import { useState, useCallback } from 'react'
import CriteriaPanel from './components/CriteriaPanel.jsx'
import MapView from './components/MapView.jsx'

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
  const [dbReady, setDbReady] = useState(false)

  const handleCriteriaChange = useCallback((updated) => {
    setCriteria(prev => ({ ...prev, ...updated }))
  }, [])

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-gray-50">
      <CriteriaPanel
        criteria={criteria}
        onChange={handleCriteriaChange}
        dbReady={dbReady}
      />
      <MapView criteria={criteria} />
    </div>
  )
}
