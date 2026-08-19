const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const read = (name) => fs.readFileSync(new URL(`../${name}`, `file://${__filename}`), 'utf8');
const app = read('app.js');
const shell = read('index.html');
const migration = read('supabase/migrations/20260819171121_gohott_phase_3_trust_and_venue_data.sql');

for (const link of ['privacy.html', 'terms.html', 'support.html', 'privacy-choices.html']) assert.match(app, new RegExp(link.replace('.', '\\.')));
for (const control of ['Profile visibility', 'Location', 'Camera &amp; Photos', 'Blocking', 'Delete Account', 'Sign Out']) assert.match(app, new RegExp(control));
assert.match(app, /if \(!currentUser\).*Sign in to manage account deletion/s, 'delete control must not render for guests');
assert.match(shell, /id="delete-account-modal"[\s\S]+id="delete-account-form"[\s\S]+name="confirmed"[\s\S]+type="submit" disabled/);
assert.match(app, /if \(!form\.elements\.confirmed\.checked\)/);
assert.match(app, /await windowObject\.GoHottAuth\.signOut\(\)/, 'sign-out flow must await and handle the auth operation');

assert.match(migration, /grant select, insert \(reason\) on public\.account_deletion_requests to authenticated/i);
assert.match(migration, /account_deletion_requests_select_own[\s\S]+auth\.uid\(\)\) = user_id/i);
assert.match(migration, /account_deletion_requests_insert_own[\s\S]+auth\.uid\(\)\) = user_id/i);
assert.doesNotMatch(migration, /grant[^;]+user_id[^;]+account_deletion_requests to authenticated/i, 'clients must not be allowed to choose deletion-request ownership');

let currentUser = null;
let fromCalls = 0;
let insertedPayload = null;
const result = { data: { status: 'pending', requested_at: '2026-08-19T00:00:00Z' }, error: null };
const query = {
  insert(payload) { insertedPayload = payload; return this; },
  select() { return this; },
  single: async () => result,
};
const client = {
  from(table) { fromCalls += 1; assert.equal(table, 'account_deletion_requests'); return query; },
  channel() { return { on() { return this; }, subscribe() { return this; } }; },
  removeChannel() {}, rpc: async () => ({ data: null, error: null }), storage: { from() { return {}; } },
};
const window = {
  GOHOTT_CONFIG: { liveWindowHours: 4 },
  supabase: { createClient: () => client },
  GoHottAuth: { getUser: () => currentUser },
};
vm.runInNewContext(read('supabase.js'), { window, console, Date, Map, String, Number, Promise });

(async () => {
  await assert.rejects(window.GoHottData.requestAccountDeletion(), /Sign in/);
  assert.equal(fromCalls, 0, 'an unauthenticated request must be rejected before a database call');
  currentUser = { id: 'user-a' };
  const request = await window.GoHottData.requestAccountDeletion('Leaving');
  assert.equal(request.status, 'pending');
  assert.deepEqual({ ...insertedPayload }, { reason: 'Leaving' });
  assert.equal('user_id' in insertedPayload, false, 'the client must never choose the request owner');
})().catch((error) => { console.error(error); process.exitCode = 1; });

console.log('account controls and deletion security tests passed');
