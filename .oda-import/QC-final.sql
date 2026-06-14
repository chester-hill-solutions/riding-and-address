DELETE FROM oda_addresses WHERE province = 'QC';
DELETE FROM oda_postal_centroids WHERE province = 'QC';
DELETE FROM oda_city_centroids WHERE province = 'QC';
DELETE FROM oda_street_ranges WHERE province = 'QC';
INSERT INTO oda_addresses (
    id, province, civic_number, street_name, street_type, street_direction, unit,
    postal_code, city, city_key, lat, lon, full_address,
    mailing_line1, mailing_line2, municipality, province_code, mailing_postal_code,
    search_key, street_key
  ) VALUES (
    5, 'QC', '350', 'SAINT-PAUL',
    'RUE', 'E', '',
    'H2Y 1H2', 'Montréal', 'MONTREAL|QC',
    45.5088, -73.554, '350 Rue Saint-Paul E, Montréal QC H2Y 1H2',
    '350 SAINT-PAUL RUE E', '', 'MONTREAL',
    'QC', 'H2Y 1H2',
    '350|SAINT-PAUL|RUE|E|MONTREAL|QC', 'SAINT-PAUL|RUE|E'
  );
INSERT INTO oda_addresses (
    id, province, civic_number, street_name, street_type, street_direction, unit,
    postal_code, city, city_key, lat, lon, full_address,
    mailing_line1, mailing_line2, municipality, province_code, mailing_postal_code,
    search_key, street_key
  ) VALUES (
    6, 'QC', '1000', 'SAINT-DENIS',
    'RUE', '', '',
    'H2X 3K8', 'Montréal', 'MONTREAL|QC',
    45.5145, -73.562, '1000 Rue Saint-Denis, Montréal QC H2X 3K8',
    '1000 SAINT-DENIS RUE', '', 'MONTREAL',
    'QC', 'H2X 3K8',
    '1000|SAINT-DENIS|RUE||MONTREAL|QC', 'SAINT-DENIS|RUE'
  );
INSERT OR REPLACE INTO oda_postal_centroids (province, postal_code, lat, lon, address_count) VALUES ('QC', 'H2Y 1H2', 45.5088, -73.554, 1);
INSERT OR REPLACE INTO oda_postal_centroids (province, postal_code, lat, lon, address_count) VALUES ('QC', 'H2X 3K8', 45.5145, -73.562, 1);
INSERT OR REPLACE INTO oda_city_centroids (province, city_key, city, lat, lon, address_count) VALUES ('QC', 'MONTREAL|QC', 'Montréal', 45.51165, -73.55799999999999, 2);
INSERT OR REPLACE INTO oda_street_ranges (province, city_key, street_key, min_civic, max_civic, lat, lon, address_count) VALUES ('QC', 'MONTREAL|QC', 'SAINT-PAUL|RUE|E', 350, 350, 45.5088, -73.554, 1);
INSERT OR REPLACE INTO oda_street_ranges (province, city_key, street_key, min_civic, max_civic, lat, lon, address_count) VALUES ('QC', 'MONTREAL|QC', 'SAINT-DENIS|RUE', 1000, 1000, 45.5145, -73.562, 1);
INSERT INTO oda_imports (province, source_url, source_version, row_count, finished_at) VALUES ('QC', 'https://www150.statcan.gc.ca/n1/en/pub/46-26-0001/2021001/ODA_QC_v1.zip', '2021001', 2, datetime('now'));