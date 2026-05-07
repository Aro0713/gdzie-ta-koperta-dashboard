import argparse
import json
from collections import Counter
from pathlib import Path
from typing import Any

import cv2
import numpy as np
import requests
from pyproj import Transformer


WMS_URL = "https://mapy.geoportal.gov.pl/wss/service/PZGIK/ORTO/WMS/HighResolution"

OUT_DIR = Path("data/ai-crawler")
OUT_DIR.mkdir(parents=True, exist_ok=True)

MODEL_VERSION = "blue-envelope-detector-mvp-v3-white-rectangle-cross"
IMAGERY_SOURCE = "geoportal-orto-wms-high-resolution"

WGS84_TO_3857 = Transformer.from_crs("EPSG:4326", "EPSG:3857", always_xy=True)
MERCATOR_TO_WGS84 = Transformer.from_crs("EPSG:3857", "EPSG:4326", always_xy=True)


def wgs84_to_3857(lng: float, lat: float) -> tuple[float, float]:
    return WGS84_TO_3857.transform(lng, lat)


def mercator_to_wgs84(x: float, y: float) -> tuple[float, float]:
    return MERCATOR_TO_WGS84.transform(x, y)


def json_default(value: Any):
    if isinstance(value, np.integer):
        return int(value)

    if isinstance(value, np.floating):
        return float(value)

    if isinstance(value, np.bool_):
        return bool(value)

    if isinstance(value, np.ndarray):
        return value.tolist()

    raise TypeError(f"Object of type {type(value).__name__} is not JSON serializable")


def download_ortho(
    west: float,
    south: float,
    east: float,
    north: float,
    size: int,
) -> tuple[Path, tuple[float, float, float, float]]:
    minx, miny = wgs84_to_3857(west, south)
    maxx, maxy = wgs84_to_3857(east, north)

    params = {
        "SERVICE": "WMS",
        "VERSION": "1.3.0",
        "REQUEST": "GetMap",
        "LAYERS": "Raster",
        "STYLES": "",
        "CRS": "EPSG:3857",
        "BBOX": f"{minx},{miny},{maxx},{maxy}",
        "WIDTH": str(size),
        "HEIGHT": str(size),
        "FORMAT": "image/png",
        "TRANSPARENT": "false",
    }

    response = requests.get(
        WMS_URL,
        params=params,
        timeout=45,
        headers={
            "User-Agent": "GdzieTaKoperta AI crawler dev contact:www.gdzietakoperta.pl"
        },
    )
    response.raise_for_status()

    content = response.content

    if content.lstrip().startswith(b"<?xml") or b"ServiceException" in content[:800]:
        raise RuntimeError(
            "Geoportal WMS zwrócił XML zamiast obrazu. Sprawdź BBOX, warstwę albo CRS."
        )

    image_path = OUT_DIR / "ortho_test.png"
    image_path.write_bytes(content)

    return image_path, (minx, miny, maxx, maxy)


def pixel_to_wgs84(
    x: int,
    y: int,
    width: int,
    height: int,
    mercator_bbox: tuple[float, float, float, float],
) -> tuple[float, float]:
    minx, miny, maxx, maxy = mercator_bbox

    mercator_x = minx + (x / width) * (maxx - minx)
    mercator_y = maxy - (y / height) * (maxy - miny)

    lng, lat = mercator_to_wgs84(mercator_x, mercator_y)

    return lat, lng


def clamp01(value: float) -> float:
    return max(0.0, min(1.0, value))


def clip_rect(
    x1: int,
    y1: int,
    x2: int,
    y2: int,
    width: int,
    height: int,
) -> tuple[int, int, int, int]:
    return (
        max(0, min(width, x1)),
        max(0, min(height, y1)),
        max(0, min(width, x2)),
        max(0, min(height, y2)),
    )


def rect_area(rect: tuple[int, int, int, int]) -> int:
    x1, y1, x2, y2 = rect
    return max(0, x2 - x1) * max(0, y2 - y1)


def count_mask(mask: np.ndarray, rect: tuple[int, int, int, int]) -> int:
    x1, y1, x2, y2 = rect

    if x2 <= x1 or y2 <= y1:
        return 0

    return int(cv2.countNonZero(mask[y1:y2, x1:x2]))


def mask_ratio(mask: np.ndarray, rect: tuple[int, int, int, int]) -> float:
    area = rect_area(rect)

    if area <= 0:
        return 0.0

    return count_mask(mask, rect) / area


def ring_ratio(
    mask: np.ndarray,
    outer_rect: tuple[int, int, int, int],
    inner_rect: tuple[int, int, int, int],
) -> float:
    outer_area = rect_area(outer_rect)
    inner_area = rect_area(inner_rect)
    ring_area = max(outer_area - inner_area, 1)

    outer_count = count_mask(mask, outer_rect)
    inner_count = count_mask(mask, inner_rect)

    return max(0, outer_count - inner_count) / ring_area


def order_points(points: np.ndarray) -> np.ndarray:
    ordered = np.zeros((4, 2), dtype=np.float32)

    points = points.astype(np.float32)

    point_sum = points.sum(axis=1)
    point_diff = np.diff(points, axis=1)

    ordered[0] = points[np.argmin(point_sum)]
    ordered[2] = points[np.argmax(point_sum)]
    ordered[1] = points[np.argmin(point_diff)]
    ordered[3] = points[np.argmax(point_diff)]

    return ordered


def expanded_rotated_box(
    rect: tuple[tuple[float, float], tuple[float, float], float],
    scale: float,
) -> tuple[np.ndarray, int, int]:
    center, size, angle = rect
    rect_w, rect_h = size

    rect_w = max(rect_w * scale, 8)
    rect_h = max(rect_h * scale, 8)

    expanded_rect = (center, (rect_w, rect_h), angle)
    box = cv2.boxPoints(expanded_rect).astype(np.float32)

    out_w = max(12, int(round(rect_w)))
    out_h = max(12, int(round(rect_h)))

    return box, out_w, out_h


def warp_patch(
    source: np.ndarray,
    box: np.ndarray,
    out_w: int,
    out_h: int,
    nearest: bool,
) -> np.ndarray:
    src_points = order_points(box)

    dst_points = np.array(
        [
            [0, 0],
            [out_w - 1, 0],
            [out_w - 1, out_h - 1],
            [0, out_h - 1],
        ],
        dtype=np.float32,
    )

    matrix = cv2.getPerspectiveTransform(src_points, dst_points)
    interpolation = cv2.INTER_NEAREST if nearest else cv2.INTER_LINEAR

    return cv2.warpPerspective(
        source,
        matrix,
        (out_w, out_h),
        flags=interpolation,
        borderMode=cv2.BORDER_REPLICATE,
    )


def build_context_masks(image: np.ndarray) -> dict[str, np.ndarray]:
    hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
    h, s, v = cv2.split(hsv)
    b, g, r = cv2.split(image)

    b_i = b.astype(np.int16)
    g_i = g.astype(np.int16)
    r_i = r.astype(np.int16)

    vivid_blue_hsv = (
        (h >= 94)
        & (h <= 132)
        & (s >= 75)
        & (v >= 50)
    )

    shadow_blue_hsv = (
        (h >= 90)
        & (h <= 138)
        & (s >= 105)
        & (v >= 35)
    )

    blue_excess = (
        (b_i > r_i + 18)
        & (b_i > g_i + 4)
    )

    blue_mask = ((vivid_blue_hsv | shadow_blue_hsv) & blue_excess).astype(np.uint8) * 255

    white_mask = (
        (s <= 78)
        & (v >= 145)
        & (r >= 125)
        & (g >= 125)
        & (b >= 125)
    ).astype(np.uint8) * 255

    hard_white_mask = (
        (s <= 60)
        & (v >= 170)
        & (r >= 150)
        & (g >= 150)
        & (b >= 150)
    ).astype(np.uint8) * 255

    green_mask = (
        (h >= 35)
        & (h <= 90)
        & (s >= 45)
        & (v >= 40)
    ).astype(np.uint8) * 255

    red_roof_mask = (
        (((h <= 14) | (h >= 165)))
        & (s >= 55)
        & (v >= 55)
    ).astype(np.uint8) * 255

    paved_gray_mask = (
        (s <= 82)
        & (v >= 42)
        & (v <= 245)
    )

    paved_warm_mask = (
        (h >= 12)
        & (h <= 42)
        & (s <= 115)
        & (v >= 52)
        & (v <= 235)
    )

    paved_mask = (
        (paved_gray_mask | paved_warm_mask)
        & (green_mask == 0)
        & (blue_mask == 0)
        & (red_roof_mask == 0)
    ).astype(np.uint8) * 255

    return {
        "blue": blue_mask,
        "white": white_mask,
        "hard_white": hard_white_mask,
        "green": green_mask,
        "red_roof": red_roof_mask,
        "paved": paved_mask,
    }


def preprocess_blue_mask(blue_mask: np.ndarray) -> np.ndarray:
    open_kernel = np.ones((3, 3), np.uint8)
    close_kernel = np.ones((15, 15), np.uint8)

    mask = cv2.morphologyEx(blue_mask, cv2.MORPH_OPEN, open_kernel)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, close_kernel)

    return mask


def largest_blue_bbox(blue_patch: np.ndarray) -> tuple[int, int, int, int] | None:
    contours, _ = cv2.findContours(blue_patch, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    if not contours:
        return None

    contour = max(contours, key=cv2.contourArea)
    x, y, w, h = cv2.boundingRect(contour)

    if w <= 0 or h <= 0:
        return None

    return x, y, w, h


def strip_horizontal_coverage(mask: np.ndarray, rect: tuple[int, int, int, int]) -> float:
    x1, y1, x2, y2 = rect

    if x2 <= x1 or y2 <= y1:
        return 0.0

    crop = mask[y1:y2, x1:x2]

    if crop.size == 0:
        return 0.0

    columns_with_white = np.count_nonzero(np.max(crop, axis=0) > 0)

    return columns_with_white / max(1, x2 - x1)


def strip_vertical_coverage(mask: np.ndarray, rect: tuple[int, int, int, int]) -> float:
    x1, y1, x2, y2 = rect

    if x2 <= x1 or y2 <= y1:
        return 0.0

    crop = mask[y1:y2, x1:x2]

    if crop.size == 0:
        return 0.0

    rows_with_white = np.count_nonzero(np.max(crop, axis=1) > 0)

    return rows_with_white / max(1, y2 - y1)


def white_rectangle_outline_score(
    white_patch: np.ndarray,
    blue_bbox: tuple[int, int, int, int],
) -> tuple[float, int, dict[str, float]]:
    height, width = white_patch.shape[:2]
    x, y, w, h = blue_bbox

    pad = max(3, int(min(w, h) * 0.10))
    band = max(3, int(min(w, h) * 0.12))

    left = max(0, x - pad)
    top = max(0, y - pad)
    right = min(width, x + w + pad)
    bottom = min(height, y + h + pad)

    top_rect = clip_rect(left, top, right, top + band, width, height)
    bottom_rect = clip_rect(left, bottom - band, right, bottom, width, height)
    left_rect = clip_rect(left, top, left + band, bottom, width, height)
    right_rect = clip_rect(right - band, top, right, bottom, width, height)

    side_scores = {
        "top": strip_horizontal_coverage(white_patch, top_rect),
        "bottom": strip_horizontal_coverage(white_patch, bottom_rect),
        "left": strip_vertical_coverage(white_patch, left_rect),
        "right": strip_vertical_coverage(white_patch, right_rect),
    }

    good_sides = sum(score >= 0.18 for score in side_scores.values())
    outline_score = float(np.mean(list(side_scores.values())))

    return outline_score, good_sides, side_scores


def hough_cross_score(
    white_patch: np.ndarray,
    blue_bbox: tuple[int, int, int, int],
) -> tuple[float, int, list[float]]:
    height, width = white_patch.shape[:2]
    x, y, w, h = blue_bbox

    margin_x = max(2, int(w * 0.10))
    margin_y = max(2, int(h * 0.10))

    inner = clip_rect(
        x + margin_x,
        y + margin_y,
        x + w - margin_x,
        y + h - margin_y,
        width,
        height,
    )

    x1, y1, x2, y2 = inner

    if x2 <= x1 or y2 <= y1:
        return 0.0, 0, []

    crop = white_patch[y1:y2, x1:x2]
    crop = cv2.morphologyEx(crop, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))

    min_dim = min(crop.shape[:2])

    if min_dim < 8:
        return 0.0, 0, []

    lines = cv2.HoughLinesP(
        crop,
        rho=1,
        theta=np.pi / 180,
        threshold=max(8, int(min_dim * 0.16)),
        minLineLength=max(6, int(min_dim * 0.32)),
        maxLineGap=max(2, int(min_dim * 0.10)),
    )

    if lines is None:
        return 0.0, 0, []

    angles: list[float] = []
    lengths: list[float] = []

    for line in lines[:, 0]:
        lx1, ly1, lx2, ly2 = [float(value) for value in line]
        dx = lx2 - lx1
        dy = ly2 - ly1
        length = float(np.hypot(dx, dy))

        if length < max(6, min_dim * 0.28):
            continue

        angle = abs(np.degrees(np.arctan2(dy, dx))) % 180
        angles.append(angle)
        lengths.append(length)

    if len(angles) < 2:
        return 0.0, len(angles), angles

    max_cross = 0.0

    for i, first_angle in enumerate(angles):
        for second_angle in angles[i + 1:]:
            diff = abs(first_angle - second_angle)
            diff = min(diff, 180 - diff)

            if 35 <= diff <= 145:
                max_cross = max(max_cross, 1.0 - abs(diff - 90) / 90)

    if max_cross <= 0:
        return 0.0, len(angles), angles

    length_score = clamp01(sum(lengths) / max(1.0, min_dim * 3.0))
    count_score = clamp01(len(angles) / 5)

    score = clamp01(max_cross * 0.55 + length_score * 0.30 + count_score * 0.15)

    return score, len(angles), angles


def diagonal_band_cross_score(
    white_patch: np.ndarray,
    blue_bbox: tuple[int, int, int, int],
) -> tuple[float, float, float]:
    height, width = white_patch.shape[:2]
    x, y, w, h = blue_bbox

    margin_x = max(2, int(w * 0.12))
    margin_y = max(2, int(h * 0.12))

    inner = clip_rect(
        x + margin_x,
        y + margin_y,
        x + w - margin_x,
        y + h - margin_y,
        width,
        height,
    )

    x1, y1, x2, y2 = inner

    if x2 <= x1 or y2 <= y1:
        return 0.0, 0.0, 0.0

    crop = white_patch[y1:y2, x1:x2]

    crop_h, crop_w = crop.shape[:2]

    if crop_h < 8 or crop_w < 8:
        return 0.0, 0.0, 0.0

    yy, xx = np.indices((crop_h, crop_w))

    band = max(2, int(min(crop_w, crop_h) * 0.12))

    diag_1 = np.abs(yy - (crop_h / max(crop_w, 1)) * xx) <= band
    diag_2 = np.abs(yy - (-crop_h / max(crop_w, 1)) * xx - crop_h) <= band

    white = crop > 0

    diag_1_score = float(np.count_nonzero(white & diag_1) / max(1, np.count_nonzero(diag_1)))
    diag_2_score = float(np.count_nonzero(white & diag_2) / max(1, np.count_nonzero(diag_2)))

    cross_score = clamp01((diag_1_score + diag_2_score) / 0.18)

    return cross_score, diag_1_score, diag_2_score


def classify_patch(
    *,
    patch_masks: dict[str, np.ndarray],
    blue_bbox: tuple[int, int, int, int],
    meters_per_pixel_x: float,
    meters_per_pixel_y: float,
) -> tuple[bool, float, str, dict[str, Any]]:
    blue_patch = patch_masks["blue"]
    white_patch = patch_masks["white"]
    hard_white_patch = patch_masks["hard_white"]

    height, width = blue_patch.shape[:2]
    x, y, w, h = blue_bbox

    inner_rect = clip_rect(x, y, x + w, y + h, width, height)

    context_margin = max(18, int(max(w, h) * 1.25))
    outer_rect = clip_rect(
        x - context_margin,
        y - context_margin,
        x + w + context_margin,
        y + h + context_margin,
        width,
        height,
    )

    blue_area_px = count_mask(blue_patch, inner_rect)
    bbox_area_px = max(w * h, 1)
    fill_ratio = blue_area_px / bbox_area_px

    width_m = w * meters_per_pixel_x
    height_m = h * meters_per_pixel_y
    min_dim_m = min(width_m, height_m)
    max_dim_m = max(width_m, height_m)
    blue_area_m2 = blue_area_px * meters_per_pixel_x * meters_per_pixel_y

    paved_ratio = ring_ratio(patch_masks["paved"], outer_rect, inner_rect)
    green_ratio = ring_ratio(patch_masks["green"], outer_rect, inner_rect)
    red_roof_ratio = ring_ratio(patch_masks["red_roof"], outer_rect, inner_rect)

    white_inside_ratio = mask_ratio(white_patch, inner_rect)
    hard_white_inside_ratio = mask_ratio(hard_white_patch, inner_rect)

    outline_score, outline_good_sides, outline_sides = white_rectangle_outline_score(
        white_patch,
        blue_bbox,
    )

    hough_score, white_line_count, white_line_angles = hough_cross_score(
        hard_white_patch,
        blue_bbox,
    )

    diagonal_score, diagonal_1_score, diagonal_2_score = diagonal_band_cross_score(
        hard_white_patch,
        blue_bbox,
    )

    cross_score = max(hough_score, diagonal_score)

    evidence = {
        "blueAreaPixels": int(blue_area_px),
        "bboxAreaPixels": int(bbox_area_px),
        "blueAreaM2": round(blue_area_m2, 2),
        "bboxMeters": {
            "w": round(width_m, 2),
            "h": round(height_m, 2),
        },
        "blueFillRatio": round(fill_ratio, 4),
        "whiteInsideRatio": round(white_inside_ratio, 4),
        "hardWhiteInsideRatio": round(hard_white_inside_ratio, 4),
        "whiteRectangleOutlineScore": round(outline_score, 4),
        "whiteRectangleGoodSides": int(outline_good_sides),
        "whiteRectangleSides": {
            key: round(value, 4)
            for key, value in outline_sides.items()
        },
        "whiteCrossScore": round(cross_score, 4),
        "houghCrossScore": round(hough_score, 4),
        "whiteLineCount": int(white_line_count),
        "whiteLineAngles": [round(float(angle), 1) for angle in white_line_angles[:12]],
        "diagonalBandCrossScore": round(diagonal_score, 4),
        "diagonalBandScores": {
            "diag1": round(diagonal_1_score, 4),
            "diag2": round(diagonal_2_score, 4),
        },
        "pavedContextRatio": round(paved_ratio, 4),
        "greenContextRatio": round(green_ratio, 4),
        "redRoofContextRatio": round(red_roof_ratio, 4),
        "bboxPixels": {"x": int(x), "y": int(y), "w": int(w), "h": int(h)},
    }

    if min_dim_m < 0.55:
        return False, 0.0, "too_small", evidence

    if max_dim_m > 8.8:
        return False, 0.0, "too_large", evidence

    if blue_area_m2 < 1.5:
        return False, 0.0, "blue_area_too_small", evidence

    if blue_area_m2 > 36:
        return False, 0.0, "blue_area_too_large", evidence

    ratio = w / max(h, 1)

    if ratio < 0.35 or ratio > 3.2:
        return False, 0.0, "bad_aspect_ratio", evidence

    if fill_ratio < 0.18:
        return False, 0.0, "blue_fill_too_low", evidence

    if paved_ratio < 0.22:
        return False, 0.0, "not_paved_context", evidence

    if green_ratio > 0.55:
        return False, 0.0, "vegetation_context", evidence

    if red_roof_ratio > 0.24 and paved_ratio < 0.45:
        return False, 0.0, "roof_like_context", evidence

    if white_inside_ratio < 0.020:
        return False, 0.0, "no_white_marking_inside_blue_field", evidence

    if hard_white_inside_ratio < 0.010:
        return False, 0.0, "no_strong_white_marking_inside_blue_field", evidence

    if outline_good_sides < 2 or outline_score < 0.14:
        return False, 0.0, "no_white_rectangle_outline", evidence

    if cross_score < 0.30:
        return False, 0.0, "no_crossed_white_lines", evidence

    car_like = (
        max_dim_m <= 5.8
        and min_dim_m <= 2.8
        and fill_ratio > 0.30
        and outline_score < 0.24
        and cross_score < 0.48
    )

    motorcycle_like = (
        blue_area_m2 < 3.2
        and outline_score < 0.25
        and cross_score < 0.44
    )

    if car_like:
        return False, 0.0, "vehicle_like", evidence

    if motorcycle_like:
        return False, 0.0, "motorcycle_or_small_object_like", evidence

    size_score = clamp01((blue_area_m2 - 1.5) / 12.0)
    fill_score = clamp01(fill_ratio / 0.55)
    paved_score = clamp01((paved_ratio - 0.22) / 0.50)
    white_score = clamp01(white_inside_ratio / 0.07)
    hard_white_score = clamp01(hard_white_inside_ratio / 0.045)
    outline_norm_score = clamp01(outline_score / 0.38)
    good_sides_score = clamp01(outline_good_sides / 4)
    cross_norm_score = clamp01(cross_score / 0.75)

    roof_penalty = clamp01(red_roof_ratio / 0.35) * 0.18
    green_penalty = clamp01(green_ratio / 0.55) * 0.22

    confidence = (
        size_score * 0.10
        + fill_score * 0.08
        + paved_score * 0.13
        + white_score * 0.13
        + hard_white_score * 0.12
        + outline_norm_score * 0.18
        + good_sides_score * 0.10
        + cross_norm_score * 0.26
        - roof_penalty
        - green_penalty
    )

    confidence = clamp01(confidence)

    if confidence < 0.64:
        return False, confidence, "low_confidence", evidence

    return True, confidence, "accepted", evidence


def detect_blue_candidates(
    image_path: Path,
    mercator_bbox: tuple[float, float, float, float],
    min_confidence: float,
    debug_rejected: bool,
):
    image = cv2.imread(str(image_path))
    if image is None:
        raise RuntimeError("Nie udało się odczytać obrazu ortofoto.")

    height, width = image.shape[:2]
    minx, miny, maxx, maxy = mercator_bbox

    meters_per_pixel_x = abs(maxx - minx) / width
    meters_per_pixel_y = abs(maxy - miny) / height

    masks = build_context_masks(image)
    blue_mask = preprocess_blue_mask(masks["blue"])

    contours, _ = cv2.findContours(
        blue_mask,
        cv2.RETR_EXTERNAL,
        cv2.CHAIN_APPROX_SIMPLE,
    )

    candidates: list[dict[str, Any]] = []
    rejected: list[dict[str, Any]] = []
    reject_summary: Counter[str] = Counter()

    debug = image.copy()

    for contour in contours:
        contour_area = cv2.contourArea(contour)

        if contour_area < 20:
            continue

        rect = cv2.minAreaRect(contour)
        center, rect_size, angle = rect
        rect_w, rect_h = rect_size

        if rect_w <= 0 or rect_h <= 0:
            continue

        field_box = cv2.boxPoints(rect).astype(np.int32)
        expanded_box, out_w, out_h = expanded_rotated_box(rect, scale=1.45)

        patch_masks = {
            key: warp_patch(mask, expanded_box, out_w, out_h, nearest=True)
            for key, mask in masks.items()
        }

        blue_bbox = largest_blue_bbox(patch_masks["blue"])

        if blue_bbox is None:
            continue

        accepted, confidence, reason, evidence = classify_patch(
            patch_masks=patch_masks,
            blue_bbox=blue_bbox,
            meters_per_pixel_x=meters_per_pixel_x,
            meters_per_pixel_y=meters_per_pixel_y,
        )

        if confidence < min_confidence:
            accepted = False
            reason = "below_min_confidence"

        center_x = int(round(center[0]))
        center_y = int(round(center[1]))
        lat, lng = pixel_to_wgs84(
            center_x,
            center_y,
            width,
            height,
            mercator_bbox,
        )

        evidence["reason"] = reason
        evidence["rotatedRectPixels"] = {
            "centerX": int(center_x),
            "centerY": int(center_y),
            "w": round(float(rect_w), 2),
            "h": round(float(rect_h), 2),
            "angle": round(float(angle), 2),
        }

        if accepted:
            candidate = {
                "lat": round(lat, 7),
                "lng": round(lng, 7),
                "confidence": round(confidence, 4),
                "modelVersion": MODEL_VERSION,
                "detectionHash": (
                    f"{MODEL_VERSION}:"
                    f"{round(lat, 7)}:"
                    f"{round(lng, 7)}:"
                    f"{round(evidence['blueAreaPixels'], 1)}:"
                    f"{round(confidence, 4)}"
                ),
                "imagerySource": IMAGERY_SOURCE,
                "evidence": evidence,
            }

            candidates.append(candidate)

            cv2.polylines(debug, [field_box], True, (0, 220, 0), 2)
            cv2.putText(
                debug,
                f"AI {confidence:.2f}",
                (center_x + 4, max(0, center_y - 6)),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.42,
                (0, 220, 0),
                1,
                cv2.LINE_AA,
            )
        else:
            reject_summary[reason] += 1

            rejected.append(
                {
                    "lat": round(lat, 7),
                    "lng": round(lng, 7),
                    "confidence": round(confidence, 4),
                    "reason": reason,
                    "evidence": evidence,
                }
            )

            if debug_rejected:
                cv2.polylines(debug, [field_box], True, (0, 0, 255), 1)
                cv2.putText(
                    debug,
                    reason[:24],
                    (center_x + 4, max(0, center_y - 6)),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.34,
                    (0, 0, 255),
                    1,
                    cv2.LINE_AA,
                )

    debug_path = OUT_DIR / "ortho_debug_candidates.png"
    cv2.imwrite(str(debug_path), debug)

    rejected_path = OUT_DIR / "gtk_ai_candidates_rejected.json"
    rejected_path.write_text(
        json.dumps(
            {
                "count": len(rejected),
                "summary": dict(reject_summary),
                "rejected": rejected[:700],
            },
            ensure_ascii=False,
            indent=2,
            default=json_default,
        ),
        encoding="utf-8",
    )

    return candidates, debug_path, rejected_path, dict(reject_summary)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--bbox", required=True, help="west,south,east,north")
    parser.add_argument("--size", type=int, default=1800)
    parser.add_argument("--min-confidence", type=float, default=0.64)
    parser.add_argument("--debug-rejected", action="store_true")
    args = parser.parse_args()

    west, south, east, north = [float(value) for value in args.bbox.split(",")]

    image_path, mercator_bbox = download_ortho(west, south, east, north, args.size)

    candidates, debug_path, rejected_path, reject_summary = detect_blue_candidates(
        image_path=image_path,
        mercator_bbox=mercator_bbox,
        min_confidence=args.min_confidence,
        debug_rejected=args.debug_rejected,
    )

    preview_output = {
        "ok": True,
        "count": len(candidates),
        "image": str(image_path),
        "debugImage": str(debug_path),
        "rejectedFile": str(rejected_path),
        "rejectSummary": reject_summary,
        "requirements": {
            "blueField": True,
            "whiteRectangleOutline": True,
            "crossedWhiteLines": True,
            "pavedContext": True,
            "rejectVehiclesRoofsVegetation": True,
        },
        "candidates": candidates,
    }

    preview_path = OUT_DIR / "gtk_ai_candidates_preview.json"
    preview_path.write_text(
        json.dumps(
            preview_output,
            ensure_ascii=False,
            indent=2,
            default=json_default,
        ),
        encoding="utf-8",
    )

    import_payload_path = OUT_DIR / "gtk_ai_candidates_import.json"
    import_payload_path.write_text(
        json.dumps(
            {"candidates": candidates},
            ensure_ascii=False,
            indent=2,
            default=json_default,
        ),
        encoding="utf-8",
    )

    print(
        json.dumps(
            preview_output,
            ensure_ascii=False,
            indent=2,
            default=json_default,
        )
    )


if __name__ == "__main__":
    main()