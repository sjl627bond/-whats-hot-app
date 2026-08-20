const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const code = fs.readFileSync(new URL('../map.js', `file://${__filename}`), 'utf8');
const views = []; const markerPositions = []; let markerMoves = 0;
const map = {
  setView(coordinates, zoom) { views.push({ coordinates: [...coordinates], zoom }); return this; },
  invalidateSize() {},
};
const layer = { clearLayers() {}, addTo() { return this; } };
const L = {
  map: () => map,
  control: { zoom: () => ({ addTo() {} }) },
  tileLayer: () => ({ addTo() {} }),
  layerGroup: () => layer,
  circleMarker(coordinates) {
    markerPositions.push([...coordinates]);
    return {
      addTo() { return this; }, bindTooltip() { return this; }, on() { return this; },
      setLatLng(next) { markerMoves += 1; markerPositions.push([...next]); return this; },
    };
  },
};
const message = { textContent: '' };
const window = { L, GOHOTT_CONFIG: { cityCenters: { Sarasota: [27.3364, -82.5307], 'Tampa Bay': [27.9606, -82.4572] } } };
const document = { querySelector: () => message };
vm.runInNewContext(code, { window, document, Number, setTimeout: (callback) => callback() });

window.GoHottMap.render({ venues: [], city: 'Sarasota', center: null, position: null, selectVenue() {} });
assert.deepEqual(views.at(-1), { coordinates: [27.3364, -82.5307], zoom: 13 }, 'location-unavailable maps retain the city center');

window.GoHottMap.setUserPosition({ latitude: 27.341, longitude: -82.535 });
assert.deepEqual(views.at(-1), { coordinates: [27.341, -82.535], zoom: 15 }, 'the first valid fix centers at a useful street-level zoom');
const viewCountAfterFirstFix = views.length;

window.GoHottMap.setUserPosition({ latitude: 27.342, longitude: -82.536 });
assert.equal(views.length, viewCountAfterFirstFix, 'later fixes must not recenter after user interaction');
assert.equal(markerMoves, 1, 'later fixes move the existing user marker');
assert.deepEqual(markerPositions.at(-1), [27.342, -82.536]);

window.GoHottMap.render({ venues: [], city: 'Sarasota', center: null, position: { latitude: 27.343, longitude: -82.537 }, selectVenue() {} });
assert.equal(views.length, viewCountAfterFirstFix, 'same-city rerenders must preserve the user-selected viewport');

window.GoHottMap.setUserPosition({ latitude: NaN, longitude: -82.5 });
assert.equal(views.length, viewCountAfterFirstFix, 'invalid fixes are ignored');

console.log('map first-fix centering tests passed');
