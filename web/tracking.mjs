/** OpenCV.js version of tracker.py. All frame processing stays on this device. */
export class LightTracker {
  constructor(cv) {
    this.cv = cv;
    this.background = null;
    this.kernel = null;
    this.kernelSize = 0;
    this.gray = new cv.Mat();
    this.current = new cv.Mat();
    this.background8 = new cv.Mat();
    this.difference = new cv.Mat();
    this.foreground = new cv.Mat();
    this.bright = new cv.Mat();
    this.mask = new cv.Mat();
    this.contours = new cv.MatVector();
    this.hierarchy = new cv.Mat();
  }

  reset() {
    this.background?.delete();
    this.background = null;
  }

  process(rgba, { brightness = 215, motion = 22, erosion = 3, minArea = 24 } = {}) {
    const cv = this.cv;
    cv.cvtColor(rgba, this.gray, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(this.gray, this.gray, new cv.Size(5, 5), 0);
    this.gray.convertTo(this.current, cv.CV_32F);
    if (!this.background || this.background.rows !== rgba.rows || this.background.cols !== rgba.cols) {
      this.reset();
      this.background = this.current.clone();
    }
    this.background.convertTo(this.background8, cv.CV_8U);
    cv.absdiff(this.gray, this.background8, this.difference);
    cv.threshold(this.difference, this.foreground, motion, 255, cv.THRESH_BINARY);
    cv.threshold(this.gray, this.bright, brightness, 255, cv.THRESH_BINARY);
    cv.bitwise_and(this.foreground, this.bright, this.mask);
    if (this.kernelSize !== erosion) {
      this.kernel?.delete();
      this.kernel = cv.Mat.ones(erosion, erosion, cv.CV_8U);
      this.kernelSize = erosion;
    }
    cv.erode(this.mask, this.mask, this.kernel);
    cv.findContours(this.mask, this.contours, this.hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
    const regions = [];
    for (let i = 0; i < this.contours.size(); i++) {
      const contour = this.contours.get(i);
      try {
        const area = cv.contourArea(contour);
        if (area < minArea) continue;
        const box = cv.boundingRect(contour);
        const moments = cv.moments(contour);
        const center = moments.m00 ? { x: moments.m10 / moments.m00, y: moments.m01 / moments.m00 }
          : { x: box.x + box.width / 2, y: box.y + box.height / 2 };
        regions.push({ box, center, area });
      } finally { contour.delete(); }
    }
    regions.sort((a, b) => b.area - a.area);
    cv.addWeighted(this.background, 0.975, this.current, 0.025, 0, this.background);
    return { regions, target: regions[0] ?? null };
  }

  destroy() {
    this.reset();
    this.kernel?.delete();
    for (const name of ["gray", "current", "background8", "difference", "foreground", "bright", "mask", "contours", "hierarchy"]) {
      this[name].delete();
    }
  }
}

export function normalizedPoint(center, width, height, margin = 0.08) {
  const clamp = value => Math.max(0, Math.min(1, value));
  return { x: clamp((center.x / (width - 1) - margin) / (1 - 2 * margin)),
    y: clamp((center.y / (height - 1) - margin) / (1 - 2 * margin)) };
}
