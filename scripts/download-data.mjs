#!/usr/bin/env node
/**
 * Download GeoJSON data for Normandy zone de chalandage.
 * Uses data.gouv.fr, Géorisques, and Overpass API.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'public', 'data');
const BB = '48.2,-1.8,50.0,1.6'; // Normandy bbox

function fetch(url, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, { headers: { 'User-Agent': 'zone-chalandage/1.0' } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 400) reject(new Error(`HTTP ${res.statusCode}`));
        else resolve(data);
      });
    });
    req.on('error', reject);
    req.setTimeout(timeout, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

async function saveJSON(name, data, transformFn) {
  console.log(`Downloading ${name}...`);
  try {
    let parsed = typeof data === 'string' ? JSON.parse(data) : data;
    if (transformFn) parsed = transformFn(parsed);
    const fp = path.join(DATA_DIR, `${name}.geojson`);
    fs.writeFileSync(fp, JSON.stringify(parsed));
    const nb = parsed.features?.length || 0;
    const size = fs.statSync(fp).size;
    console.log(`  ✅ ${name}.geojson (${(size/1024).toFixed(0)} KB, ${nb} features)`);
  } catch (e) {
    console.error(`  ❌ ${name}: ${e.message}`);
  }
}

function overpassToFC(data) {
  if (!data?.elements) return { type: 'FeatureCollection', features: [] };
  return {
    type: 'FeatureCollection',
    features: data.elements
      .filter(e => e.type)
      .map(e => {
        let geometry = null;
        if (e.type === 'node') {
          geometry = { type: 'Point', coordinates: [e.lon, e.lat] };
        } else if (e.type === 'way' && Array.isArray(e.geometry) && e.geometry.length > 0) {
          // e.geometry from Overpass 'out geom' is [{lat, lon}, ...]
          geometry = {
            type: 'LineString',
            coordinates: e.geometry.map(pt => [pt.lon, pt.lat])
          };
        } else if (e.type === 'relation' && e.geometry?.type === 'MultiPolygon') {
          // Already GeoJSON? Keep as-is.
          geometry = e.geometry;
        } else if (e.type === 'relation' && Array.isArray(e.members)) {
          // For boundary relations with out geom, skip (too complex)
          return null;
        }
        if (!geometry) return null;
        return {
          type: 'Feature',
          geometry,
          properties: e.tags || { id: e.id, type: e.type }
        };
      })
      .filter(Boolean)
  };
}

async function op(name, query) {
  const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`;
  try {
    const raw = await fetch(url, 60000);
    await saveJSON(name, raw, overpassToFC);
  } catch (e) {
    console.error(`  ❌ ${name}: ${e.message} — retrying with smaller area...`);
    // Retry with half the area
    try {
      const [s, w, n, e] = BB.split(',').map(Number);
      const midLat = (s + n) / 2;
      for (const [halfName, halfBB] of [['_ouest', `${s},${w},${midLat},${e}`], ['_est', `${midLat},${w},${n},${e}`]]) {
        const url2 = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query.replace(/\([\d.,-]+\)/, `(${halfBB})`))}`;
        const raw2 = await fetch(url2, 60000);
        const fc = overpassToFC(JSON.parse(raw2));
        if (fc.features.length > 0) {
          const fp = path.join(DATA_DIR, `${name}${halfName}.geojson`);
          fs.writeFileSync(fp, JSON.stringify(fc));
          console.log(`  ✅ ${name}${halfName}.geojson (${fc.features.length} features)`);
        }
      }
    } catch (e2) {
      console.error(`  ❌ ${name} retry also failed: ${e2.message}`);
    }
  }
}

async function main() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  console.log(`📁 Data dir: ${DATA_DIR}\n`);

  // 1. SEVESO — Géorisques API with correct region code (28 = Normandie)
  try {
    const raw = await fetch(
      'https://www.georisques.gouv.fr/api/v1/icpe/etablissements?page=1&page_size=1000&codeRegion=28&seveso=AS'
    );
    await saveJSON('seveso_sites', raw, (d) => ({
      type: 'FeatureCollection',
      features: (d.data || []).map(e => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [parseFloat(e.longitude), parseFloat(e.latitude)] },
        properties: { nom: e.raisonSociale, seveso: e.seveso, commune: e.libelleCommune || e.codeInsee }
      })).filter(f => f.geometry.coordinates[0] && !isNaN(f.geometry.coordinates[0]))
    }));
  } catch (e) {
    console.error(`  ❌ seveso_sites: ${e.message}`);
  }

  // 2. Gares (smaller query)
  await op('gares', `[out:json][timeout:30];node["railway"="station"](${BB});out geom;`);

  // 3. Grandes routes — motorway only (smaller)
  await op('grandes_routes', `[out:json][timeout:30];way["highway"="motorway"](${BB});(._;>;);out geom;`);

  // 4. Déchetteries + décharges
  await op('nuisances', `[out:json][timeout:30];
    (node["amenity"="waste_transfer_station"](${BB});
     node["amenity"="recycling"](${BB});
     node["landuse"="landfill"](${BB}););
    out geom;`);

  // 5. Gares SNCF
  await op('gares_sncf', `[out:json][timeout:30];
    node["railway"="station"]["operator"~"SNCF|TER"](48.5,-1.0,49.5,0.0);
    out geom;`);

  // 6. Ménil-Jean et May-sur-Orne
  await op('menil_jean', `[out:json][timeout:30];rel["name"="Ménil-Jean"][type=boundary];(._;>;);out geom;`);
  await op('may_sur_orne', `[out:json][timeout:30];rel["name"="May-sur-Orne"][type=boundary];(._;>;);out geom;`);

  console.log('\n✅ Download complete');
  const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.geojson'));
  console.log(`📊 ${files.length} GeoJSON files in ${DATA_DIR}`);
  files.forEach(f => {
    const s = fs.statSync(path.join(DATA_DIR, f)).size;
    console.log(`   ${f.padEnd(30)} ${(s/1024).toFixed(0)} KB`);
  });
}

main().catch(console.error);
