from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import geopandas as gpd
import osmnx as ox
import pandas as pd
from shapely.geometry import Point

ROOT = Path(__file__).resolve().parents[2]
AREAS_FILE = ROOT / "scripts" / "osm" / "areas.json"

PUBLIC_DATA_DIR = ROOT / "public" / "data"
PRIVATE_DATA_DIR = ROOT / "data"

GEOJSON_OUT = PUBLIC_DATA_DIR / "disabled-parking.geojson"
METADATA_OUT = PUBLIC_DATA_DIR / "disabled-parking-metadata.json"
GPKG_OUT = PRIVATE_DATA_DIR / "osm-disabled-parking.gpkg"
PARQUET_OUT = PRIVATE_DATA_DIR / "osm-disabled-parking.parquet"

LAYER_NAME = "disabled_parking"

CAPACITY_DISABLED_BAD_VALUES = {
    "",
    "0",
    "0.0",
    "no",
    "none",
    "false",
    "nan",
    "null",
}

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

POLAND_PROJECTED_CRS = "EPSG:2180"
PARKING_SPACE_MATCH_DISTANCE_METERS = 30
PRIVATE_ACCESS_INHERIT_DISTANCE_METERS = 25


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


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

    if not text:
        return None

    return text


def normalize_tag_value(value: Any) -> str | None:
    text = as_text(value)

    if text is None:
        return None

    return text.strip().lower()


def has_useful_disabled_capacity(value: Any) -> bool:
    text = as_text(value)

    if text is None:
        return False

    return text.lower() not in CAPACITY_DISABLED_BAD_VALUES


def safe_get(row: pd.Series, key: str) -> Any:
    if key in row:
        return row[key]

    return None


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


def filter_rows_with_public_access(
    gdf: gpd.GeoDataFrame,
    label: str,
) -> gpd.GeoDataFrame:
    if gdf.empty:
        return gdf

    keep_positions: list[int] = []
    removed = 0

    for position, (_, row) in enumerate(gdf.iterrows()):
        if row_has_non_public_access(row):
            removed += 1
            continue

        keep_positions.append(position)

    if removed:
        print(f"Filtered non-public access from {label}: removed={removed}")

    return gdf.iloc[keep_positions].copy()


def to_projected_gdf(gdf: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    if gdf.empty:
        return gdf

    projected = gdf.copy()

    if projected.crs is None:
        projected = projected.set_crs("EPSG:4326")

    return projected.to_crs(POLAND_PROJECTED_CRS)


def is_usable_geometry(geometry: Any) -> bool:
    try:
        return geometry is not None and not geometry.is_empty
    except Exception:
        return False


def geometry_matches_point(
    geometry: Any,
    point: Point,
    max_distance_meters: float,
) -> bool:
    if not is_usable_geometry(geometry) or not is_usable_geometry(point):
        return False

    try:
        if geometry.contains(point) or geometry.intersects(point):
            return True

        return geometry.distance(point) <= max_distance_meters
    except Exception:
        return False


def get_projected_space_points(gdf: gpd.GeoDataFrame) -> list[Point]:
    if gdf.empty:
        return []

    projected = to_projected_gdf(gdf)
    points: list[Point] = []

    for geometry in projected.geometry:
        point = point_from_geometry(geometry)

        if point is not None:
            points.append(point)

    return points


def filter_disabled_spaces_inside_non_public_parkings(
    disabled_spaces_gdf: gpd.GeoDataFrame,
    raw_parking_gdf: gpd.GeoDataFrame,
    label: str,
) -> gpd.GeoDataFrame:
    if disabled_spaces_gdf.empty or raw_parking_gdf.empty:
        return disabled_spaces_gdf

    non_public_parking_positions: list[int] = []

    for position, (_, row) in enumerate(raw_parking_gdf.iterrows()):
        if row_has_non_public_access(row):
            non_public_parking_positions.append(position)

    if not non_public_parking_positions:
        return disabled_spaces_gdf

    non_public_parkings = raw_parking_gdf.iloc[non_public_parking_positions].copy()

    projected_spaces = to_projected_gdf(disabled_spaces_gdf)
    projected_private_parkings = to_projected_gdf(non_public_parkings)

    private_geometries = [
        geometry
        for geometry in projected_private_parkings.geometry
        if is_usable_geometry(geometry)
    ]

    if not private_geometries:
        return disabled_spaces_gdf

    keep_positions: list[int] = []
    removed = 0

    for position, geometry in enumerate(projected_spaces.geometry):
        point = point_from_geometry(geometry)

        if point is None:
            keep_positions.append(position)
            continue

        is_inside_private_parking = any(
            geometry_matches_point(
                private_geometry,
                point,
                PRIVATE_ACCESS_INHERIT_DISTANCE_METERS,
            )
            for private_geometry in private_geometries
        )

        if is_inside_private_parking:
            removed += 1
            continue

        keep_positions.append(position)

    if removed:
        print(
            f"Filtered disabled spaces inheriting private parking access from {label}: "
            f"removed={removed}"
        )

    return disabled_spaces_gdf.iloc[keep_positions].copy()


def filter_parkings_covered_by_exact_spaces(
    parking_gdf: gpd.GeoDataFrame,
    disabled_spaces_gdf: gpd.GeoDataFrame,
    label: str,
) -> gpd.GeoDataFrame:
    if parking_gdf.empty or disabled_spaces_gdf.empty:
        return parking_gdf

    projected_parkings = to_projected_gdf(parking_gdf)
    disabled_space_points = get_projected_space_points(disabled_spaces_gdf)

    if not disabled_space_points:
        return parking_gdf

    keep_positions: list[int] = []
    removed = 0

    for position, geometry in enumerate(projected_parkings.geometry):
        has_exact_space = any(
            geometry_matches_point(
                geometry,
                disabled_space_point,
                PARKING_SPACE_MATCH_DISTANCE_METERS,
            )
            for disabled_space_point in disabled_space_points
        )

        if has_exact_space:
            removed += 1
            continue

        keep_positions.append(position)

    if removed:
        print(
            f"Filtered duplicated parking objects with exact disabled spaces from {label}: "
            f"removed={removed}"
        )

    return parking_gdf.iloc[keep_positions].copy()


def get_osm_type_and_id(row: pd.Series) -> tuple[str, int | None]:
    osm_type_raw = (
        safe_get(row, "element")
        or safe_get(row, "element_type")
        or safe_get(row, "osm_type")
        or safe_get(row, "type")
    )

    osm_id_raw = (
        safe_get(row, "id")
        or safe_get(row, "osmid")
        or safe_get(row, "osm_id")
    )

    osm_type = as_text(osm_type_raw) or "unknown"

    try:
        osm_id = int(osm_id_raw)
    except (TypeError, ValueError):
        osm_id = None

    return osm_type, osm_id


def point_from_geometry(geometry: Any) -> Point | None:
    if geometry is None:
        return None

    try:
        if geometry.is_empty:
            return None

        if geometry.geom_type == "Point":
            return geometry

        return geometry.representative_point()
    except Exception:
        return None


def fetch_osmnx_features_for_place(
    area: dict[str, Any],
    tags: dict[str, Any],
    label: str,
) -> gpd.GeoDataFrame:
    place_query = area.get("place_query")

    if not place_query:
        raise ValueError(f"Area {area.get('id')} has no place_query")

    print(f"Fetching {label}: place={place_query}, tags={tags}")

    try:
        gdf = ox.features.features_from_place(
            query=place_query,
            tags=tags,
        )
    except Exception as exc:
        message = str(exc)

        if "No data elements" in message or "InsufficientResponseError" in message:
            print(f"No OSM data for {label}")
            return gpd.GeoDataFrame(geometry=[], crs="EPSG:4326")

        raise RuntimeError(f"Failed to fetch {label}: {message}") from exc

    if gdf.empty:
        return gdf

    if gdf.crs is None:
        gdf = gdf.set_crs("EPSG:4326")

    return gdf.to_crs("EPSG:4326")


def normalize_area_features(
    gdf: gpd.GeoDataFrame,
    area: dict[str, Any],
    object_type_hint: str,
    synced_at: str,
) -> list[dict[str, Any]]:
    if gdf.empty:
        return []

    records: list[dict[str, Any]] = []

    reset = gdf.reset_index()

    for _, row in reset.iterrows():
        if row_has_non_public_access(row):
            continue

        amenity = as_text(safe_get(row, "amenity"))
        parking_space = as_text(safe_get(row, "parking_space"))
        capacity_disabled = as_text(safe_get(row, "capacity:disabled"))

        if object_type_hint == "parking_with_disabled_capacity":
            if amenity != "parking":
                continue

            if not has_useful_disabled_capacity(capacity_disabled):
                continue

            object_type = "parking_with_disabled_capacity"

        elif object_type_hint == "disabled_parking_space":
            if parking_space != "disabled":
                continue

            object_type = "disabled_parking_space"

        else:
            continue

        original_geometry = safe_get(row, "geometry")
        point_geometry = point_from_geometry(original_geometry)

        if point_geometry is None:
            continue

        osm_type, osm_id = get_osm_type_and_id(row)

        osm_url = None
        if osm_type != "unknown" and osm_id is not None:
            osm_url = f"https://www.openstreetmap.org/{osm_type}/{osm_id}"

        record = {
            "source": "openstreetmap",
            "sourceStatus": "osm_snapshot",
            "objectType": object_type,
            "osmType": osm_type,
            "osmId": osm_id,
            "osmUrl": osm_url,
            "name": as_text(safe_get(row, "name")),
            "amenity": amenity,
            "parking": as_text(safe_get(row, "parking")),
            "parkingSpace": parking_space,
            "capacity": as_text(safe_get(row, "capacity")),
            "capacityDisabled": capacity_disabled,
            "access": as_text(safe_get(row, "access")),
            "wheelchair": as_text(safe_get(row, "wheelchair")),
            "surface": as_text(safe_get(row, "surface")),
            "operator": as_text(safe_get(row, "operator")),
            "areaId": area["id"],
            "areaName": area["name"],
            "syncedAt": synced_at,
            "originalGeometryType": getattr(original_geometry, "geom_type", None),
            "geometry": point_geometry,
        }

        records.append(record)

    return records


def build_dataset() -> gpd.GeoDataFrame:
    ox.settings.use_cache = True
    ox.settings.log_console = True
    ox.settings.timeout = 240

    synced_at = now_iso()
    areas = load_areas()
    all_records: list[dict[str, Any]] = []

    for index, area in enumerate(areas, start=1):
        print("=" * 80)
        print(f"Area {index}/{len(areas)}: {area['name']}")

        capacity_gdf = fetch_osmnx_features_for_place(
            area=area,
            tags={"capacity:disabled": True},
            label=f"{area['id']} capacity:disabled",
        )

        disabled_spaces_gdf = fetch_osmnx_features_for_place(
            area=area,
            tags={"parking_space": "disabled"},
            label=f"{area['id']} parking_space=disabled",
        )

        public_disabled_spaces_gdf = filter_rows_with_public_access(
            disabled_spaces_gdf,
            label=f"{area['id']} parking_space=disabled",
        )

        public_disabled_spaces_gdf = filter_disabled_spaces_inside_non_public_parkings(
            public_disabled_spaces_gdf,
            raw_parking_gdf=capacity_gdf,
            label=f"{area['id']} parking_space=disabled",
        )

        public_capacity_gdf = filter_rows_with_public_access(
            capacity_gdf,
            label=f"{area['id']} capacity:disabled",
        )

        display_capacity_gdf = filter_parkings_covered_by_exact_spaces(
            public_capacity_gdf,
            disabled_spaces_gdf=public_disabled_spaces_gdf,
            label=f"{area['id']} capacity:disabled",
        )

        all_records.extend(
            normalize_area_features(
                display_capacity_gdf,
                area=area,
                object_type_hint="parking_with_disabled_capacity",
                synced_at=synced_at,
            )
        )

        all_records.extend(
            normalize_area_features(
                public_disabled_spaces_gdf,
                area=area,
                object_type_hint="disabled_parking_space",
                synced_at=synced_at,
            )
        )

    if not all_records:
        return gpd.GeoDataFrame(geometry=[], crs="EPSG:4326")

    output = gpd.GeoDataFrame(all_records, geometry="geometry", crs="EPSG:4326")

    output["dedupeKey"] = (
        output["objectType"].astype(str)
        + ":"
        + output["osmType"].astype(str)
        + ":"
        + output["osmId"].astype(str)
    )

    output = output.drop_duplicates(subset=["dedupeKey"]).drop(columns=["dedupeKey"])

    output = output.sort_values(
        by=["objectType", "areaId", "osmType", "osmId"],
        ascending=[True, True, True, True],
    ).reset_index(drop=True)

    return output


def write_outputs(gdf: gpd.GeoDataFrame) -> None:
    PUBLIC_DATA_DIR.mkdir(parents=True, exist_ok=True)
    PRIVATE_DATA_DIR.mkdir(parents=True, exist_ok=True)

    if gdf.empty:
        gdf = gpd.GeoDataFrame(
            {
                "source": [],
                "sourceStatus": [],
                "objectType": [],
                "osmType": [],
                "osmId": [],
                "osmUrl": [],
                "name": [],
                "amenity": [],
                "parking": [],
                "parkingSpace": [],
                "capacity": [],
                "capacityDisabled": [],
                "access": [],
                "wheelchair": [],
                "surface": [],
                "operator": [],
                "areaId": [],
                "areaName": [],
                "syncedAt": [],
                "originalGeometryType": [],
            },
            geometry=[],
            crs="EPSG:4326",
        )

    print(f"Writing GeoJSON: {GEOJSON_OUT}")
    gdf.to_file(GEOJSON_OUT, driver="GeoJSON")

    print(f"Writing GeoPackage: {GPKG_OUT}")
    if GPKG_OUT.exists():
        GPKG_OUT.unlink()
    gdf.to_file(GPKG_OUT, layer=LAYER_NAME, driver="GPKG")

    print(f"Writing GeoParquet: {PARQUET_OUT}")
    gdf.to_parquet(PARQUET_OUT, index=False)

    exact_count = (
        int((gdf["objectType"] == "disabled_parking_space").sum())
        if not gdf.empty
        else 0
    )

    parking_count = (
        int((gdf["objectType"] == "parking_with_disabled_capacity").sum())
        if not gdf.empty
        else 0
    )

    metadata = {
        "generatedAt": now_iso(),
        "country": "Poland",
        "strategy": "voivodeship-snapshot-public-access-deduped",
        "count": int(len(gdf)),
        "exactDisabledParkingSpaces": exact_count,
        "parkingsWithDisabledCapacity": parking_count,
        "files": {
            "geojson": str(GEOJSON_OUT.relative_to(ROOT)).replace("\\", "/"),
            "geopackage": str(GPKG_OUT.relative_to(ROOT)).replace("\\", "/"),
            "geoparquet": str(PARQUET_OUT.relative_to(ROOT)).replace("\\", "/"),
        },
        "areas": load_areas(),
        "filters": {
            "nonPublicAccessValues": sorted(NON_PUBLIC_ACCESS_VALUES),
            "accessKeys": ACCESS_KEYS,
            "parkingSpaceMatchDistanceMeters": PARKING_SPACE_MATCH_DISTANCE_METERS,
            "privateAccessInheritDistanceMeters": PRIVATE_ACCESS_INHERIT_DISTANCE_METERS,
        },
        "note": (
            "OSM-first Poland snapshot generated from OpenStreetMap data via "
            "OSMnx/Overpass. User location is used only to filter 5 km in the "
            "application. Non-public parking objects are filtered out. Parking "
            "objects with mapped exact disabled parking spaces are not displayed "
            "as aggregate parking objects."
        ),
    }

    print(f"Writing metadata: {METADATA_OUT}")
    METADATA_OUT.write_text(
        json.dumps(metadata, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    print(json.dumps(metadata, ensure_ascii=False, indent=2))


def main() -> None:
    dataset = build_dataset()
    write_outputs(dataset)


if __name__ == "__main__":
    main()