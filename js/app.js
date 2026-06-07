/* ============================================================
   Vectorlab — front-end controller
   Handles upload (drag/drop + browse), live slider readouts,
   conversion request, SVG render, zoom, and download.
   Uses local WASM vtracer on the main thread.
   ============================================================ */

import * as vtracer_bg from './vtracer_webapp_bg.js';

(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);

  // --- i18n ---------------------------------------------------------------
  const LANG = navigator.language.startsWith("ja") ? "ja" : "en";
  const STRINGS = {
    en: {
      pageTitle:     "Vectorlab — Raster to Vector Studio",
      brandTag:      "raster → vector studio",
      srcPanel:      "Source image",
      dropHeadline:  "Drop an image here",
      dropSub:       'or <span class="dz-link">browse files</span> — PNG · JPEG · WEBP',
      tracingPanel:  "Tracing settings",
      modeLabel:     "Mode",
      hierarchyLabel:"Layout hierarchy",
      curveLabel:    "Curve smoothing",
      speckleLabel:  "Filter speckle",
      precisionLabel:"Color precision",
      layerLabel:    "Layer difference",
      optColor:      "Color",
      optBW:         "Black & White",
      optStacked:    "Stacked",
      optCutout:     "Cutout",
      optSpline:     "Spline",
      optPolygon:    "Polygon",
      scaleClean:    "clean",
      scaleDetail:   "detail",
      scaleFlat:     "flat",
      scaleRich:     "rich",
      scaleFine:     "fine",
      scaleCoarse:   "coarse",
      convertBtn:    "Convert to SVG",
      compareLabel:  "Compare",
      downloadBtn:   "Download SVG",
      origTag:       "Original",
      svgTag:        "Vector · SVG",
      origPh:        "Your source image will appear here",
      svgPh:         "The vectorized result will render here",
      refreshBtn:    "Refresh page",
      awaitingImg:   "Awaiting image",
      tracing:       "Tracing…",
      convFailed:    "Conversion failed",
      doneMsg:       (ms, kb) => `Done in ${ms} ms · ${kb} KB SVG`,
      loadedMsg:     (name, size) => `Loaded ${name} · ${size}`,
      errNoFile:     "Please choose an image first.",
      errBadType:    "Unsupported file type. Please use PNG, JPEG, WEBP, BMP or GIF.",
      errNoSvg:      "No SVG returned by the server.",
      elapsedFmt:    (m, s) => `Elapsed: ${m}:${s}`,
      tips: {
        mode:      "Color traces the full palette. Black & White outputs a flat two-tone trace.",
        hierarchy: "Stacked places filled shapes on top of each other. Cutout subtracts each shape from the layer below.",
        curve:     "Spline uses smooth Bézier curves. Polygon uses straight line segments — faster but angular.",
        speckle:   "Removes tiny noise specks. Higher values merge smaller detail clusters, producing a cleaner trace.",
        precision: "Colour quantization levels (1–8). Higher values preserve more distinct colours but increase file size.",
        layer:     "Threshold for separating colour layers. Lower = more layers with finer colour; Higher = similar colours merged.",
      },
      progress: [
        { at:  0, msg: "Tracing paths…",             hint: "" },
        { at:  4, msg: "Analysing image…",            hint: "" },
        { at: 10, msg: "Quantizing colours…",         hint: "" },
        { at: 18, msg: "Generating Bézier curves…",   hint: "" },
        { at: 28, msg: "Optimising paths…",           hint: "" },
        { at: 42, msg: "Merging layers…",             hint: "" },
        { at: 60, msg: "Finishing up…",               hint: "Large or complex images take longer" },
        { at: 90, msg: "Please wait a moment…",       hint: "You can wait or refresh the page" },
      ],
    },
    ja: {
      pageTitle:     "Vectorlab — ラスター・ベクター変換スタジオ",
      brandTag:      "ラスター → ベクター スタジオ",
      srcPanel:      "ソース画像",
      dropHeadline:  "画像をここにドロップ",
      dropSub:       'または <span class="dz-link">ファイルを選択</span> — PNG · JPEG · WEBP',
      tracingPanel:  "トレース設定",
      modeLabel:     "モード",
      hierarchyLabel:"レイヤー階層",
      curveLabel:    "曲線スムージング",
      speckleLabel:  "スペックル除去",
      precisionLabel:"色の精度",
      layerLabel:    "レイヤー差分",
      optColor:      "カラー",
      optBW:         "白黒",
      optStacked:    "スタック",
      optCutout:     "カットアウト",
      optSpline:     "スプライン",
      optPolygon:    "ポリゴン",
      scaleClean:    "スムース",
      scaleDetail:   "詳細",
      scaleFlat:     "フラット",
      scaleRich:     "リッチ",
      scaleFine:     "細かい",
      scaleCoarse:   "粗い",
      convertBtn:    "SVGに変換",
      compareLabel:  "比較",
      downloadBtn:   "SVGダウンロード",
      origTag:       "オリジナル",
      svgTag:        "ベクター · SVG",
      origPh:        "ソース画像がここに表示されます",
      svgPh:         "ベクター化結果がここに表示されます",
      refreshBtn:    "ページを更新",
      awaitingImg:   "画像を待機中",
      tracing:       "トレース中…",
      convFailed:    "変換に失敗しました",
      doneMsg:       (ms, kb) => `完了 ${ms} ms · ${kb} KB SVG`,
      loadedMsg:     (name, size) => `${name} · ${size} を読み込みました`,
      errNoFile:     "画像を選択してください。",
      errBadType:    "サポートされていないファイル形式です。PNG・JPEG・WEBP・BMP・GIF を使用してください。",
      errNoSvg:      "サーバーから SVG が返されませんでした。",
      elapsedFmt:    (m, s) => `経過: ${m}:${s}`,
      tips: {
        mode:      "カラーはフルカラーを保持してトレース。白黒はモノクロ2値で出力します。",
        hierarchy: "スタックは塗り図形を重ねて描画。カットアウトは下のレイヤーから図形を切り抜きます。",
        curve:     "スプラインは滑らかなベジェ曲線。ポリゴンは直線セグメントで高速ですが角張ります。",
        speckle:   "小さなノイズを除去します。値が大きいほど細かいディテールが統合・省略され、すっきりしたトレースになります。",
        precision: "色の量子化レベル（1〜8）。大きいほど色数が増えて精細になりますが、ファイルサイズも増加します。",
        layer:     "カラーレイヤーの分割閾値。小さいほど細かい色分け、大きいほど似た色がまとめられます。",
      },
      progress: [
        { at:  0, msg: "パスをトレース中…",           hint: "" },
        { at:  4, msg: "画像を解析中…",               hint: "" },
        { at: 10, msg: "色を量子化中…",               hint: "" },
        { at: 18, msg: "ベジェ曲線を生成中…",         hint: "" },
        { at: 28, msg: "パスを最適化中…",             hint: "" },
        { at: 42, msg: "レイヤーを統合中…",           hint: "" },
        { at: 60, msg: "仕上げ処理中…",              hint: "大きな画像や複雑なイラストは時間がかかります" },
        { at: 90, msg: "もうしばらくお待ちください…", hint: "このまましばらくお待ちいただくか、ページを更新してください" },
      ],
    },
  };
  const T = STRINGS[LANG];

  function applyI18n() {
    document.title = T.pageTitle;
    document.querySelectorAll("[data-i18n]").forEach((el) => {
      const key = el.dataset.i18n;
      if (key in T) el.textContent = T[key];
    });
    document.querySelectorAll("[data-i18n-html]").forEach((el) => {
      const key = el.dataset.i18nHtml;
      if (key in T) el.innerHTML = T[key];
    });
    document.querySelectorAll("[data-i18n-tip]").forEach((btn) => {
      const key = btn.dataset.i18nTip;
      if (T.tips && key in T.tips) {
        const box = document.createElement("span");
        box.className = "tip-box";
        box.textContent = T.tips[key];
        btn.appendChild(box);
      }
    });
  }
  applyI18n();

  // --- elements -----------------------------------------------------------
  const form        = $("controls");
  const dropzone    = $("dropzone");
  const fileInput   = $("file-input");
  const dzEmpty     = dropzone.querySelector(".dz-empty");
  const dzLoaded    = dropzone.querySelector(".dz-loaded");
  const thumb       = $("thumb");
  const fileNameEl  = $("file-name");
  const fileSizeEl  = $("file-size");
  const clearBtn    = $("clear-file");

  const convertBtn  = $("convert-btn");
  const errorMsg    = $("error-msg");

  const origView    = $("orig-view");
  const origPh      = $("orig-placeholder");
  const svgView     = $("svg-view");
  const svgPh       = $("svg-placeholder");
  const loading     = $("loading");
  const downloadBtn = $("download-btn");
  const statInfo    = $("stat-info");

  const zoomCtl       = $("zoom-controls");
  const zoomLevel     = $("zoom-level");
  const svgPaneTag    = $("svg-pane-tag");
  const overlayStatus = $("overlay-status");
  const overlayElapsed= $("overlay-elapsed");
  const overlayHint   = $("overlay-hint");

  const sliders = ["filter_speckle", "color_precision", "layer_difference"];

  // --- state --------------------------------------------------------------
  let currentFile = null;
  let objectUrl   = null;   // revoke-able preview URL
  let downloadUrl = null;   // blob URL for SVG download
  let zoom        = 1;
  let progressTimer = null;

  // --- progress -----------------------------------------------------------
  function startProgressTimer() {
    let elapsed = 0;
    overlayStatus && (overlayStatus.textContent = T.progress[0].msg);
    overlayElapsed && (overlayElapsed.textContent = T.elapsedFmt(0, "00"));
    overlayHint && (overlayHint.textContent = "");

    progressTimer = setInterval(() => {
      elapsed++;
      if (overlayElapsed) {
        const m = Math.floor(elapsed / 60);
        const s = String(elapsed % 60).padStart(2, "0");
        overlayElapsed.textContent = T.elapsedFmt(m, s);
      }
      if (overlayStatus) {
        const step = [...T.progress].reverse().find(s => elapsed >= s.at);
        if (step) overlayStatus.textContent = step.msg;
        if (overlayHint) overlayHint.textContent = step?.hint ?? "";
      }
    }, 1000);
  }

  function stopProgressTimer() {
    if (progressTimer) { clearInterval(progressTimer); progressTimer = null; }
  }

  // --- helpers ------------------------------------------------------------
  const human = (bytes) => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / 1048576).toFixed(2) + " MB";
  };

  const showError = (msg) => {
    errorMsg.textContent = msg;
    errorMsg.hidden = false;
  };
  const clearError = () => { errorMsg.hidden = true; };

  // --- live slider readouts ----------------------------------------------
  sliders.forEach((id) => {
    const input = $(id);
    const out = $(id + "_v");
    input.addEventListener("input", () => { out.textContent = input.value; });
  });

  // --- file handling ------------------------------------------------------
  const ACCEPTED = ["image/png", "image/jpeg", "image/bmp", "image/webp", "image/gif"];

  function loadFile(file) {
    if (!file) return;
    if (!ACCEPTED.includes(file.type) && !/\.(png|jpe?g|bmp|webp|gif)$/i.test(file.name)) {
      showError(T.errBadType);
      return;
    }
    clearError();
    currentFile = file;

    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = URL.createObjectURL(file);

    thumb.src = objectUrl;
    origView.src = objectUrl;
    fileNameEl.textContent = file.name;
    fileSizeEl.textContent = human(file.size);

    dzEmpty.hidden = true;
    dzLoaded.hidden = false;

    origView.hidden = false;
    origPh.hidden = true;

    convertBtn.disabled = false;
    statInfo.textContent = T.loadedMsg(file.name, human(file.size));
    statInfo.classList.remove("done");

    // reset previous result
    resetResult();
  }

  function resetResult() {
    svgView.hidden = true;
    svgView.innerHTML = "";
    svgView.classList.remove("ready");
    svgPh.hidden = false;
    zoomCtl.hidden = true;
    downloadBtn.classList.add("disabled");
    if (svgPaneTag) { svgPaneTag.textContent = T.svgTag; svgPaneTag.classList.remove("result-ready"); }
    if (downloadUrl) { URL.revokeObjectURL(downloadUrl); downloadUrl = null; }
    zoom = 1; applyZoom();
  }

  function clearFile() {
    currentFile = null;
    if (objectUrl) { URL.revokeObjectURL(objectUrl); objectUrl = null; }
    fileInput.value = "";
    dzEmpty.hidden = false;
    dzLoaded.hidden = true;
    origView.hidden = true;
    origView.src = "";
    origPh.hidden = false;
    convertBtn.disabled = true;
    statInfo.textContent = T.awaitingImg;
    statInfo.classList.remove("done");
    resetResult();
    clearError();
  }

  fileInput.addEventListener("change", (e) => loadFile(e.target.files[0]));
  clearBtn.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); clearFile(); });

  // keyboard activation of dropzone
  dropzone.addEventListener("keydown", (e) => {
    if ((e.key === "Enter" || e.key === " ") && dzLoaded.hidden) {
      e.preventDefault(); fileInput.click();
    }
  });

  // --- drag & drop --------------------------------------------------------
  ["dragenter", "dragover"].forEach((evt) =>
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault(); e.stopPropagation();
      dropzone.classList.add("dragover");
    })
  );
  ["dragleave", "drop"].forEach((evt) =>
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault(); e.stopPropagation();
      if (evt === "dragleave" && dropzone.contains(e.relatedTarget)) return;
      dropzone.classList.remove("dragover");
    })
  );
  dropzone.addEventListener("drop", (e) => {
    const file = e.dataTransfer.files && e.dataTransfer.files[0];
    if (file) loadFile(file);
  });

  // --- zoom ---------------------------------------------------------------
  function applyZoom() {
    svgView.style.transform = `scale(${zoom})`;
    zoomLevel.textContent = Math.round(zoom * 100) + "%";
  }
  $("zoom-in").addEventListener("click", () => { zoom = Math.min(zoom + 0.25, 8); applyZoom(); });
  $("zoom-out").addEventListener("click", () => { zoom = Math.max(zoom - 0.25, 0.25); applyZoom(); });
  $("zoom-reset").addEventListener("click", () => { zoom = 1; applyZoom(); });

  // --- conversion ---------------------------------------------------------
  let wasm_initialized = false;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!currentFile) { showError(T.errNoFile); return; }

    clearError();
    loading.hidden = false;
    startProgressTimer();
    convertBtn.classList.add("loading");
    convertBtn.disabled = true;
    statInfo.textContent = T.tracing;
    statInfo.classList.remove("done");

    const t0 = performance.now();
    try {
      // 1. Initialize WASM module if not already initialized
      if (!wasm_initialized) {
        const response = await fetch('js/vtracer_webapp_bg.wasm');
        const wasmModule = await WebAssembly.instantiateStreaming(response, {
          './vtracer_webapp_bg.js': vtracer_bg
        });
        vtracer_bg.__wbg_set_wasm(wasmModule.instance.exports);
        wasm_initialized = true;
      }

      // 2. Draw image to hidden canvas "frame"
      const img = new Image();
      img.src = URL.createObjectURL(currentFile);
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = () => reject(new Error("Failed to load image for processing."));
      });

      const canvas = $("frame");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(img.src);

      const deg2rad = (deg) => deg/180*3.141592654;
      
      const rawParams = {
        canvas_id: "frame",
        svg_id: "svg",
        colormode: $("colormode").value,
        hierarchical: $("hierarchical").value,
        mode: $("mode").value
      };
      sliders.forEach((id) => rawParams[id] = parseInt($(id).value, 10));

      const params = {
        canvas_id: "frame",
        svg_id: "svg",
        colormode: rawParams.colormode,
        hierarchical: rawParams.hierarchical,
        mode: rawParams.mode,
        corner_threshold: deg2rad(60.0),
        length_threshold: 4.0,
        max_iterations: 10,
        splice_threshold: deg2rad(45.0),
        filter_speckle: rawParams.filter_speckle * rawParams.filter_speckle,
        color_precision: 8 - rawParams.color_precision,
        layer_difference: rawParams.layer_difference,
        path_precision: 8
      };

      // 4. Run converter
      console.log("Creating converter with params:", params);
      const converter = params.colormode === "color" 
        ? vtracer_bg.ColorImageConverter.new_with_string(JSON.stringify(params))
        : vtracer_bg.BinaryImageConverter.new_with_string(JSON.stringify(params));
      
      console.log("Calling converter.init()");
      converter.init();
      console.log("converter.init() success");
      
      let tickCount = 0;
      // non-blocking loop
      await new Promise((resolve, reject) => {
        function loop() {
          try {
            tickCount++;
            if (tickCount % 100 === 0) console.log("Calling tick", tickCount);
            const done = converter.tick();
            if (done) {
              console.log("converter done at tick", tickCount);
              resolve();
            } else {
              setTimeout(loop, 0); // yield to browser
            }
          } catch(err) {
            console.error("converter.tick() panicked at tick", tickCount, err);
            reject(err);
          }
        }
        setTimeout(loop, 0);
      });

      // 5. Get SVG result
      const svgEl = $("svg");
      const result = svgEl.outerHTML;

      if (!result) throw new Error(T.errNoSvg);

      renderSVG(result);

      const ms = Math.round(performance.now() - t0);
      const kb = (result.length / 1024).toFixed(1);
      statInfo.textContent = T.doneMsg(ms, kb);
      statInfo.classList.add("done");
    } catch (err) {
      console.error(err);
      showError(err.message || T.convFailed);
      statInfo.textContent = T.convFailed;
      statInfo.classList.remove("done");
    } finally {
      stopProgressTimer();
      loading.hidden = true;
      convertBtn.classList.remove("loading");
      convertBtn.disabled = false;
    }
  });

  function renderSVG(svgText) {
    // Use a blob URL rendered via <img> instead of innerHTML.
    // Setting innerHTML on a 17MB+ SVG freezes the browser's main thread
    // for tens of seconds; <img src=blobURL> loads asynchronously.
    if (downloadUrl) { URL.revokeObjectURL(downloadUrl); downloadUrl = null; }
    
    const svgContent = `<?xml version="1.0" encoding="UTF-8"?>\n<!-- Generator: Vectorlab (visioncortex VTracer) -->\n` + svgText;
    const blob = new Blob([svgContent], { type: "image/svg+xml" });
    downloadUrl = URL.createObjectURL(blob);

    svgView.innerHTML = "";
    const img = document.createElement("img");
    img.src = downloadUrl;
    img.alt = "Vectorized SVG";
    img.style.cssText = "max-width:100%; max-height:60vh; object-fit:contain;";
    svgView.appendChild(img);

    svgView.classList.remove("ready");
    svgView.hidden = false;
    svgPh.hidden = true;
    void svgView.offsetWidth;
    svgView.classList.add("ready");

    if (svgPaneTag) { svgPaneTag.textContent = T.svgTag; svgPaneTag.classList.add("result-ready"); }

    zoom = 1; applyZoom();
    zoomCtl.hidden = false;

    downloadBtn.href = downloadUrl;
    const base = (currentFile?.name || "image").replace(/\.[^.]+$/, "");
    downloadBtn.setAttribute("download", `${base}.svg`);
    downloadBtn.classList.remove("disabled");
  }

  // --- Auto-load for testing ---
  fetch('image.png')
    .then(r => r.blob())
    .then(blob => {
      const file = new File([blob], "image.png", { type: "image/png" });
      loadFile(file);
    });
})();
