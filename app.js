(function initialiseApp(windowObject, documentObject) {
  'use strict';
  const state = { venues: [], currentVenue: null, currentCity: 'Sarasota', loading: false };
  const elements = { cards: documentObject.querySelector('#venue-cards'), error: documentObject.querySelector('#error-region'), fresh: documentObject.querySelector('#fresh'), cityLabel: documentObject.querySelector('#city-label'), modal: documentObject.querySelector('#check-in-modal'), modalTitle: documentObject.querySelector('#check-in-title'), formMessage: documentObject.querySelector('#form-message'), reportTop: documentObject.querySelector('#report-top') };
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
  const cityVenues = () => state.venues.filter((venue) => state.currentCity === 'Sarasota' ? venue.area === 'Sarasota' : venue.area !== 'Sarasota');

  function calculateLiveVenues(venues, checkIns) {
    return venues.map((venue) => {
      const reports = checkIns.filter((report) => report.venue_id === venue.id);
      const adjustment = Math.max(-15, Math.min(15, reports.reduce((total, report) => {
        if (report.crowd_level === 5) return total + 3;
        if (report.crowd_level === 4) return total + 2;
        if (report.crowd_level === 2) return total - 1;
        if (report.crowd_level === 1) return total - 3;
        return total;
      }, 0)));
      const latest = [...reports].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
      return { ...venue, live_score: Math.max(0, Math.min(100, Number(venue.hot_score || 50) + adjustment)), live_status: latest?.vibe || venue.status || 'CHILL' };
    }).sort((a, b) => b.live_score - a.live_score);
  }
  function showError(message) { elements.error.innerHTML = message ? `<div class="error">${escapeHtml(message)}</div>` : ''; }
  function renderVenues() {
    const venues = cityVenues();
    if (!venues.length) { elements.cards.innerHTML = `<div class="empty-state">No ${escapeHtml(state.currentCity)} venues are available yet.</div>`; elements.reportTop.disabled = true; return; }
    elements.reportTop.disabled = false;
    elements.cards.innerHTML = venues.map((venue, index) => `
      <button class="venue-card" type="button" data-venue-id="${escapeHtml(venue.id)}" aria-label="Report the vibe at ${escapeHtml(venue.name)}">
        <span class="rank">#${index + 1}</span><span class="venue-info"><span class="venue-name">${escapeHtml(venue.name)}</span><span class="venue-meta">${escapeHtml(venue.area || '')} · ${escapeHtml(venue.scene || 'Nightlife')}</span><span class="venue-status">● ${escapeHtml(venue.live_status)}${venue.line_note ? ` · ${escapeHtml(venue.line_note)}` : ''}</span></span><span class="score">${escapeHtml(venue.live_score)}<small>HOTT</small></span>
      </button>`).join('');
  }
  async function loadVenues() {
    if (state.loading) return;
    state.loading = true; elements.fresh.textContent = 'Updating…'; elements.fresh.classList.remove('is-live'); showError('');
    try {
      const result = await windowObject.GoHottData.getVenuesWithRecentCheckIns();
      state.venues = calculateLiveVenues(result.venues, result.checkIns);
      if (result.checkInsError) showError(`Crowd reports could not load: ${result.checkInsError.message}`);
      renderVenues(); elements.fresh.textContent = 'Live now'; elements.fresh.classList.add('is-live');
    } catch (error) { showError(error.message); elements.cards.innerHTML = '<div class="empty-state">Live venue data is temporarily unavailable.</div>'; elements.fresh.textContent = 'Offline'; }
    finally { state.loading = false; }
  }
  function setCity(city) {
    state.currentCity = city; elements.cityLabel.textContent = `${city.toUpperCase()} · LIVE NIGHTLIFE`;
    documentObject.querySelectorAll('[data-city]').forEach((button) => { const active = button.dataset.city === city; button.classList.toggle('is-active', active); button.setAttribute('aria-pressed', String(active)); }); renderVenues();
  }
  function openModal(venueId) {
    state.currentVenue = state.venues.find((venue) => String(venue.id) === String(venueId)); if (!state.currentVenue) return;
    elements.modalTitle.textContent = state.currentVenue.name; elements.formMessage.textContent = ''; elements.modal.hidden = false; documentObject.body.style.overflow = 'hidden'; elements.modal.querySelector('[data-level]').focus();
  }
  function closeModal() { elements.modal.hidden = true; documentObject.body.style.overflow = ''; state.currentVenue = null; }
  async function submitVote(button) {
    if (!state.currentVenue) return;
    const buttons = elements.modal.querySelectorAll('[data-level]'); buttons.forEach((item) => { item.disabled = true; }); elements.formMessage.textContent = 'Sending your report…';
    try { await windowObject.GoHottData.createCheckIn(state.currentVenue.id, Number(button.dataset.level), button.dataset.vibe); closeModal(); await loadVenues(); }
    catch (error) { elements.formMessage.textContent = `Could not submit report: ${error.message}`; }
    finally { buttons.forEach((item) => { item.disabled = false; }); }
  }
  function navigate(target) {
    documentObject.querySelectorAll('[data-screen]').forEach((screen) => { screen.hidden = screen.dataset.screen !== target; });
    documentObject.querySelectorAll('[data-target]').forEach((button) => { const active = button.dataset.target === target; button.classList.toggle('is-active', active); if (active) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current'); }); windowObject.location.hash = target;
  }
  documentObject.addEventListener('click', (event) => {
    const city = event.target.closest('[data-city]'); if (city) setCity(city.dataset.city);
    const card = event.target.closest('[data-venue-id]'); if (card) openModal(card.dataset.venueId);
    const vote = event.target.closest('[data-level]'); if (vote) submitVote(vote);
    const nav = event.target.closest('[data-target]'); if (nav) navigate(nav.dataset.target);
    if (event.target.closest('[data-close-modal]')) closeModal();
  });
  elements.reportTop.addEventListener('click', () => { const topVenue = cityVenues()[0]; if (topVenue) openModal(topVenue.id); });
  documentObject.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !elements.modal.hidden) closeModal(); });
  const initialScreen = ['discover', 'map', 'saved', 'profile'].includes(windowObject.location.hash.slice(1)) ? windowObject.location.hash.slice(1) : 'discover';
  navigate(initialScreen); windowObject.GoHottData.subscribeToCheckIns(loadVenues, (status) => { if (status === 'CHANNEL_ERROR') elements.fresh.textContent = 'Refresh needed'; }); loadVenues();
  if ('serviceWorker' in navigator) windowObject.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}(window, document));
