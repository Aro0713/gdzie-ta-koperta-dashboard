from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any

import geopandas as gpd
import osmnx as ox
import pandas as pd
from pyproj import Transformer
from shapely.geometry import box


ROOT = Path(__file__).resolve().parents[2]
AREAS_FILE = ROOT / "scripts" / "osm" / "areas.json"
OUT_DIR = ROOT / "data" / "ai-crawler"
OUT_DIR.mkdir(parents=True, exist_ok=True)

SQL_OUT = OUT_DIR / "seed_scan_tiles.sql"

POLAND_PROJECTED_CRS = "EPSG:2180"
WGS84_CRS = "EPSG:4326"

TO_WGS84 = Transformer.from_crs(POLAND_PROJECTED_CRS, WGS84_CRS, always_xy=True)

NON_PUBLIC_ACCESS_VALUES = {
    "private",
    "no",
    "military",
    "emergency",
    "delivery",
    "residents",
    "permit",
}

ACCESS_KEYS = [
    "access",
    "vehicle",
    "motor_vehicle",
    "motorcar",
    "foot",
]


def load_areas() -> list[dict[str, Any]]:
    with AREAS_FILE.open("r", encoding="utf-8-sig") as file:
        data = json.load(file)

    if not isinstance(data, list):
        raise ValueError("areas.json must contain a list")

    return data


def as_text(value: Any) -> str | None:
    if value is None:
        return None

    try:
        if pd.isna(value):
            return None
    except TypeError:
        pass

    text = str(value).strip()

    return text or None


def safe_get(row: pd.Series, key: str) -> Any:
    if key in row:
        return row[key]

    return None


def normalize_tag_value(value: Any) -> str | None:
    text = as_text(value)

    if text is None:
        return None

    return text.lower().strip()


def is_non_public_access_value(value: Any) -> bool:
    text = normalize_tag_value(value)

    if text is None:
        return False

    parts = {
        part.strip()
        for part in text.replace(",", ";").split(";")
        if part.strip()
    }

    return any(part in NON_PUBLIC_ACCESS_VALUES for part in parts)


def row_has_non_public_access(row: pd.Series) -> bool:
    return any(is_non_public_access_value(safe_get(row, key)) for key in ACCESS_KEYS)


def get_osm_type_and_id(row: pd.Series) -> tuple[str, str]:
    osm_type = (
        as_text(safe_get(row, "element"))
        or as_text(safe_get(row, "element_type"))
        or as_text(safe_get(row, "osm_type"))
        or as_text(safe_get(row, "type"))
        or "unknown"
    )

    osm_id = (
        as_text(safe_get(row, "id"))
        or as_text(safe_get(row, "osmid"))
        or as_text(safe_get(row, "osm_id"))
        or "unknown"
    )

    return osm_type, osm_id


def fetch_public_parkings_for_area(area: dict[str, Any]) -> gpd.GeoDataFrame:
    place_query = area.get("place_query")

    if not place_query:
        raise ValueError(f"Area {area.get('id')} has no place_query")

    print(f"Fetching public parkings: {area['name']}")

    try:
        gdf = ox.features.features_from_place(
            query=place_query,
            tags={"amenity": "parking"},
        )
    except Exception as exc:
        message = str(exc)

        if "No data elements" in message or "InsufficientResponseError" in message:
            print(f"No parking data for {area['name']}")
            return gpd.GeoDataFrame(geometry=[], crs=WGS84_CRS)

        raise RuntimeError(f"Failed to fetch {area['name']}: {message}") from exc

    if gdf.empty:
        return gdf

    if gdf.crs is None:
        gdf = gdf.set_crs(WGS84_CRS)

    gdf = gdf.to_crs(WGS84_CRS).reset_index()

    keep_positions: list[int] = []

    for position, (_, row) in enumerate(gdf.iterrows()):
        amenity = as_text(safe_get(row, "amenity"))

        if amenity != "parking":
            continue

        if row_has_non_public_access(row):
            continue

        keep_positions.append(position)

    return gdf.iloc[keep_positions].copy()


def projected_bbox_to_wgs84(
    minx: float,
    miny: float,
    maxx: float,
    maxy: float,
) -> tuple[float, float, float, float]:
    points = [
        TO_WGS84.transform(minx, miny),
        TO_WGS84.transform(minx, maxy),
        TO_WGS84.transform(maxx, miny),
        TO_WGS84.transform(maxx, maxy),
    ]

    lngs = [point[0] for point in points]
    lats = [point[1] for point in points]

    west = min(lngs)
    east = max(lngs)
    south = min(lats)
    north = max(lats)

    return west, south, east, north


def make_tile_key(
    area_id: str,
    osm_type: str,
    osm_id: str,
    west: float,
    south: float,
    east: float,
    north: float,
) -> str:
    raw = f"{area_id}:{osm_type}:{osm_id}:{west:.7f}:{south:.7f}:{east:.7f}:{north:.7f}"
    digest = hashlib.sha1(raw.encode("utf-8")).hexdigest()[:16]

    return f"osm-parking-{area_id}-{digest}"


def build_tiles_for_parking(
    row: pd.Series,
    area: dict[str, Any],
    tile_size_m: float,
    margin_m: float,
) -> list[dict[str, Any]]:
    geometry = safe_get(row, "geometry")

    if geometry is None:
        return []

    try:
        if geometry.is_empty:
            return []
    except Exception:
        return []

    projected_geometry = (
        gpd.GeoSeries([geometry], crs=WGS84_CRS)
        .to_crs(POLAND_PROJECTED_CRS)
        .iloc[0]
    )

    if projected_geometry.is_empty:
        return []

    scan_geometry = projected_geometry.buffer(margin_m)
    minx, miny, maxx, maxy = scan_geometry.bounds

    osm_type, osm_id = get_osm_type_and_id(row)
    area_id = str(area["id"])

    tiles: list[dict[str, Any]] = []

    x = minx
    while x < maxx:
        y = miny

        while y < maxy:
            tile_geom = box(
                x,
                y,
                min(x + tile_size_m, maxx),
                min(y + tile_size_m, maxy),
            )

            if not tile_geom.intersects(scan_geometry):
                y += tile_size_m
                continue

            west, south, east, north = projected_bbox_to_wgs84(*tile_geom.bounds)

            tile_key = make_tile_key(
                area_id=area_id,
                osm_type=osm_type,
                osm_id=osm_id,
                west=west,
                south=south,
                east=east,
                north=north,
            )

            tiles.append(
                {
                    "tile_key": tile_key,
                    "west": round(west, 7),
                    "south": round(south, 7),
                    "east": round(east, 7),
                    "north": round(north, 7),
                    "priority": 20,
                }
            )

            y += tile_size_m

        x += tile_size_m

    return tiles


def sql_quote(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def write_sql(tiles: list[dict[str, Any]], output_path: Path) -> None:
    if not tiles:
        output_path.write_text("-- No tiles generated.\n", encoding="utf-8")
        return

    lines = [
        "INSERT INTO gtk_ai_scan_tiles (",
        "  tile_key,",
        "  west,",
        "  south,",
        "  east,",
        "  north,",
        "  priority",
        ")",
        "VALUES",
    ]

    values: list[str] = []

    for tile in tiles:
        values.append(
            "("
            + ", ".join(
                [
                    sql_quote(tile["tile_key"]),
                    str(tile["west"]),
                    str(tile["south"]),
                    str(tile["east"]),
                    str(tile["north"]),
                    str(tile["priority"]),
                ]
            )
            + ")"
        )

    lines.append(",\n".join(values))
    lines.append("ON CONFLICT (tile_key) DO NOTHING;")

    output_path.write_text("\n".join(lines), encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--tile-size-m", type=float, default=120)
    parser.add_argument("--margin-m", type=float, default=25)
    parser.add_argument("--max-areas", type=int, default=0)
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--limit-per-area", type=int, default=200)
    parser.add_argument("--output", default=str(SQL_OUT))
    args = parser.parse_args()

    ox.settings.use_cache = True
    ox.settings.log_console = True
    ox.settings.timeout = 240

    areas = load_areas()

    if args.max_areas > 0:
        areas = areas[: args.max_areas]

    all_tiles: list[dict[str, Any]] = []
    seen_keys: set[str] = set()
    area_summaries: list[dict[str, Any]] = []

    for index, area in enumerate(areas, start=1):
        print("=" * 80)
        print(f"Area {index}/{len(areas)}: {area['name']}")

        area_tiles_count = 0
        area_parking_count = 0

        gdf = fetch_public_parkings_for_area(area)

        if gdf.empty:
            area_summaries.append(
                {
                    "areaId": area["id"],
                    "areaName": area["name"],
                    "parkings": 0,
                    "tiles": 0,
                }
            )
            continue

        for _, row in gdf.iterrows():
            area_parking_count += 1

            tiles = build_tiles_for_parking(
                row=row,
                area=area,
                tile_size_m=args.tile_size_m,
                margin_m=args.margin_m,
            )

            for tile in tiles:
                if tile["tile_key"] in seen_keys:
                    continue

                seen_keys.add(tile["tile_key"])
                all_tiles.append(tile)
                area_tiles_count += 1

                if args.limit_per_area > 0 and area_tiles_count >= args.limit_per_area:
                    break

                if args.limit > 0 and len(all_tiles) >= args.limit:
                    break

            if args.limit_per_area > 0 and area_tiles_count >= args.limit_per_area:
                break

            if args.limit > 0 and len(all_tiles) >= args.limit:
                break

        area_summaries.append(
            {
                "areaId": area["id"],
                "areaName": area["name"],
                "parkings": area_parking_count,
                "tiles": area_tiles_count,
            }
        )

        print(
            json.dumps(
                area_summaries[-1],
                ensure_ascii=False,
                indent=2,
            )
        )

        if args.limit > 0 and len(all_tiles) >= args.limit:
            break

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    write_sql(all_tiles, output_path)

    summary = {
        "ok": True,
        "tiles": len(all_tiles),
        "output": str(output_path),
        "tileSizeMeters": args.tile_size_m,
        "marginMeters": args.margin_m,
        "maxAreas": args.max_areas,
        "limit": args.limit,
        "limitPerArea": args.limit_per_area,
        "areas": area_summaries,
    }

    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()