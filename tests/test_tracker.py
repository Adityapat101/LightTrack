import unittest

import cv2
import numpy as np

from tracker import CursorSmoother, LightTracker, Settings, screen_point


class TrackingTests(unittest.TestCase):
    def setUp(self):
        self.tracker = LightTracker()
        self.room = np.full((180, 240, 3), 30, np.uint8)
        cv2.rectangle(self.room, (10, 10), (45, 45), (255, 255, 255), -1)
        self.tracker.process(self.room)

    def test_static_lamp_and_dark_motion_are_ignored(self):
        moved = self.room.copy()
        cv2.rectangle(moved, (70, 60), (130, 120), (130, 130, 130), -1)
        self.assertIsNone(self.tracker.process(moved).target)

    def test_moving_bright_light_is_located(self):
        frame = self.room.copy()
        cv2.circle(frame, (120, 90), 15, (255, 255, 255), -1)
        result = self.tracker.process(frame)
        self.assertEqual(len(result.regions), 1)
        self.assertAlmostEqual(result.target.center[0], 120, delta=1)
        self.assertAlmostEqual(result.target.center[1], 90, delta=1)

    def test_multiple_contours_are_sorted_by_area(self):
        frame = self.room.copy()
        cv2.circle(frame, (100, 90), 18, (255, 255, 255), -1)
        cv2.circle(frame, (190, 125), 10, (255, 255, 255), -1)
        result = self.tracker.process(frame)
        self.assertEqual(len(result.regions), 2)
        self.assertGreater(result.regions[0].area, result.regions[1].area)
        self.assertAlmostEqual(result.target.center[0], 100, delta=1)

    def test_isolated_bright_noise_is_removed(self):
        frame = self.room.copy()
        frame[70, 120] = 255
        frame[110, 170] = 255
        self.assertEqual(self.tracker.process(frame).regions, [])

    def test_erosion_changes_the_detected_region(self):
        frame = self.room.copy()
        cv2.rectangle(frame, (90, 80), (130, 120), (255, 255, 255), -1)
        small = LightTracker(Settings(kernel_size=1))
        large = LightTracker(Settings(kernel_size=7))
        small.process(self.room)
        large.process(self.room)
        self.assertGreater(small.process(frame).target.area, large.process(frame).target.area)

    def test_reset_and_resolution_change_relearn_background(self):
        self.tracker.reset()
        self.assertIsNone(self.tracker.process(self.room).target)
        self.assertIsNone(self.tracker.process(np.zeros((80, 100, 3), np.uint8)).target)

    def test_empty_frame_is_rejected(self):
        with self.assertRaises(ValueError):
            self.tracker.process(None)

    def test_coordinate_mapping_stays_on_screen(self):
        self.assertEqual(screen_point((-50, -100), (640, 480), (1920, 1080)), (0, 0))
        self.assertEqual(screen_point((900, 700), (640, 480), (1920, 1080)), (1919, 1079))
        middle = screen_point((319.5, 239.5), (640, 480), (1920, 1080))
        self.assertEqual(middle, (960, 540))

    def test_smoothing_and_reacquisition(self):
        smoother = CursorSmoother(alpha=0.25)
        self.assertEqual(smoother.update((0, 0)), (0, 0))
        self.assertEqual(smoother.update((100, 80)), (25, 20))
        smoother.reset()
        self.assertEqual(smoother.update((100, 80)), (100, 80))


if __name__ == "__main__":
    unittest.main()
