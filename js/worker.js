import { ColorImageConverter, BinaryImageConverter } from "https://cdn.jsdelivr.net/npm/vectortracer@0.1.2/+esm";

self.onmessage = function(e) {
  const { imageData, params } = e.data;

  try {
    const isColor = params.colormode === "color";
    
    // Map UI params to vtracer options
    const options = {
      hierarchical: params.hierarchical,
      mode: params.mode,
      filter_speckle: parseInt(params.filter_speckle),
      color_precision: parseInt(params.color_precision),
      layer_difference: parseInt(params.layer_difference),
      length_threshold: 4,
      corner_threshold: 60,
      path_precision: 8
    };

    const ConverterClass = isColor ? ColorImageConverter : BinaryImageConverter;
    const converter = new ConverterClass(imageData, options);
    
    converter.init();

    // In a Web Worker, it's safe to block the thread
    let done = false;
    while (!done) {
      done = converter.tick();
    }

    const svg = converter.getResult();
    converter.free();

    self.postMessage({ success: true, svg: svg });
  } catch (err) {
    self.postMessage({ success: false, error: err.message || String(err) });
  }
};
