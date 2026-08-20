(function initialiseMobile(windowObject, documentObject) {
  'use strict';
  const RATIONALE_KEY = 'gohott.location-rationale.v1';
  const isNative = () => Boolean(windowObject.Capacitor?.isNativePlatform?.());
  const locationRationaleAccepted = () => sessionStorage.getItem(RATIONALE_KEY) === 'accepted';
  const acceptLocationRationale = () => sessionStorage.setItem(RATIONALE_KEY, 'accepted');
  function updateNetworkState() {
    const banner = documentObject.getElementById('network-banner');
    if (!banner) return;
    banner.hidden = navigator.onLine;
    documentObject.documentElement.classList.toggle('is-offline', !navigator.onLine);
  }
  function parseDeepLink(value = windowObject.location.hash) {
    const parts = String(value).replace(/^#\/?/, '').split('/').filter(Boolean);
    if (parts[0] === 'share') parts.shift();
    const type = parts[0]; const id = parts[1] || '';
    return ['venue', 'profile', 'live-look', 'plan'].includes(type) && /^[a-zA-Z0-9-]{1,64}$/.test(id) ? { type, id } : null;
  }
  function resolveDeepLink(value, { venues = [], liveLooks = [] } = {}) {
    const link = parseDeepLink(value);
    if (!link) return null;
    if (link.type === 'profile') return { route: 'social', view: 'profile', id: link.id };
    if (link.type === 'plan') return { route: 'social', view: 'plan', id: link.id };
    if (link.type === 'venue') return venues.some((venue) => String(venue.id) === link.id) ? { route: 'venue', venueId: link.id } : { route: 'discover', view: 'unavailable', id: link.id };
    const look = liveLooks.find((item) => String(item.id) === link.id);
    return look && venues.some((venue) => String(venue.id) === String(look.venue_id)) ? { route: 'venue', venueId: String(look.venue_id), liveLookId: link.id } : { route: 'discover', view: 'unavailable', id: link.id };
  }
  function preferredPhotoInput() { return isNative() ? 'native-camera-plugin' : 'html-file-input'; }
  function notificationCapability() {
    if (isNative()) return { available: true, provider: 'apns-native-bridge' };
    return { available: 'Notification' in windowObject && 'serviceWorker' in navigator, provider: 'web-push' };
  }
  windowObject.addEventListener('online', updateNetworkState);
  windowObject.addEventListener('offline', updateNetworkState);
  documentObject.addEventListener('DOMContentLoaded', updateNetworkState);
  windowObject.GoHottMobile = Object.freeze({ isNative, locationRationaleAccepted, acceptLocationRationale, parseDeepLink, resolveDeepLink, preferredPhotoInput, notificationCapability, updateNetworkState });
}(window, document));
