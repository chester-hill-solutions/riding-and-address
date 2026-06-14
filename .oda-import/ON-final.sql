DELETE FROM oda_addresses WHERE province = 'ON';
DELETE FROM oda_postal_centroids WHERE province = 'ON';
DELETE FROM oda_city_centroids WHERE province = 'ON';
DELETE FROM oda_street_ranges WHERE province = 'ON';
INSERT INTO oda_addresses (
    province, civic_number, street_name, street_type, street_direction, unit,
    postal_code, city, city_key, lat, lon, full_address,
    mailing_line1, mailing_line2, municipality, province_code, mailing_postal_code,
    search_key, street_key
  ) VALUES (
    'ON', '123', '123 Main St',
    'Toronto ON M5V 2T6"', 'MAIN', '1205',
    'M5V 2T6', 'ST', 'ST|ON',
    43.6533, -79.3833, '"Unit 1205',
    'UNIT 1205', '123 123 MAIN ST TORONTOONMVT MAIN', 'ST',
    'ON', 'M5V 2T6',
    '123|123 MAIN ST|TORONTO ON M5V 2T6|MAIN|ST|ON', '123 MAIN ST|TORONTO ON M5V 2T6|MAIN'
  );
INSERT INTO oda_rtree (id, minx, maxx, miny, maxy) VALUES (1, -79.3833, -79.3833, 43.6533, 43.6533);
INSERT OR REPLACE INTO oda_postal_centroids (province, postal_code, lat, lon, address_count) VALUES ('ON', 'M5V 2T6', 43.6533, -79.3833, 1);
INSERT OR REPLACE INTO oda_city_centroids (province, city_key, city, lat, lon, address_count) VALUES ('ON', 'ST|ON', 'ST', 43.6533, -79.3833, 1);
INSERT OR REPLACE INTO oda_street_ranges (province, city_key, street_key, min_civic, max_civic, lat, lon, address_count) VALUES ('ON', 'ST|ON', '123 MAIN ST|TORONTO ON M5V 2T6|MAIN', 123, 123, 43.6533, -79.3833, 1);
INSERT INTO oda_imports (province, source_url, source_version, row_count, finished_at) VALUES ('ON', 'https://www150.statcan.gc.ca/n1/en/pub/46-26-0001/2021001/ODA_ON_v1.zip', '2021001', 1, datetime('now'));