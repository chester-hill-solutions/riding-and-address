#!/usr/bin/env python3
"""Acquire the federal electoral geography layers from Elections Canada's bulk archives.

Why Python and not the TypeScript acquisition script: Elections Canada publishes these
layers as zipped shapefiles, and a shapefile cannot be read without a shapefile reader.
The repository's established pattern for that is `acquire-provincial-ridings.py` — geopandas
plus a per-source download function — so this script follows the same shape.

Why not the ArcGIS REST service for these two layers: it works, but the service
rate-limits hard, and the bulk archive is a single 95 MB download that needs no paging.
For a one-shot national layer the archive is the better route by a wide margin.

What this produces:

    data/geo/federal-polling-divisions-2025.geojson   (71,687 polling divisions)
    data/geo/federal-electoral-districts-2025.geojson  (343 federal electoral districts)

Both are normalized to the same property contract the TypeScript normalizer produces, so
the serving side does not care which route a dataset came from.

Usage:
    python3 scripts/acquire-electoral-geo.py                 # dry run, downloads and reports
    python3 scripts/acquire-electoral-geo.py --execute       # writes the output files
    python3 scripts/acquire-electoral-geo.py --level federal-polling-division --execute
    python3 scripts/acquire-electoral-geo.py --force         # overwrite existing output
"""

from __future__ import annotations

import argparse
import json
import sys
import zipfile
from datetime import datetime, timezone
from pathlib import Path

import geopandas as gpd

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "data" / "geo"
RAW_DIR = ROOT / "data" / "geo" / ".raw"

PROVENANCE_FILE = "PROVENANCE.json"

# Elections Canada "Electoral Geography Boundary Files (45th General Election)".
# The archives are published under the Open Government Licence - Canada.
SOURCES = {
    "federal-polling-division": {
        "url": "https://www.elections.ca/res/cir/mapsCorner/vector/PollingDivisionBoundaries_2025_SHP.zip",
        "r2_key": "federal-polling-divisions-2025.geojson",
        "name": "Federal Polling Division",
        "year": 2025,
        "attribution": "© Elections Canada, 45th General Election (2025) electoral geography",
        "licence": "Open Government Licence – Canada",
        "licence_url": "https://open.canada.ca/en/open-government-licence-canada",
    },
    "federal-electoral-district": {
        "url": "https://www.elections.ca/res/cir/mapsCorner/vector/FederalElectoralDistricts_2025_SHP.zip",
        "r2_key": "federal-electoral-districts-2025.geojson",
        "name": "Federal Electoral District",
        "year": 2025,
        "attribution": "© Elections Canada, 45th General Election (2025) electoral geography",
        "licence": "Open Government Licence – Canada",
        "licence_url": "https://open.canada.ca/en/open-government-licence-canada",
    },
}

# Statistics Canada `PRUID` / Elections Canada `FED_NUM` prefix -> province code.
# The two numbering schemes share the same province digits.
PROV_NUM_TO_CODE = {
    "10": "NL", "11": "PE", "12": "NS", "13": "NB", "24": "QC", "35": "ON",
    "46": "MB", "47": "SK", "48": "AB", "59": "BC", "60": "YT", "61": "NT", "62": "NU",
}

# Coordinate decimals kept in the written GeoJSON. Five decimals is about a metre, which
# is far finer than a point-in-polygon test needs.
PRECISION = 5


def curl_download(url: str, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    import subprocess

    subprocess.run(["curl", "-sfL", "--retry", "3", url, "-o", str(dest)], check=True)


def province_from_fed_num(value: object) -> str | None:
    """Province code for a federal district number (e.g. 24037 -> QC)."""
    try:
        text = str(value).strip()
    except Exception:
        return None
    if not text:
        return None
    prefix = text[:2] if len(text) >= 3 else text.zfill(2)
    return PROV_NUM_TO_CODE.get(prefix)


def find_shapefile(root: Path) -> Path | None:
    for path in sorted(root.rglob("*.shp")):
        return path
    return None


def read_archive(url: str, cache_name: str) -> gpd.GeoDataFrame:
    """Download (once) and read the shapefile inside the archive."""
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    zip_path = RAW_DIR / cache_name
    if not zip_path.exists():
        print(f"  downloading {url}")
        curl_download(url, zip_path)

    extract_dir = RAW_DIR / cache_name.replace(".zip", "")
    if not extract_dir.exists():
        with zipfile.ZipFile(zip_path) as archive:
            archive.extractall(extract_dir)

    shp = find_shapefile(extract_dir)
    if shp is None:
        raise FileNotFoundError(f"no .shp found inside {zip_path}")

    gdf = gpd.read_file(shp)
    return gdf.to_crs("EPSG:4326")


def normalize_polling_divisions(gdf: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    """Polling divisions: the federal district number plus the division's own numbers.

    A polling division has no name of its own. The number is only unique inside its
    electoral district, so the display name is the riding name qualified by the division
    number — "Ajax — PD 20-083" — which is how a person would refer to it.
    """
    columns = {c.upper(): c for c in gdf.columns}
    records = []
    for row in gdf.to_dict("records"):
        fed_num = row.get(columns.get("FED_NUM", "FED_NUM"))
        pd_num = row.get(columns.get("PD_NUM", "PD_NUM"))
        suffix = row.get(columns.get("PD_NBR_SFX", "PD_NBR_SFX"))
        combined = row.get(columns.get("PD_NUM_SFX_CO", "PD_NUM_SFX_CO"))
        if combined in (None, ""):
            combined = f"{pd_num}-{suffix}" if suffix not in (None, "") else str(pd_num)
        records.append(
            {
                "FED_NUM": fed_num,
                "PD_NUM": pd_num,
                "PD_NBR_SFX": suffix,
                "PD_NUM_SFX_CO": combined,
                "PD_TYPE": row.get(columns.get("PD_TYPE", "PD_TYPE")),
                "ADV_POLL_NUM": row.get(columns.get("ADV_POLL_NUM", "ADV_POLL_NUM")),
                "PROV_TERR": province_from_fed_num(fed_num),
            }
        )
    return gpd.GeoDataFrame(records, geometry=gdf.geometry, crs=gdf.crs)


def normalize_electoral_districts(gdf: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    """Federal electoral districts: the district number and its English and French names."""
    columns = {c.upper(): c for c in gdf.columns}
    records = []
    for row in gdf.to_dict("records"):
        fed_num = row.get(columns.get("FED_NUM", "FED_NUM"))
        name_en = row.get(columns.get("ED_NAMEE", "ED_NAMEE"))
        records.append(
            {
                "FED_NUM": fed_num,
                "ED_NAMEE": name_en,
                "ED_NAMEF": row.get(columns.get("ED_NAMEF", "ED_NAMEF")),
                "REPORDER": row.get(columns.get("REPORDER", "REPORDER")),
                "PROV_TERR": province_from_fed_num(fed_num),
                "ENGLISH_NAME": name_en,
            }
        )
    return gpd.GeoDataFrame(records, geometry=gdf.geometry, crs=gdf.crs)


NORMALIZERS = {
    "federal-polling-division": normalize_polling_divisions,
    "federal-electoral-district": normalize_electoral_districts,
}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--level", action="append", dest="levels", help="Limit to a level (repeatable).")
    parser.add_argument("--execute", action="store_true", help="Write the output files.")
    parser.add_argument("--force", action="store_true", help="Overwrite an existing output file.")
    parser.add_argument("--out-dir", default=str(OUT_DIR), help="Output directory.")
    args = parser.parse_args()

    levels = args.levels or list(SOURCES.keys())
    unknown = [level for level in levels if level not in SOURCES]
    if unknown:
        print(f"Unknown level(s): {', '.join(unknown)}", file=sys.stderr)
        return 1

    out_dir = Path(args.out_dir)
    print(f"mode             : {'WRITE' if args.execute else 'DRY RUN'}")
    print(f"output directory : {out_dir}")
    print("")

    acquired = []
    failures = []

    for level in levels:
        source = SOURCES[level]
        label = f"elections-canada-2025/{level}"
        try:
            gdf = read_archive(source["url"], Path(source["url"]).name)
            normalized = NORMALIZERS[level](gdf)

            target = out_dir / source["r2_key"]
            if target.exists() and not args.force:
                print(f"  SKIP  {label:<44} {target} exists (use --force)")
                continue

            properties_rows = normalized.drop(columns="geometry").to_dict("records")
            features = []
            for geom, properties in zip(normalized.geometry.to_crs("EPSG:4326"), properties_rows):
                geo = json.loads(json.dumps(geom.__geo_interface__))
                features.append(
                    {
                        "type": "Feature",
                        "geometry": round_geometry(geo),
                        "properties": properties,
                    }
                )

            if args.execute:
                out_dir.mkdir(parents=True, exist_ok=True)
                target.write_text(
                    json.dumps({"type": "FeatureCollection", "features": features}, separators=(",", ":")),
                    encoding="utf-8",
                )
                target.chmod(0o600)

            size = target.stat().st_size if target.exists() else 0
            acquired.append(
                {
                    "r2Key": source["r2_key"],
                    "level": level,
                    "sourceId": "elections-canada-2025",
                    "sourceName": "Elections Canada — 45th General Election (2025) electoral geography",
                    "licenceId": "elections-canada-ogl-canada",
                    "licenceName": source["licence"],
                    "licenceUrl": source["licence_url"],
                    "attribution": source["attribution"],
                    "features": len(features),
                    "bytes": size,
                    "sha256": "",
                    "fetchedAt": "",
                }
            )
            print(
                f"  {'WROTE' if args.execute else 'READ '} {label:<44} {len(features):>7} features  "
                f"{size / 1048576:>6.1f} MB  {source['r2_key']}"
            )
        except Exception as exc:  # noqa: BLE001 - the CLI reports and continues
            failures.append(f"{label}: {exc}")
            print(f"  FAIL  {label}: {exc}", file=sys.stderr)

    if failures:
        print("")
        print(f"{len(failures)} layer(s) failed:", file=sys.stderr)
        for failure in failures:
            print(f"  - {failure}", file=sys.stderr)
        return 1

    if not args.execute:
        print("")
        print("Dry run complete. Re-run with --execute to write the output files.")
        return 0

    if acquired:
        write_provenance(out_dir, acquired)
        print("")
        print(f"  provenance written to {out_dir / PROVENANCE_FILE}")
    return 0


def write_provenance(out_dir: Path, acquired: list[dict]) -> None:
    """Merge this run's datasets into the provenance manifest.

    The manifest is the record of what CanCoder is serving and under what licence, so
    every dataset that lands in `data/geo` has to appear in it. The TypeScript
    acquisition script writes the same file; the two merge rather than overwrite.
    """
    import hashlib

    path = out_dir / PROVENANCE_FILE
    existing: dict[str, dict] = {}
    if path.exists():
        try:
            existing = {
                entry.get("r2Key", ""): entry
                for entry in json.loads(path.read_text(encoding="utf-8")).get("datasets", [])
            }
        except (ValueError, OSError):
            existing = {}

    now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    for entry in acquired:
        target = out_dir / entry["r2Key"]
        if target.exists():
            entry["bytes"] = target.stat().st_size
            entry["sha256"] = hashlib.sha256(target.read_bytes()).hexdigest()
        entry["fetchedAt"] = now
        existing[entry["r2Key"]] = entry

    payload = {
        "schema": 1,
        "generatedAt": now,
        "datasets": [existing[key] for key in sorted(existing)],
    }
    out_dir.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    path.chmod(0o600)


def round_geometry(geometry: dict, decimals: int = PRECISION) -> dict:
    """Round every coordinate in a GeoJSON geometry."""
    if geometry.get("type") == "GeometryCollection":
        return {
            **geometry,
            "geometries": [round_geometry(g, decimals) for g in geometry.get("geometries", [])],
        }
    coordinates = geometry.get("coordinates")
    if coordinates is None:
        return geometry

    def walk(value):
        if isinstance(value, (int, float)):
            return round(float(value), decimals)
        if isinstance(value, (list, tuple)):
            return [walk(v) for v in value]
        return value

    return {**geometry, "coordinates": walk(coordinates)}


if __name__ == "__main__":
    raise SystemExit(main())
