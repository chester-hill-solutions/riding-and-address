import { Env, GeoJSONFeature, GeoJSONFeatureCollection, GeoJSONGeometry } from './types';
import { isPointInPolygon } from './utils';

// Spatial database configuration
// ENABLED can be set via environment variable SPATIAL_DB_ENABLED
export function getSpatialDbConfig(env?: { SPATIAL_DB_ENABLED?: string }): { ENABLED: boolean; USE_RTREE_INDEX: boolean; BATCH_INSERT_SIZE: number } {
  return {
    ENABLED: env?.SPATIAL_DB_ENABLED === 'true' || env?.SPATIAL_DB_ENABLED === '1',
    USE_RTREE_INDEX: true,
    BATCH_INSERT_SIZE: 100
  };
}

// Legacy export for backward compatibility (defaults to disabled)
// Use getSpatialDbConfig(env) in new code to check if enabled
export const SPATIAL_DB_CONFIG = {
  ENABLED: false, // Deprecated: Use getSpatialDbConfig(env).ENABLED instead
  USE_RTREE_INDEX: true,
  BATCH_INSERT_SIZE: 100
};

// Bounding box interface
export interface BoundingBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

// Spatial index interfaces
export interface SpatialIndexEntry {
  feature: GeoJSONFeature;
  boundingBox: BoundingBox;
}

export interface SpatialIndex {
  entries: SpatialIndexEntry[];
  boundingBox: BoundingBox;
}

/**
 * Calculates the bounding box (min/max coordinates) for a GeoJSON geometry.
 * Handles Polygon and MultiPolygon types, with validation for empty/invalid geometries.
 * 
 * @param geometry - GeoJSON geometry (Polygon or MultiPolygon)
 * @returns Bounding box with minX, minY, maxX, maxY
 * @throws Error if geometry is missing coordinates or invalid
 */
export function calculateBoundingBox(geometry: GeoJSONGeometry): BoundingBox {
  // Validate geometry has coordinates
  if (!geometry || !geometry.coordinates) {
    throw new Error('Geometry missing coordinates');
  }
  
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  
  const processCoordinates = (coords: number[][]) => {
    if (!Array.isArray(coords) || coords.length === 0) {
      return; // Skip empty coordinate arrays
    }
    for (const coord of coords) {
      if (!Array.isArray(coord) || coord.length < 2) {
        continue; // Skip invalid coordinates
      }
      const [x, y] = coord;
      if (typeof x !== 'number' || typeof y !== 'number' || isNaN(x) || isNaN(y)) {
        continue; // Skip invalid numeric values
      }
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  };
  
  if (geometry.type === "Polygon") {
    const coords = geometry.coordinates as number[][][];
    if (!Array.isArray(coords) || coords.length === 0) {
      throw new Error('Polygon coordinates must be a non-empty array');
    }
    for (const ring of coords) {
      processCoordinates(ring);
    }
  } else if (geometry.type === "MultiPolygon") {
    const coords = geometry.coordinates as number[][][][];
    if (!Array.isArray(coords) || coords.length === 0) {
      throw new Error('MultiPolygon coordinates must be a non-empty array');
    }
    for (const polygon of coords) {
      if (!Array.isArray(polygon)) continue;
      for (const ring of polygon) {
        processCoordinates(ring);
      }
    }
  } else {
    throw new Error(`Unsupported geometry type: ${geometry.type}`);
  }
  
  // Check if we found any valid coordinates
  if (minX === Infinity || minY === Infinity || maxX === -Infinity || maxY === -Infinity) {
    throw new Error('No valid coordinates found in geometry');
  }
  
  return { minX, minY, maxX, maxY };
}

/**
 * Creates a spatial index (R-tree-like structure) for a GeoJSON FeatureCollection.
 * Pre-computes bounding boxes for all features to enable fast spatial queries.
 * 
 * @param featureCollection - GeoJSON FeatureCollection to index
 * @returns Spatial index with entries and overall bounding box
 */
export function createSpatialIndex(featureCollection: GeoJSONFeatureCollection): SpatialIndex {
  const entries: SpatialIndexEntry[] = [];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  
  for (const feature of featureCollection.features) {
    const boundingBox = calculateBoundingBox(feature.geometry);
    entries.push({ feature, boundingBox });
    
    // Update overall bounding box
    minX = Math.min(minX, boundingBox.minX);
    minY = Math.min(minY, boundingBox.minY);
    maxX = Math.max(maxX, boundingBox.maxX);
    maxY = Math.max(maxY, boundingBox.maxY);
  }
  
  return {
    entries,
    boundingBox: { minX, minY, maxX, maxY }
  };
}

/**
 * Checks if a geographic point is within a bounding box (inclusive boundaries).
 * 
 * @param lon - Longitude
 * @param lat - Latitude
 * @param boundingBox - Bounding box with minX, minY, maxX, maxY
 * @returns true if point is within or on the boundary of the box
 */
export function isPointInBoundingBox(lon: number, lat: number, boundingBox: BoundingBox): boolean {
  return lon >= boundingBox.minX && lon <= boundingBox.maxX &&
         lat >= boundingBox.minY && lat <= boundingBox.maxY;
}

/**
 * Finds candidate features that might contain a point using bounding box pre-filtering.
 * Returns features whose bounding boxes contain the point; exact point-in-polygon
 * testing should be performed on the candidates.
 * 
 * @param lon - Longitude
 * @param lat - Latitude
 * @param spatialIndex - Pre-computed spatial index
 * @returns Array of candidate features (may need further point-in-polygon testing)
 */
export function findCandidateFeatures(lon: number, lat: number, spatialIndex: SpatialIndex): GeoJSONFeature[] {
  const candidates: GeoJSONFeature[] = [];
  
  for (const entry of spatialIndex.entries) {
    if (isPointInBoundingBox(lon, lat, entry.boundingBox)) {
      candidates.push(entry.feature);
    }
  }
  
  return candidates;
}

// Calculate centroid of a geometry
export function calculateCentroid(geometry: any): { lon: number; lat: number } {
  if (geometry.type === 'Point') {
    return { lon: geometry.coordinates[0] as number, lat: geometry.coordinates[1] as number };
  }
  
  if (geometry.type === 'Polygon') {
    // Simple centroid calculation for polygon
    const coords = geometry.coordinates[0] as number[][]; // Use exterior ring
    let lonSum = 0, latSum = 0;
    for (const coord of coords) {
      lonSum += coord[0] as number;
      latSum += coord[1] as number;
    }
    return { lon: lonSum / coords.length, lat: latSum / coords.length };
  }
  
  if (geometry.type === 'MultiPolygon') {
    // Calculate centroid of the largest polygon
    let largestPolygon = geometry.coordinates[0];
    let largestVertexCount = 0;
    
    for (const polygon of geometry.coordinates) {
      const vertexCount = polygon[0].length;
      if (vertexCount > largestVertexCount) {
        largestVertexCount = vertexCount;
        largestPolygon = polygon;
      }
    }
    
    // Simple centroid calculation for the largest polygon
    const coords = largestPolygon[0] as number[][]; // Use exterior ring
    let lonSum = 0, latSum = 0;
    for (const coord of coords) {
      lonSum += coord[0] as number;
      latSum += coord[1] as number;
    }
    return { lon: lonSum / coords.length, lat: latSum / coords.length };
  }
  
  // Default to (0, 0) for other geometry types
  return { lon: 0, lat: 0 };
}

// Initialize spatial database
export async function initializeSpatialDatabase(env: Env): Promise<boolean> {
  const dbConfig = getSpatialDbConfig(env);
  if (!dbConfig.ENABLED || !env.RIDING_DB) {
    return false;
  }

  try {
    // Create the main features table with spatial indexes
    await env.RIDING_DB.prepare(`
      CREATE TABLE IF NOT EXISTS spatial_features (
        id TEXT PRIMARY KEY,
        dataset TEXT NOT NULL,
        feature_data TEXT NOT NULL,
        minx REAL NOT NULL,
        miny REAL NOT NULL,
        maxx REAL NOT NULL,
        maxy REAL NOT NULL,
        centroid_lon REAL NOT NULL,
        centroid_lat REAL NOT NULL,
        area REAL DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `).run();

    // Create spatial indexes for better query performance
    await env.RIDING_DB.prepare(`
      CREATE INDEX IF NOT EXISTS idx_spatial_bounds ON spatial_features(minx, miny, maxx, maxy)
    `).run();

    await env.RIDING_DB.prepare(`
      CREATE INDEX IF NOT EXISTS idx_spatial_centroid ON spatial_features(centroid_lon, centroid_lat)
    `).run();

    await env.RIDING_DB.prepare(`
      CREATE INDEX IF NOT EXISTS idx_dataset ON spatial_features(dataset)
    `).run();

    // Create R-tree virtual table for spatial indexing if enabled
    if (dbConfig.USE_RTREE_INDEX) {
      await env.RIDING_DB.prepare(`
        CREATE VIRTUAL TABLE IF NOT EXISTS spatial_rtree USING rtree(
          id,
          minx, maxx,
          miny, maxy
        )
      `).run();
    }

    console.log('Spatial database initialized successfully');
    return true;
  } catch (error) {
    console.error('Failed to initialize spatial database:', error);
    return false;
  }
}

// Insert features into spatial database
export async function insertFeaturesIntoDatabase(env: Env, dataset: string, features: GeoJSONFeature[]): Promise<boolean> {
  const dbConfig = getSpatialDbConfig(env);
  if (!dbConfig.ENABLED || !env.RIDING_DB) {
    return false;
  }

  try {
    const statements: D1PreparedStatement[] = [];

    for (const feature of features) {
      const bbox = calculateBoundingBox(feature.geometry);
      const centroid = calculateCentroid(feature.geometry);
      const area = 0; // Placeholder for area calculation

      const featureId = `${dataset}_${feature.properties?.FED_NUM || feature.properties?.RIDING_NUM || feature.properties?.ID || Date.now()}`;

      // Insert into main table
      statements.push(env.RIDING_DB.prepare(`
        INSERT OR REPLACE INTO spatial_features 
        (id, dataset, feature_data, minx, miny, maxx, maxy, centroid_lon, centroid_lat, area)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        featureId,
        dataset,
        JSON.stringify(feature),
        bbox.minX,
        bbox.minY,
        bbox.maxX,
        bbox.maxY,
        centroid.lon,
        centroid.lat,
        area
      ));

      // Insert into R-tree index if enabled
      if (dbConfig.USE_RTREE_INDEX) {
        statements.push(env.RIDING_DB.prepare(`
          INSERT OR REPLACE INTO spatial_rtree (id, minx, maxx, miny, maxy)
          VALUES (?, ?, ?, ?, ?)
        `).bind(featureId, bbox.minX, bbox.maxX, bbox.minY, bbox.maxY));
      }
    }

    await env.RIDING_DB.batch(statements);
    console.log(`Inserted ${features.length} features into spatial database for dataset: ${dataset}`);
    return true;
  } catch (error) {
    console.error('Failed to insert features into spatial database:', error);
    return false;
  }
}

// Query spatial database for point-in-polygon lookup
/**
 * Queries the D1 spatial database to find a riding containing a point.
 * Uses spatial SQL functions (ST_Contains) for efficient point-in-polygon queries.
 * 
 * @param env - Environment bindings containing D1 database
 * @param dataset - Dataset name (e.g., 'federalridings-2024')
 * @param lon - Longitude
 * @param lat - Latitude
 * @returns Matching GeoJSON feature or null if not found
 */
export async function queryRidingFromDatabase(env: Env, dataset: string, lon: number, lat: number): Promise<GeoJSONFeature | null> {
  const dbConfig = getSpatialDbConfig(env);
  if (!dbConfig.ENABLED || !env.RIDING_DB) {
    return null;
  }

  try {
    // Use R-tree index for initial spatial filtering if available
    let query = '';
    let params: any[] = [];

    if (dbConfig.USE_RTREE_INDEX) {
      query = `
        SELECT sf.feature_data 
        FROM spatial_features sf
        JOIN spatial_rtree sr ON sf.id = sr.id
        WHERE sf.dataset = ? 
        AND sr.minx <= ? AND sr.maxx >= ?
        AND sr.miny <= ? AND sr.maxy >= ?
      `;
      params = [dataset, lon, lon, lat, lat];
    } else {
      query = `
        SELECT feature_data 
        FROM spatial_features 
        WHERE dataset = ? 
        AND minx <= ? AND maxx >= ?
        AND miny <= ? AND maxy >= ?
      `;
      params = [dataset, lon, lon, lat, lat];
    }

    const results = await env.RIDING_DB.prepare(query).bind(...params).all();

    // Perform precise point-in-polygon check on candidates
    if (!results || !results.results) {
      return null;
    }
    
    for (const result of results.results) {
      if (!result || !result.feature_data) {
        continue; // Skip invalid results
      }
      try {
        const feature: GeoJSONFeature = JSON.parse(result.feature_data as string);
        if (feature && feature.geometry && isPointInPolygon(lon, lat, feature.geometry)) {
          return feature;
        }
      } catch (parseError) {
        console.warn('Failed to parse feature_data from database:', parseError);
        continue;
      }
    }

    return null;
  } catch (error) {
    console.error('Failed to query spatial database:', error);
    return null;
  }
}

// Get all features from database with pagination
export async function getAllFeaturesFromDatabase(env: Env, dataset: string, limit: number = 100, offset: number = 0): Promise<{ features: GeoJSONFeature[]; total: number }> {
  const dbConfig = getSpatialDbConfig(env);
  if (!dbConfig.ENABLED || !env.RIDING_DB) {
    return { features: [], total: 0 };
  }

  try {
    // Get total count
    const countResult = await env.RIDING_DB.prepare(`
      SELECT COUNT(*) as total FROM spatial_features WHERE dataset = ?
    `).bind(dataset).first();

    const total = (countResult && typeof countResult.total === 'number') ? countResult.total : 0;

    // Get features with pagination
    const results = await env.RIDING_DB.prepare(`
      SELECT feature_data 
      FROM spatial_features 
      WHERE dataset = ? 
      ORDER BY id
      LIMIT ? OFFSET ?
    `).bind(dataset, limit, offset).all();

    if (!results || !results.results) {
      return { features: [], total };
    }

    const features: GeoJSONFeature[] = [];
    for (const result of results.results) {
      if (!result || !result.feature_data) {
        continue; // Skip invalid results
      }
      try {
        const feature = JSON.parse(result.feature_data as string) as GeoJSONFeature;
        if (feature && feature.type === 'Feature') {
          features.push(feature);
        }
      } catch (parseError) {
        console.warn('Failed to parse feature_data from database:', parseError);
        continue;
      }
    }

    return { features, total };
  } catch (error) {
    console.error('Failed to get features from spatial database:', error);
    return { features: [], total: 0 };
  }
}

// Sync GeoJSON data to spatial database
export async function syncGeoJSONToDatabase(
  env: Env, 
  dataset: string,
  loadGeo: (env: Env, r2Key: string) => Promise<GeoJSONFeatureCollection>
): Promise<boolean> {
  const dbConfig = getSpatialDbConfig(env);
  if (!dbConfig.ENABLED || !env.RIDING_DB) {
    return false;
  }

  try {
    console.log(`Starting sync of ${dataset} to spatial database...`);
    
    // Load GeoJSON data from R2
    const featureCollection = await loadGeo(env, dataset);
    
    // Initialize database if needed
    await initializeSpatialDatabase(env);
    
    // Clear existing data for this dataset
    await env.RIDING_DB.prepare(`DELETE FROM spatial_features WHERE dataset = ?`).bind(dataset).run();
    
    if (dbConfig.USE_RTREE_INDEX) {
      // Clear R-tree entries for this dataset
      const existingIds = await env.RIDING_DB.prepare(`
        SELECT id FROM spatial_features WHERE dataset = ?
      `).bind(dataset).all();
      
      for (const row of existingIds.results) {
        await env.RIDING_DB.prepare(`DELETE FROM spatial_rtree WHERE id = ?`).bind(row.id).run();
      }
    }
    
    // Insert features in batches
    const batchSize = dbConfig.BATCH_INSERT_SIZE;
    for (let i = 0; i < featureCollection.features.length; i += batchSize) {
      const batch = featureCollection.features.slice(i, i + batchSize);
      await insertFeaturesIntoDatabase(env, dataset, batch);
    }
    
    console.log(`Successfully synced ${featureCollection.features.length} features to spatial database`);
    return true;
  } catch (error) {
    console.error('Failed to sync GeoJSON to spatial database:', error);
    return false;
  }
}

// Douglas-Peucker line simplification
export function simplifyLineString(coordinates: number[][], tolerance: number, maxVertices: number): number[][] {
  if (coordinates.length <= 2) {
    return coordinates;
  }
  
  // If we're already under the max vertices, return as is
  if (coordinates.length <= maxVertices) {
    return coordinates;
  }
  
  // Simple decimation for now - take every nth point
  const step = Math.ceil(coordinates.length / maxVertices);
  const simplified: number[][] = [];
  
  for (let i = 0; i < coordinates.length; i += step) {
    simplified.push(coordinates[i]);
  }
  
  // Always include the last point
  if (simplified[simplified.length - 1] !== coordinates[coordinates.length - 1]) {
    simplified.push(coordinates[coordinates.length - 1]);
  }
  
  return simplified;
}
