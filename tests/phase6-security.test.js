const assert = require('node:assert/strict'); const fs = require('node:fs');
const migration = fs.readFileSync(new URL('../supabase/migrations/20260819233000_gohott_phase_6_launch_readiness.sql', `file://${__filename}`), 'utf8');
const browser = ['mobile.js','observability.js','supabase.js','app.js'].map((file) => fs.readFileSync(new URL(`../${file}`, `file://${__filename}`), 'utf8')).join('\n');
assert.doesNotMatch(migration, /\b(drop|truncate|delete\s+from|update\s+public\.(venues|check_ins|profiles|live_looks|messages))\b/i);
['user_data_export_requests','push_notification_devices','client_error_reports'].forEach((table) => assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`, 'i')));
assert.match(migration, /revoke all on public\.push_notification_devices from anon, authenticated/i); assert.match(migration, /revoke all on public\.client_error_reports from anon, authenticated/i);
assert.match(migration, /request_user_data_export[\s\S]+require_active_social_session\(\)/i); assert.match(migration, /revoke all on function public\.request_user_data_export\(\) from public, anon/i);
assert.doesNotMatch(browser, /(service[_-]?role|supabase_service|apns[_-]?(key|secret)|private[_-]?key)/i); assert.match(browser, /replace\(\/\[\\w\.\+\-\]\+@/);
console.log('Phase 6 security contract tests passed');
