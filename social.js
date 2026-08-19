(function initialiseSocial(windowObject) {
  'use strict';
  const USERNAME = /^[a-z0-9_]{3,24}$/;
  const PLAN_STATUSES = Object.freeze(['going', 'maybe', 'interested']);
  const VISIBILITIES = Object.freeze(['private', 'followers', 'mutuals', 'public']);
  const SHARE_TYPES = Object.freeze(['venue', 'profile', 'live_look', 'plan']);

  function normaliseUsername(value) {
    const username = String(value || '').trim().toLowerCase();
    if (!USERNAME.test(username)) throw new Error('Use 3–24 lowercase letters, numbers, or underscores.');
    return username;
  }
  function validateBio(value) {
    const bio = String(value || '').trim();
    if (bio.length > 160) throw new Error('Bios can be up to 160 characters.');
    return bio;
  }
  function validateMessage(value) {
    const body = String(value || '').trim();
    if (!body || body.length > 2000) throw new Error('Messages must be 1–2,000 characters.');
    return body;
  }
  function validatePlan(status, visibility) {
    if (!PLAN_STATUSES.includes(status) || !VISIBILITIES.includes(visibility)) throw new Error('Choose a valid plan and visibility.');
    return { status, visibility };
  }
  function sharePath(type, id) {
    if (!SHARE_TYPES.includes(type) || !id) throw new Error('This item cannot be shared.');
    return `#share/${encodeURIComponent(type)}/${encodeURIComponent(id)}`;
  }
  async function share({ type, id, title, text }) {
    const url = new URL(sharePath(type, id), windowObject.location.href).href;
    if (windowObject.navigator.share) {
      try { await windowObject.navigator.share({ title, text, url }); return 'shared'; }
      catch (error) { if (error.name === 'AbortError') return 'cancelled'; }
    }
    await windowObject.navigator.clipboard.writeText(url); return 'copied';
  }
  windowObject.GoHottSocial = Object.freeze({ USERNAME, PLAN_STATUSES, VISIBILITIES, SHARE_TYPES, normaliseUsername, validateBio, validateMessage, validatePlan, sharePath, share });
}(window));
