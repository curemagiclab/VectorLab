"""
Vectorlab — Raster → SVG vectorization service.

A small Flask backend wrapping the `vtracer` library. The single API endpoint
accepts an uploaded raster image plus a set of tracing parameters and returns
the generated SVG markup. Processing happens fully in-memory (no temp files
touch disk) via `vtracer.convert_raw_image_to_svg`.
"""

from __future__ import annotations

import io
import os
import sys

from flask import Flask, jsonify, render_template, request, send_file

import vtracer


def _resource(rel: str) -> str:
    """Resolve path to a bundled resource (works both frozen and in dev)."""
    base = sys._MEIPASS if getattr(sys, "frozen", False) else os.path.dirname(os.path.abspath(__file__))
    return os.path.join(base, rel)


app = Flask(__name__, template_folder=_resource("templates"), static_folder=_resource("static"))

# 16 MB upload ceiling — generous for raster art, stops abuse.
app.config["MAX_CONTENT_LENGTH"] = 16 * 1024 * 1024

ALLOWED_EXTENSIONS = {"png", "jpg", "jpeg", "bmp", "gif", "webp"}

# Whitelists for the enum-style parameters. Anything outside these falls back
# to the documented default rather than crashing the Rust binding.
COLORMODES = {"color", "binary"}          # UI exposes "color" / "bw" -> mapped below
HIERARCHIES = {"stacked", "cutout"}
MODES = {"spline", "polygon", "none"}


def _clamp(value, low, high, default):
    """Coerce `value` to an int within [low, high], falling back to default."""
    try:
        return max(low, min(high, int(value)))
    except (TypeError, ValueError):
        return default


def _allowed(filename: str) -> bool:
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/vectorize", methods=["POST"])
def vectorize():
    """Convert an uploaded raster image into SVG markup.

    Expects multipart/form-data with:
      - `image`: the raster file (PNG/JPEG/...).
      - tracing params as individual form fields (see below).

    Returns JSON: { "svg": "<svg ...>...</svg>" } on success, or
    { "error": "..." } with an appropriate HTTP status on failure.
    """
    if "image" not in request.files:
        return jsonify(error="No image file was provided."), 400

    file = request.files["image"]
    if not file or file.filename == "":
        return jsonify(error="No image file was selected."), 400

    if not _allowed(file.filename):
        return (
            jsonify(error=f"Unsupported file type. Allowed: {', '.join(sorted(ALLOWED_EXTENSIONS))}."),
            415,
        )

    img_bytes = file.read()
    if not img_bytes:
        return jsonify(error="The uploaded file is empty."), 400

    # --- Gather + sanitize parameters --------------------------------------
    # The UI uses friendly labels ("bw"); map them to vtracer's vocabulary.
    raw_mode = request.form.get("colormode", "color").lower()
    colormode = "binary" if raw_mode in ("bw", "binary", "b&w") else "color"

    hierarchical = request.form.get("hierarchical", "stacked").lower()
    if hierarchical not in HIERARCHIES:
        hierarchical = "stacked"

    mode = request.form.get("mode", "spline").lower()
    if mode not in MODES:
        mode = "spline"

    filter_speckle = _clamp(request.form.get("filter_speckle"), 0, 128, 4)
    color_precision = _clamp(request.form.get("color_precision"), 1, 8, 6)
    layer_difference = _clamp(request.form.get("layer_difference"), 0, 256, 16)

    # --- Run the tracer ----------------------------------------------------
    # NOTE: arguments are passed POSITIONALLY on purpose. The vtracer 0.6.x
    # cp314 wheel ships a PyO3 binding whose keyword-argument handling triggers
    # a native access violation on Python 3.14; positional calls are stable.
    # img_format=None lets vtracer auto-detect from magic bytes, which is more
    # robust than trusting the file extension (they can mismatch).
    # Positional order matches the binding's signature:
    #   (img_bytes, img_format, colormode, hierarchical, mode,
    #    filter_speckle, color_precision, layer_difference, ...)
    try:
        svg = vtracer.convert_raw_image_to_svg(
            img_bytes,
            None,
            colormode,
            hierarchical,
            mode,
            filter_speckle,
            color_precision,
            layer_difference,
        )
    except Exception as exc:  # noqa: BLE001 — surface any binding failure cleanly
        app.logger.exception("vectorization failed")
        return jsonify(error=f"Vectorization failed: {exc}"), 500

    # Allow ?download=1 to stream the SVG as a file attachment instead of JSON.
    if request.args.get("download"):
        buffer = io.BytesIO(svg.encode("utf-8"))
        return send_file(
            buffer,
            mimetype="image/svg+xml",
            as_attachment=True,
            download_name="vectorized.svg",
        )

    return jsonify(svg=svg)


@app.errorhandler(413)
def too_large(_err):
    return jsonify(error="File is too large (16 MB maximum)."), 413


if __name__ == "__main__":
    if getattr(sys, "frozen", False):
        import socket
        import threading
        import webbrowser
        # Pick a free port dynamically so the EXE never conflicts with other services.
        with socket.socket() as _s:
            _s.bind(("127.0.0.1", 0))
            _port = _s.getsockname()[1]
        print(f"\n  Vectorlab  →  http://127.0.0.1:{_port}")
        print("  このウィンドウを閉じると終了します。\n")
        threading.Timer(1.2, lambda: webbrowser.open(f"http://127.0.0.1:{_port}")).start()
        app.run(debug=False, host="127.0.0.1", port=_port)
    else:
        app.run(debug=True, host="127.0.0.1", port=5000)
