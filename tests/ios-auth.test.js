const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const code = fs.readFileSync(new URL('../auth.js', `file://${__filename}`), 'utf8');
const appStateListeners = {};
const authStateListeners = [];
let activeSession = { user: { id: 'user-a', email: 'user-a@example.test' }, access_token: 'test-only' };
let started = 0; let stopped = 0; let signOutScope = null;
let resetRequest = null; let updatedPassword = null; let exchangedCode = null; let establishedTokens = null;
const auth = {
  getSession: async () => ({ data: { session: activeSession }, error: null }),
  onAuthStateChange: (callback) => { authStateListeners.push(callback); },
  startAutoRefresh: () => { started += 1; }, stopAutoRefresh: () => { stopped += 1; },
  signInWithPassword: async ({ email }) => email === 'bad@example.test' ? { error: new Error('Invalid login credentials') } : { data: { user: activeSession.user, session: activeSession }, error: null },
  signUp: async () => ({ data: { session: null }, error: null }),
  resetPasswordForEmail: async (email, options) => { resetRequest = { email, options }; return { error: null }; },
  updateUser: async ({ password }) => { updatedPassword = password; return { data: { user: activeSession.user }, error: null }; },
  exchangeCodeForSession: async (code) => { exchangedCode = code; return { data: { session: activeSession }, error: null }; },
  setSession: async (tokens) => { establishedTokens = tokens; return { data: { session: activeSession }, error: null }; },
  signOut: async ({ scope }) => { signOutScope = scope; return { error: null }; },
};
const window = {
  GoHottData: { client: { auth } },
  GoHottNative: { isNative: true },
  location: { origin: 'capacitor://localhost', pathname: '/' },
  addEventListener(name, callback) { appStateListeners[name] = callback; },
};
vm.runInNewContext(code, { window, console, URL, URLSearchParams });

(async () => {
  const observed = [];
  window.GoHottAuth.subscribe((session) => observed.push(session));
  await window.GoHottAuth.initialise();
  assert.equal(window.GoHottAuth.getUser().id, 'user-a');

  appStateListeners['gohott:native-app-state']({ detail: { isActive: false } });
  assert.equal(stopped, 1);
  activeSession = { user: { id: 'user-b', email: 'user-b@example.test' } };
  appStateListeners['gohott:native-app-state']({ detail: { isActive: true } });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(started, 1); assert.equal(window.GoHottAuth.getUser().id, 'user-b');

  await assert.rejects(window.GoHottAuth.signIn('bad@example.test', 'invalid'), /Invalid login credentials/);
  assert.equal((await window.GoHottAuth.signUp('new@example.test', 'password')).needsConfirmation, true);
  await window.GoHottAuth.requestPasswordReset('user-a@example.test');
  assert.deepEqual(JSON.parse(JSON.stringify(resetRequest)), { email: 'user-a@example.test', options: { redirectTo: 'gohott://auth/recovery' } });
  await window.GoHottAuth.handleRecoveryUrl('gohott://auth/recovery?code=recovery-code');
  assert.equal(exchangedCode, 'recovery-code');
  await window.GoHottAuth.handleRecoveryUrl('gohott://auth/recovery#access_token=access&refresh_token=refresh&type=recovery');
  assert.deepEqual(JSON.parse(JSON.stringify(establishedTokens)), { access_token: 'access', refresh_token: 'refresh' });
  await assert.rejects(window.GoHottAuth.handleRecoveryUrl('gohott://profile/user-b#access_token=secret&refresh_token=secret&type=recovery'), /invalid/);
  await assert.rejects(window.GoHottAuth.handleRecoveryUrl('https://attacker.example/?recovery=1#access_token=secret&refresh_token=secret&type=recovery'), /invalid/);
  await assert.rejects(window.GoHottAuth.updatePassword('short'), /at least 6/);
  await window.GoHottAuth.updatePassword('new-secure-password'); assert.equal(updatedPassword, 'new-secure-password');
  await window.GoHottAuth.reauthenticate('correct-password');
  await window.GoHottAuth.signOut(); assert.equal(signOutScope, 'local');

  await window.GoHottAuth.completeAccountDeletion();
  assert.equal(window.GoHottAuth.getSession(), null, 'successful deletion must clear the local session');

  authStateListeners[0]('SIGNED_OUT', null);
  assert.equal(window.GoHottAuth.getSession(), null);
  assert.ok(observed.length >= 3);
})().catch((error) => { console.error(error); process.exitCode = 1; });

console.log('iOS authentication/session tests passed');
