import { useState, useCallback, useEffect, useRef } from 'react'
import CriteriaPanel from './components/CriteriaPanel.jsx'
import MapView from './components/MapView.jsx'
import { useSpatialData } from './hooks/useSpatialData.js'
import { useDuckDB } from './hooks/useDuckDB.js'
import { useIsochroneFetcher } from './hooks/useIsochroneFetcher.js'

const DEFAULT_CRITERIA = {
  menilJean: { enabled: true, km: 120, min: 60 },
  maySurOrne: { enabled: true, km: 120, min: 60 },
  inondation: { enabled: true },
  seveso: { enabled: true },
  zoneHumide: { enabled: true },
  grandeRoute: { enabled: true, km: 0.5 },
  nuisance: { enabled: true, km: 1 },
  gare: { enabled: true, km: 10 },
}

export default function App() {
  const [criteria, setCriteria] = useState(DEFAULT_CRITERIA)
  const [panelOpen, setPanelOpen] = useState(true)
  const [mode, setMode] = useState('km')  // 'km' | 'time'
  const [apiKey, setApiKey] = useState('')
  const criteriaRef = useRef(criteria)

  const spatial = useSpatialData()
  const duckdb = useDuckDB()
  const isochrone = useIsochroneFetcher()

  // Keep ref in sync
  useEffect(() => { criteriaRef.current = criteria }, [criteria])

  // Fetch isochrones when mode=time and criteria or apiKey changes
  useEffect(() => {
    if (mode === 'time' && apiKey && criteria.menilJean.enabled && criteria.maySurOrne.enabled) {
      isochrone.fetchAll(apiKey, criteria.menilJean.min, criteria.maySurOrne.min)
    }
  }, [mode, apiKey, criteria.menilJean.min, criteria.maySurOrne.min,
      criteria.menilJean.enabled, criteria.maySurOrne.enabled])

  // Recompute when ready
  useEffect(() => {
    if (!duckdb.ready || !spatial.data || spatial.loading) return

    if (mode === 'time' && isochrone.isochrones.menilJean && isochrone.isochrones.maySurOrne) {
      duckdb.computeIntersection(criteriaRef.current, spatial.data, {
        mode: 'time',
        isochrones: isochrone.isochrones,
      })
    } else if (mode === 'km') {
      duckdb.computeIntersection(criteriaRef.current, spatial.data, { mode: 'km' })
    }
  }, [duckdb.ready, spatial.data, spatial.loading,
      criteria, mode, isochrone.isochrones])

  const handleCriteriaChange = useCallback((updated) => {
    setCriteria(prev => ({ ...prev, ...updated }))
  }, [])

  const handleModeChange = useCallback((newMode) => {
    setMode(newMode)
  }, [])

  const handleApiKeyChange = useCallback((key) => {
    setApiKey(key)
  }, [])

  const isochroneStatus = {
    fetching: isochrone.fetching,
    fetchError: isochrone.fetchError,
    hasMenil: !!isochrone.isochrones.menilJean,
    hasMay: !!isochrone.isochrones.maySurOrne,
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-gray-50 relative">
      {/* Collapsible panel */}
      <div className={`shrink-0 h-full transition-all duration-300 ease-in-out ${
        panelOpen ? 'w-80' : 'w-0 overflow-hidden'
      }`}>
        <CriteriaPanel
          criteria={criteria}
          onChange={handleCriteriaChange}
          loading={spatial.loading || duckdb.loading}
          error={spatial.error || duckdb.error}
          data={spatial.data}
          dbReady={duckdb.ready}
          intersectionCount={duckdb.intersection?.features?.length || 0}
          mode={mode}
          onModeChange={handleModeChange}
          apiKey={apiKey}
          onApiKeyChange={handleApiKeyChange}
          isochroneStatus={isochroneStatus}
        />
      </div>

      {/* Panel toggle */}
      <button
        onClick={() => setPanelOpen(!panelOpen)}
        className="absolute top-4 left-4 z-[1000] bg-white rounded-lg shadow-md border border-gray-200 p-2 hover:bg-gray-50 transition-colors"
        title={panelOpen ? 'Masquer les filtres' : 'Afficher les filtres'}
      >
        <svg className={`w-5 h-5 text-gray-600 transition-transform ${panelOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
      </button>

      <MapView
        criteria={criteria}
        spatialData={spatial.data}
        intersection={duckdb.intersection}
        zone0={duckdb.zone0}
        loading={spatial.loading || duckdb.loading || isochrone.fetching}
        panelOpen={panelOpen}
        mode={mode}
        isochronePolygons={isochrone.isochrones}
      />
    </div>
  )
}
