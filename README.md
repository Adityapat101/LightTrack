# LightTrack

A small computer vision project that follows a moving light and maps its position to a cursor. The desktop app uses Python, OpenCV, and PyAutoGUI. The web demo uses OpenCV.js to show the same processing steps without installing anything.

**[Live demo](https://lighttrack-beta.vercel.app/)** · **[Download the Python app](https://lighttrack-beta.vercel.app/LightTrack-python.zip)**

## Run the Python app

Use Python 3.12 or newer and a webcam:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
python lighttrack.py
```

Keep the camera still. Start with the light out of frame so the app can learn the room background, then move a small torch into view. A dim room and a small bright source work better than a large reflection. The image is mirrored so moving right moves the cursor right.

The app starts in preview mode. Press **M** to enable or pause desktop cursor control, **R** to reset the background, **V** to toggle the combined mask, and **Q** or **Esc** to quit. PyAutoGUI's corner fail-safe stays enabled; moving the mouse to a screen corner pauses control. There is no automatic clicking.

On macOS, allow the terminal app to use the camera. Desktop cursor movement also needs Accessibility permission for the terminal app. On Linux, PyAutoGUI generally needs an X11 desktop session. The web version works without these desktop permissions.

Optional parameters:

```bash
python lighttrack.py --camera 0 --brightness 215 --motion 22 --min-area 24
```

## How it works

1. Read a webcam frame, mirror it, convert to grayscale, and apply a small Gaussian blur.
2. Subtract a running-average background and threshold the difference to find foreground movement.
3. Separately threshold the grayscale image to keep bright pixels.
4. Combine the foreground and brightness masks with a bitwise AND.
5. Erode the combined mask with a configurable square kernel to remove small specks.
6. Find external contours, discard tiny ones, and rank the remaining contours by area. Draw bounding boxes and track the centroid of the largest contour. Zero, one, or several contours are handled.
7. Map the target's coordinates to the screen, clamp to valid pixels, and smooth successive cursor positions. If no target is found, leave the desktop cursor alone.

`tracker.py` contains the camera-independent detection and coordinate mapping. `lighttrack.py` is the webcam window and optional PyAutoGUI connection. `web/tracking.mjs` implements the same pipeline with OpenCV.js; `web/app.js` connects it to a webcam or a generated example scene.

## Browser demo

The page supports live webcam input, an explicitly labeled generated example, motion/combined-mask views, and brightness, motion, and erosion controls. The example contains a static lamp, dim movement, isolated noise, and a moving light. Its frames go through the actual OpenCV pipeline; the target location is detected from pixels, not read from the animation's coordinates.

Frames are processed locally and are not uploaded or recorded. The camera is requested only after clicking **Use my camera** and is released when stopped or when leaving the tab. The browser demo moves a cursor **inside the preview**. Browsers cannot use PyAutoGUI to move the operating system cursor; run the Python app for that feature.

To preview the site locally (Node 22+ and Python 3):

```bash
npm run build
npm run dev
```

Open <http://127.0.0.1:4173>. No npm packages need to be installed. Vercel runs the same build and serves `dist/` as static files. The Python download is generated from the maintained source during the build.

The current deployment was published with the Vercel CLI. Automatic GitHub-to-Vercel deployment is not connected because the Vercel account needs its GitHub login connection first. To publish an update from a linked local checkout, run `vercel deploy --prod`.

## Checks

```bash
python -m unittest discover -s tests -v
npm test
npm run build
```

The Python and browser-pipeline tests use generated frames to check moving-light location, static lighting rejection, dim movement, noise, contour ranking, erosion, background reset, and coordinate mapping. These checks do not verify a physical webcam or desktop accessibility permissions. The GitHub workflow runs both sets of tests and builds the site.

## Limits

This is a threshold-based experiment, with no trained model or identity tracking. Several bright moving objects can make the target switch. Moving the camera changes the background; reset it and hold still. A stationary light is eventually absorbed into the background. Reflections, overexposure, and room brightness need parameter adjustments. No FPS, accuracy, latency, or real-user performance claims have been measured for the project.

## References and license

- [OpenCV contour tutorial](https://docs.opencv.org/4.13.0/d5/daa/tutorial_js_contours_begin.html)
- [OpenCV image arithmetic](https://docs.opencv.org/4.13.0/d0/d86/tutorial_py_image_arithmetics.html)
- [PyAutoGUI mouse control](https://pyautogui.readthedocs.io/en/latest/mouse.html)
- [Browser camera API](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia)

Project code is MIT licensed. The unmodified `web/vendor/opencv.js` runtime was downloaded from the [official OpenCV 4.13.0 build](https://docs.opencv.org/4.13.0/opencv.js); its Apache 2.0 license is included alongside it.
