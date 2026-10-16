"""The small, camera-independent OpenCV pipeline used by LightTrack."""

from dataclasses import dataclass

import cv2
import numpy as np


@dataclass
class Settings:
    brightness: int = 215
    motion: int = 22
    min_area: float = 24
    kernel_size: int = 3
    learning_rate: float = 0.025

    def __post_init__(self):
        if not 0 <= self.brightness <= 255 or not 0 <= self.motion <= 255:
            raise ValueError("Thresholds must be between 0 and 255.")
        if self.min_area < 0 or self.kernel_size not in (1, 3, 5, 7):
            raise ValueError("Use a nonnegative area and a kernel of 1, 3, 5, or 7.")
        if not 0 < self.learning_rate <= 1:
            raise ValueError("Learning rate must be between 0 (exclusive) and 1.")


@dataclass
class Region:
    box: tuple[int, int, int, int]
    center: tuple[float, float]
    area: float


@dataclass
class Detection:
    regions: list[Region]
    foreground: np.ndarray
    bright: np.ndarray
    mask: np.ndarray

    @property
    def target(self):
        return self.regions[0] if self.regions else None


class LightTracker:
    def __init__(self, settings=None):
        self.settings = settings or Settings()
        self.background = None

    def reset(self):
        self.background = None

    def process(self, frame):
        if frame is None or frame.ndim != 3 or frame.shape[2] != 3:
            raise ValueError("Expected a nonempty BGR camera frame.")
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        gray = cv2.GaussianBlur(gray, (5, 5), 0)
        if self.background is None or self.background.shape != gray.shape:
            self.background = gray.astype(np.float32)

        # A running average is the background model. Static lamps disappear from
        # the foreground mask, while moving dark objects fail the bright mask.
        difference = cv2.absdiff(gray, cv2.convertScaleAbs(self.background))
        _, foreground = cv2.threshold(difference, self.settings.motion, 255, cv2.THRESH_BINARY)
        _, bright = cv2.threshold(gray, self.settings.brightness, 255, cv2.THRESH_BINARY)
        mask = cv2.bitwise_and(foreground, bright)
        kernel = np.ones((self.settings.kernel_size, self.settings.kernel_size), np.uint8)
        mask = cv2.erode(mask, kernel, iterations=1)
        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        regions = []
        for contour in contours:
            area = cv2.contourArea(contour)
            if area < self.settings.min_area:
                continue
            x, y, width, height = cv2.boundingRect(contour)
            moments = cv2.moments(contour)
            center = ((moments["m10"] / moments["m00"], moments["m01"] / moments["m00"])
                      if moments["m00"] else (x + width / 2, y + height / 2))
            regions.append(Region((x, y, width, height), center, area))
        regions.sort(key=lambda region: region.area, reverse=True)
        cv2.accumulateWeighted(gray, self.background, self.settings.learning_rate)
        return Detection(regions, foreground, bright, mask)


def screen_point(center, frame_size, screen_size, margin=0.08):
    """Map the inner camera rectangle to the screen, clamped to real pixels."""
    if not 0 <= margin < 0.5 or min(*frame_size, *screen_size) <= 1:
        raise ValueError("Invalid frame, screen, or active margin.")
    coordinates = []
    for value, frame_length, screen_length in zip(center, frame_size, screen_size):
        normalized = (value / (frame_length - 1) - margin) / (1 - 2 * margin)
        coordinates.append(round(float(np.clip(normalized, 0, 1)) * (screen_length - 1)))
    return tuple(coordinates)


class CursorSmoother:
    def __init__(self, alpha=0.3):
        if not 0 < alpha <= 1:
            raise ValueError("Smoothing alpha must be between 0 (exclusive) and 1.")
        self.alpha = alpha
        self.point = None

    def reset(self):
        self.point = None

    def update(self, point):
        point = np.array(point, dtype=float)
        self.point = point if self.point is None else self.point + self.alpha * (point - self.point)
        return tuple(np.rint(self.point).astype(int))
