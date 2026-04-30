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
    "null"
}


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


def has_useful_disabled_capacity(value: Any) -> bool:
    text = as_text(value)

    if text is None:
        return False

    return text.lower() not in CAPACITY_DISABLED_BAD_VALUES


def safe_get(row: pd.Series, key: str) -> Any:
    if key in row:
        return row[key]

    return None


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

        all_records.extend(
            normalize_area_features(
                capacity_gdf,
                area=area,
                object_type_hint="parking_with_disabled_capacity",
                synced_at=synced_at,
            )
        )

        disabled_spaces_gdf = fetch_osmnx_features_for_place(
            area=area,
            tags={"parking_space": "disabled"},
            label=f"{area['id']} parking_space=disabled",
        )

        all_records.extend(
            normalize_area_features(
                disabled_spaces_gdf,
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
        "strategy": "voivodeship-snapshot",
        "count": int(len(gdf)),
        "exactDisabledParkingSpaces": exact_count,
        "parkingsWithDisabledCapacity": parking_count,
        "files": {
            "geojson": str(GEOJSON_OUT.relative_to(ROOT)).replace("\\", "/"),
            "geopackage": str(GPKG_OUT.relative_to(ROOT)).replace("\\", "/"),
            "geoparquet": str(PARQUET_OUT.relative_to(ROOT)).replace("\\", "/"),
        },
        "areas": load_areas(),
        "note": "OSM-first Poland snapshot generated from OpenStreetMap data via OSMnx/Overpass. User location is used only to filter 5 km in the application."
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
