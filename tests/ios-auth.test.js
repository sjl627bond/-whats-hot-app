const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const code = fs.readFileSync(new URL('../auth.js', `file://${__filename}`), 'utf8');
const appStateListeners = {};
const authStateListeners = [];
let activeSession = { user: { id: 'user-a' }, access_token: 'test-only' };
let started = 0; let stopped = 0; let signOutScope = null;
const auth = {
  getSession: async () => ({ data: { session: activeSession }, error: null }),
  onAuthStateChange: (callback) => { authStateListeners.push(callback); },
  startAutoRefresh: () => { started += 1; }, stopAutoRefresh: () => { stopped += 1; },
  signInWithPassword: async ({ email }) => email === 'bad@example.test' ? { error: new Error('Invalid login credentials') } : { error: null },
  signUp: async () => ({ data: { session: null }, error: null }),
  signOut: async ({ scope }) => { signOutScope = scope; return { error: null }; },
};
const window = {
  GoHottData: { client: { auth } },
  addEventListener(name, callback) { appStateListeners[name] = callback; },
};
vm.runInNewContext(code, { window, console });

(async () => {
  const observed = [];
  window.GoHottAuth.subscribe((session) => observed.push(session));
  await window.GoHottAuth.initialise();
  assert.equal(window.GoHottAuth.getUser().id, 'user-a');

  appStateListeners['gohott:native-app-state']({ detail: { isActive: false } });
  assert.equal(stopped, 1);
  activeSession = { user: { id: 'user-b' } };
  appStateListeners['gohott:native-app-state']({ detail: { isActive: true } });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(started, 1); assert.equal(window.GoHottAuth.getUser().id, 'user-b');

  await assert.rejects(window.GoHottAuth.signIn('bad@example.test', 'invalid'), /Invalid login credentials/);
  assert.equal((await window.GoHottAuth.signUp('new@example.test', 'password')).needsConfirmation, true);
  await window.GoHottAuth.signOut(); assert.equal(signOutScope, 'local');

  authStateListeners[0]('SIGNED_OUT', null);
  assert.equal(window.GoHottAuth.getSession(), null);
  assert.ok(observed.length >= 3);
})().catch((error) => { console.error(error); process.exitCode = 1; });

console.log('iOS authentication/session tests passed');
