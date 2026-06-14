CREATE TABLE IF NOT EXISTS oda_imports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      province TEXT NOT NULL,
      source_url TEXT,
      source_version TEXT NOT NULL,
      row_count INTEGER DEFAULT 0,
      started_at TEXT DEFAULT CURRENT_TIMESTAMP,
      finished_at TEXT,
      checksum TEXT
    );
CREATE TABLE IF NOT EXISTS oda_addresses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      province TEXT NOT NULL,
      civic_number TEXT,
      street_name TEXT,
      street_type TEXT,
      street_direction TEXT,
      unit TEXT,
      postal_code TEXT,
      city TEXT,
      city_key TEXT NOT NULL,
      lat REAL NOT NULL,
      lon REAL NOT NULL,
      full_address TEXT,
      mailing_line1 TEXT,
      mailing_line2 TEXT,
      municipality TEXT,
      province_code TEXT,
      mailing_postal_code TEXT,
      search_key TEXT NOT NULL,
      street_key TEXT NOT NULL
    );
CREATE TABLE IF NOT EXISTS oda_postal_centroids (
      province TEXT NOT NULL,
      postal_code TEXT NOT NULL,
      lat REAL NOT NULL,
      lon REAL NOT NULL,
      address_count INTEGER NOT NULL,
      PRIMARY KEY (province, postal_code)
    );
CREATE TABLE IF NOT EXISTS oda_city_centroids (
      province TEXT NOT NULL,
      city_key TEXT NOT NULL,
      city TEXT NOT NULL,
      lat REAL NOT NULL,
      lon REAL NOT NULL,
      address_count INTEGER NOT NULL,
      PRIMARY KEY (province, city_key)
    );
CREATE TABLE IF NOT EXISTS oda_street_ranges (
      province TEXT NOT NULL,
      city_key TEXT NOT NULL,
      street_key TEXT NOT NULL,
      min_civic INTEGER,
      max_civic INTEGER,
      lat REAL NOT NULL,
      lon REAL NOT NULL,
      address_count INTEGER NOT NULL,
      PRIMARY KEY (province, city_key, street_key)
    );
CREATE INDEX IF NOT EXISTS idx_oda_postal ON oda_addresses(province, postal_code);
CREATE INDEX IF NOT EXISTS idx_oda_street ON oda_addresses(province, city_key, street_key, civic_number);
CREATE INDEX IF NOT EXISTS idx_oda_search ON oda_addresses(search_key);
CREATE INDEX IF NOT EXISTS idx_oda_city ON oda_addresses(province, city_key);
