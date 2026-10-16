import { LightTracker, normalizedPoint } from "./tracking.mjs";

const $ = selector => document.querySelector(selector);
const preview = $("#preview");
const context = preview.getContext("2d");
const source = document.createElement("canvas");
source.width = 640;
source.height = 440;
const sourceContext = source.getContext("2d", { willReadFrequently: true });
const video = $("#camera");
const cursor = $("#cursor");
const settings = { brightness: 215, motion: 22, erosion: 3 };
let tracker, stream, animation, mode, view = "tracking", started = 0, previous = 0;
let smooth = null, missingSince = 0, starting = false, cameraAttempt = 0;

function error(message = "") { $("#error").textContent = message; $("#error").hidden = !message; }
function setState(state) { $("#tracking-state").textContent = state; $("#stage-status").textContent = state; }

function initialize() {
  if (tracker || !window.cv?.Mat) return;
  try {
    tracker = new LightTracker(window.cv);
    $("#start-camera").disabled = false;
    $("#start-example").disabled = false;
    $("#engine-status").textContent = "OpenCV ready · runs on your device";
    error();
  } catch { error("Tracking could not start. Reload this page to try again."); }
}
window.addEventListener("opencv-ready", initialize);
window.addEventListener("opencv-error", () => error("OpenCV could not load. Check your connection and reload the page."));
initialize();
window.setTimeout(() => {
  if (!tracker) error("OpenCV is taking a while to load. Check your connection, then reload if needed.");
}, 25000);

function resetBackground() {
  tracker.reset();
  smooth = null;
  started = performance.now();
  missingSince = 0;
  cursor.hidden = true;
  setState("Learning background");
}

function stop({ preserveError = false } = {}) {
  cameraAttempt++;
  cancelAnimationFrame(animation);
  stream?.getTracks().forEach(track => track.stop());
  stream = null;
  video.srcObject = null;
  mode = null;
  starting = false;
  smooth = null;
  cursor.hidden = true;
  $("#empty-state").hidden = false;
  $("#stage-badge").hidden = true;
  $("#session-actions").hidden = true;
  $("#source-label").textContent = "NO INPUT";
  $("#regions").textContent = "—";
  $("#position").textContent = "—, —";
  $("#start-camera").disabled = !tracker;
  $("#start-example").disabled = !tracker;
  $("#engine-status").textContent = tracker ? "OpenCV ready · runs on your device" : "Loading OpenCV…";
  setState("Not started");
  if (!preserveError) error();
}

function begin(input) {
  mode = input;
  previous = 0;
  $("#empty-state").hidden = true;
  $("#stage-badge").hidden = false;
  $("#session-actions").hidden = false;
  $("#source-label").textContent = input === "camera" ? "LIVE CAMERA" : "GENERATED EXAMPLE";
  resetBackground();
  animation = requestAnimationFrame(tick);
}

// The example is deliberately synthetic: a static lamp, a dim moving object,
// small bright specks, and one moving light all go through the real pipeline.
function drawExample(seconds) {
  const ctx = sourceContext;
  ctx.fillStyle = "#20271f"; ctx.fillRect(0, 0, 640, 440);
  ctx.strokeStyle = "#313b2b"; ctx.lineWidth = 1;
  for (let x = 0; x < 640; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 440); ctx.stroke(); }
  for (let y = 0; y < 440; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(640, y); ctx.stroke(); }
  ctx.fillStyle = "#394432"; ctx.fillRect(25, 290, 590, 13); ctx.fillRect(63, 303, 10, 137); ctx.fillRect(563, 303, 10, 137);
  ctx.fillStyle = "#515a49"; ctx.fillRect(503, 211, 5, 79);
  ctx.fillStyle = "#eeeeda"; ctx.fillRect(482, 205, 48, 12);
  ctx.font = "10px monospace"; ctx.fillStyle = "#8a967b"; ctx.fillText("STATIC LIGHT", 473, 192);
  ctx.fillStyle = "#64705a"; ctx.fillRect(80 + Math.sin(seconds * 0.6) * 35, 240, 46, 49);
  ctx.fillStyle = "#89957a"; ctx.fillText("DIM MOVEMENT", 37, 326);
  if (seconds > 0.7) {
    const x = 320 + Math.sin(seconds * 0.75) * 170;
    const y = 155 + Math.sin(seconds * 1.08) * 73;
    const halo = ctx.createRadialGradient(x, y, 5, x, y, 35);
    halo.addColorStop(0, "#fbffe4"); halo.addColorStop(.3, "#dceba9b0"); halo.addColorStop(1, "#c8df8b00");
    ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(x, y, 35, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#ffffff"; ctx.beginPath(); ctx.arc(x, y, 11, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "white"; ctx.fillRect(210 + Math.round(Math.sin(seconds * 3) * 90), 370, 1, 1);
  }
  ctx.fillStyle = "#8d997f"; ctx.font = "10px monospace"; ctx.fillText("GENERATED SCENE / REAL OPENCV PROCESSING", 22, 416);
}

function tick(now) {
  if (!mode) return;
  animation = requestAnimationFrame(tick);
  if (now - previous < 1000 / 30) return;
  previous = now;
  try {
    if (mode === "camera") {
      if (video.readyState < 2) return;
      // Fill the frame without stretching the camera's aspect ratio.
      const scale = Math.max(640 / video.videoWidth, 440 / video.videoHeight);
      const width = video.videoWidth * scale, height = video.videoHeight * scale;
      sourceContext.save(); sourceContext.translate(640, 0); sourceContext.scale(-1, 1);
      sourceContext.drawImage(video, (640 - width) / 2, (440 - height) / 2, width, height);
      sourceContext.restore();
    } else drawExample((now - started) / 1000);
    const rgba = window.cv.imread(source);
    let detection;
    try { detection = tracker.process(rgba, settings); } finally { rgba.delete(); }
    if (view === "tracking") context.drawImage(source, 0, 0);
    else window.cv.imshow(preview, view === "foreground" ? tracker.foreground : tracker.mask);
    $("#regions").textContent = String(detection.regions.length);
    for (let index = 0; index < detection.regions.length; index++) {
      const { box } = detection.regions[index];
      context.strokeStyle = index === 0 ? "#cfe59b" : "#7e8f6b";
      context.lineWidth = index === 0 ? 1.5 : 1;
      context.strokeRect(box.x - 5, box.y - 5, box.width + 10, box.height + 10);
    }
    if (now - started < 650) {
      setState("Learning background"); cursor.hidden = true; return;
    }
    if (detection.target) {
      const { center } = detection.target;
      const point = normalizedPoint(center, 640, 440);
      smooth = smooth ? { x: smooth.x + .3 * (point.x - smooth.x), y: smooth.y + .3 * (point.y - smooth.y) } : point;
      cursor.style.left = `calc(${smooth.x * 100}% - ${smooth.x * 19}px)`;
      cursor.style.top = `calc(${smooth.y * 100}% - ${smooth.y * 24}px)`;
      cursor.hidden = false;
      $("#position").textContent = `${Math.round(center.x)}, ${Math.round(center.y)}`;
      setState("Following light");
      missingSince = 0;
    } else {
      missingSince ||= now;
      if (now - missingSince > 400) smooth = null;
      cursor.hidden = true;
      $("#position").textContent = "—, —";
      setState("Looking for light");
    }
  } catch (cause) {
    console.error("LightTrack processing error", cause);
    error("The tracker stopped. Try starting the example again or reload the page.");
    stop({ preserveError: true });
  }
}

$("#start-example").addEventListener("click", () => {
  stop();
  begin("example");
});
$("#start-camera").addEventListener("click", async () => {
  if (starting) return;
  stop();
  starting = true;
  const attempt = cameraAttempt;
  $("#start-camera").disabled = true;
  $("#engine-status").textContent = "Waiting for camera permission…";
  try {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error("unsupported");
    const result = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 440 }, facingMode: "user" }, audio: false });
    if (attempt !== cameraAttempt) { result.getTracks().forEach(track => track.stop()); return; }
    stream = result;
    video.srcObject = stream;
    await video.play();
    if (attempt !== cameraAttempt) return;
    stream.getVideoTracks()[0].addEventListener("ended", () => {
      if (mode === "camera") { stop(); error("The camera disconnected. You can reconnect it or try the example."); }
    });
    begin("camera");
  } catch (cause) {
    if (attempt !== cameraAttempt) return;
    stop();
    const message = cause.name === "NotAllowedError" ? "Camera access wasn't allowed. Enable it in your browser's site settings, or try the example."
      : cause.name === "NotFoundError" ? "No camera was found. Try the example instead."
        : "The camera couldn't start. Check that it isn't in use by another app, or try the example.";
    error(message);
  } finally {
    if (attempt === cameraAttempt) {
      starting = false;
      $("#start-camera").disabled = false;
      $("#engine-status").textContent = "OpenCV ready · runs on your device";
    }
  }
});
$("#stop").addEventListener("click", () => stop());
$("#reset").addEventListener("click", resetBackground);
for (const key of ["brightness", "motion", "erosion"]) {
  $(`#${key}`).addEventListener("input", event => {
    settings[key] = Number(event.target.value);
    $(`#${key}-value`).textContent = key === "erosion" ? `${settings[key]} × ${settings[key]}` : String(settings[key]);
  });
}
document.querySelectorAll("[data-view]").forEach(button => button.addEventListener("click", () => {
  view = button.dataset.view;
  document.querySelectorAll("[data-view]").forEach(item => {
    item.classList.toggle("active", item === button);
    item.setAttribute("aria-pressed", String(item === button));
  });
}));
window.addEventListener("pagehide", () => { stop(); tracker?.destroy(); tracker = null; });
window.addEventListener("pageshow", () => initialize());
document.addEventListener("visibilitychange", () => { if (document.hidden) stop(); });
