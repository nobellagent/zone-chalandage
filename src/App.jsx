import { useState, useCallback, useEffect } from 'react'
import CriteriaPanel from './components/CriteriaPanel.jsx'
import MapView from './components/MapView.jsx'
import { useSpatialData } from './hooks/useSpatialData.js'

const DEFAULT_CRITERIA = {
  menilJean: { enabled: true, km: 120 },
  maySurOrne: { enabled: true, km: 120 },
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
  const { data, loading, error } = useSpatialData()

  const handleCriteriaChange = useCallback((updated) => {
    setCriteria(prev => ({ ...prev, ...updated }))
  }, [])

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-gray-50 relative">
      {/* Collapsible panel */}
      <div className={`shrink-0 h-full transition-all duration-300 ease-in-out ${
        panelOpen ? 'w-80' : 'w-0 overflow-hidden'
      }`}>
        <CriteriaPanel
          criteria={criteria}
          onChange={handleCriteriaChange}
          loading={loading}
          error={error}
          data={data}
        />
      </div>

      {/* Panel toggle button */}
      <button
        onClick={() => setPanelOpen(!panelOpen)}
        className="absolute top-4 left-4 z-[1000] bg-white rounded-lg shadow-md border border-gray-200 p-2 hover:bg-gray-50 transition-colors"
        title={panelOpen ? 'Masquer les filtres' : 'Afficher les filtres'}
      >
        <svg className={`w-5 h-5 text-gray-600 transition-transform ${panelOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
      </button>

      <MapView criteria={criteria} spatialData={data} loading={loading} />
    </div>
  )
}
