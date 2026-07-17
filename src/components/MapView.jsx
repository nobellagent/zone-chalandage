import { useEffect, useRef, useState, useMemo } from 'react'
import L from 'leaflet'

const CENTER = [49.0, -0.2]
const ZOOM = 9
const MENIL_JEAN = [48.7386, -0.2197]
const MAY_SUR_ORNE = [49.1048, -0.3678]

const TILE_PROVIDERS = {
  osm: { url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', attr: '&copy; OpenStreetMap' },
  topo: { url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', attr: '&copy; OpenTopoMap' },
  satellite: { url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', attr: '&copy; Esri' },
}

export default function MapView({ criteria, spatialData, intersection, loading }) {
  const mapRef = useRef(null)
  const mapInstance = useRef(null)
  const overlaysRef = useRef([])
  const intersectionLayerRef = useRef(null)
  const [tiles, setTiles] = useState('osm')

  // Legend
  const activeInfo = useMemo(() => {
    const a = []
    if (criteria.menilJean.enabled) a.push({ label: `Isochrone Ménil-Jean ${criteria.menilJean.km} km`, color: '#2563eb' })
    if (criteria.maySurOrne.enabled) a.push({ label: `Isochrone May-sur-Orne ${criteria.maySurOrne.km} km`, color: '#7c3aed' })
    if (criteria.seveso.enabled) a.push({ label: 'Zone SEVESO exclue', color: '#dc2626' })
    if (criteria.grandeRoute.enabled) a.push({ label: `Route exclue (${criteria.grandeRoute.km} km)`, color: '#f97316' })
    if (criteria.nuisance.enabled) a.push({ label: `Nuisance exclue (${criteria.nuisance.km} km)`, color: '#ea580c' })
    if (criteria.gare.enabled) a.push({ label: `Inclusion gare (${criteria.gare.km} km)`, color: '#2563eb' })
    return a
  }, [criteria])

  // Init map once — use canvas renderer for performance
  useEffect(() => {
    if (mapInstance.current) return
    const map = L.map(mapRef.current, {
      center: CENTER,
      zoom: ZOOM,
      zoomControl: true,
      preferCanvas: true, // Canvas > SVG for 1000s of features
    })
    const t = TILE_PROVIDERS.osm
    L.tileLayer(t.url, { attribution: t.attr, maxZoom: 18 }).addTo(map)

    // Fix icons
    delete L.Icon.Default.prototype._getIconUrl
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
      iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
      shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
    })

    L.marker(MENIL_JEAN).addTo(map).bindPopup('<b>Ménil-Jean</b>')
    L.marker(MAY_SUR_ORNE).addTo(map).bindPopup('<b>May-sur-Orne</b>')

    mapInstance.current = map
    return () => { map.remove(); mapInstance.current = null }
  }, [])

  // Tile switcher
  useEffect(() => {
    const map = mapInstance.current
    if (!map) return
    map.eachLayer((layer) => {
      if (layer._url && !layer._icon && !layer._marker) map.removeLayer(layer)
    })
    const t = TILE_PROVIDERS[tiles]
    L.tileLayer(t.url, { attribution: t.attr, maxZoom: 18 }).addTo(map)
  }, [tiles])

  // Update overlays when criteria or spatial data change
  useEffect(() => {
    const map = mapInstance.current
    if (!map) return

    // Clear old overlays
    overlaysRef.current.forEach(l => { try { map.removeLayer(l) } catch {} })
    overlaysRef.current = []

    // Isochrone circles (always lightweight)
    if (criteria.menilJean.enabled) {
      const c = L.circle(MENIL_JEAN, { radius: criteria.menilJean.km * 1000, color: '#2563eb', fillColor: '#2563eb', fillOpacity: 0.06, opacity: 0.4, weight: 2, dashArray: '8, 4' }).addTo(map)
      overlaysRef.current.push(c)
    }
    if (criteria.maySurOrne.enabled) {
      const c = L.circle(MAY_SUR_ORNE, { radius: criteria.maySurOrne.km * 1000, color: '#7c3aed', fillColor: '#7c3aed', fillOpacity: 0.06, opacity: 0.4, weight: 2, dashArray: '8, 4' }).addTo(map)
      overlaysRef.current.push(c)
    }

    // Exclusion: SEVESO sites — use lightweight circle markers
    if (criteria.seveso.enabled && spatialData?.seveso_sites?.features) {
      const layer = L.geoJSON(spatialData.seveso_sites, {
        pointToLayer: (f, ll) => L.circleMarker(ll, { radius: 8, color: '#dc2626', fillColor: '#dc2626', fillOpacity: 0.4, weight: 1 }),
      }).bindPopup(f => `<b>${f.properties.nom || 'SEVESO'}</b><br/>${f.properties.commune || ''}`).addTo(map)
      overlaysRef.current.push(layer)
    }

    // Exclusion: roads — show only at zoom >= 8 to reduce lag
    if (criteria.grandeRoute.enabled && spatialData?.grandes_routes_ouest?.features) {
      const layer = L.geoJSON(spatialData.grandes_routes_ouest, {
        style: { color: '#f97316', weight: 1.5, opacity: 0.25 },
      }).addTo(map)
      overlaysRef.current.push(layer)
    }

    // Exclusion: nuisances — lightweight circle markers
    if (criteria.nuisance.enabled && spatialData?.dechetteries?.features) {
      const layer = L.geoJSON(spatialData.dechetteries, {
        pointToLayer: (f, ll) => L.circleMarker(ll, { radius: 3, color: '#ea580c', fillColor: '#ea580c', fillOpacity: 0.3, weight: 1 }),
      }).addTo(map)
      overlaysRef.current.push(layer)
    }

    // Gares
    if (criteria.gare.enabled) {
      for (const key of ['gares_ouest', 'gares_est', 'gares_sncf_ouest']) {
        const data = spatialData?.[key]
        if (data?.features) {
          const layer = L.geoJSON(data, {
            pointToLayer: (f, ll) => L.circleMarker(ll, { radius: 5, color: '#2563eb', fillColor: '#2563eb', fillOpacity: 0.25, weight: 1 }),
          }).addTo(map)
          overlaysRef.current.push(layer)
        }
      }
    }

  }, [criteria, spatialData])

  // Update DuckDB intersection polygon
  useEffect(() => {
    const map = mapInstance.current
    if (!map) return

    if (intersectionLayerRef.current) {
      map.removeLayer(intersectionLayerRef.current)
      intersectionLayerRef.current = null
    }

    if (intersection?.features?.length > 0) {
      const layer = L.geoJSON(intersection, {
        style: {
          color: '#16a34a',
          fillColor: '#16a34a',
          fillOpacity: 0.3,
          weight: 3,
          opacity: 0.8,
        },
      }).addTo(map)
      intersectionLayerRef.current = layer
      map.fitBounds(layer.getBounds(), { padding: [50, 50] })
    }
  }, [intersection])

  return (
    <div className="flex-1 relative">
      {loading && (
        <div className="absolute inset-0 z-[1000] bg-white/50 flex items-center justify-center pointer-events-none">
          <div className="bg-white rounded-lg shadow-lg px-6 py-4 text-sm text-gray-600 flex items-center gap-3">
            <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            Calcul de l'intersection...
          </div>
        </div>
      )}

      <div ref={mapRef} className="w-full h-full" />

      {/* Tile switcher */}
      <div className="absolute top-4 right-4 z-[1000] flex gap-1">
        {Object.keys(TILE_PROVIDERS).map(key => (
          <button key={key} onClick={() => setTiles(key)}
            className={`px-2.5 py-1 text-xs rounded shadow-sm border transition-colors ${
              tiles === key ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
            }`}>{key === 'osm' ? 'Carte' : key === 'topo' ? 'Topo' : 'Sat.'}</button>
        ))}
      </div>

      {/* Legend */}
      <div className="absolute bottom-6 right-4 z-[1000] bg-white/90 backdrop-blur rounded-lg shadow-lg border border-gray-200 p-3 text-xs max-w-60">
        <p className="font-semibold text-gray-700 mb-2 text-sm">
          Critères actifs
          {intersection?.features?.length > 0 && (
            <span className="ml-2 text-green-600 font-bold">✅</span>
          )}
        </p>
        {activeInfo.length === 0 && <p className="text-gray-400 italic">Aucun</p>}
        <div className="space-y-1.5">
          {activeInfo.map((c, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="inline-block w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: c.color }} />
              <span className="text-gray-600">{c.label}</span>
            </div>
          ))}
        </div>
        {intersection?.features?.length > 0 && (
          <div className="mt-2 pt-2 border-t border-gray-200">
            <div className="flex items-center gap-2">
              <span className="inline-block w-4 h-4 rounded border-2 border-green-600 bg-green-400/30" />
              <span className="text-gray-700 font-medium">Zone finale (intersection)</span>
            </div>
            <p className="text-gray-400 mt-0.5">
              {intersection.features.length} polygone{intersection.features.length > 1 ? 's' : ''}
              — Calculé par DuckDB spatial 🦆
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
