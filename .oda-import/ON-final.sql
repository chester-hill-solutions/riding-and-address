DELETE FROM oda_addresses WHERE province = 'ON';
DELETE FROM oda_postal_centroids WHERE province = 'ON';
DELETE FROM oda_city_centroids WHERE province = 'ON';
DELETE FROM oda_street_ranges WHERE province = 'ON';
INSERT INTO oda_addresses (
    id, province, civic_number, street_name, street_type, street_direction, unit,
    postal_code, city, city_key, lat, lon, full_address,
    mailing_line1, mailing_line2, municipality, province_code, mailing_postal_code,
    search_key, street_key
  ) VALUES (
    1, 'ON', '123', 'MAIN',
    'ST', '', '',
    'M5V 2T6', 'Toronto', 'TORONTO|ON',
    43.6532, -79.3832, '123 Main St, Toronto ON M5V 2T6',
    '123 MAIN ST', '', 'TORONTO',
    'ON', 'M5V 2T6',
    '123|MAIN|ST||TORONTO|ON', 'MAIN|ST'
  );
INSERT INTO oda_addresses (
    id, province, civic_number, street_name, street_type, street_direction, unit,
    postal_code, city, city_key, lat, lon, full_address,
    mailing_line1, mailing_line2, municipality, province_code, mailing_postal_code,
    search_key, street_key
  ) VALUES (
    2, 'ON', '123', 'MAIN',
    'ST', '', '1205',
    'M5V 2T6', 'Toronto', 'TORONTO|ON',
    43.6533, -79.3833, 'Unit 1205, 123 Main St, Toronto ON M5V 2T6',
    'UNIT 1205', '123 MAIN ST', 'TORONTO',
    'ON', 'M5V 2T6',
    '123|MAIN|ST||TORONTO|ON', 'MAIN|ST'
  );
INSERT INTO oda_addresses (
    id, province, civic_number, street_name, street_type, street_direction, unit,
    postal_code, city, city_key, lat, lon, full_address,
    mailing_line1, mailing_line2, municipality, province_code, mailing_postal_code,
    search_key, street_key
  ) VALUES (
    3, 'ON', '456', 'KING',
    'ST', 'W', '',
    'M5H 1A1', 'Toronto', 'TORONTO|ON',
    43.6489, -79.3817, '456 King St W, Toronto ON M5H 1A1',
    '456 KING ST W', '', 'TORONTO',
    'ON', 'M5H 1A1',
    '456|KING|ST|W|TORONTO|ON', 'KING|ST|W'
  );
INSERT INTO oda_addresses (
    id, province, civic_number, street_name, street_type, street_direction, unit,
    postal_code, city, city_key, lat, lon, full_address,
    mailing_line1, mailing_line2, municipality, province_code, mailing_postal_code,
    search_key, street_key
  ) VALUES (
    4, 'ON', '123', 'MAIN',
    'ST', '', '',
    'K1A 0A1', 'Ottawa', 'OTTAWA|ON',
    45.4215, -75.6972, '123 Main St, Ottawa ON K1A 0A1',
    '123 MAIN ST', '', 'OTTAWA',
    'ON', 'K1A 0A1',
    '123|MAIN|ST||OTTAWA|ON', 'MAIN|ST'
  );
INSERT OR REPLACE INTO oda_postal_centroids (province, postal_code, lat, lon, address_count) VALUES ('ON', 'M5V 2T6', 43.65325, -79.38325, 2);
INSERT OR REPLACE INTO oda_postal_centroids (province, postal_code, lat, lon, address_count) VALUES ('ON', 'M5H 1A1', 43.6489, -79.3817, 1);
INSERT OR REPLACE INTO oda_postal_centroids (province, postal_code, lat, lon, address_count) VALUES ('ON', 'K1A 0A1', 45.4215, -75.6972, 1);
INSERT OR REPLACE INTO oda_city_centroids (province, city_key, city, lat, lon, address_count) VALUES ('ON', 'TORONTO|ON', 'Toronto', 43.6518, -79.38273333333333, 3);
INSERT OR REPLACE INTO oda_city_centroids (province, city_key, city, lat, lon, address_count) VALUES ('ON', 'OTTAWA|ON', 'Ottawa', 45.4215, -75.6972, 1);
INSERT OR REPLACE INTO oda_street_ranges (province, city_key, street_key, min_civic, max_civic, lat, lon, address_count) VALUES ('ON', 'TORONTO|ON', 'MAIN|ST', 123, 123, 43.65325, -79.38325, 2);
INSERT OR REPLACE INTO oda_street_ranges (province, city_key, street_key, min_civic, max_civic, lat, lon, address_count) VALUES ('ON', 'TORONTO|ON', 'KING|ST|W', 456, 456, 43.6489, -79.3817, 1);
INSERT OR REPLACE INTO oda_street_ranges (province, city_key, street_key, min_civic, max_civic, lat, lon, address_count) VALUES ('ON', 'OTTAWA|ON', 'MAIN|ST', 123, 123, 45.4215, -75.6972, 1);
INSERT INTO oda_imports (province, source_url, source_version, row_count, finished_at) VALUES ('ON', 'https://www150.statcan.gc.ca/n1/en/pub/46-26-0001/2021001/ODA_ON_v1.zip', '2021001', 4, datetime('now'));