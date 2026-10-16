"""Run `python lighttrack.py`; press M to opt in to desktop cursor control."""

import argparse
import time

import cv2

from tracker import CursorSmoother, LightTracker, Settings, screen_point


def main():
    parser = argparse.ArgumentParser(description="Track a moving light with OpenCV.")
    parser.add_argument("--camera", type=int, default=0, help="Webcam device index (default: 0)")
    parser.add_argument("--brightness", type=int, default=215)
    parser.add_argument("--motion", type=int, default=22)
    parser.add_argument("--min-area", type=float, default=24)
    args = parser.parse_args()
    tracker = LightTracker(Settings(args.brightness, args.motion, args.min_area))
    smoother = CursorSmoother()
    camera = cv2.VideoCapture(args.camera)
    mouse = None
    controlling = False
    show_mask = False
    lost_since = None
    try:
        if not camera.isOpened():
            raise RuntimeError("Cannot open the webcam. Check camera permissions or try --camera 1.")
        camera.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
        camera.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
        print("Keep the camera still. Start with the light out of view, then move it into frame.")
        print("M: enable/pause cursor | R: relearn background | V: mask view | Q/Esc: quit")
        while True:
            ok, frame = camera.read()
            if not ok:
                raise RuntimeError("The webcam stopped returning frames.")
            frame = cv2.flip(frame, 1)
            detection = tracker.process(frame)
            if detection.target:
                lost_since = None
                for index, region in enumerate(detection.regions):
                    x, y, width, height = region.box
                    color = (110, 220, 80) if index == 0 else (150, 150, 150)
                    cv2.rectangle(frame, (x, y), (x + width, y + height), color, 2)
                center = detection.target.center
                cv2.circle(frame, tuple(round(value) for value in center), 4, (110, 220, 80), -1)
                if controlling:
                    destination = screen_point(center, (frame.shape[1], frame.shape[0]), mouse.size())
                    try:
                        mouse.moveTo(*smoother.update(destination), duration=0, _pause=False)
                    except mouse.FailSafeException:
                        controlling = False
                        smoother.reset()
                        print("Corner fail-safe triggered; cursor control paused. Press M to resume.")
            else:
                lost_since = lost_since or time.monotonic()
                if time.monotonic() - lost_since > 0.4:
                    smoother.reset()
            display = cv2.cvtColor(detection.mask, cv2.COLOR_GRAY2BGR) if show_mask else frame
            status = f"Cursor {'ON' if controlling else 'OFF'} | {len(detection.regions)} regions | M mouse  R reset  V mask  Q quit"
            cv2.putText(display, status, (12, 24), cv2.FONT_HERSHEY_SIMPLEX, 0.46, (80, 220, 110), 1)
            cv2.imshow("LightTrack", display)
            key = cv2.waitKey(1) & 0xFF
            if key in (ord("q"), 27):
                break
            if key == ord("r"):
                tracker.reset()
                smoother.reset()
            elif key == ord("v"):
                show_mask = not show_mask
            elif key == ord("m"):
                if mouse is None:
                    import pyautogui
                    mouse = pyautogui
                    mouse.FAILSAFE = True
                controlling = not controlling
                smoother.reset()
    finally:
        camera.release()
        cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
