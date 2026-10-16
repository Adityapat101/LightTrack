// The official OpenCV.js build invokes this after its embedded WASM is ready.
window.Module = { onRuntimeInitialized() { window.dispatchEvent(new Event("opencv-ready")); } };
