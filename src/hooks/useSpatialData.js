import { useState, useEffect } from 'react'

const DATASET_FILES = [
  'seveso_sites',
  'gares_ouest',
  'gares_est',
  'gares_sncf_ouest',
  'grandes_routes_ouest',
  'dechetteries',
]

export function useSpatialData() {
  const [state, setState] = useState({
    data: {},
    loading: true,
    error: null,
  })

  useEffect(() => {
    let cancelled = false

    async function loadAll() {
      try {
        const loaded = {}

        for (const name of DATASET_FILES) {
          const resp = await fetch(`/zone-chalandage/data/${name}.geojson`)
          if (!resp.ok) {
            console.warn(`⚠️ ${name}.geojson not found`)
            continue
          }
          const json = await resp.json()
          if (json.features?.length > 0) {
            loaded[name] = json
          }
        }

        if (!cancelled) {
          const totalFeatures = Object.values(loaded).reduce((s, f) => s + (f.features?.length || 0), 0)
          setState({
            data: loaded,
            loading: false,
            error: null,
            totalFeatures,
            loadedFiles: Object.keys(loaded),
          })
        }
      } catch (e) {
        if (!cancelled) {
          setState({ data: {}, loading: false, error: e.message })
        }
      }
    }

    loadAll()
    return () => { cancelled = true }
  }, [])

  return state
}
