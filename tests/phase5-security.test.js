const assert = require('node:assert/strict');
const fs = require('node:fs');
const migration = fs.readFileSync(new URL('../supabase/migrations/20260819224500_gohott_phase_5_social.sql', `file://${__filename}`), 'utf8');
const browser = ['social.js', 'supabase.js', 'app.js'].map((file) => fs.readFileSync(new URL(`../${file}`, `file://${__filename}`), 'utf8')).join('\n');

assert.doesNotMatch(migration, /\b(truncate|drop\s+table|drop\s+column|delete\s+from\s+public\.(venues|check_ins|profiles|live_looks))\b/i);
['user_blocks', 'follows', 'conversations', 'conversation_participants', 'messages', 'message_references', 'nightlife_plans', 'live_look_reactions', 'social_notifications', 'social_reports'].forEach((table) => {
  assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`, 'i'), `${table} must enable RLS`);
});
assert.match(migration, /require_active_social_session[\s\S]+auth\.sessions/i);
assert.match(migration, /send_social_message[\s\S]+is_conversation_member/i);
assert.match(migration, /send_social_message[\s\S]+created_at>now\(\)-interval '2 seconds'/i);
assert.match(migration, /mark_conversation_read[\s\S]+conversation_participants/i);
assert.match(migration, /start_direct_conversation[\s\S]+message_permission/i);
assert.match(migration, /set_user_block[\s\S]+delete from public\.follows/i);
assert.match(migration, /set_nightlife_plan[\s\S]+p_date not between current_date and current_date\+90/i);
assert.match(migration, /Intent only\. Never infer or publish current physical presence/i);
assert.doesNotMatch(migration, /check \(plan_date between current_date/i, 'time-dependent plan validation belongs in the RPC');
assert.doesNotMatch(browser, /(service[_-]?role|supabase_service|secret_key)/i);
assert.doesNotMatch(browser, /recipient_id\s*:/i, 'clients must not create notifications for arbitrary users');
assert.doesNotMatch(browser, /sender_id\s*:/i, 'clients must not choose message sender identity');
assert.match(browser, /social_settings_pending/);
assert.match(browser, /conversation_id=eq\./);
console.log('Phase 5 security contract tests passed');
