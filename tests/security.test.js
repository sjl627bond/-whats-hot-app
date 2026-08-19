const assert = require('node:assert/strict');
const fs = require('node:fs');

const migration = fs.readFileSync(new URL('../supabase/migrations/20260819171121_gohott_phase_3_trust_and_venue_data.sql', `file://${__filename}`), 'utf8');
const frontend = ['config.js', 'supabase.js', 'auth.js', 'app.js'].map((file) => fs.readFileSync(new URL(`../${file}`, `file://${__filename}`), 'utf8')).join('\n');
const vercel = JSON.parse(fs.readFileSync(new URL('../vercel.json', `file://${__filename}`), 'utf8'));

assert.doesNotMatch(migration, /\b(delete\s+from|truncate|drop\s+table|drop\s+column)\b/i, 'migration must not remove production data or schema');
assert.match(migration, /security definer\s+set search_path = ''/i);
assert.match(migration, /revoke execute on function public\.submit_check_in_v3[\s\S]+from public, anon/i);
assert.match(migration, /grant execute on function public\.submit_check_in_v3[\s\S]+to authenticated/i);
assert.match(migration, /revoke all on public\.check_in_location_evidence from anon, authenticated/i);
assert.match(migration, /revoke insert on public\.check_ins from anon, authenticated/i);
assert.match(migration, /auth\.sessions[\s\S]+s\.user_id = v_user_id/i);
assert.match(migration, /pg_advisory_xact_lock\(hashtextextended\(v_user_id::text, 0\)\)/i);
assert.match(migration, /created_at > now\(\) - interval '10 minutes'/i);
assert.match(migration, /created_at > now\(\) - interval '15 minutes'/i);
assert.match(migration, /v_vibe := case p_crowd_level/i);
assert.doesNotMatch(migration, /grant insert \([^)]*trust_tier/i, 'browser column grants must exclude server trust fields');
assert.doesNotMatch(frontend, /(service[_-]?role|secret)[A-Za-z_]*\s*[:=]\s*['"][^'"]+/i, 'browser code must not contain a privileged credential');
assert.doesNotMatch(frontend, /trust_tier\s*:/i, 'browser payloads must not assign server-owned trust tiers');
const headers = Object.fromEntries(vercel.headers[0].headers.map((header) => [header.key, header.value]));
assert.match(headers['Content-Security-Policy'], /frame-ancestors 'none'/);
assert.match(headers['Content-Security-Policy'], /wss:\/\/\*\.supabase\.co/);
assert.equal(headers['X-Content-Type-Options'], 'nosniff');
console.log('security contract tests passed');
