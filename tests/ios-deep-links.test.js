const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const mobile = fs.readFileSync(new URL('../mobile.js', `file://${__filename}`), 'utf8');
const app = fs.readFileSync(new URL('../app.js', `file://${__filename}`), 'utf8');
const listeners = {};
const window = { location: { hash: '#share/venue/venue-1' }, addEventListener(name, callback) { listeners[name] = callback; } };
const document = { addEventListener() {}, getElementById() { return null; }, documentElement: { classList: { toggle() {} } } };
const sessionStorage = { getItem() { return null; }, setItem() {} };
vm.runInNewContext(mobile, { window, document, sessionStorage, navigator: { onLine: true } });

const fixtures = { venues: [{ id: 'venue-1' }, { id: 'venue-2' }], liveLooks: [{ id: 'look-1', venue_id: 'venue-2' }] };
assert.deepEqual(JSON.parse(JSON.stringify(window.GoHottMobile.resolveDeepLink('#share/venue/venue-1', fixtures))), { route: 'venue', venueId: 'venue-1' });
assert.deepEqual(JSON.parse(JSON.stringify(window.GoHottMobile.resolveDeepLink('#share/live-look/look-1', fixtures))), { route: 'venue', venueId: 'venue-2', liveLookId: 'look-1' });
assert.deepEqual(JSON.parse(JSON.stringify(window.GoHottMobile.resolveDeepLink('#share/profile/user-1', fixtures))), { route: 'social', view: 'profile', id: 'user-1' });
assert.deepEqual(JSON.parse(JSON.stringify(window.GoHottMobile.resolveDeepLink('#share/plan/plan-1', fixtures))), { route: 'social', view: 'plan', id: 'plan-1' });
assert.equal(window.GoHottMobile.resolveDeepLink('#share/profile/<script>', fixtures), null);

assert.match(app, /destination\.route === 'venue'[\s\S]*openVenue\(destination\.venueId\)/);
assert.match(app, /destination\.view === 'profile'[\s\S]*openSharedProfile\(destination\.id\)/);
assert.match(app, /destination\.view === 'plan'[\s\S]*openSharedPlan\(destination\.id\)/);
assert.match(app, /getSharedProfile\(id\)/);
assert.match(app, /getNightlifePlan\(id\)/);
assert.match(app, /addEventListener\('hashchange',[\s\S]*handleDeepLink/);
assert.match(app, /addEventListener\('gohott:native-link',[\s\S]*handleDeepLink\(event\.detail\?\.hash\)/);

console.log('iOS application deep-link destination tests passed');
