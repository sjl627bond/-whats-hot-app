const assert = require('node:assert/strict');
const fs = require('node:fs');

const migration = fs.readFileSync(new URL('../supabase/migrations/20260820192115_verified_venue_coordinates.sql', `file://${__filename}`), 'utf8');
const liveLookMigration = fs.readFileSync(new URL('../supabase/migrations/20260819203000_gohott_phase_4_live_looks.sql', `file://${__filename}`), 'utf8');
const map = fs.readFileSync(new URL('../map.js', `file://${__filename}`), 'utf8');

assert.doesNotMatch(migration, /\b(delete\s+from|truncate|drop\s+table|drop\s+column)\b/i);
assert.match(migration, /check \(\(latitude is null and longitude is null\) or \(latitude is not null and longitude is not null\)\)/i);
assert.match(migration, /latitude is null or latitude between -90 and 90/i);
assert.match(migration, /longitude is null or longitude between -180 and 180/i);
assert.match(migration, /new\.verification_status = 'verified'[\s\S]+new\.latitude is not null[\s\S]+new\.longitude is not null/i);
assert.match(migration, /else[\s\S]+set latitude = null,[\s\S]+longitude = null/i, 'unverified coordinates must not remain trusted');
assert.match(migration, /after insert or update of latitude, longitude, verification_status or delete/i);
assert.match(migration, /revoke all on function public\.set_verified_venue_coordinates[^;]+from public, anon, authenticated/i);
assert.match(migration, /grant execute on function public\.set_verified_venue_coordinates[^;]+to service_role/i);
assert.match(migration, /coalesce\(cardinality\(p_source_urls\), 0\) = 0/i);
assert.match(migration, /source_url !~ '\^https:\/\/'/i);
assert.equal((migration.match(/select public\.set_verified_venue_coordinates\(/g) || []).length, 13);

assert.match(liveLookMigration, /select latitude,longitude into v_lat,v_lon from public\.venue_profiles where venue_id=v_look\.venue_id and verification_status='verified'/i);
assert.match(liveLookMigration, /if v_distance>500 or p_accuracy_meters>250/i);
assert.match(map, /venue\.coordinate_status === 'verified'/);

console.log('Verified venue coordinate contract tests passed');
