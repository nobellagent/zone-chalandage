import { useState, useEffect, useRef, useCallback } from 'react'

// Coordinates
const MENIL_JEAN = [48.7386, -0.2197]
const MAY_SUR_ORNE = [49.1048, -0.3678]
const SRID = 4326

let duckdb = null
let dbInitPromise = null

/**
 * Initialize DuckDB WASM with spatial extension.
 * Returns {conn, db} once ready.
 */
async function initDuckDB() {
  if (duckdb) return duckdb
  if (dbInitPromise) return dbInitPromise

  dbInitPromise = (async () => {
    try {
      const duckdb_wasm = await import('@duckdb/duckdb-wasm')
      const JSDELIVR_CDN = 'https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.29.0/dist/'

      const bundle = new duckdb_wasm.AsyncDuckDBBundle()
      const db = new duckdb_wasm.AsyncDuckDB()
      
      await db.instantiate(
        `${JSDELIVR_CDN}duckdb-mvp.wasm`,
        `${JSDELIVR_CDN}duckdb-browser-mvp.worker.js`,
      )

      const conn = await db.connect()

      // Load spatial extension
      await conn.query(`INSTALL spatial;`)
      await conn.query(`LOAD spatial;`)
      await conn.query(`SET srid_range=${SRID};`)

      console.log('✅ DuckDB spatial ready')
      duckdb = { db, conn }
      return duckdb
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

  // Create table from GeoJSON using ST_GeomFromGeoJSON
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

  await conn.query(`ALTER TABLE ${tableName} ALTER geom TYPE GEOMETRY;`)
  return rows.length
}

/**
 * Convert DuckDB query result rows to GeoJSON FeatureCollection.
 */
function rowsToGeoJSON(rows) {
  const features = []
  for (const row of rows) {
    const geojson = JSON.parse(row.geojson || row.geom_json || 'null')
    if (geojson) {
      features.push({
        type: 'Feature',
        geometry: geojson,
        properties: row.properties || {},
      })
    }
  }
  return { type: 'FeatureCollection', features }
}

export function useDuckDB() {
  const [state, setState] = useState({
    ready: false,
    loading: true,
    error: null,
    intersection: null,
    dataLoaded: false,
  })
  const stateRef = useRef(state)
  const queryRef = useRef(null)

  const computeIntersection = useCallback(async (criteria, spatialData) => {
    const current = stateRef.current
    if (!current.ready || !spatialData) return

    try {
      const { conn } = await initDuckDB()
      if (!conn) return

      // Load GeoJSON data into DuckDB tables
      const tables = {
        seveso: spatialData.seveso_sites,
        gares_ouest: spatialData.gares_ouest,
        gares_est: spatialData.gares_est,
        routes: spatialData.grandes_routes_ouest,
        nuisances: spatialData.dechetteries,
      }

      for (const [name, geojson] of Object.entries(tables)) {
        if (geojson) {
          await loadGeoJSONTable(conn, name, geojson, ['nom', 'commune'])
        }
      }

      // Build the spatial query
      // Strategy:
      // 1. Get intersection zone of both isochrones (buffers around towns)
      // 2. Subtract exclusion zones (SEVESO buffers, road buffers, nuisance buffers)
      // 3. Intersect with inclusion zones (train station buffers)

      const conditions = []

      // Step 1: Isochrone intersection (buffer around each town)
      const menilKm = criteria.menilJean.enabled ? criteria.menilJean.km : 99999
      const mayKm = criteria.maySurOrne.enabled ? criteria.maySurOrne.km : 99999

      const isochroneQuery = `
        WITH isochrone AS (
          SELECT ST_Intersection(
            ST_Buffer(ST_Point(${MENIL_JEAN[1]}, ${MENIL_JEAN[0]}), ${menilKm} * 1000),
            ST_Buffer(ST_Point(${MAY_SUR_ORNE[1]}, ${MAY_SUR_ORNE[0]}), ${mayKm} * 1000)
          ) AS zone
        )
      `

      // Step 2: Subtract exclusion zones
      const exclusions = []

      if (criteria.seveso.enabled) {
        exclusions.push(`
          (SELECT ST_UnionAgg(ST_Buffer(geom, 3000)) FROM seveso)
        `)
      }

      if (criteria.grandeRoute.enabled) {
        exclusions.push(`
          (SELECT ST_UnionAgg(ST_Buffer(geom, ${criteria.grandeRoute.km * 1000})) FROM routes)
        `)
      }

      if (criteria.nuisance.enabled) {
        exclusions.push(`
          (SELECT ST_UnionAgg(ST_Buffer(geom, ${criteria.nuisance.km * 1000})) FROM nuisances)
        `)
      }

      // Step 3: Inclusion zones (train stations)
      const inclusions = []
      if (criteria.gare.enabled) {
        inclusions.push(`
          (SELECT ST_UnionAgg(ST_Buffer(geom, ${criteria.gare.km * 1000})) FROM (
            SELECT * FROM gares_ouest UNION ALL SELECT * FROM gares_est
          ))
        `)
      }

      // Build final query
      let query = `${isochroneQuery}\nSELECT ST_AsGeoJSON(result) AS geojson FROM (\n  SELECT zone AS result FROM isochrone\n`

      for (const excl of exclusions) {
        query = query.replace(
          /SELECT zone AS result FROM isochrone/,
          `SELECT ST_Difference(zone, ${excl}) AS result FROM isochrone`
        )
        // Actually need to chain these properly
      }

      // Simpler approach: chain operations step by step
      let simpleQuery = `
        WITH zone0 AS (
          SELECT ST_Intersection(
            ST_Buffer(ST_Point(${MENIL_JEAN[1]}, ${MENIL_JEAN[0]}), ${menilKm} * 1000),
            ST_Buffer(ST_Point(${MAY_SUR_ORNE[1]}, ${MAY_SUR_ORNE[0]}), ${mayKm} * 1000)
          ) AS geom
        )
      `

      let currentAlias = 'zone0'
      let exclusionIdx = 0
      for (const excl of exclusions) {
        exclusionIdx++
        const alias = `zone${exclusionIdx}`
        simpleQuery += `, ${alias} AS (\n  SELECT ST_Difference(${currentAlias}.geom, ${excl}) AS geom FROM ${currentAlias}\n)`
        currentAlias = alias
      }

      let inclusionIdx = 0
      for (const incl of inclusions) {
        inclusionIdx++
        const alias = `zone${exclusionIdx + inclusionIdx}`
        simpleQuery += `, ${alias} AS (\n  SELECT ST_Intersection(${currentAlias}.geom, ${incl}) AS geom FROM ${currentAlias}\n)`
        currentAlias = alias
      }

      simpleQuery += `\nSELECT ST_AsGeoJSON(geom) AS geojson FROM ${currentAlias} WHERE geom IS NOT NULL AND ST_Area(geom) > 0;`

      // Execute
      const result = await conn.query(simpleQuery)
      const fc = rowsToGeoJSON(result.toArray())

      setState(prev => ({
        ...prev,
        intersection: fc.features.length > 0 ? fc : null,
        lastQuery: simpleQuery,
      }))
      stateRef.current = { ...stateRef.current, intersection: fc }

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
