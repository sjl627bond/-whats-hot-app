const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync(new URL('../supabase/functions/delete-account/index.ts', `file://${__filename}`), 'utf8');
const config = fs.readFileSync(new URL('../supabase/config.toml', `file://${__filename}`), 'utf8');
const migrations = [2, 3, 4, 5, 6].map((phase) => {
  const file = fs.readdirSync(new URL('../supabase/migrations/', `file://${__filename}`)).find((name) => name.includes(`phase_${phase}`));
  return fs.readFileSync(new URL(`../supabase/migrations/${file}`, `file://${__filename}`), 'utf8');
}).join('\n');

assert.match(config, /\[functions\.delete-account\][\s\S]+verify_jwt = true/);
assert.match(source, /admin\.auth\.getUser\(token\)/, 'the server must verify the presented JWT');
assert.match(source, /performAccountDeletion\(\{ admin, userId: user\.id, operationId \}\)/, 'the verified user must be the only deletion authority');
assert.match(source, /"user_id" in body \|\| "userId" in body/, 'client-selected account targets must be rejected');
assert.match(source, /Date\.now\(\).*issuedAt > 600/, 'a recent authenticated session must be required');
assert.doesNotMatch(source, /console\.(?:info|error)[^\n]+user\.id/, 'logs must not contain the user id');

const cascades = [
  ['profiles', 'id'], ['saved_venues', 'user_id'], ['venue_claim_requests', 'user_id'],
  ['account_deletion_requests', 'user_id'], ['check_in_location_evidence', 'user_id'],
  ['live_looks', 'user_id'], ['live_look_location_evidence', 'user_id'], ['live_look_reports', 'reporter_user_id'],
  ['user_blocks', 'blocker_id'], ['user_blocks', 'blocked_id'], ['follows', 'follower_id'], ['follows', 'following_id'], ['conversation_participants', 'user_id'],
  ['messages', 'sender_id'], ['nightlife_plans', 'user_id'], ['live_look_reactions', 'user_id'],
  ['social_notifications', 'recipient_id'], ['social_reports', 'reporter_id'],
  ['user_data_export_requests', 'user_id'], ['push_notification_devices', 'user_id'],
];
for (const [table, column] of cascades) assert.match(migrations, new RegExp(`create table if not exists public\\.${table}[\\s\\S]+?${column} uuid[^;]+references auth\\.users\\(id\\) on delete cascade`, 'i'), `${table}.${column} must cascade`);
for (const [table, column] of [['check_ins', 'user_id'], ['venue_profiles', 'owner_user_id'], ['venue_profiles', 'verified_by'], ['moderation_audit_log', 'actor_user_id'], ['social_notifications', 'actor_id'], ['client_error_reports', 'user_id']]) assert.match(migrations, new RegExp(`${column} uuid[^;]+references auth\\.users\\(id\\) on delete set null`, 'i'), `${table}.${column} must be de-identified`);

(async () => {
  const { performAccountDeletion } = await import(new URL('../supabase/functions/_shared/account-deletion-core.mjs', `file://${__filename}`));
  const calls = { storage: [], auth: [], updates: [] };
  const rows = {
    live_looks: [{ storage_path: 'user-a/look-1/original.jpg' }, { storage_path: 'user-a/look-2/original.png' }],
    conversation_participants: [{ conversation_id: 'conversation-a' }],
    conversations: [{ id: 'conversation-a', direct_key: 'user-a:user-b' }],
  };
  const query = (table) => ({
    upsert: async (payload) => { calls.upsert = { table, payload }; return { error: null }; },
    select() { return { eq: async () => ({ data: rows[table] || [], error: null }), in: async () => ({ data: rows[table] || [], error: null }) }; },
    update(payload) { return { eq: async () => { calls.updates.push({ table, payload }); return { error: null }; } }; },
  });
  const admin = {
    from: query,
    storage: { from: (bucket) => ({ remove: async (paths) => { calls.storage.push({ bucket, paths }); return { error: null }; } }) },
    auth: { admin: { deleteUser: async (id, soft) => { calls.auth.push({ id, soft }); return { error: null }; } } },
  };
  const result = await performAccountDeletion({ admin, userId: 'user-a', operationId: 'operation-a' });
  assert.equal(result.removedObjects, 2);
  assert.deepEqual(calls.auth, [{ id: 'user-a', soft: false }]);
  assert.deepEqual(calls.storage[0], { bucket: 'live-looks', paths: ['user-a/look-1/original.jpg', 'user-a/look-2/original.png'] });
  assert.ok(calls.updates.some(({ table, payload }) => table === 'conversations' && payload.direct_key === 'deleted:operation-a:conversation-a'));
  assert.equal(JSON.stringify(calls).includes('user-b/look'), false, 'another user’s storage must never be selected');

  let deletedOnFailure = false; let resetToPending = false;
  const failingAdmin = {
    from(table) {
      return {
        upsert: async () => ({ error: null }),
        select() { return { eq: async () => ({ data: table === 'live_looks' ? [{ storage_path: 'user-a/look/original.jpg' }] : [], error: null }), in: async () => ({ data: [], error: null }) }; },
        update(payload) { return { eq: async () => { if (table === 'account_deletion_requests' && payload.status === 'pending') resetToPending = true; return { error: null }; } }; },
      };
    },
    storage: { from: () => ({ remove: async () => ({ error: new Error('storage unavailable') }) }) },
    auth: { admin: { deleteUser: async () => { deletedOnFailure = true; return { error: null }; } } },
  };
  await assert.rejects(performAccountDeletion({ admin: failingAdmin, userId: 'user-a', operationId: 'operation-b' }), /storage_cleanup/);
  assert.equal(deletedOnFailure, false, 'Auth deletion must not run after required cleanup fails');
  assert.equal(resetToPending, true, 'failed attempts must remain retryable');
})().catch((error) => { console.error(error); process.exitCode = 1; });

console.log('account deletion backend security tests passed');
