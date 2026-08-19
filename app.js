(function initialiseApp(windowObject, documentObject) {
  'use strict';
  const state = { venues: [], checkIns: [], savedIds: new Set(), profile: null, currentVenue: null, currentCity: 'Sarasota', route: 'discover', previousRoute: 'discover', loading: false, authMode: 'signin', position: null, locationStatus: 'idle' };
  let lastFocusedElement = null;
  const el = (selector) => documentObject.querySelector(selector);
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
  const cityVenues = () => state.venues.filter((venue) => state.currentCity === 'Sarasota' ? venue.area === 'Sarasota' : venue.area !== 'Sarasota');
  const user = () => windowObject.GoHottAuth.getUser();

  function calculateLiveVenues(venues, checkIns) {
    return venues.map((venue) => {
      const reports = checkIns.filter((report) => String(report.venue_id) === String(venue.id));
      const adjustment = Math.max(-15, Math.min(15, reports.reduce((total, report) => total + ({ 5: 3, 4: 2, 2: -1, 1: -3 }[report.crowd_level] || 0), 0)));
      const latest = reports[0]; const hasCoordinates = venue.latitude !== null && venue.latitude !== '' && venue.longitude !== null && venue.longitude !== '';
      const distance = state.position && hasCoordinates ? windowObject.GoHottGeo.distanceMeters(state.position, { latitude: Number(venue.latitude), longitude: Number(venue.longitude) }) : null;
      return { ...venue, live_score: Math.max(0, Math.min(100, Number(venue.hot_score || 50) + adjustment)), live_status: latest?.vibe || venue.status || 'CHILL', distance_meters: distance };
    }).sort((a, b) => b.live_score - a.live_score);
  }
  function venueById(id) { return state.venues.find((venue) => String(venue.id) === String(id)); }
  function readableTime(value) { if (!value) return ''; const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000)); return minutes < 1 ? 'just now' : minutes < 60 ? `${minutes}m ago` : `${Math.floor(minutes / 60)}h ago`; }
  function friendlyAuthError(message) { if (/invalid login/i.test(message)) return 'Email or password is incorrect.'; if (/already registered/i.test(message)) return 'An account already exists for that email.'; return message; }
  function showNotice(target, message, type = '') { target.innerHTML = message ? `<div class="state-card ${type}">${escapeHtml(message)}</div>` : ''; }

  function renderDiscover() {
    const venues = cityVenues(); const cards = el('#venue-cards');
    if (!venues.length) { cards.innerHTML = '<div class="state-card">No venues are available in this city yet.</div>'; return; }
    cards.innerHTML = venues.map((venue, index) => {
      const distance = windowObject.GoHottGeo.formatDistance(venue.distance_meters); const saved = state.savedIds.has(venue.id);
      return `<article class="venue-card"><button class="venue-main" type="button" data-venue="${escapeHtml(venue.id)}" aria-label="Open ${escapeHtml(venue.name)} details"><span class="rank">${String(index + 1).padStart(2, '0')}</span><span class="venue-info"><strong>${escapeHtml(venue.name)}</strong><span>${escapeHtml(venue.area || '')} · ${escapeHtml(venue.scene || 'Nightlife')}</span><em>● ${escapeHtml(venue.live_status)}${venue.line_note ? ` · ${escapeHtml(venue.line_note)}` : ''}${distance ? ` · ${distance}` : ''}</em></span><span class="score">${escapeHtml(venue.live_score)}<small>HOTT</small></span></button><button class="save-mini ${saved ? 'is-saved' : ''}" type="button" data-save="${escapeHtml(venue.id)}" aria-label="${saved ? 'Unsave' : 'Save'} ${escapeHtml(venue.name)}">${saved ? '♥' : '♡'}</button></article>`;
    }).join('');
  }
  async function loadVenues() {
    if (state.loading) return; state.loading = true; el('#fresh').textContent = 'Updating…'; el('#fresh').classList.remove('is-live'); el('#error-region').innerHTML = '';
    try {
      const result = await windowObject.GoHottData.getVenuesWithRecentCheckIns(); state.checkIns = result.checkIns; state.venues = calculateLiveVenues(result.venues, result.checkIns);
      if (result.checkInsError) console.warn('Recent crowd reports could not load.', result.checkInsError);
      renderDiscover(); el('#fresh').textContent = 'Live now'; el('#fresh').classList.add('is-live');
      const [hashRoute, hashId] = windowObject.location.hash.slice(1).split('/'); if (hashRoute === 'venue' && hashId && venueById(hashId)) openVenue(hashId);
      if (state.route === 'map') renderMap(); if (state.route === 'venue' && state.currentVenue) renderVenueDetail(state.currentVenue.id);
    } catch (error) { showNotice(el('#error-region'), error.message, 'error'); el('#venue-cards').innerHTML = '<div class="state-card">Live rankings are temporarily unavailable.</div>'; el('#fresh').textContent = 'Offline'; }
    finally { state.loading = false; }
  }
  function setCity(city) {
    state.currentCity = city; el('#city-label').textContent = `${city.toUpperCase()} · TONIGHT`;
    documentObject.querySelectorAll('[data-city]').forEach((button) => { const active = button.dataset.city === city; button.classList.toggle('is-active', active); button.setAttribute('aria-pressed', String(active)); });
    renderDiscover(); if (state.route === 'map') renderMap();
  }

  async function useLocation() {
    state.locationStatus = 'requesting'; const notice = el('#location-notice'); notice.hidden = false; notice.textContent = 'Requesting your location…';
    try { state.position = await windowObject.GoHottGeo.requestPosition(); state.locationStatus = 'granted'; notice.textContent = 'Location on · Distances are now shown where venue coordinates exist.'; state.venues = calculateLiveVenues(state.venues, state.checkIns); renderDiscover(); windowObject.GoHottMap.setUserPosition(state.position); }
    catch (error) { state.locationStatus = error.code === 1 ? 'denied' : 'unavailable'; notice.textContent = error.code === 1 ? 'Location is off. City browsing still works normally.' : 'Location is unavailable. City browsing still works normally.'; }
    if (state.route === 'map') renderMap(); return state.position;
  }
  function renderMap() {
    const venues = cityVenues(); windowObject.GoHottMap.render({ venues, city: state.currentCity, position: state.position, selectVenue: showMapPreview });
  }
  function showMapPreview(venue) {
    const preview = el('#map-preview'); preview.hidden = false; preview.innerHTML = `<div><p class="eyebrow">${escapeHtml(venue.area)}</p><strong>${escapeHtml(venue.name)}</strong><span>● ${escapeHtml(venue.live_status)} · ${escapeHtml(venue.live_score)} HOTT</span></div><button class="secondary-button" type="button" data-venue="${escapeHtml(venue.id)}">View</button>`;
  }

  function navigate(route, options = {}) {
    if (route === 'venue') state.previousRoute = state.route === 'venue' ? 'discover' : state.route; else if (state.route !== 'venue') state.previousRoute = state.route;
    state.route = route; documentObject.querySelectorAll('[data-screen]').forEach((screen) => { screen.hidden = screen.dataset.screen !== route; });
    documentObject.querySelectorAll('.nav-item').forEach((button) => { const active = button.dataset.route === route || (route === 'venue' && button.dataset.route === state.previousRoute); button.classList.toggle('is-active', active); if (active) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current'); });
    if (!options.skipHash) windowObject.location.hash = route === 'venue' && state.currentVenue ? `venue/${state.currentVenue.id}` : route;
    if (route === 'map') renderMap(); if (route === 'saved') renderSaved(); if (route === 'profile') renderProfile(); windowObject.scrollTo({ top: 0, behavior: 'instant' });
  }
  function openVenue(id) { const venue = venueById(id); if (!venue) return; state.currentVenue = venue; renderVenueDetail(id); navigate('venue'); }
  function renderVenueDetail(id) {
    const venue = venueById(id); if (!venue) return; state.currentVenue = venue;
    const reports = state.checkIns.filter((report) => String(report.venue_id) === String(id)).slice(0, 5); const saved = state.savedIds.has(venue.id); const distance = windowObject.GoHottGeo.formatDistance(venue.distance_meters);
    el('#venue-detail').innerHTML = `<div class="detail-hero"><p class="eyebrow">${escapeHtml(venue.area || 'NIGHTLIFE')}</p><h1>${escapeHtml(venue.name)}</h1><p>${escapeHtml(venue.scene || 'Nightlife')}</p><div class="detail-score"><strong>${escapeHtml(venue.live_score)}</strong><span>GOHOTT SCORE<br>● ${escapeHtml(venue.live_status)}</span></div></div><div class="detail-actions"><button class="primary-button" type="button" data-check-in="${escapeHtml(venue.id)}">Report the vibe</button><button class="secondary-button ${saved ? 'is-saved' : ''}" type="button" data-save="${escapeHtml(venue.id)}">${saved ? '♥ Saved' : '♡ Save'}</button></div><div class="detail-grid"><div><span>Area</span><strong>${escapeHtml(venue.area || 'Not listed')}</strong></div>${distance ? `<div><span>Distance</span><strong>${distance}</strong></div>` : ''}${venue.line_note ? `<div><span>Line</span><strong>${escapeHtml(venue.line_note)}</strong></div>` : ''}</div><section class="reports"><div class="section-heading"><div><p class="eyebrow">CROWD PULSE</p><h2>Recent reports</h2></div></div>${reports.length ? reports.map((report) => `<div class="report-row"><span>${report.crowd_level >= 4 ? '🔥' : report.crowd_level === 2 ? '🌙' : '💤'}</span><div><strong>${escapeHtml(report.vibe)}</strong><small>${escapeHtml(readableTime(report.created_at))}${report.verification_status === 'verified_nearby' ? ' · Verified nearby' : ''}</small></div></div>`).join('') : '<div class="state-card">No recent crowd reports. Be the first tonight.</div>'}</section>`;
  }

  function openAuth(context = '') { lastFocusedElement = documentObject.activeElement; el('#auth-modal').hidden = false; documentObject.body.classList.add('modal-open'); el('#auth-message').textContent = context; setTimeout(() => el('#auth-form input').focus(), 0); }
  function closeAuth() { el('#auth-modal').hidden = true; documentObject.body.classList.remove('modal-open'); lastFocusedElement?.focus?.(); }
  function renderAuthMode() { const signup = state.authMode === 'signup'; el('#auth-title').textContent = signup ? 'Create account' : 'Sign in'; el('#auth-form button').textContent = signup ? 'Create account' : 'Sign in'; el('[data-toggle-auth]').textContent = signup ? 'Already have an account? Sign in' : 'Create an account instead'; el('#auth-form [name="password"]').autocomplete = signup ? 'new-password' : 'current-password'; }
  async function handleAuthSubmit(form) {
    const message = el('#auth-message'); const submit = form.querySelector('button[type="submit"]'); submit.disabled = true; message.textContent = state.authMode === 'signup' ? 'Creating your account…' : 'Signing you in…';
    try { const data = new FormData(form); if (state.authMode === 'signup') { const result = await windowObject.GoHottAuth.signUp(data.get('email'), data.get('password')); message.textContent = result.needsConfirmation ? 'Check your email to confirm your account.' : 'Account created.'; if (!result.needsConfirmation) closeAuth(); } else { await windowObject.GoHottAuth.signIn(data.get('email'), data.get('password')); closeAuth(); } }
    catch (error) { message.textContent = friendlyAuthError(error.message); } finally { submit.disabled = false; }
  }
  async function onAuthChanged() {
    const currentUser = user();
    state.savedIds = new Set(); state.profile = null;
    if (currentUser) { try { const [ids, profile] = await Promise.all([windowObject.GoHottData.getSavedVenueIds(currentUser.id), windowObject.GoHottData.getProfile(currentUser.id)]); state.savedIds = new Set(ids); state.profile = profile; } catch (error) { console.info(error.message); } }
    el('[data-account-label]').textContent = currentUser ? (state.profile?.display_name || currentUser.email?.split('@')[0] || 'Profile') : 'Sign in';
    renderDiscover(); if (state.route === 'profile') renderProfile(); if (state.route === 'saved') renderSaved();
  }

  async function toggleSave(id) {
    const currentUser = user(); if (!currentUser) { openAuth('Sign in to save venues.'); return; }
    try { if (state.savedIds.has(id)) { await windowObject.GoHottData.unsaveVenue(currentUser.id, id); state.savedIds.delete(id); } else { await windowObject.GoHottData.saveVenue(currentUser.id, id); state.savedIds.add(id); } renderDiscover(); if (state.route === 'venue') renderVenueDetail(id); if (state.route === 'saved') renderSaved(); }
    catch (error) { showNotice(state.route === 'saved' ? el('#saved-content') : el('#error-region'), error.message, 'error'); }
  }
  function renderSaved() {
    const container = el('#saved-content'); if (!user()) { container.innerHTML = '<div class="state-card auth-required"><span>♡</span><h2>Keep your shortlist.</h2><p>Sign in to save venues and find them here.</p><button class="primary-button" type="button" data-open-auth>Sign in</button></div>'; return; }
    const venues = state.venues.filter((venue) => state.savedIds.has(venue.id)); if (!venues.length) { container.innerHTML = '<div class="state-card"><span>♡</span><h2>Nothing saved yet.</h2><p>Tap the heart on a venue to build your shortlist.</p><button class="secondary-button" type="button" data-route="discover">Explore venues</button></div>'; return; }
    container.innerHTML = venues.map((venue) => `<article class="saved-row"><button type="button" data-venue="${escapeHtml(venue.id)}"><span><strong>${escapeHtml(venue.name)}</strong><small>${escapeHtml(venue.area)} · ${escapeHtml(venue.live_status)}</small></span><b>${escapeHtml(venue.live_score)}</b></button><button type="button" data-save="${escapeHtml(venue.id)}" aria-label="Unsave ${escapeHtml(venue.name)}">♥</button></article>`).join('');
  }
  async function renderProfile() {
    const container = el('#profile-content'); const currentUser = user(); if (!currentUser) { container.innerHTML = '<div class="state-card auth-required"><span>◉</span><h2>Your nights, remembered.</h2><p>Sign in to manage your profile and trusted activity.</p><button class="primary-button" type="button" data-open-auth>Sign in or create account</button></div>'; return; }
    const [history] = await Promise.all([windowObject.GoHottData.getUserCheckIns(currentUser.id)]);
    container.innerHTML = `<div class="profile-card"><div class="avatar-large">${escapeHtml((state.profile?.display_name || currentUser.email || 'G')[0].toUpperCase())}</div><div><strong>${escapeHtml(state.profile?.display_name || 'Night owl')}</strong><span>${escapeHtml(currentUser.email || '')}</span></div></div><form class="profile-form" id="profile-form"><label>Display name<input name="display_name" maxlength="60" value="${escapeHtml(state.profile?.display_name || '')}" placeholder="How friends see you"></label><label>Home city<select name="home_city"><option value="">Choose a city</option><option value="Sarasota" ${state.profile?.home_city === 'Sarasota' ? 'selected' : ''}>Sarasota</option><option value="Tampa Bay" ${state.profile?.home_city === 'Tampa Bay' ? 'selected' : ''}>Tampa Bay</option></select></label><button class="primary-button" type="submit">Save profile</button><p class="form-message" id="profile-message"></p></form><div class="profile-stats"><div><strong>${state.savedIds.size}</strong><span>Saved</span></div><div><strong>${history.length}</strong><span>Reports</span></div></div><section class="reports"><div class="section-heading"><div><p class="eyebrow">ACTIVITY</p><h2>Recent check-ins</h2></div></div>${history.length ? history.map((report) => { const venue = venueById(report.venue_id); return `<div class="report-row"><span>●</span><div><strong>${escapeHtml(venue?.name || 'Venue')}</strong><small>${escapeHtml(report.vibe)} · ${readableTime(report.created_at)}</small></div></div>`; }).join('') : '<div class="state-card">No trusted activity yet.</div>'}</section><button class="text-button danger" type="button" data-sign-out>Sign out</button>`;
  }
  async function saveProfile(form) { const data = new FormData(form); const message = el('#profile-message'); message.textContent = 'Saving…'; try { state.profile = await windowObject.GoHottData.saveProfile({ id: user().id, display_name: data.get('display_name').trim() || null, home_city: data.get('home_city') || null }); message.textContent = 'Profile saved.'; onAuthChanged(); } catch (error) { message.textContent = error.message; } }

  async function openCheckIn(id) {
    state.currentVenue = venueById(id); if (!state.currentVenue) return; lastFocusedElement = documentObject.activeElement; el('#check-in-title').textContent = state.currentVenue.name; el('#check-in-message').textContent = ''; el('#check-in-modal').hidden = false; documentObject.body.classList.add('modal-open'); el('#trust-status').textContent = 'Checking whether you are nearby…'; el('#check-in-modal [data-level]').focus();
    try { const position = state.position || await useLocation(); const assessment = windowObject.GoHottGeo.assess(position, state.currentVenue); el('#trust-status').textContent = assessment.status === 'verified_nearby' ? `✓ Nearby · ${windowObject.GoHottGeo.formatDistance(assessment.distanceMeters)} away` : assessment.distanceMeters == null ? 'Venue coordinates unavailable · Report will be unverified' : `${windowObject.GoHottGeo.formatDistance(assessment.distanceMeters)} away · Report will be unverified`; }
    catch { el('#trust-status').textContent = 'Location unavailable · You can still report the vibe'; }
  }
  function closeCheckIn() { el('#check-in-modal').hidden = true; documentObject.body.classList.remove('modal-open'); lastFocusedElement?.focus?.(); }
  async function submitCheckIn(button) {
    const currentUser = user(); const assessment = state.locationStatus === 'denied' ? { status: 'location_denied', distanceMeters: null } : windowObject.GoHottGeo.assess(state.position, state.currentVenue); const buttons = el('#check-in-modal').querySelectorAll('[data-level]'); buttons.forEach((item) => { item.disabled = true; }); el('#check-in-message').textContent = 'Sending your report…';
    try { await windowObject.GoHottData.createCheckIn({ venue_id: state.currentVenue.id, crowd_level: Number(button.dataset.level), vibe: button.dataset.vibe, user_id: currentUser?.id || null, verification_status: assessment.status, distance_meters: assessment.distanceMeters }); closeCheckIn(); await loadVenues(); }
    catch (error) { el('#check-in-message').textContent = error.message; } finally { buttons.forEach((item) => { item.disabled = false; }); }
  }

  documentObject.addEventListener('click', (event) => {
    const route = event.target.closest('[data-route]'); if (route) { event.preventDefault(); navigate(route.dataset.route); }
    const city = event.target.closest('[data-city]'); if (city) setCity(city.dataset.city);
    const venue = event.target.closest('[data-venue]'); if (venue) openVenue(venue.dataset.venue);
    const save = event.target.closest('[data-save]'); if (save) toggleSave(save.dataset.save);
    const checkIn = event.target.closest('[data-check-in]'); if (checkIn) openCheckIn(checkIn.dataset.checkIn);
    const vote = event.target.closest('[data-level]'); if (vote) submitCheckIn(vote);
    if (event.target.closest('[data-location]')) useLocation(); if (event.target.closest('[data-account]')) user() ? navigate('profile') : openAuth();
    if (event.target.closest('[data-open-auth]')) openAuth(); if (event.target.closest('[data-close-auth]')) closeAuth(); if (event.target.closest('[data-close-modal]')) closeCheckIn();
    if (event.target.closest('[data-toggle-auth]')) { state.authMode = state.authMode === 'signin' ? 'signup' : 'signin'; renderAuthMode(); el('#auth-message').textContent = ''; }
    if (event.target.closest('[data-sign-out]')) windowObject.GoHottAuth.signOut(); if (event.target.closest('[data-back]')) navigate(state.previousRoute || 'discover');
  });
  documentObject.addEventListener('submit', (event) => { event.preventDefault(); if (event.target.id === 'auth-form') handleAuthSubmit(event.target); if (event.target.id === 'profile-form') saveProfile(event.target); });
  documentObject.addEventListener('keydown', (event) => { if (event.key === 'Escape') { if (!el('#auth-modal').hidden) closeAuth(); if (!el('#check-in-modal').hidden) closeCheckIn(); } });
  windowObject.addEventListener('hashchange', () => { const [route, id] = windowObject.location.hash.slice(1).split('/'); if (route === 'venue' && id) { state.currentVenue = venueById(id); if (state.currentVenue) { renderVenueDetail(id); navigate('venue', { skipHash: true }); } } else if (['discover', 'map', 'saved', 'profile'].includes(route)) navigate(route, { skipHash: true }); });

  windowObject.GoHottAuth.subscribe(onAuthChanged); windowObject.GoHottAuth.initialise();
  windowObject.GoHottData.subscribeToCheckIns(loadVenues, (status) => { if (status === 'CHANNEL_ERROR') el('#fresh').textContent = 'Refresh needed'; });
  loadVenues(); renderAuthMode();
  const [initialRoute, initialId] = windowObject.location.hash.slice(1).split('/'); if (initialRoute === 'venue' && initialId) { state.currentVenue = venueById(initialId); } navigate(['discover', 'map', 'saved', 'profile'].includes(initialRoute) ? initialRoute : 'discover', { skipHash: true });
  if ('serviceWorker' in navigator) windowObject.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch((error) => console.warn('Service worker registration failed.', error)));
}(window, document));
