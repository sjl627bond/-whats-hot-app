(function initialiseGeo(windowObject) {
  'use strict';
  let lastPosition = null;
  function distanceMeters(a, b) {
    if (![a?.latitude, a?.longitude, b?.latitude, b?.longitude].every(Number.isFinite)) return null;
    const radius = 6371000;
    const toRad = (value) => value * Math.PI / 180;
    const dLat = toRad(b.latitude - a.latitude); const dLon = toRad(b.longitude - a.longitude);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2;
    return Math.round(radius * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h)));
  }
  function requestPosition() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) { reject(Object.assign(new Error('Location is not available on this device.'), { code: 0 })); return; }
      navigator.geolocation.getCurrentPosition((position) => {
        lastPosition = { latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy };
        resolve(lastPosition);
      }, reject, { enableHighAccuracy: false, timeout: 10000, maximumAge: 120000 });
    });
  }
  function assess(position, venue) {
    if (!position) return { status: 'location_unavailable', distanceMeters: null };
    if (venue.latitude === null || venue.latitude === '' || venue.longitude === null || venue.longitude === '') return { status: 'unassessed', distanceMeters: null };
    const distance = distanceMeters(position, { latitude: Number(venue.latitude), longitude: Number(venue.longitude) });
    if (distance === null) return { status: 'unassessed', distanceMeters: null };
    return { status: distance <= windowObject.GOHOTT_CONFIG.trustedRadiusMeters ? 'client_nearby' : 'client_outside_radius', distanceMeters: distance };
  }
  const formatDistance = (meters) => meters == null ? '' : meters < 1000 ? `${meters} m` : `${(meters / 1609.344).toFixed(1)} mi`;
  windowObject.GoHottGeo = Object.freeze({ requestPosition, distanceMeters, assess, formatDistance, getLastPosition: () => lastPosition });
}(window));
