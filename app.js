(function initialiseApp(windowObject, documentObject) {
  'use strict';
  const state = { venues: [], checkIns: [], markets: [], liveLooks: [], liveLooksAvailable: false, selectedLiveLookFile: null, savedIds: new Set(), profile: null, socialTab: 'people', people: [], conversations: [], activeConversation: null, currentVenue: null, currentCity: 'Sarasota', route: 'discover', previousRoute: 'discover', loading: false, authMode: 'signin', position: null, locationStatus: 'idle' };
  let lastFocusedElement = null;
  let unsubscribeSocial = null;
  const el = (selector) => documentObject.querySelector(selector);
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
  function safeHttpsUrl(value) { try { const url = new URL(value); return url.protocol === 'https:' ? url.href : ''; } catch { return ''; } }
  const cityVenues = () => state.venues.filter((venue) => {
    if (venue.market_id) return state.markets.find((market) => market.id === venue.market_id)?.name === state.currentCity;
    return state.currentCity === 'Sarasota' ? venue.area === 'Sarasota' : venue.area !== 'Sarasota';
  });
  const user = () => windowObject.GoHottAuth.getUser();

  function calculateLiveVenues(venues, checkIns) {
    return windowObject.GoHottRanking.rankVenues(venues, checkIns).map((venue) => {
      const hasCoordinates = venue.latitude !== null && venue.latitude !== '' && venue.longitude !== null && venue.longitude !== '';
      const distance = state.position && hasCoordinates ? windowObject.GoHottGeo.distanceMeters(state.position, { latitude: Number(venue.latitude), longitude: Number(venue.longitude) }) : null;
      return { ...venue, distance_meters: distance };
    });
  }
  function venueById(id) { return state.venues.find((venue) => String(venue.id) === String(id)); }
  function looksForVenue(id) { return state.liveLooks.filter((look) => String(look.venue_id) === String(id)); }
  function readableTime(value) { if (!value) return ''; const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000)); return minutes < 1 ? 'just now' : minutes < 60 ? `${minutes}m ago` : `${Math.floor(minutes / 60)}h ago`; }
  function reportTrustLabel(report) {
    if (report.trust_tier === 'server_assessed_nearby') return ' · Proximity assessed';
    if (!report.trust_tier && report.user_id && report.proximity_status === 'client_nearby') return ' · Device-estimated nearby';
    return '';
  }
  function tonightHours(hours) {
    if (!hours || typeof hours !== 'object') return '';
    const day = new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(new Date()).toLowerCase();
    return hours[day] || hours[day.slice(0, 3)] || '';
  }
  function friendlyAuthError(message) { if (/invalid login/i.test(message)) return 'Email or password is incorrect.'; if (/already registered/i.test(message)) return 'An account already exists for that email.'; return message; }
  function showNotice(target, message, type = '') { target.innerHTML = message ? `<div class="state-card ${type}">${escapeHtml(message)}</div>` : ''; }

  function renderDiscover() {
    const venues = cityVenues(); const cards = el('#venue-cards');
    if (!venues.length) { cards.innerHTML = '<div class="state-card">No venues are available in this city yet.</div>'; return; }
    cards.innerHTML = venues.map((venue, index) => {
      const distance = windowObject.GoHottGeo.formatDistance(venue.distance_meters); const saved = state.savedIds.has(venue.id);
      const lookCount = looksForVenue(venue.id).length;
      return `<article class="venue-card"><button class="venue-main" type="button" data-venue="${escapeHtml(venue.id)}" aria-label="Open ${escapeHtml(venue.name)} details"><span class="rank">${String(index + 1).padStart(2, '0')}</span><span class="venue-info"><strong>${escapeHtml(venue.name)}${venue.is_verified ? ' <i class="verified-badge" aria-label="Verified venue data">✓</i>' : ''}</strong><span>${escapeHtml(venue.area || '')} · ${escapeHtml((venue.categories || [])[0] || venue.scene || 'Nightlife')}</span><em>● ${escapeHtml(venue.live_status)} · ${escapeHtml(venue.activity_label)}${distance ? ` · ${distance}` : ''}</em>${lookCount ? `<b class="live-look-badge">◉ ${lookCount} Live Look${lookCount === 1 ? '' : 's'}</b>` : ''}</span><span class="score">${escapeHtml(venue.live_score)}<small>HOTT</small></span></button><button class="save-mini ${saved ? 'is-saved' : ''}" type="button" data-save="${escapeHtml(venue.id)}" aria-label="${saved ? 'Unsave' : 'Save'} ${escapeHtml(venue.name)}">${saved ? '♥' : '♡'}</button></article>`;
    }).join('');
  }
  function renderMarketSwitcher() {
    const markets = state.markets.length ? state.markets : [{ name: 'Sarasota' }, { name: 'Tampa Bay' }];
    el('#market-switcher').innerHTML = markets.map((market) => `<button class="city-button ${market.name === state.currentCity ? 'is-active' : ''}" type="button" data-city="${escapeHtml(market.name)}" aria-pressed="${market.name === state.currentCity}">${escapeHtml(market.name)}</button>`).join('');
  }
  async function loadVenues() {
    if (state.loading) return; state.loading = true; el('#fresh').textContent = 'Updating…'; el('#fresh').classList.remove('is-live'); el('#error-region').innerHTML = '';
    try {
      const result = await windowObject.GoHottData.getVenuesWithRecentCheckIns(); state.checkIns = result.checkIns; state.markets = result.markets; state.venues = calculateLiveVenues(result.venues, result.checkIns);
      const liveResult = await windowObject.GoHottData.getActiveLiveLooks().catch((error) => { console.info('Live Look is unavailable.', error.message); return { available: false, looks: [] }; }); state.liveLooksAvailable = liveResult.available; state.liveLooks = liveResult.looks; renderMarketSwitcher();
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
    const venues = cityVenues(); const market = state.markets.find((item) => item.name === state.currentCity);
    const center = market ? [market.center_latitude, market.center_longitude] : null;
    windowObject.GoHottMap.render({ venues, city: state.currentCity, center, position: state.position, selectVenue: showMapPreview });
  }
  function showMapPreview(venue) {
    const preview = el('#map-preview'); const count = looksForVenue(venue.id).length; preview.hidden = false; preview.innerHTML = `<div><p class="eyebrow">${escapeHtml(venue.area)} · VERIFIED DATA</p><strong>${escapeHtml(venue.name)}</strong><span>● ${escapeHtml(venue.live_status)} · ${escapeHtml(venue.live_score)} HOTT${count ? ` · ${count} Live Look${count === 1 ? '' : 's'}` : ''}</span></div><button class="secondary-button" type="button" data-venue="${escapeHtml(venue.id)}">View</button>`;
  }

  function navigate(route, options = {}) {
    if (route === 'venue') state.previousRoute = state.route === 'venue' ? 'discover' : state.route; else if (state.route !== 'venue') state.previousRoute = state.route;
    state.route = route; documentObject.querySelectorAll('[data-screen]').forEach((screen) => { screen.hidden = screen.dataset.screen !== route; });
    documentObject.querySelectorAll('.nav-item').forEach((button) => { const active = button.dataset.route === route || (route === 'venue' && button.dataset.route === state.previousRoute); button.classList.toggle('is-active', active); if (active) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current'); });
    if (!options.skipHash) windowObject.location.hash = route === 'venue' && state.currentVenue ? `venue/${state.currentVenue.id}` : route;
    if (route === 'map') renderMap(); if (route === 'saved') renderSaved(); if (route === 'social') renderSocial(); if (route === 'profile') renderProfile(); windowObject.scrollTo({ top: 0, behavior: 'instant' });
  }
  function openVenue(id) { const venue = venueById(id); if (!venue) return; state.currentVenue = venue; renderVenueDetail(id); navigate('venue'); }
  function renderVenueDetail(id) {
    const venue = venueById(id); if (!venue) return; state.currentVenue = venue;
    const reports = state.checkIns.filter((report) => String(report.venue_id) === String(id)).slice(0, 5); const saved = state.savedIds.has(venue.id); const distance = windowObject.GoHottGeo.formatDistance(venue.distance_meters);
    const hours = tonightHours(venue.hours); const categories = Array.isArray(venue.categories) ? venue.categories.join(' · ') : '';
    const photoUrl = safeHttpsUrl(venue.photo_urls?.[0]); const websiteUrl = safeHttpsUrl(venue.website_url); const socialUrl = safeHttpsUrl(venue.social_url);
    const liveLooks = looksForVenue(id); const liveLookGallery = `<section class="live-look-section"><div class="section-heading"><div><p class="eyebrow">LIVE LOOK</p><h2>See it right now.</h2></div><button class="secondary-button" type="button" data-add-live-look="${escapeHtml(id)}">Add</button></div>${liveLooks.length ? `<div class="live-look-gallery">${liveLooks.map((look) => `<article class="live-look-card"><img src="${escapeHtml(look.image_url)}" alt="Live Look at ${escapeHtml(venue.name)}" loading="lazy"><div class="live-look-meta"><strong>${escapeHtml(look.caption || 'The scene right now')}</strong><span>${escapeHtml(windowObject.GoHottLiveLook.ageLabel(look.published_at))} · ${escapeHtml(windowObject.GoHottLiveLook.remainingLabel(look.expires_at))}${look.proximity_assessment === 'server_assessed_nearby' ? ' · Proximity assessed' : ''}</span><div class="live-look-actions">${look.is_owner ? `<button type="button" data-remove-live-look="${escapeHtml(look.id)}">Remove</button>` : user() ? `<button type="button" data-report-live-look="${escapeHtml(look.id)}">Report</button>` : ''}</div></div></article>`).join('')}</div>` : `<div class="state-card">No active Live Looks yet. ${state.liveLooksAvailable ? 'Share a temporary photo of the scene.' : 'Live Look is awaiting its reviewed database rollout.'}</div>`}</section>`;
    el('#venue-detail').innerHTML = `<div class="detail-hero">${photoUrl ? `<img class="venue-photo" src="${escapeHtml(photoUrl)}" alt="${escapeHtml(venue.name)} venue">` : ''}<p class="eyebrow">${escapeHtml(venue.area || 'NIGHTLIFE')}${venue.is_verified ? ' · VERIFIED DATA' : ''}</p><h1>${escapeHtml(venue.name)}${venue.is_verified ? ' <i class="verified-badge" aria-label="Verified venue data">✓</i>' : ''}</h1><p>${escapeHtml(categories || venue.scene || 'Nightlife')}</p><div class="detail-score"><strong>${escapeHtml(venue.live_score)}</strong><span>GOHOTT SCORE<br>● ${escapeHtml(venue.live_status)}<br>${escapeHtml(venue.activity_label)}</span></div></div><div class="detail-actions"><button class="primary-button" type="button" data-check-in="${escapeHtml(venue.id)}">Report the vibe</button><button class="secondary-button ${saved ? 'is-saved' : ''}" type="button" data-save="${escapeHtml(venue.id)}">${saved ? '♥ Saved' : '♡ Save'}</button></div><div class="detail-grid"><div><span>Area</span><strong>${escapeHtml(venue.area || 'Not listed')}</strong></div>${distance ? `<div><span>Distance</span><strong>${distance}</strong></div>` : ''}${hours ? `<div><span>Tonight</span><strong>${escapeHtml(hours)}</strong></div>` : ''}${venue.address ? `<div><span>Address</span><strong>${escapeHtml(venue.address)}</strong></div>` : ''}${venue.line_note ? `<div><span>Line</span><strong>${escapeHtml(venue.line_note)}</strong></div>` : ''}</div><div class="venue-links">${websiteUrl ? `<a class="venue-link" href="${escapeHtml(websiteUrl)}" target="_blank" rel="noopener noreferrer">Official website ↗</a>` : ''}${socialUrl ? `<a class="venue-link" href="${escapeHtml(socialUrl)}" target="_blank" rel="noopener noreferrer">Official social ↗</a>` : ''}</div><section class="score-explainer"><strong>Why this score?</strong><span>Baseline ${escapeHtml(venue.hot_score || 50)} · Live activity ${venue.score_adjustment >= 0 ? '+' : ''}${escapeHtml(venue.score_adjustment)}</span></section>${liveLookGallery}<section class="reports"><div class="section-heading"><div><p class="eyebrow">CROWD PULSE</p><h2>Recent reports</h2></div></div>${reports.length ? reports.map((report) => `<div class="report-row"><span>${report.crowd_level >= 4 ? '🔥' : report.crowd_level === 2 ? '🌙' : '💤'}</span><div><strong>${escapeHtml(report.vibe)}</strong><small>${escapeHtml(readableTime(report.created_at))}${reportTrustLabel(report)}</small></div></div>`).join('') : '<div class="state-card">No recent crowd reports. Be the first tonight.</div>'}</section>`;
    const socialExtras = `<section class="plan-card"><p class="eyebrow">TONIGHT'S PLAN</p><h3>Thinking about ${escapeHtml(venue.name)}?</h3><p class="privacy-note">Plans express future intent, not your current location. You control who can see them.</p><div class="plan-controls"><select name="plan_status" aria-label="Plan status"><option value="going">Going</option><option value="maybe">Maybe</option><option value="interested">Interested</option></select><select name="plan_visibility" aria-label="Plan visibility"><option value="followers">Followers</option><option value="mutuals">Mutuals</option><option value="private">Only me</option><option value="public">Public</option></select><button type="button" data-save-plan="${escapeHtml(id)}">Save plan</button><button type="button" data-share-venue="${escapeHtml(id)}" data-share-label="${escapeHtml(venue.name)}">Share venue</button></div><p class="form-message" role="status"></p></section>${liveLooks.length ? `<section class="plan-card"><p class="eyebrow">REACT</p><h3>What’s the scene giving?</h3><div class="person-actions">${liveLooks.map((look) => `<button type="button" data-react-look="${escapeHtml(look.id)}" data-reaction="fire" data-icon="🔥">🔥 Fire</button><button type="button" data-react-look="${escapeHtml(look.id)}" data-reaction="vibe" data-icon="⚡">⚡ Vibe</button>`).join('')}</div></section>` : ''}`;
    el('#venue-detail').insertAdjacentHTML('beforeend', socialExtras);
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
    unsubscribeSocial?.(); unsubscribeSocial = null;
    state.savedIds = new Set(); state.profile = null;
    if (currentUser) { try { const [ids, profile] = await Promise.all([windowObject.GoHottData.getSavedVenueIds(currentUser.id), windowObject.GoHottData.getProfile(currentUser.id)]); state.savedIds = new Set(ids); state.profile = profile; } catch (error) { console.info(error.message); } }
    el('[data-account-label]').textContent = currentUser ? (state.profile?.display_name || currentUser.email?.split('@')[0] || 'Profile') : 'Sign in';
    if (currentUser) unsubscribeSocial = windowObject.GoHottData.subscribeToSocial(currentUser.id, state.activeConversation, () => { if (state.route === 'social') renderSocial(); });
    renderDiscover(); if (state.route === 'profile') renderProfile(); if (state.route === 'saved') renderSaved(); if (state.route === 'social') renderSocial();
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
  function socialTabs() {
    return `<div class="social-tabs" role="tablist" aria-label="Social sections">${['people', 'feed', 'chats'].map((tab) => `<button type="button" role="tab" data-social-tab="${tab}" aria-selected="${state.socialTab === tab}" class="${state.socialTab === tab ? 'is-active' : ''}">${tab[0].toUpperCase() + tab.slice(1)}</button>`).join('')}</div>`;
  }
  function personCard(person) {
    const avatar = safeHttpsUrl(person.avatar_url);
    return `<article class="person-card"><div class="social-avatar">${avatar ? `<img src="${escapeHtml(avatar)}" alt="">` : escapeHtml((person.display_name || person.username || 'G')[0].toUpperCase())}</div><div class="person-copy"><strong>${escapeHtml(person.display_name || person.username || 'GoHott member')}${person.is_mutual ? ' · Mutual' : ''}</strong><span>${person.username ? `@${escapeHtml(person.username)} · ` : ''}${escapeHtml(person.home_city || '')}</span><span>${escapeHtml(person.bio || '')}</span><span>${escapeHtml(person.follower_count || 0)} followers · ${escapeHtml(person.following_count || 0)} following</span></div><div class="person-actions"><button type="button" data-follow="${escapeHtml(person.id)}" data-following="${person.is_following}">${person.is_following ? 'Following' : 'Follow'}</button><button type="button" data-message-person="${escapeHtml(person.id)}">Message</button><button type="button" data-share-profile="${escapeHtml(person.id)}" data-share-label="${escapeHtml(person.display_name || person.username || 'GoHott profile')}" aria-label="Share profile">↗</button><button type="button" data-report-profile="${escapeHtml(person.id)}" aria-label="Report profile">!</button><button type="button" data-block-person="${escapeHtml(person.id)}" aria-label="Block profile">Block</button></div></article>`;
  }
  async function renderSocial(tab = state.socialTab) {
    state.socialTab = tab; const container = el('#social-content');
    if (!user()) { container.innerHTML = '<div class="state-card auth-required"><span>◎</span><h2>Your night network.</h2><p>Sign in to follow people, share plans, and message privately.</p><button class="primary-button" type="button" data-open-auth>Sign in</button></div>'; return; }
    container.innerHTML = `${socialTabs()}<div class="loading"><span></span>Loading…</div>`;
    try {
      if (tab === 'people') {
        const [result, followers, following] = await Promise.all([windowObject.GoHottData.searchPeople(''), windowObject.GoHottData.listConnections('followers'), windowObject.GoHottData.listConnections('following')]); state.people = result.people;
        container.innerHTML = `${socialTabs()}<form class="social-search" id="social-search"><label class="sr-only" for="people-query">Search people</label><input id="people-query" name="query" maxlength="50" placeholder="Search name or username"><button class="secondary-button" type="submit">Search</button></form><div id="people-results">${result.available ? (state.people.map(personCard).join('') || '<div class="state-card">No profiles match yet.</div>') : '<div class="state-card">Social features are awaiting the reviewed Phase 5 migration.</div>'}</div>${result.available ? `<div class="social-panel-title"><h2>Your network</h2></div><details><summary>${escapeHtml(followers.length)} followers</summary>${followers.map(personCard).join('') || '<div class="state-card">No followers yet.</div>'}</details><details><summary>${escapeHtml(following.length)} following</summary>${following.map(personCard).join('') || '<div class="state-card">You are not following anyone yet.</div>'}</details>` : ''}`;
      } else if (tab === 'feed') {
        const notifications = await windowObject.GoHottData.getNotifications();
        container.innerHTML = `${socialTabs()}<div class="social-panel-title"><h2>Activity</h2>${notifications.some((item) => !item.read_at) ? '<button class="text-button" type="button" data-mark-read>Mark read</button>' : ''}</div>${notifications.length ? notifications.map((item) => `<article class="notification-row ${item.read_at ? '' : 'is-unread'}"><div><strong>${escapeHtml(item.summary)}</strong><span>${escapeHtml(readableTime(item.created_at))}</span></div></article>`).join('') : '<div class="state-card">Your privacy-safe social activity will appear here.</div>'}`;
      } else {
        state.conversations = await windowObject.GoHottData.getConversations(); let thread = '';
        if (state.activeConversation) { const messages = await windowObject.GoHottData.getMessages(state.activeConversation); windowObject.GoHottData.markConversationRead(state.activeConversation).catch(() => {}); thread = `<div class="chat-thread" aria-live="polite">${messages.map((message) => `<div class="message-bubble ${message.sender_id === user().id ? 'is-mine' : ''}">${escapeHtml(message.body)}${message.message_references?.[0] ? `<div class="message-reference">${escapeHtml(message.message_references[0].label || message.message_references[0].reference_type)}</div>` : ''}<small>${escapeHtml(readableTime(message.created_at))}</small></div>`).join('') || '<div class="state-card">Start the conversation.</div>'}</div><form class="chat-compose" id="chat-form"><label class="sr-only" for="chat-message">Message</label><input id="chat-message" name="message" maxlength="2000" autocomplete="off" placeholder="Send a message" required><button class="primary-button" type="submit">Send</button></form>`; }
        container.innerHTML = `${socialTabs()}${state.conversations.map((conversation) => `<button class="conversation-row" type="button" data-conversation="${escapeHtml(conversation.id)}"><div><strong>Direct conversation${conversation.unread_count ? ` · ${escapeHtml(conversation.unread_count)} unread` : ''}</strong><span>${escapeHtml(readableTime(conversation.updated_at))}</span></div></button>`).join('') || '<div class="state-card">No conversations yet. Find someone in People to say hello.</div>'}${thread}`;
      }
    } catch (error) { container.innerHTML = `${socialTabs()}<div class="state-card error">${escapeHtml(error.message)}</div>`; }
  }
  async function searchPeople(form) { const result = await windowObject.GoHottData.searchPeople(new FormData(form).get('query')); state.people = result.people; el('#people-results').innerHTML = state.people.map(personCard).join('') || '<div class="state-card">No profiles match.</div>'; }
  async function toggleFollow(button) { await windowObject.GoHottData.setFollow(button.dataset.follow, button.dataset.following !== 'true'); await renderSocial('people'); }
  function connectActiveChat() { unsubscribeSocial?.(); unsubscribeSocial = user() ? windowObject.GoHottData.subscribeToSocial(user().id, state.activeConversation, () => { if (state.route === 'social') renderSocial('chats'); }) : null; }
  async function startChat(targetId) { state.activeConversation = await windowObject.GoHottData.startConversation(targetId); connectActiveChat(); await renderSocial('chats'); }
  async function blockPerson(targetId) { if (!windowObject.confirm('Block this account? Following and messaging will stop.')) return; await windowObject.GoHottData.setBlock(targetId, true); await renderSocial('people'); }
  async function reportProfile(targetId) { const reason = windowObject.prompt('Report reason: spam, harassment, impersonation, privacy, unsafe, or other'); if (!reason) return; await windowObject.GoHottData.reportSocialContent('profile', targetId, reason.trim().toLowerCase()); windowObject.alert('Report received. Thank you.'); }
  async function shareItem(type, id, label) { const result = await windowObject.GoHottSocial.share({ type, id, title: label, text: `See ${label} on GoHott` }); if (result === 'copied') windowObject.alert('Share link copied.'); }
  async function savePlan(button) { if (!user()) return openAuth('Sign in to share a nightlife plan.'); const card = button.closest('.plan-card'); try { await windowObject.GoHottData.setNightlifePlan(button.dataset.savePlan, card.querySelector('[name="plan_status"]').value, card.querySelector('[name="plan_visibility"]').value); card.querySelector('[role="status"]').textContent = 'Plan saved. This expresses intent, never current presence.'; } catch (error) { card.querySelector('[role="status"]').textContent = error.message; } }
  async function reactLook(button) { if (!user()) return openAuth('Sign in to react.'); try { const count = await windowObject.GoHottData.reactToLiveLook(button.dataset.reactLook, button.dataset.reaction); button.textContent = `${button.dataset.icon} ${count}`; } catch (error) { windowObject.alert(error.message); } }

  async function renderProfile() {
    const container = el('#profile-content'); const currentUser = user(); if (!currentUser) { container.innerHTML = '<div class="state-card auth-required"><span>◉</span><h2>Your nights, remembered.</h2><p>Sign in to manage your profile and account activity.</p><button class="primary-button" type="button" data-open-auth>Sign in or create account</button></div>'; return; }
    const [history, deletionRequest] = await Promise.all([windowObject.GoHottData.getUserCheckIns(currentUser.id), windowObject.GoHottData.getAccountDeletionRequest(currentUser.id)]);
    container.innerHTML = `<div class="profile-card"><div class="avatar-large">${escapeHtml((state.profile?.display_name || currentUser.email || 'G')[0].toUpperCase())}</div><div><strong>${escapeHtml(state.profile?.display_name || 'Night owl')}</strong><span>${escapeHtml(currentUser.email || '')}</span></div></div><form class="profile-form" id="profile-form"><label>Display name<input name="display_name" maxlength="60" value="${escapeHtml(state.profile?.display_name || '')}" placeholder="How friends see you"></label><label>Home city<select name="home_city"><option value="">Choose a city</option><option value="Sarasota" ${state.profile?.home_city === 'Sarasota' ? 'selected' : ''}>Sarasota</option><option value="Tampa Bay" ${state.profile?.home_city === 'Tampa Bay' ? 'selected' : ''}>Tampa Bay</option></select></label><button class="primary-button" type="submit">Save profile</button><p class="form-message" id="profile-message"></p></form><div class="profile-stats"><div><strong>${state.savedIds.size}</strong><span>Saved</span></div><div><strong>${history.length}</strong><span>Reports</span></div></div><section class="reports"><div class="section-heading"><div><p class="eyebrow">ACTIVITY</p><h2>Recent check-ins</h2></div></div>${history.length ? history.map((report) => { const venue = venueById(report.venue_id); return `<div class="report-row"><span>●</span><div><strong>${escapeHtml(venue?.name || 'Venue')}</strong><small>${escapeHtml(report.vibe)} · ${readableTime(report.created_at)}${reportTrustLabel(report)}</small></div></div>`; }).join('') : '<div class="state-card">No account activity yet.</div>'}</section><section class="privacy-card"><p class="eyebrow">PRIVACY</p><h2>Account controls</h2><p>Your profile and saved venues are private to your account. Phase 3 location-validation evidence is kept out of public venue feeds.</p>${deletionRequest ? `<div class="request-status">Deletion request: ${escapeHtml(deletionRequest.status)}</div>` : '<button class="text-button danger" type="button" data-request-deletion>Request account deletion</button>'}<p class="form-message" id="privacy-message" role="status"></p></section><button class="text-button" type="button" data-sign-out>Sign out</button>`;
    el('#profile-form button[type="submit"]').insertAdjacentHTML('beforebegin', `<div class="profile-social-grid"><label>Username<input name="username" maxlength="24" value="${escapeHtml(state.profile?.username || '')}" placeholder="nightowl"></label><label>Avatar URL<input name="avatar_url" type="url" value="${escapeHtml(state.profile?.avatar_url || '')}" placeholder="https://…"></label><label>Bio<textarea name="bio" maxlength="160" placeholder="Your nightlife vibe">${escapeHtml(state.profile?.bio || '')}</textarea></label><label>Favorite categories<input name="favorite_categories" value="${escapeHtml((state.profile?.favorite_categories || []).join(', '))}" placeholder="Dance, live music"></label><label>Profile visibility<select name="profile_visibility"><option value="public">Public</option><option value="followers" ${state.profile?.profile_visibility === 'followers' ? 'selected' : ''}>Followers</option><option value="private" ${state.profile?.profile_visibility === 'private' ? 'selected' : ''}>Private</option></select></label><label>Who can message<select name="message_permission"><option value="everyone">Everyone</option><option value="followers" ${state.profile?.message_permission !== 'everyone' ? 'selected' : ''}>People you follow</option><option value="mutuals" ${state.profile?.message_permission === 'mutuals' ? 'selected' : ''}>Mutual follows</option><option value="nobody" ${state.profile?.message_permission === 'nobody' ? 'selected' : ''}>Nobody</option></select></label><p class="privacy-note">Your plan visibility is chosen per venue. GoHott never turns a plan into proof of current presence.</p></div>`);
  }
  async function saveProfile(form) { const data = new FormData(form); const message = el('#profile-message'); message.textContent = 'Saving…'; try { const username = data.get('username') ? windowObject.GoHottSocial.normaliseUsername(data.get('username')) : null; const avatarUrl = data.get('avatar_url').trim(); if (avatarUrl && !safeHttpsUrl(avatarUrl)) throw new Error('Avatar URL must use HTTPS.'); state.profile = await windowObject.GoHottData.saveProfile({ id: user().id, display_name: data.get('display_name').trim() || null, home_city: data.get('home_city') || null, username, avatar_url: avatarUrl || null, bio: windowObject.GoHottSocial.validateBio(data.get('bio')), favorite_categories: data.get('favorite_categories').split(',').map((item) => item.trim()).filter(Boolean).slice(0, 12), profile_visibility: data.get('profile_visibility'), message_permission: data.get('message_permission') }); message.textContent = state.profile.social_settings_pending ? 'Core profile saved. Social settings await the reviewed Phase 5 migration.' : 'Profile saved.'; if (!state.profile.social_settings_pending) onAuthChanged(); } catch (error) { message.textContent = error.message; } }
  async function requestDeletion() {
    const message = el('#privacy-message'); if (!message) return;
    if (!windowObject.confirm('Request account deletion? This records a request for a privileged backend process; it does not delete data immediately.')) return;
    message.textContent = 'Submitting a deletion request…';
    try { await windowObject.GoHottData.requestAccountDeletion(); message.textContent = 'Request received. A privileged backend process must complete deletion and session revocation.'; }
    catch (error) { message.textContent = error.message; }
  }

  async function openCheckIn(id) {
    state.currentVenue = venueById(id); if (!state.currentVenue) return; lastFocusedElement = documentObject.activeElement; el('#check-in-title').textContent = state.currentVenue.name; el('#check-in-message').textContent = ''; el('#check-in-modal').hidden = false; documentObject.body.classList.add('modal-open'); el('#trust-status').textContent = 'Checking whether you are nearby…'; el('#check-in-modal [data-level]').focus();
    if (!user()) { el('#trust-status').textContent = 'Guest report · Sign in to add server-assessed proximity'; return; }
    try { const position = state.position || await useLocation(); const assessment = windowObject.GoHottGeo.assess(position, state.currentVenue); el('#trust-status').textContent = assessment.status === 'client_nearby' ? `Location ready · ${windowObject.GoHottGeo.formatDistance(assessment.distanceMeters)} away` : assessment.distanceMeters == null ? 'Location or verified venue coordinates unavailable · Report will remain unassessed' : `${windowObject.GoHottGeo.formatDistance(assessment.distanceMeters)} away · The server will assess this report`; }
    catch { el('#trust-status').textContent = 'Location unavailable · You can still report the vibe'; }
  }
  function closeCheckIn() { el('#check-in-modal').hidden = true; documentObject.body.classList.remove('modal-open'); lastFocusedElement?.focus?.(); }
  async function submitCheckIn(button) {
    const currentUser = user(); const assessment = state.locationStatus === 'denied' ? { status: 'location_denied', distanceMeters: null } : windowObject.GoHottGeo.assess(state.position, state.currentVenue); const buttons = el('#check-in-modal').querySelectorAll('[data-level]'); buttons.forEach((item) => { item.disabled = true; }); el('#check-in-message').textContent = 'Sending your report…';
    try { await windowObject.GoHottData.createCheckIn({ venue_id: state.currentVenue.id, crowd_level: Number(button.dataset.level), vibe: button.dataset.vibe, user_id: currentUser?.id || null, proximity_status: assessment.status, distance_meters: assessment.distanceMeters, latitude: state.position?.latitude, longitude: state.position?.longitude, accuracy_meters: state.position?.accuracy }); closeCheckIn(); await loadVenues(); }
    catch (error) { el('#check-in-message').textContent = error.message; } finally { buttons.forEach((item) => { item.disabled = false; }); }
  }

  function openLiveLook(id) {
    state.currentVenue = venueById(id); if (!state.currentVenue) return;
    if (!user()) { openAuth('Sign in to add a temporary Live Look.'); return; }
    lastFocusedElement = documentObject.activeElement; state.selectedLiveLookFile = null; el('#live-look-form').reset(); el('#live-look-preview').hidden = true; el('#live-look-message').textContent = state.liveLooksAvailable ? '' : 'Live Look is awaiting its reviewed Phase 4 database rollout.'; el('#caption-count').textContent = '0/80'; el('#live-look-modal').hidden = false; documentObject.body.classList.add('modal-open');
  }
  function closeLiveLook() { el('#live-look-modal').hidden = true; documentObject.body.classList.remove('modal-open'); state.selectedLiveLookFile = null; lastFocusedElement?.focus?.(); }
  function selectLiveLookFile(input) {
    const file = input.files?.[0]; if (!file) return;
    try { windowObject.GoHottLiveLook.validateFile(file); state.selectedLiveLookFile = file; const preview = el('#live-look-preview'); preview.src = URL.createObjectURL(file); preview.hidden = false; el('#live-look-message').textContent = ''; }
    catch (error) { input.value = ''; state.selectedLiveLookFile = null; el('#live-look-message').textContent = error.message; }
  }
  async function submitLiveLook(form) {
    const submit = form.querySelector('[type="submit"]'); if (!state.selectedLiveLookFile) { el('#live-look-message').textContent = 'Choose or take a photo first.'; return; }
    submit.disabled = true; el('#live-look-message').textContent = 'Checking location and publishing…';
    try {
      const position = state.position || await useLocation(); if (!position) throw new Error('Location is required to add a Live Look. Discovery still works without it.');
      const data = new FormData(form); const result = await windowObject.GoHottData.uploadLiveLook({ venueId: state.currentVenue.id, file: state.selectedLiveLookFile, caption: data.get('caption'), durationChoice: data.get('duration'), position });
      closeLiveLook(); await loadVenues(); if (result.duration_fallback) windowObject.alert('Published for 60 minutes because a verified closing time is not available.');
    } catch (error) { el('#live-look-message').textContent = error.message; } finally { submit.disabled = false; }
  }
  async function removeLiveLook(id) { if (!windowObject.confirm('Remove this Live Look from public view?')) return; try { await windowObject.GoHottData.removeLiveLook(id); await loadVenues(); } catch (error) { windowObject.alert(error.message); } }
  async function reportLiveLook(id) { const reason = windowObject.prompt('Report reason: spam, unsafe, privacy, misleading, or other'); if (!reason) return; try { await windowObject.GoHottData.reportLiveLook(id, reason.trim().toLowerCase()); windowObject.alert('Report received. Thank you.'); } catch (error) { windowObject.alert(error.message); } }

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
    if (event.target.closest('[data-sign-out]')) windowObject.GoHottAuth.signOut(); if (event.target.closest('[data-request-deletion]')) requestDeletion(); if (event.target.closest('[data-back]')) navigate(state.previousRoute || 'discover');
    const addLook = event.target.closest('[data-add-live-look]'); if (addLook) openLiveLook(addLook.dataset.addLiveLook);
    const removeLook = event.target.closest('[data-remove-live-look]'); if (removeLook) removeLiveLook(removeLook.dataset.removeLiveLook);
    const reportLook = event.target.closest('[data-report-live-look]'); if (reportLook) reportLiveLook(reportLook.dataset.reportLiveLook);
    if (event.target.closest('[data-close-live-look]')) closeLiveLook();
    const socialTab = event.target.closest('[data-social-tab]'); if (socialTab) renderSocial(socialTab.dataset.socialTab);
    const follow = event.target.closest('[data-follow]'); if (follow) toggleFollow(follow).catch((error) => windowObject.alert(error.message));
    const messagePerson = event.target.closest('[data-message-person]'); if (messagePerson) startChat(messagePerson.dataset.messagePerson).catch((error) => windowObject.alert(error.message));
    const block = event.target.closest('[data-block-person]'); if (block) blockPerson(block.dataset.blockPerson).catch((error) => windowObject.alert(error.message));
    const profileReport = event.target.closest('[data-report-profile]'); if (profileReport) reportProfile(profileReport.dataset.reportProfile).catch((error) => windowObject.alert(error.message));
    const conversation = event.target.closest('[data-conversation]'); if (conversation) { state.activeConversation = conversation.dataset.conversation; connectActiveChat(); renderSocial('chats'); }
    const shareProfile = event.target.closest('[data-share-profile]'); if (shareProfile) shareItem('profile', shareProfile.dataset.shareProfile, shareProfile.dataset.shareLabel).catch((error) => windowObject.alert(error.message));
    const shareVenue = event.target.closest('[data-share-venue]'); if (shareVenue) shareItem('venue', shareVenue.dataset.shareVenue, shareVenue.dataset.shareLabel).catch((error) => windowObject.alert(error.message));
    const plan = event.target.closest('[data-save-plan]'); if (plan) savePlan(plan);
    const reaction = event.target.closest('[data-react-look]'); if (reaction) reactLook(reaction);
    if (event.target.closest('[data-mark-read]')) windowObject.GoHottData.markNotificationsRead().then(() => renderSocial('feed')).catch((error) => windowObject.alert(error.message));
  });
  documentObject.addEventListener('change', (event) => { if (event.target.matches('#live-look-form input[type="file"]')) selectLiveLookFile(event.target); });
  documentObject.addEventListener('input', (event) => { if (event.target.matches('#live-look-form [name="caption"]')) el('#caption-count').textContent = `${event.target.value.length}/80`; });
  documentObject.addEventListener('submit', (event) => { event.preventDefault(); if (event.target.id === 'auth-form') handleAuthSubmit(event.target); if (event.target.id === 'profile-form') saveProfile(event.target); if (event.target.id === 'live-look-form') submitLiveLook(event.target); if (event.target.id === 'social-search') searchPeople(event.target); if (event.target.id === 'chat-form') { const input = event.target.elements.message; windowObject.GoHottData.sendMessage(state.activeConversation, input.value).then(() => { input.value = ''; renderSocial('chats'); }).catch((error) => windowObject.alert(error.message)); } });
  documentObject.addEventListener('keydown', (event) => { if (event.key === 'Escape') { if (!el('#auth-modal').hidden) closeAuth(); if (!el('#check-in-modal').hidden) closeCheckIn(); if (!el('#live-look-modal').hidden) closeLiveLook(); } });
  windowObject.addEventListener('hashchange', () => { const [route, id] = windowObject.location.hash.slice(1).split('/'); if (route === 'venue' && id) { state.currentVenue = venueById(id); if (state.currentVenue) { renderVenueDetail(id); navigate('venue', { skipHash: true }); } } else if (['discover', 'map', 'saved', 'social', 'profile'].includes(route)) navigate(route, { skipHash: true }); });

  windowObject.GoHottAuth.subscribe(onAuthChanged); windowObject.GoHottAuth.initialise();
  windowObject.GoHottData.subscribeToCheckIns(loadVenues, (status) => { if (status === 'CHANNEL_ERROR') el('#fresh').textContent = 'Refresh needed'; });
  windowObject.GoHottData.subscribeToLiveLooks(() => loadVenues());
  loadVenues(); renderAuthMode();
  const [initialRoute, initialId] = windowObject.location.hash.slice(1).split('/'); if (initialRoute === 'venue' && initialId) { state.currentVenue = venueById(initialId); } navigate(['discover', 'map', 'saved', 'social', 'profile'].includes(initialRoute) ? initialRoute : 'discover', { skipHash: true });
  if ('serviceWorker' in navigator) windowObject.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch((error) => console.warn('Service worker registration failed.', error)));
}(window, document));
