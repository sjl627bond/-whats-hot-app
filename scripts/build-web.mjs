import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const output = resolve(root, 'www');
const assets = [
  'index.html', 'privacy.html', 'terms.html', 'support.html', 'privacy-choices.html', 'offline.html',
  'styles.css', 'mobile.css', 'legal.css', 'app.js', 'auth.js', 'config.js', 'geo.js',
  'live-look.js', 'map.js', 'mobile.js', 'native-runtime.js', 'observability.js',
  'ranking.js', 'social.js', 'supabase.js', 'sw.js', 'manifest.json',
  'icon.svg', 'icon-192.png', 'icon-512.png',
];

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await Promise.all(assets.map((asset) => cp(resolve(root, asset), resolve(output, asset))));
const vendor = resolve(output, 'vendor');
await mkdir(resolve(vendor, 'leaflet', 'images'), { recursive: true });
await Promise.all([
  cp(resolve(root, 'node_modules/@supabase/supabase-js/dist/umd/supabase.js'), resolve(vendor, 'supabase.js')),
  cp(resolve(root, 'node_modules/leaflet/dist/leaflet.js'), resolve(vendor, 'leaflet', 'leaflet.js')),
  cp(resolve(root, 'node_modules/leaflet/dist/leaflet.css'), resolve(vendor, 'leaflet', 'leaflet.css')),
  cp(resolve(root, 'node_modules/leaflet/dist/images'), resolve(vendor, 'leaflet', 'images'), { recursive: true }),
]);
const indexPath = resolve(output, 'index.html');
const nativeIndex = (await readFile(indexPath, 'utf8'))
  .replace('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4/dist/umd/supabase.min.js', 'vendor/supabase.js')
  .replace('https://unpkg.com/leaflet@1.9.4/dist/leaflet.js', 'vendor/leaflet/leaflet.js')
  .replace('https://unpkg.com/leaflet@1.9.4/dist/leaflet.css', 'vendor/leaflet/leaflet.css');
await writeFile(indexPath, nativeIndex);
console.log(`Built ${assets.length} web assets with local native dependencies into ${output}`);
