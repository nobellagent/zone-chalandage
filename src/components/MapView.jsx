import { useEffect, useRef, useMemo, useState } from 'react'
import L from 'leaflet'

// Centre Marges Normandes
const CENTER = [49.0, -0.2]
const ZOOM = 9
const MENIL_JEAN = [48.7386, -0.2197]
const MAY_SUR_ORNE = [49.1048, -0.3678]

function tileLayer(url, attr) {
  return L.tileLayer(url, { attribution: attr, maxZoom: 18 })
}

const TILE_PROVIDERS = {
  osm: {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attr: '&copy; OpenStreetMap contributors',
  },
  topo: {
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attr: '&copy; OpenTopoMap contributors',
  },
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attr: '&copy; Esri',
  },
}

export default function MapView({ criteria, spatialData, loading }) {
  const mapRef = useRef(null)
  const mapInstance = useRef(null)
  const layersRef = useRef([])
  const [tiles, setTiles] = useState('osm')

  // Compute intersection zone from active criteria
  const intersectionZone = useMemo(() => {
    // When data isn't loaded yet, use simple circles
    if (loading || !spatialData) return null

    // This will be replaced with turf.js polygon operations
    // once the data is properly loaded
    return {
      type: 'Feature',
      geometry: null,
      properties: { label: 'Zone calculée (données en cours de chargement)' }
    }
  }, [criteria, spatialData, loading])

  // Legend info
  const activeInfo = useMemo(() => {
    const a = []
    if (criteria.menilJean.enabled) a.push({ label: `Rayon Ménil-Jean ${criteria.menilJean.km} km`, color: '#2563eb' })
    if (criteria.maySurOrne.enabled) a.push({ label: `Rayon May-sur-Orne ${criteria.maySurOrne.km} km`, color: '#7c3aed' })
    if (criteria.inondation.enabled) a.push({ label: 'Hors zone inondable', color: '#059669' })
    if (criteria.seveso.enabled) a.push({ label: 'Hors SEVESO', color: '#d97706' })
    if (criteria.zoneHumide.enabled) a.push({ label: 'Hors zone humide', color: '#0891b2' })
    if (criteria.grandeRoute.enabled) a.push({ label: `>${criteria.grandeRoute.km} km route`, color: '#dc2626' })
    if (criteria.nuisance.enabled) a.push({ label: `>${criteria.nuisance.km} km nuisance`, color: '#ea580c' })
    if (criteria.gare.enabled) a.push({ label: `<${criteria.gare.km} km gare`, color: '#2563eb' })
    return a
  }, [criteria])

  // Init map
  useEffect(() => {
    if (mapInstance.current) return
    const map = L.map(mapRef.current, {
      center: CENTER,
      zoom: ZOOM,
      zoomControl: true,
    })

    const t = TILE_PROVIDERS.osm
    L.tileLayer(t.url, { attribution: t.attr, maxZoom: 18 }).addTo(map)

    // Fix Leaflet marker icons
    delete L.Icon.Default.prototype._getIconUrl
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
      iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
      shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
    })

    L.marker(MENIL_JEAN).addTo(map).bindPopup('<b>Ménil-Jean</b>')
    L.marker(MAY_SUR_ORNE).addTo(map).bindPopup('<b>May-sur-Orne</b>')

    mapInstance.current = map
    mapRef.current._map = map
    return () => { map.remove(); mapInstance.current = null }
  }, [])

  // Switch tile layer
  useEffect(() => {
    const map = mapInstance.current
    if (!map) return
    // Remove all existing tile layers
    map.eachLayer((layer) => {
      if (layer._url && !layer._icon) map.removeLayer(layer)
    })
    const t = TILE_PROVIDERS[tiles]
    L.tileLayer(t.url, { attribution: t.attr, maxZoom: 18 }).addTo(map)
  }, [tiles])

  // Update map layers when criteria change
  useEffect(() => {
    const map = mapInstance.current
    if (!map) return

    // Clear old overlays
    layersRef.current.forEach(l => map.removeLayer(l))
    layersRef.current = []

    // Draw isochrone circles
    if (criteria.menilJean.enabled) {
      const c = L.circle(MENIL_JEAN, {
        radius: criteria.menilJean.km * 1000,
        color: '#2563eb', fillColor: '#2563eb', fillOpacity: 0.08, opacity: 0.5, weight: 2,
      }).addTo(map)
      layersRef.current.push(c)
    }

    if (criteria.maySurOrne.enabled) {
      const c = L.circle(MAY_SUR_ORNE, {
        radius: criteria.maySurOrne.km * 1000,
        color: '#7c3aed', fillColor: '#7c3aed', fillOpacity: 0.08, opacity: 0.5, weight: 2,
      }).addTo(map)
      layersRef.current.push(c)
    }

    // Draw SEVESO points
    if (criteria.seveso.enabled && spatialData?.seveso_sites?.features) {
      const layer = L.geoJSON(spatialData.seveso_sites, {
        pointToLayer: (f, latlng) => L.circleMarker(latlng, {
          radius: 6, color: '#dc2626', fillColor: '#dc2626', fillOpacity: 0.7, weight: 1,
        }),
      }).addTo(map)
      layersRef.current.push(layer)
    }

    // Draw train stations
    if (criteria.gare.enabled && spatialData?.gares?.features) {
      const layer = L.geoJSON(spatialData.gares, {
        pointToLayer: (f, latlng) => L.circleMarker(latlng, {
          radius: 4, color: '#2563eb', fillColor: '#2563eb', fillOpacity: 0.5, weight: 1,
        }),
      }).addTo(map)
      layersRef.current.push(layer)
    }

    // Draw major roads
    if (criteria.grandeRoute.enabled && spatialData?.grandes_routes?.features) {
      const layer = L.geoJSON(spatialData.grandes_routes, {
        style: { color: '#dc2626', weight: 2, opacity: 0.5 },
      }).addTo(map)
      layersRef.current.push(layer)
    }

    // Draw waste facilities
    if (criteria.nuisance.enabled) {
      const allNuisances = []
      if (spatialData?.dechetteries?.features) allNuisances.push(...spatialData.dechetteries.features)
      if (spatialData?.centres_enfouissement?.features) allNuisances.push(...spatialData.centres_enfouissement.features)
      if (allNuisances.length > 0) {
        const layer = L.geoJSON({ type: 'FeatureCollection', features: allNuisances }, {
          pointToLayer: (f, latlng) => L.circleMarker(latlng, {
            radius: 5, color: '#ea580c', fillColor: '#ea580c', fillOpacity: 0.7, weight: 1,
          }),
        }).addTo(map)
        layersRef.current.push(layer)
      }
    }

  }, [criteria, spatialData])

  return (
    <div className="flex-1 relative">
      {/* Loading overlay */}
      {loading && (
        <div className="absolute inset-0 z-[1000] bg-white/50 flex items-center justify-center">
          <div className="bg-white rounded-lg shadow-lg px-6 py-4 text-sm text-gray-600 flex items-center gap-3">
            <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            Chargement des données...
          </div>
        </div>
      )}

      <div ref={mapRef} className="w-full h-full" />

      {/* Tile switcher */}
      <div className="absolute top-4 right-4 z-[1000] flex gap-1">
        {Object.entries(TILE_PROVIDERS).map(([key]) => (
          <button
            key={key}
            onClick={() => setTiles(key)}
            className={`px-2.5 py-1 text-xs rounded shadow-sm border transition-colors ${
              tiles === key
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
            }`}
          >
            {key === 'osm' ? 'Carte' : key === 'topo' ? 'Topo' : 'Satellite'}
          </button>
        ))}
      </div>

      {/* Legend */}
      <div className="absolute bottom-6 right-4 z-[1000] bg-white/90 backdrop-blur rounded-lg shadow-lg border border-gray-200 p-3 text-xs max-w-56">
        <p className="font-medium text-gray-700 mb-2">Critères actifs</p>
        {activeInfo.length === 0 && (
          <p className="text-gray-400 italic">Aucun</p>
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
            <span className="inline-block w-3 h-3 rounded-sm shrink-0 border-2 border-green-600 bg-green-300/30" />
            <span className="text-gray-600 font-medium">Intersection</span>
          </div>
        )}
      </div>
    </div>
  )
}
