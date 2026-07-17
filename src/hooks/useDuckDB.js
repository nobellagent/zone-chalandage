import { useState, useEffect, useRef, useCallback } from 'react'

// Coordinates
const MENIL_JEAN = [48.7386, -0.2197]
const MAY_SUR_ORNE = [49.1048, -0.3678]

let dbInstance = null
let dbInitPromise = null

/**
 * Initialize DuckDB WASM with spatial extension using v1.33.x API.
 */
async function initDuckDB() {
  if (dbInstance) return dbInstance
  if (dbInitPromise) return dbInitPromise

  dbInitPromise = (async () => {
    try {
      const duckdb = await import('@duckdb/duckdb-wasm')

      // Logger required in v1.33+
      const logger = new duckdb.ConsoleLogger()

      // Get CDN bundles and select best one for this browser
      const bundles = duckdb.getJsDelivrBundles()
      const bundle = await duckdb.selectBundle({
        mvp: bundles.mvp,
        eh: bundles.eh,
      })

      // Create web worker
      const worker = await duckdb.createWorker(bundle.mainWorker)

      // Create & attach
      const db = new duckdb.AsyncDuckDB(logger)
      db.attach(worker)
      await db.instantiate(bundle.mainModule)

      // Connect
      const conn = await db.connect()

      // Load spatial extension
      await conn.query(`INSTALL spatial;`)
      await conn.query(`LOAD spatial;`)

      console.log('✅ DuckDB spatial ready (v1.33.x)')
      dbInstance = { db, conn }
      return dbInstance
    } catch (e) {
      console.error('❌ DuckDB init failed:', e)
      dbInitPromise = null
      throw e
    }
  })()

  return dbInitPromise
}

/**
 * Load a GeoJSON feature collection into a DuckDB table.
 */
async function loadGeoJSONTable(conn, tableName, geojson, columns) {
  if (!geojson?.features?.length) return 0

  const rows = geojson.features.map(f => {
    const geom = JSON.stringify(f.geometry)
    const props = f.properties || {}
    const colValues = columns.map(c => {
      const val = props[c]
      return val !== undefined ? (typeof val === 'string' ? `'${val.replace(/'/g, "''")}'` : val) : 'NULL'
    })
    return `(ST_GeomFromGeoJSON('${geom.replace(/'/g, "''")}'), ${colValues.join(', ')})`
  })

  if (rows.length === 0) return 0

  await conn.query(`DROP TABLE IF EXISTS ${tableName};`)
  const colDefs = ['geom GEOMETRY', ...columns.map(c => `${c} VARCHAR`)]
  await conn.query(`CREATE TABLE ${tableName} (${colDefs.join(', ')});`)

  // Batch insert in chunks
  const chunkSize = 100
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize)
    const vals = chunk.join(', ')
    await conn.query(`INSERT INTO ${tableName} VALUES ${vals};`)
  }

  return rows.length
}

/**
 * Convert DuckDB query result rows to GeoJSON FeatureCollection.
 * v1.33.x conn.query() returns an Arrow Table, not raw rows.
 */
function arrowToGeoJSON(table) {
  const features = []
  const geojsonCol = 'geojson'
  const colIndex = table.schema.fields.findIndex(
    f => f.name === geojsonCol || f.name === 'geom_json'
  )
  if (colIndex === -1) return { type: 'FeatureCollection', features: [] }

  for (let r = 0; r < table.numRows; r++) {
    const row = table.get(r)
    const raw = row[colIndex]
    if (raw === null || raw === undefined) continue
    const geojson = typeof raw === 'string' ? JSON.parse(raw) : raw
    if (geojson) {
      features.push({
        type: 'Feature',
        geometry: geojson,
        properties: {},
      })
    }
  }
  return { type: 'FeatureCollection', features }
}

/**
 * Returns null-safe string expression for DuckDB coord.
 * ST_Point takes (lon, lat) in DuckDB.
 */
function stPoint(lat, lon) {
  return `ST_Point(${lon}, ${lat})`
}

export function useDuckDB() {
  const [state, setState] = useState({
    ready: false,
    loading: true,
    error: null,
    intersection: null,
    zone0: null,        // initial intersection zone (for bold outline display)
    lastQuery: null,
  })
  const stateRef = useRef(state)

  const computeIntersection = useCallback(async (criteria, spatialData, options = {}) => {
    const current = stateRef.current
    if (!current.ready || !spatialData) return

    const { mode = 'km', isochrones = {} } = options

    try {
      const { conn } = await initDuckDB()
      if (!conn) return

      // Load relevant GeoJSON data into DuckDB tables
      const tables = {
        seveso: spatialData.seveso_sites,
        gares_ouest: spatialData.gares_ouest,
        gares_est: spatialData.gares_est,
        routes: spatialData.grandes_routes_ouest,
        nuisances: spatialData.dechetteries,
      }

      for (const [name, geojson] of Object.entries(tables)) {
        if (geojson?.features?.length > 0) {
          await loadGeoJSONTable(conn, name, geojson, ['nom', 'commune'])
        }
      }

      // Handle time mode: load real isochrone polygons into DuckDB
      if (mode === 'time' && isochrones.menilJean && isochrones.maySurOrne) {
        await loadGeoJSONTable(conn, 'isochrone_menil',
          { type: 'FeatureCollection', features: [isochrones.menilJean] }, ['name'])
        await loadGeoJSONTable(conn, 'isochrone_may',
          { type: 'FeatureCollection', features: [isochrones.maySurOrne] }, ['name'])
      }

      const menilKm = criteria.menilJean.enabled ? criteria.menilJean.km : 99999
      const mayKm = criteria.maySurOrne.enabled ? criteria.maySurOrne.km : 99999

      // Build zone0 depending on mode
      let zone0Sql
      if (mode === 'time' && isochrones.menilJean && isochrones.maySurOrne) {
        // Real isochrone polygons from ORS
        zone0Sql = `
          SELECT ST_Intersection(
            (SELECT geom FROM isochrone_menil LIMIT 1),
            (SELECT geom FROM isochrone_may LIMIT 1)
          ) AS geom
        `
      } else {
        // Fallback: circular buffers (km mode)
        zone0Sql = `
          SELECT ST_Intersection(
            ST_Buffer(${stPoint(MENIL_JEAN[0], MENIL_JEAN[1])}, ${menilKm} * 1000),
            ST_Buffer(${stPoint(MAY_SUR_ORNE[0], MAY_SUR_ORNE[1])}, ${mayKm} * 1000)
          ) AS geom
        `
      }

      // Step-by-step CTE
      let query = `WITH zone0 AS (${zone0Sql})`

      let currentAlias = 'zone0'
      let stepIdx = 0

      // Helper: for exclusions, filter features whose buffer intersects current zone
      const addExclusion = (alias, tableName, bufferMeters) => {
        stepIdx++
        const nextAlias = `zone${stepIdx}`
        query += `, ${nextAlias} AS (
          SELECT ST_Difference(${alias}.geom, (
            SELECT ST_UnionAgg(ST_Buffer(f.geom, ${bufferMeters}))
            FROM ${tableName} f
            WHERE ST_Intersects(ST_Buffer(f.geom, ${bufferMeters}), (SELECT geom FROM ${alias}))
          )) AS geom FROM ${alias}
        )`
        return nextAlias
      }

      // Helper: for inclusions, filter features whose buffer intersects current zone
      const addInclusion = (alias, tableSource, bufferMeters) => {
        stepIdx++
        const nextAlias = `zone${stepIdx}`
        query += `, ${nextAlias} AS (
          SELECT ST_Intersection(${alias}.geom, (
            SELECT ST_UnionAgg(ST_Buffer(f.geom, ${bufferMeters}))
            FROM (${tableSource}) f
            WHERE ST_Intersects(ST_Buffer(f.geom, ${bufferMeters}), (SELECT geom FROM ${alias}))
          )) AS geom FROM ${alias}
        )`
        return nextAlias
      }

      // Exclusion: SEVESO (3km buffer)
      if (criteria.seveso.enabled) {
        currentAlias = addExclusion(currentAlias, 'seveso', 3000)
      }

      // Exclusion: roads
      if (criteria.grandeRoute.enabled) {
        currentAlias = addExclusion(currentAlias, 'routes', criteria.grandeRoute.km * 1000)
      }

      // Exclusion: nuisances
      if (criteria.nuisance.enabled) {
        currentAlias = addExclusion(currentAlias, 'nuisances', criteria.nuisance.km * 1000)
      }

      // Inclusion: train stations
      if (criteria.gare.enabled) {
        currentAlias = addInclusion(
          currentAlias,
          `SELECT * FROM gares_ouest UNION ALL SELECT * FROM gares_est`,
          criteria.gare.km * 1000
        )
      }

      // Final query: return zone0 + final result
      query += `
        SELECT
          (SELECT ST_AsGeoJSON(geom) FROM zone0) AS zone0_geojson,
          ST_AsGeoJSON(geom) AS geojson
        FROM ${currentAlias}
        WHERE geom IS NOT NULL AND ST_Area(geom) > 0;
      `

      // Execute
      const result = await conn.query(query)
      const fc = arrowToGeoJSON(result)

      // Extract zone0 from the first row — it's returned alongside the final result
      let zone0Fc = null
      if (result.numRows > 0) {
        const row = result.get(0)
        const zone0Raw = row['zone0_geojson']
        if (zone0Raw) {
          const geom = typeof zone0Raw === 'string' ? JSON.parse(zone0Raw) : zone0Raw
          zone0Fc = {
            type: 'FeatureCollection',
            features: [{ type: 'Feature', geometry: geom, properties: {} }]
          }
        }
      }

      setState(prev => ({
        ...prev,
        intersection: fc.features.length > 0 ? fc : null,
        zone0: zone0Fc,
        lastQuery: query,
      }))
      stateRef.current = { ...stateRef.current, intersection: fc, zone0: zone0Fc }

    } catch (e) {
      console.error('❌ Intersection query failed:', e)
    }
  }, [])

  // Init DuckDB
  useEffect(() => {
    let cancelled = false

    async function init() {
      try {
        const { conn } = await initDuckDB()
        if (!cancelled) {
          const test = await conn.query('SELECT 1 AS n')
          console.log('✅ DuckDB test query OK')
          setState(prev => ({ ...prev, ready: true, loading: false }))
          stateRef.current = { ...stateRef.current, ready: true }
        }
      } catch (e) {
        if (!cancelled) {
          setState(prev => ({ ...prev, loading: false, error: e.message }))
        }
      }
    }

    init()
    return () => { cancelled = true }
  }, [])

  return { ...state, computeIntersection }
}
