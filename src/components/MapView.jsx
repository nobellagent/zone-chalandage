import { useEffect, useRef, useMemo } from 'react'
import L from 'leaflet'

// Centre Normandie
const CENTER = [49.18, -0.37]
const ZOOM = 9

// Coordonnées
const MENIL_JEAN = [48.7386, -0.2197]
const MAY_SUR_ORNE = [49.1048, -0.3678]

function circleOptions(km, color, enabled) {
  return {
    radius: km * 1000,
    color,
    fillColor: color,
    fillOpacity: enabled ? 0.12 : 0,
    opacity: enabled ? 0.6 : 0,
    weight: 2,
  }
}

export default function MapView({ criteria }) {
  const mapRef = useRef(null)
  const mapInstance = useRef(null)
  const layersRef = useRef([])

  // Build active criteria info
  const activeInfo = useMemo(() => {
    const active = []
    if (criteria.menilJean.enabled) active.push({ label: `Ménil-Jean (${criteria.menilJean.km} km)`, color: '#2563eb' })
    if (criteria.maySurOrne.enabled) active.push({ label: `May-sur-Orne (${criteria.maySurOrne.km} km)`, color: '#7c3aed' })
    if (criteria.inondation.enabled) active.push({ label: 'Risque inondation nul', color: '#059669' })
    if (criteria.seveso.enabled) active.push({ label: 'Risque SEVESO faible', color: '#d97706' })
    if (criteria.zoneHumide.enabled) active.push({ label: 'Pas zone humide', color: '#0891b2' })
    if (criteria.grandeRoute.enabled) active.push({ label: `>${criteria.grandeRoute.km} km des routes`, color: '#dc2626' })
    if (criteria.nuisance.enabled) active.push({ label: `>${criteria.nuisance.km} km nuisance`, color: '#ea580c' })
    if (criteria.gare.enabled) active.push({ label: `<${criteria.gare.km} km gare`, color: '#2563eb' })
    return active
  }, [criteria])

  // Init map once
  useEffect(() => {
    if (mapInstance.current) return
    const map = L.map(mapRef.current, {
      center: CENTER,
      zoom: ZOOM,
      zoomControl: true,
    })

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 18,
    }).addTo(map)

    mapInstance.current = map

    // Fix Leaflet icon issue with bundlers
    delete L.Icon.Default.prototype._getIconUrl
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
      iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
      shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
    })

    // Markers for reference points
    L.marker(MENIL_JEAN).addTo(map).bindPopup('Ménil-Jean')
    L.marker(MAY_SUR_ORNE).addTo(map).bindPopup('May-sur-Orne')

    return () => {
      map.remove()
      mapInstance.current = null
    }
  }, [])

  // Update circles when criteria change
  useEffect(() => {
    const map = mapInstance.current
    if (!map) return

    // Clear old layers
    layersRef.current.forEach(l => map.removeLayer(l))
    layersRef.current = []

    // Add circles for isochrones
    if (criteria.menilJean.enabled) {
      const c = L.circle(MENIL_JEAN, circleOptions(criteria.menilJean.km, '#2563eb', true)).addTo(map)
      layersRef.current.push(c)
    }
    if (criteria.maySurOrne.enabled) {
      const c = L.circle(MAY_SUR_ORNE, circleOptions(criteria.maySurOrne.km, '#7c3aed', true)).addTo(map)
      layersRef.current.push(c)
    }

    // Calculate intersection of both circles if both enabled
    if (criteria.menilJean.enabled && criteria.maySurOrne.enabled) {
      const dist = map.distance(MENIL_JEAN, MAY_SUR_ORNE)
      const r1 = criteria.menilJean.km * 1000
      const r2 = criteria.maySurOrne.km * 1000
      if (dist < r1 + r2 && dist > Math.abs(r1 - r2)) {
        const center = [
          (MENIL_JEAN[0] + MAY_SUR_ORNE[0]) / 2,
          (MENIL_JEAN[1] + MAY_SUR_ORNE[1]) / 2,
        ]
        // Approximate intersection zone
        const intersection = L.circle(center, {
          radius: Math.min(r1, r2) * 0.6,
          color: '#16a34a',
          fillColor: '#16a34a',
          fillOpacity: 0.25,
          opacity: 0.8,
          weight: 2,
          dashArray: '5, 5',
        }).addTo(map)
        layersRef.current.push(intersection)
      }
    }
  }, [criteria])

  return (
    <div className="flex-1 relative">
      <div ref={mapRef} className="w-full h-full" />

      {/* Legend */}
      <div className="absolute bottom-6 right-4 z-[1000] bg-white/90 backdrop-blur rounded-lg shadow-lg border border-gray-200 p-3 text-xs max-w-56">
        <p className="font-medium text-gray-700 mb-2">Critères actifs</p>
        {activeInfo.length === 0 && (
          <p className="text-gray-400 italic">Aucun critère actif</p>
        )}
        <div className="space-y-1.5">
          {activeInfo.map((c, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="inline-block w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: c.color }} />
              <span className="text-gray-600">{c.label}</span>
            </div>
          ))}
        </div>
        {criteria.menilJean.enabled && criteria.maySurOrne.enabled && (
          <div className="flex items-center gap-2 mt-2 pt-2 border-t border-gray-100">
            <span className="inline-block w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: '#16a34a', border: '1px dashed #166534' }} />
            <span className="text-gray-600 font-medium">Intersection</span>
          </div>
        )}
      </div>
    </div>
  )
}
