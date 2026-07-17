import { useCallback } from 'react'
import CriteriaToggle from './CriteriaToggle.jsx'
import CriteriaSlider from './CriteriaSlider.jsx'

export default function CriteriaPanel({ criteria, onChange, dbReady }) {
  const toggle = useCallback((key) => {
    onChange({ [key]: { ...criteria[key], enabled: !criteria[key].enabled } })
  }, [criteria, onChange])

  const setKm = useCallback((key, km) => {
    onChange({ [key]: { ...criteria[key], km } })
  }, [criteria, onChange])

  return (
    <aside className="w-80 shrink-0 h-full overflow-y-auto bg-white border-r border-gray-200 shadow-sm flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-gray-100">
        <h1 className="text-lg font-semibold text-gray-900">Zone de Chalandage</h1>
        <p className="text-sm text-gray-500 mt-1">Normandie</p>
      </div>

      {/* DB Status */}
      <div className="px-4 pt-3 pb-1 flex items-center gap-2">
        <span className={`inline-block w-2 h-2 rounded-full ${dbReady ? 'bg-green-500' : 'bg-amber-400'}`} />
        <span className="text-xs text-gray-400">{dbReady ? 'Données prêtes' : 'Initialisation...'}</span>
      </div>

      {/* Criteria list */}
      <div className="flex-1 p-4 space-y-5">
        <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Isochrones</p>

        <CriteriaSlider
          label="Ménil-Jean"
          description="Distance max depuis Ménil-Jean"
          enabled={criteria.menilJean.enabled}
          value={criteria.menilJean.km}
          min={10}
          max={200}
          step={5}
          unit="km"
          onToggle={() => toggle('menilJean')}
          onChange={(v) => setKm('menilJean', v)}
        />

        <CriteriaSlider
          label="May-sur-Orne"
          description="Distance max depuis May-sur-Orne"
          enabled={criteria.maySurOrne.enabled}
          value={criteria.maySurOrne.km}
          min={10}
          max={200}
          step={5}
          unit="km"
          onToggle={() => toggle('maySurOrne')}
          onChange={(v) => setKm('maySurOrne', v)}
        />

        <div className="border-t border-gray-100 pt-4">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">Risques & Environnement</p>
        </div>

        <CriteriaToggle
          label="Risque inondation nul"
          description="Zones sans risque inondation"
          enabled={criteria.inondation.enabled}
          onToggle={() => toggle('inondation')}
        />

        <CriteriaToggle
          label="Risque SEVESO faible"
          description="Pas de site SEVESO à proximité"
          enabled={criteria.seveso.enabled}
          onToggle={() => toggle('seveso')}
        />

        <CriteriaToggle
          label="Pas en zone humide"
          description="Éviter les zones de marée"
          enabled={criteria.zoneHumide.enabled}
          onToggle={() => toggle('zoneHumide')}
        />

        <CriteriaSlider
          label="Distance grande route"
          description="Éviter autoroutes / nationales"
          enabled={criteria.grandeRoute.enabled}
          value={criteria.grandeRoute.km}
          min={0.1}
          max={5}
          step={0.1}
          unit="km"
          onToggle={() => toggle('grandeRoute')}
          onChange={(v) => setKm('grandeRoute', v)}
        />

        <CriteriaSlider
          label="Distance nuisance"
          description="Déchetterie, centre d'enfouissement"
          enabled={criteria.nuisance.enabled}
          value={criteria.nuisance.km}
          min={0.5}
          max={10}
          step={0.5}
          unit="km"
          onToggle={() => toggle('nuisance')}
          onChange={(v) => setKm('nuisance', v)}
        />

        <CriteriaSlider
          label="Proximité gare"
          description="Distance max d'une gare"
          enabled={criteria.gare.enabled}
          value={criteria.gare.km}
          min={1}
          max={30}
          step={1}
          unit="km"
          onToggle={() => toggle('gare')}
          onChange={(v) => setKm('gare', v)}
        />
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-gray-100 text-xs text-gray-400 text-center">
        Données open-source · data.gouv.fr · OSM
      </div>
    </aside>
  )
}
