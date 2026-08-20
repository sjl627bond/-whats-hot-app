(function initialiseAuth(windowObject) {
  'use strict';
  const client = windowObject.GoHottData.client;
  let session = null;
  const listeners = new Set();
  const recoveryListeners = new Set();
  const notify = () => listeners.forEach((listener) => listener(session));
  const notifyRecovery = (detail) => recoveryListeners.forEach((listener) => listener(detail));

  function recoveryRedirectUrl() {
    if (windowObject.GoHottNative?.isNative) return 'gohott://auth/recovery';
    return `${windowObject.location.origin}${windowObject.location.pathname}?recovery=1`;
  }

  async function handleRecoveryUrl(rawUrl) {
    let url;
    try { url = new URL(rawUrl); } catch { throw new Error('This recovery link is invalid. Request a new one.'); }
    const nativeCallback = url.protocol === 'gohott:' && url.hostname === 'auth' && url.pathname === '/recovery';
    const webCallback = ['http:', 'https:'].includes(url.protocol) && url.origin === windowObject.location.origin && url.searchParams.get('recovery') === '1';
    if (!nativeCallback && !webCallback) throw new Error('This recovery link is invalid. Request a new one.');
    const hash = new URLSearchParams(url.hash.replace(/^#/, ''));
    const type = hash.get('type') || url.searchParams.get('type');
    const code = url.searchParams.get('code');
    if (type && type !== 'recovery') throw new Error('This link is not a password-recovery link.');
    if (code) {
      const { data, error } = await client.auth.exchangeCodeForSession(code);
      if (error) throw new Error(error.message);
      session = data?.session || session;
    } else {
      const accessToken = hash.get('access_token'); const refreshToken = hash.get('refresh_token');
      if (!accessToken || !refreshToken || type !== 'recovery') throw new Error('This recovery link is incomplete or expired. Request a new one.');
      const { data, error } = await client.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
      if (error) throw new Error(error.message);
      session = data?.session || session;
    }
    notify(); notifyRecovery({ status: 'ready' });
  }

  async function initialise() {
    const { data, error } = await client.auth.getSession();
    if (error) console.warn('Auth session could not be restored.', error);
    session = data?.session || null;
    notify();
    client.auth.onAuthStateChange((event, nextSession) => { session = nextSession; notify(); if (event === 'PASSWORD_RECOVERY') notifyRecovery({ status: 'ready' }); });
    windowObject.addEventListener('gohott:auth-callback', ({ detail }) => {
      handleRecoveryUrl(detail?.url).catch((error) => notifyRecovery({ status: 'error', message: error.message }));
    });
    windowObject.addEventListener('gohott:native-app-state', ({ detail }) => {
      if (detail?.isActive) {
        client.auth.startAutoRefresh();
        client.auth.getSession().then(({ data }) => { session = data?.session || null; notify(); });
      } else client.auth.stopAutoRefresh();
    });
    return session;
  }
  async function signIn(email, password) {
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
  }
  async function signUp(email, password) {
    const { data, error } = await client.auth.signUp({ email, password });
    if (error) throw new Error(error.message);
    return { needsConfirmation: !data.session };
  }
  async function requestPasswordReset(email) {
    const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo: recoveryRedirectUrl() });
    if (error) throw new Error(error.message);
  }
  async function updatePassword(password) {
    if (typeof password !== 'string' || password.length < 6) throw new Error('Password must be at least 6 characters.');
    if (!session?.user) throw new Error('Open a fresh recovery link before setting a new password.');
    const { error } = await client.auth.updateUser({ password });
    if (error) throw new Error(error.message);
    notifyRecovery({ status: 'success' });
  }
  async function signOut() {
    const { error } = await client.auth.signOut({ scope: 'local' });
    if (error) throw new Error(error.message);
  }
  async function reauthenticate(password) {
    const currentUser = session?.user;
    if (!currentUser?.id || !currentUser.email) throw new Error('Sign in again before deleting your account.');
    const { data, error } = await client.auth.signInWithPassword({ email: currentUser.email, password });
    if (error || data?.user?.id !== currentUser.id) throw new Error('Your password could not be verified.');
    session = data.session || session; notify();
  }
  async function completeAccountDeletion() {
    try { await client.auth.signOut({ scope: 'local' }); } catch { /* The server may already have removed the Auth user. */ }
    session = null; notify();
  }
  function subscribe(listener) { listeners.add(listener); listener(session); return () => listeners.delete(listener); }
  function subscribeToRecovery(listener) { recoveryListeners.add(listener); return () => recoveryListeners.delete(listener); }
  function getSession() { return session; }
  function getUser() { return session?.user || null; }

  windowObject.GoHottAuth = Object.freeze({ initialise, signIn, signUp, signOut, requestPasswordReset, updatePassword, handleRecoveryUrl, reauthenticate, completeAccountDeletion, subscribe, subscribeToRecovery, getSession, getUser });
}(window));
