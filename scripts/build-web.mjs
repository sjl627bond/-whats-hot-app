import { cp, mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const output = resolve(root, 'www');
const assets = [
  'index.html', 'privacy.html', 'terms.html', 'offline.html',
  'styles.css', 'mobile.css', 'app.js', 'auth.js', 'config.js', 'geo.js',
  'live-look.js', 'map.js', 'mobile.js', 'native-runtime.js', 'observability.js',
  'ranking.js', 'social.js', 'supabase.js', 'sw.js', 'manifest.json',
  'icon.svg', 'icon-192.png', 'icon-512.png',
];

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await Promise.all(assets.map((asset) => cp(resolve(root, asset), resolve(output, asset))));
console.log(`Built ${assets.length} web assets into ${output}`);
