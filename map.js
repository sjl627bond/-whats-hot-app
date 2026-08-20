(function initialiseMap(windowObject, documentObject) {
  'use strict';
  let map = null; let venueLayer = null; let userMarker = null; let onSelect = null; let activeCity = null; let hasCenteredOnUser = false;
  const centers = windowObject.GOHOTT_CONFIG.cityCenters;

  function ensureMap() {
    if (map || !windowObject.L) return map;
    map = windowObject.L.map('map', { zoomControl: false }).setView(centers.Sarasota, 13);
    windowObject.L.control.zoom({ position: 'topright' }).addTo(map);
    windowObject.L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);
    venueLayer = windowObject.L.layerGroup().addTo(map);
    return map;
  }
  function scoreColor(score) { return score >= 85 ? '#ff5315' : score >= 70 ? '#ff9a69' : '#f1b45a'; }
  function render({ venues, city, center, position, selectVenue }) {
    onSelect = selectVenue; const instance = ensureMap();
    const message = documentObject.querySelector('#map-message');
    if (!instance) { message.textContent = 'The interactive map could not load. Venue discovery is still available.'; return; }
    venueLayer.clearLayers();
    if (city !== activeCity && (activeCity !== null || !hasCenteredOnUser)) instance.setView(center || centers[city] || centers.Sarasota, city === 'Sarasota' ? 13 : 12);
    activeCity = city;
    const mappable = venues.filter((venue) => venue.coordinate_status === 'verified' && venue.latitude !== null && venue.latitude !== '' && venue.longitude !== null && venue.longitude !== '' && Number.isFinite(Number(venue.latitude)) && Number.isFinite(Number(venue.longitude)));
    mappable.forEach((venue) => {
      const marker = windowObject.L.circleMarker([Number(venue.latitude), Number(venue.longitude)], { radius: 13, color: '#09090b', weight: 3, fillColor: scoreColor(venue.live_score), fillOpacity: 1 });
      marker.bindTooltip(String(venue.live_score), { permanent: true, direction: 'center', className: 'score-tooltip' });
      marker.on('click', () => onSelect?.(venue)); marker.addTo(venueLayer);
    });
    message.textContent = mappable.length ? `${mappable.length} venues mapped with verified coordinates.` : 'Verified venue coordinates are not available for this market yet. Discovery still works normally.';
    if (position) setUserPosition(position);
    setTimeout(() => instance.invalidateSize(), 0);
  }
  function setUserPosition(position) {
    const instance = ensureMap(); const latitude = Number(position?.latitude); const longitude = Number(position?.longitude);
    if (!instance || !Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return;
    const coordinates = [latitude, longitude];
    if (userMarker) userMarker.setLatLng(coordinates);
    else userMarker = windowObject.L.circleMarker(coordinates, { radius: 8, color: '#fff', weight: 3, fillColor: '#3b82f6', fillOpacity: 1 }).addTo(instance).bindTooltip('You are here');
    if (!hasCenteredOnUser) { instance.setView(coordinates, 15); hasCenteredOnUser = true; }
  }
  windowObject.GoHottMap = Object.freeze({ render, setUserPosition });
}(window, document));
