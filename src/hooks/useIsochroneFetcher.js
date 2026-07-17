import { useState, useCallback, useRef } from 'react'

const ORS_URL = 'https://api.openrouteservice.org/v2/isochrones/driving-car'

/**
 * Debounced isochrone fetcher from OpenRouteService API.
 * Returns GeoJSON FeatureCollection polygons for real driving-time zones.
 */
export function useIsochroneFetcher() {
  const [isochrones, setIsochrones] = useState({
    menilJean: null,   // GeoJSON Feature
    maySurOrne: null,  // GeoJSON Feature
  })
  const [fetching, setFetching] = useState(false)
  const [fetchError, setFetchError] = useState(null)
  const fetchIdRef = useRef(0)

  const fetchIsochrone = useCallback(async (apiKey, label, lon, lat, minutes) => {
    if (!apiKey || !minutes || minutes < 1) return null

    const body = {
      locations: [[lon, lat]],
      range: [minutes * 60],  // convert to seconds
      range_type: 'time',
      units: 'm',
      attributes: ['area'],
    }

    const resp = await fetch(ORS_URL, {
      method: 'POST',
      headers: {
        'Authorization': apiKey,
        'Content-Type': 'application/json',
        'Accept': 'application/json, application/geo+json',
      },
      body: JSON.stringify(body),
    })

    if (!resp.ok) {
      const text = await resp.text()
      throw new Error(`ORS ${resp.status}: ${text.slice(0, 200)}`)
    }

    const data = await resp.json()
    // data is a GeoJSON FeatureCollection; get first feature
    const feature = data?.features?.[0] || null
    if (feature) {
      // Label the feature for identification
      feature.properties = { ...feature.properties, name: label }
    }
    return feature
  }, [])

  const fetchAll = useCallback(async (apiKey, menilMinutes, mayMinutes) => {
    // Cancel previous fetch
    const thisFetch = ++fetchIdRef.current
    setFetching(true)
    setFetchError(null)

    try {
      // Fetch both in parallel
      const [menilFeat, mayFeat] = await Promise.all([
        fetchIsochrone(apiKey, 'Ménil-Jean', -0.2197, 48.7386, menilMinutes),
        fetchIsochrone(apiKey, 'May-sur-Orne', -0.3678, 49.1048, mayMinutes),
      ])

      // Only update if this is still the latest fetch
      if (thisFetch === fetchIdRef.current) {
        setIsochrones({ menilJean: menilFeat, maySurOrne: mayFeat })
      }
    } catch (e) {
      if (thisFetch === fetchIdRef.current) {
        setFetchError(e.message)
      }
    } finally {
      if (thisFetch === fetchIdRef.current) {
        setFetching(false)
      }
    }
  }, [fetchIsochrone])

  return { isochrones, fetching, fetchError, fetchAll }
}
