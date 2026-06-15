#!/usr/bin/env python3
"""Download and normalize provincial riding boundary GeoJSON for R2 upload."""

from __future__ import annotations

import json
import subprocess
import sys
import zipfile
from pathlib import Path

import geopandas as gpd
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "data" / "ridings"
RAW_DIR = ROOT / "data" / "ridings" / ".raw"

NAME_FIELDS = (
    "ENGLISH_NAME",
    "ENGLISH_NA",
    "NAME_EN",
    "FED_NAME",
    "ED_NAMEE",
    "ED_NAME",
    "NM_CEP",
    "DIST_NAME",
    "DISTRICT",
    "DISTRICT_N",
    "DISTRICT_NAME",
    "ED",
    "ED_LABEL",
    "NAME",
    "PED",
    "Electoral_District",
    "ELECTORAL_",
)


def curl_download(url: str, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(["curl", "-sfL", url, "-o", str(dest)], check=True)


def fetch_json(url: str) -> dict:
    result = subprocess.run(["curl", "-sfL", url], capture_output=True, check=True, text=True)
    return json.loads(result.stdout)


def normalize_gdf(gdf: gpd.GeoDataFrame, prov_code: str) -> gpd.GeoDataFrame:
    gdf = gdf.to_crs("EPSG:4326")
    name_col = None
    for col in gdf.columns:
        if col == "geometry":
            continue
        upper = col.upper()
        if upper in {f.upper() for f in NAME_FIELDS}:
            name_col = col
            break
        if any(token in upper for token in ("NAME", "DISTRICT", "DIST", "LABEL")):
            name_col = col
            break

    records = []
    for _, row in gdf.iterrows():
        props = {k: (None if v != v else v) for k, v in row.items() if k != "geometry"}
        name = None
        if name_col is not None:
            val = row.get(name_col)
            if val is not None and str(val).strip():
                name = str(val).strip()
        if not name:
            for field in NAME_FIELDS:
                val = props.get(field)
                if val is not None and str(val).strip():
                    name = str(val).strip()
                    break
        if not name:
            raise ValueError(f"Could not resolve riding name for {prov_code}; columns: {list(gdf.columns)}")

        clean = {"ENGLISH_NAME": name, "PROV_TERR": prov_code}
        records.append({"geometry": row.geometry, **clean})

    out = gpd.GeoDataFrame(records, geometry="geometry", crs="EPSG:4326")
    return out


def write_geojson(gdf: gpd.GeoDataFrame, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    gdf.to_file(path, driver="GeoJSON")
    print(f"Wrote {path.name}: {len(gdf)} features")


def from_opennorth(slug: str, prov_code: str) -> gpd.GeoDataFrame:
    url = f"https://represent.opennorth.ca/boundaries/{slug}/simple_shape"
    data = fetch_json(url)
    features = []
    for obj in data.get("objects", []):
        name = obj.get("name")
        geom = obj.get("simple_shape")
        if not name or not geom:
            continue
        features.append(
            {
                "type": "Feature",
                "properties": {"ENGLISH_NAME": name, "PROV_TERR": prov_code},
                "geometry": geom,
            }
        )
    fc = {"type": "FeatureCollection", "features": features}
    tmp = RAW_DIR / f"{prov_code}_opennorth.geojson"
    tmp.parent.mkdir(parents=True, exist_ok=True)
    tmp.write_text(json.dumps(fc))
    gdf = gpd.read_file(tmp)
    return normalize_gdf(gdf, prov_code)


def from_geojson_url(url: str, prov_code: str) -> gpd.GeoDataFrame:
    raw = RAW_DIR / f"{prov_code}_raw.geojson"
    curl_download(url, raw)
    gdf = gpd.read_file(raw)
    return normalize_gdf(gdf, prov_code)


def from_shapefile_zip(url: str, prov_code: str, shp_glob: str = "*.shp") -> gpd.GeoDataFrame:
    zip_path = RAW_DIR / f"{prov_code}.zip"
    curl_download(url, zip_path)
    extract_dir = RAW_DIR / prov_code
    extract_dir.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(zip_path) as zf:
        zf.extractall(extract_dir)
    shps = sorted(extract_dir.rglob(shp_glob))
    if not shps:
        raise FileNotFoundError(f"No shapefile in {zip_path}")
    if len(shps) == 1:
        gdf = gpd.read_file(shps[0])
    else:
        parts = [gpd.read_file(shp) for shp in shps]
        gdf = gpd.GeoDataFrame(pd.concat(parts, ignore_index=True), crs=parts[0].crs)
    return normalize_gdf(gdf, prov_code)


def from_shapefile_zip_merge(urls: list[str], prov_code: str) -> gpd.GeoDataFrame:
    frames: list[gpd.GeoDataFrame] = []
    for i, url in enumerate(urls):
        zip_path = RAW_DIR / f"{prov_code}_{i}.zip"
        curl_download(url, zip_path)
        extract_dir = RAW_DIR / f"{prov_code}_{i}"
        extract_dir.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(zip_path) as zf:
            zf.extractall(extract_dir)
        shps = list(extract_dir.rglob("*.shp"))
        if not shps:
            raise FileNotFoundError(f"No shapefile in {url}")
        frames.append(gpd.read_file(shps[0]))
    gdf = gpd.GeoDataFrame(pd.concat(frames, ignore_index=True), crs=frames[0].crs)
    return normalize_gdf(gdf, prov_code)


def acquire_qc() -> gpd.GeoDataFrame:
    url = (
        "https://donnees.electionsquebec.qc.ca/autres/provincial/"
        "circonscriptions_electorales_sans_eau_2026.json"
    )
    return from_geojson_url(url, "QC")


def acquire_bc() -> gpd.GeoDataFrame:
    url = (
        "https://delivery.maps.gov.bc.ca/arcgis/rest/services/whse/"
        "bcgw_pub_whse_admin_boundaries/MapServer/74/query?"
        "where=1%3D1&outFields=*&f=geojson"
    )
    return from_geojson_url(url, "BC")


def acquire_ab() -> gpd.GeoDataFrame:
    return from_shapefile_zip(
        "https://www.elections.ab.ca/uploads/2019Boundaries_ED-Shapefiles.zip",
        "AB",
    )


def acquire_nb() -> gpd.GeoDataFrame:
    url = "https://gnb.socrata.com/api/geospatial/c468-yuuy?method=export&format=GeoJSON"
    return from_geojson_url(url, "NB")


def acquire_yt() -> gpd.GeoDataFrame:
    return from_shapefile_zip(
        "https://map-data.service.yukon.ca/GeoYukon/Administrative_Boundaries/"
        "Yukon_Electoral_Districts/Yukon_Electoral_Districts.shp.zip",
        "YT",
    )


def acquire_nu() -> gpd.GeoDataFrame:
    return from_shapefile_zip(
        "https://www.elections.nu.ca/en/file-download/download/public/2034",
        "NU",
    )


def acquire_sk_official() -> gpd.GeoDataFrame:
    return from_shapefile_zip(
        "https://cdn.elections.sk.ca/maps-ge30/ESK_KML_Shape_Files_Mar2024.zip",
        "SK",
    )


def acquire_nl_official() -> gpd.GeoDataFrame:
    return from_shapefile_zip(
        "https://opendata.gov.nl.ca/public/opendata/filedownload/?file-id=3323",
        "NL",
    )


ACQUISITIONS: dict[str, tuple[str, callable]] = {
    "quebecridings-2025.geojson": ("QC", acquire_qc),
    "bcridings-2022.geojson": ("BC", acquire_bc),
    "abridings-2022.geojson": ("AB", acquire_ab),
    "nsridings-2022.geojson": (
        "NS",
        lambda: from_opennorth("nova-scotia-electoral-districts-2019", "NS"),
    ),
    "nbridings-2022.geojson": ("NB", acquire_nb),
    "mbridings-2022.geojson": (
        "MB",
        lambda: from_opennorth("manitoba-electoral-districts-2018", "MB"),
    ),
    "skridings-2022.geojson": (
        "SK",
        lambda: from_opennorth("saskatchewan-electoral-districts-representation-act-2022", "SK"),
    ),
    "nlridings-2022.geojson": (
        "NL",
        lambda: from_opennorth("newfoundland-and-labrador-electoral-districts", "NL"),
    ),
    "peridings-2022.geojson": (
        "PE",
        lambda: from_opennorth("prince-edward-island-electoral-districts-2017", "PE"),
    ),
    "ntridings-2022.geojson": (
        "NT",
        lambda: from_opennorth("northwest-territories-electoral-districts-2013", "NT"),
    ),
    "nuridings-2022.geojson": ("NU", acquire_nu),
    "ytridings-2022.geojson": ("YT", acquire_yt),
}


def main() -> int:
    selected = sys.argv[1:] or list(ACQUISITIONS.keys())
    errors: list[str] = []

    for filename in selected:
        if filename not in ACQUISITIONS:
            print(f"Unknown dataset: {filename}", file=sys.stderr)
            errors.append(filename)
            continue
        prov_code, fn = ACQUISITIONS[filename]
        print(f"\n=== {filename} ({prov_code}) ===")
        try:
            gdf = fn()
            write_geojson(gdf, OUT_DIR / filename)
        except Exception as exc:  # noqa: BLE001
            print(f"FAILED {filename}: {exc}", file=sys.stderr)
            errors.append(filename)

    if errors:
        print(f"\nErrors: {errors}", file=sys.stderr)
        return 1
    print("\nAll datasets acquired.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
