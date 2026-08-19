(function initialiseAuth(windowObject) {
  'use strict';
  const client = windowObject.GoHottData.client;
  let session = null;
  const listeners = new Set();
  const notify = () => listeners.forEach((listener) => listener(session));

  async function initialise() {
    const { data, error } = await client.auth.getSession();
    if (error) console.warn('Auth session could not be restored.', error);
    session = data?.session || null;
    notify();
    client.auth.onAuthStateChange((_event, nextSession) => { session = nextSession; notify(); });
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
  function getSession() { return session; }
  function getUser() { return session?.user || null; }

  windowObject.GoHottAuth = Object.freeze({ initialise, signIn, signUp, signOut, reauthenticate, completeAccountDeletion, subscribe, getSession, getUser });
}(window));
