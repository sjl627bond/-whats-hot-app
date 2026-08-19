const assert = require('node:assert/strict'); const fs = require('node:fs'); const vm = require('node:vm');
const code = fs.readFileSync(new URL('../mobile.js', `file://${__filename}`), 'utf8'); const listeners = {};
const session = new Map(); const document = { getElementById: () => null, documentElement: { classList: { toggle() {} } }, addEventListener() {} };
const window = { location: { hash: '#share/venue/abc-123' }, addEventListener(type, fn) { listeners[type] = fn; }, Notification: function Notification() {} };
const context = { window, document, navigator: { onLine: true, serviceWorker: {} }, sessionStorage: { getItem: (k) => session.get(k) || null, setItem: (k, v) => session.set(k, v) } }; vm.runInNewContext(code, context);
assert.deepEqual(JSON.parse(JSON.stringify(window.GoHottMobile.parseDeepLink())), { type: 'venue', id: 'abc-123' });
assert.equal(window.GoHottMobile.parseDeepLink('#share/message/private'), null); assert.equal(window.GoHottMobile.locationRationaleAccepted(), false); window.GoHottMobile.acceptLocationRationale(); assert.equal(window.GoHottMobile.locationRationaleAccepted(), true);
assert.equal(window.GoHottMobile.notificationCapability().available, true); console.log('Phase 6 mobile contract tests passed');
