#!/usr/bin/env python3
"""Stream NAR's split ZIP into a disk-backed join and emit D1 postal centroid SQL.

No dependencies beyond Python's standard library. This builds artifacts only;
use wrangler explicitly to import the resulting SQL into D1.
"""

import argparse
import csv
import io
import json
import math
from pathlib import Path
import re
import sqlite3
import tempfile
import zipfile

PROVINCES = {
    'NL': '10', 'PE': '11', 'NS': '12', 'NB': '13', 'QC': '24', 'ON': '35',
    'MB': '46', 'SK': '47', 'AB': '48', 'BC': '59', 'YT': '60', 'NT': '61', 'NU': '62',
}
POSTAL = re.compile(r'[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z]\d[ABCEGHJ-NPRSTV-Z]\d')


def entries(archive, folder, province):
    token = PROVINCES[province]
    selected = sorted(
        name for name in archive.namelist()
        if re.search(rf'(^|/){folder}/', name, re.I)
        and name.lower().endswith('.csv')
        and re.search(rf'(^|[^0-9]){token}([^0-9]|$)', Path(name).name)
    )
    if not selected:
        raise ValueError(f'No {folder} CSV entries for {province}')
    return selected


def rows(archive, names):
    for name in names:
        with archive.open(name) as binary:
            with io.TextIOWrapper(binary, encoding='utf-8-sig', newline='') as stream:
                for row in csv.DictReader(stream):
                    yield {key.strip(): (value or '').strip() for key, value in row.items()}


def coordinates(row):
    for prefix in ('BF_REPPOINT', 'BG', 'REPPOINT'):
        try:
            lat = float(row.get(f'{prefix}_LATITUDE', ''))
            lon = float(row.get(f'{prefix}_LONGITUDE', ''))
        except ValueError:
            continue
        if math.isfinite(lat) and math.isfinite(lon) and -90 <= lat <= 90 and -180 <= lon <= 180:
            return lat, lon
    return None


def chunks(iterator, size=10_000):
    batch = []
    for item in iterator:
        batch.append(item)
        if len(batch) == size:
            yield batch
            batch = []
    if batch:
        yield batch


def build(archive_path, province, output, report_path):
    output = Path(output)
    output.parent.mkdir(parents=True, exist_ok=True)
    # A temporary SQLite database keeps millions of LOC_GUIDs out of Python memory.
    with tempfile.TemporaryDirectory(prefix='nar-postal-') as directory:
        with sqlite3.connect(Path(directory) / 'join.sqlite') as db, zipfile.ZipFile(archive_path) as archive:
            addresses = entries(archive, 'Addresses', province)
            locations = entries(archive, 'Locations', province)
            db.executescript('''
                CREATE TABLE addresses (loc_guid TEXT NOT NULL, postal TEXT NOT NULL);
                CREATE TABLE locations (loc_guid TEXT PRIMARY KEY, lat REAL, lon REAL) WITHOUT ROWID;
            ''')
            counts = {'address_rows': 0, 'postal_rows': 0, 'invalid_postal_rows': 0,
                      'missing_address_guid': 0, 'location_rows': 0, 'invalid_location_rows': 0}

            def address_values():
                for row in rows(archive, addresses):
                    counts['address_rows'] += 1
                    postal = re.sub(r'\s+', '', row.get('MAIL_POSTAL_CODE', '')).upper()
                    if not POSTAL.fullmatch(postal):
                        counts['invalid_postal_rows'] += 1
                        continue
                    counts['postal_rows'] += 1
                    guid = row.get('LOC_GUID', '')
                    if not guid:
                        counts['missing_address_guid'] += 1
                    yield guid, postal[:3] + ' ' + postal[3:]

            for batch in chunks(address_values()):
                db.executemany('INSERT INTO addresses VALUES (?, ?)', batch)
                db.commit()

            def location_values():
                for row in rows(archive, locations):
                    counts['location_rows'] += 1
                    point = coordinates(row)
                    guid = row.get('LOC_GUID', '')
                    if not guid or point is None:
                        counts['invalid_location_rows'] += 1
                        continue
                    yield guid, *point

            for batch in chunks(location_values()):
                db.executemany('INSERT OR REPLACE INTO locations VALUES (?, ?, ?)', batch)
                db.commit()
            db.executescript('''
                CREATE TABLE full_centroids AS
                    SELECT a.postal, SUM(l.lat) AS lat_sum, SUM(l.lon) AS lon_sum, COUNT(*) AS n
                    FROM addresses a JOIN locations l USING (loc_guid)
                    GROUP BY a.postal;
                CREATE UNIQUE INDEX full_postal ON full_centroids(postal);
                CREATE TABLE zone_centroids AS
                    SELECT substr(postal, 1, 5) AS postal, SUM(lat_sum) AS lat_sum,
                           SUM(lon_sum) AS lon_sum, SUM(n) AS n
                    FROM full_centroids GROUP BY substr(postal, 1, 5);
                CREATE UNIQUE INDEX zone_postal ON zone_centroids(postal);
            ''')
            full_count = db.execute('SELECT COUNT(*) FROM full_centroids').fetchone()[0]
            zone_count = db.execute('SELECT COUNT(*) FROM zone_centroids').fetchone()[0]
            if full_count == 0:
                raise ValueError('No joined postal coordinates; refusing to emit an empty import')

            # Evaluate all source postal codes, including codes whose locations did not resolve.
            coverage = db.execute('''
                SELECT COUNT(*), SUM(f.postal IS NOT NULL), SUM(z.postal IS NOT NULL)
                FROM (SELECT DISTINCT postal FROM addresses) a
                LEFT JOIN full_centroids f ON a.postal = f.postal
                LEFT JOIN zone_centroids z ON substr(a.postal, 1, 5) = z.postal
            ''').fetchone()
            joined = db.execute('SELECT SUM(n) FROM full_centroids').fetchone()[0]
            report = {
                'archive': str(archive_path), 'province': province, **counts,
                'joined_postal_rows': joined,
                'unresolved_postal_rows': counts['postal_rows'] - joined,
                'full_centroids': full_count, 'zone_centroids': zone_count,
                'source_postal_codes': coverage[0], 'full_code_coverage': coverage[1] / coverage[0],
                'full_or_zone_coverage': coverage[2] / coverage[0],
            }
            # Retain unrelated ODA centroids. NAR replaces matching full/zone keys. The
            # province's old zone keys are cleared so a later vintage cannot leave stale zones.
            with output.open('w', encoding='utf-8') as sql:
                sql.write(f"-- NAR postal centroids: {province}; {Path(archive_path).name}\n")
                sql.write(f"DELETE FROM oda_postal_centroids WHERE province='{province}' AND length(postal_code)=5;\n")
                for table in ('full_centroids', 'zone_centroids'):
                    for postal, lat, lon, count in db.execute(
                        f'SELECT postal, lat_sum/n, lon_sum/n, n FROM {table} ORDER BY postal'
                    ):
                        sql.write('INSERT OR REPLACE INTO oda_postal_centroids '
                                  '(province, postal_code, lat, lon, address_count) '
                                  f"VALUES ('{province}', '{postal}', {lat:.10f}, {lon:.10f}, {count});\n")
            report_path = Path(report_path)
            report_path.parent.mkdir(parents=True, exist_ok=True)
            report_path.write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
            print(json.dumps(report, indent=2))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--zip', required=True, type=Path, help='NAR archive, e.g. .nar-import/202606.zip')
    parser.add_argument('--province', choices=PROVINCES, default='ON')
    parser.add_argument('--output', type=Path, default=Path('.nar-import/postal-centroids.sql'))
    parser.add_argument('--report', type=Path, default=Path('.nar-import/postal-centroids-report.json'))
    args = parser.parse_args()
    build(args.zip, args.province, args.output, args.report)


if __name__ == '__main__':
    main()
