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
  function subscribe(listener) { listeners.add(listener); listener(session); return () => listeners.delete(listener); }
  function getSession() { return session; }
  function getUser() { return session?.user || null; }

  windowObject.GoHottAuth = Object.freeze({ initialise, signIn, signUp, signOut, subscribe, getSession, getUser });
}(window));
