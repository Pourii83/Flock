RNNoise noise suppression assets (copied from `@sapphi-red/web-noise-suppressor`, MIT;
RNNoise by Xiph.Org, BSD-3-Clause). Served statically so the AudioWorklet and WASM
can be loaded at /noise/... on web and desktop. Refresh after upgrading the package:

    cp node_modules/@sapphi-red/web-noise-suppressor/dist/rnnoise/workletProcessor.js public/noise/rnnoise-worklet.js
    cp node_modules/@sapphi-red/web-noise-suppressor/dist/rnnoise*.wasm public/noise/
