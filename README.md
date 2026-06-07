# Vectorlab — Raster → Vector Studio

A clean, single-page web app that converts raster images (PNG/JPEG/WEBP…) into
scalable **SVG** vectors using the [`vtracer`](https://github.com/visioncortex/vtracer)
engine, with live, tunable tracing parameters.

![stack](https://img.shields.io/badge/Flask-3.x-000) ![engine](https://img.shields.io/badge/vtracer-0.6-6366f1)

## Features

- **Drag-and-drop upload** with thumbnail preview and file info.
- **Live tracing controls** — mode (color / B&W), layout hierarchy
  (stacked / cutout), curve smoothing (spline / polygon), and sliders for
  filter speckle, color precision, and layer difference.
- **Side-by-side compare** — original raster vs. natively-rendered SVG on a
  checkerboard canvas, with **zoom** so you can inspect the vector paths.
- **Download SVG** once a conversion succeeds.
- In-memory processing (no temp files), with error handling for bad input.
- Responsive dark UI that adapts from wide monitors down to phones.

## Quick start

```bash
# 1. (optional) create a virtual environment
python -m venv .venv
.venv\Scripts\activate        # Windows
# source .venv/bin/activate   # macOS / Linux

# 2. install dependencies
pip install -r requirements.txt

# 3. run
python app.py
```

Then open <http://127.0.0.1:5000> in your browser.

## API

### `POST /api/vectorize`

`multipart/form-data`:

| field             | type   | values / range            | default  |
| ----------------- | ------ | ------------------------- | -------- |
| `image`           | file   | PNG / JPEG / WEBP / BMP / GIF | —     |
| `colormode`       | string | `color`, `bw`             | `color`  |
| `hierarchical`    | string | `stacked`, `cutout`       | `stacked`|
| `mode`            | string | `spline`, `polygon`       | `spline` |
| `filter_speckle`  | int    | 1–10                      | 4        |
| `color_precision` | int    | 1–8                       | 6        |
| `layer_difference`| int    | 2–32                      | 16       |

**Response:** `{ "svg": "<svg …>…</svg>" }`

Append `?download=1` to receive the SVG as a file attachment instead of JSON.
On error returns `{ "error": "message" }` with a 4xx/5xx status.

## Project layout

```
SVGCreator/
├── app.py                 # Flask backend + vtracer wrapper
├── requirements.txt
├── templates/
│   └── index.html         # SPA markup
└── static/
    ├── style.css          # dark studio theme
    └── app.js             # upload / convert / zoom controller
```

## Notes

The backend uses `vtracer.convert_raw_image_to_svg` to trace bytes directly in
memory. `vtracer` also exposes `convert_image_to_svg_py(in_path, out_path, …)`
for file-based workflows if you prefer that route.
