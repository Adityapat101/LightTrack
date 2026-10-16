import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { LightTracker, normalizedPoint } from "../web/tracking.mjs";

const require = createRequire(import.meta.url);
const cv = require("../web/vendor/opencv.js");
await new Promise((resolve, reject) => {
  const began = Date.now();
  const timer = setInterval(() => {
    if (cv.Mat?.prototype.clone) { clearInterval(timer); resolve(); }
    else if (Date.now() - began > 30000) { clearInterval(timer); reject(new Error("OpenCV did not initialize")); }
  }, 30);
});

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log(`PASS ${name}`); };
function room() {
  const frame = new cv.Mat(180, 240, cv.CV_8UC4, new cv.Scalar(30, 30, 30, 255));
  cv.rectangle(frame, new cv.Point(10, 10), new cv.Point(45, 45), new cv.Scalar(255, 255, 255, 255), -1);
  return frame;
}
function run(draw, settings) {
  const tracker = new LightTracker(cv);
  const background = room(), frame = room();
  try {
    tracker.process(background, settings);
    draw(frame);
    return tracker.process(frame, settings);
  } finally { tracker.destroy(); background.delete(); frame.delete(); }
}
const light = (frame, x, y, radius) => cv.circle(frame, new cv.Point(x, y), radius, new cv.Scalar(255, 255, 255, 255), -1);

test("static room lighting is excluded", () => assert.equal(run(() => {}).target, null));
test("dim movement is excluded", () => {
  const result = run(frame => cv.rectangle(frame, new cv.Point(80, 70), new cv.Point(130, 120), new cv.Scalar(130, 130, 130, 255), -1));
  assert.equal(result.target, null);
});
test("moving light has the correct centroid", () => {
  const result = run(frame => light(frame, 120, 90, 15));
  assert.equal(result.regions.length, 1);
  assert.ok(Math.abs(result.target.center.x - 120) < 1);
  assert.ok(Math.abs(result.target.center.y - 90) < 1);
});
test("variable contours are sorted by area", () => {
  const result = run(frame => { light(frame, 100, 90, 18); light(frame, 190, 125, 10); });
  assert.equal(result.regions.length, 2);
  assert.ok(result.regions[0].area > result.regions[1].area);
  assert.ok(Math.abs(result.target.center.x - 100) < 1);
});
test("single-pixel noise is removed", () => {
  const result = run(frame => { light(frame, 100, 70, 0); light(frame, 180, 110, 0); });
  assert.equal(result.regions.length, 0);
});
test("erosion changes the region area", () => {
  const draw = frame => light(frame, 120, 90, 20);
  assert.ok(run(draw, { erosion: 1 }).target.area > run(draw, { erosion: 7 }).target.area);
});
test("reset relearns a changed background", () => {
  const tracker = new LightTracker(cv), frame = room();
  try {
    tracker.process(frame);
    light(frame, 120, 90, 15);
    assert.ok(tracker.process(frame).target);
    tracker.reset();
    assert.equal(tracker.process(frame).target, null);
  } finally { tracker.destroy(); frame.delete(); }
});
test("cursor mapping is clamped at the preview edges", () => {
  assert.deepEqual(normalizedPoint({ x: -100, y: -10 }, 640, 440), { x: 0, y: 0 });
  assert.deepEqual(normalizedPoint({ x: 900, y: 800 }, 640, 440), { x: 1, y: 1 });
});
test("cursor mapping preserves the center", () => {
  assert.deepEqual(normalizedPoint({ x: 319.5, y: 219.5 }, 640, 440), { x: 0.5, y: 0.5 });
});
console.log(`${passed} browser-pipeline checks passed using the bundled OpenCV runtime.`);
