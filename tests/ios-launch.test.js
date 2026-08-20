const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const read = (path) => fs.readFileSync(new URL(`../${path}`, `file://${__filename}`), 'utf8');
const packageJson = JSON.parse(read('package.json'));
const capacitor = JSON.parse(read('capacitor.config.json'));
const plist = read('ios/App/App/Info.plist');
const project = read('ios/App/App.xcodeproj/project.pbxproj');
const appDelegate = read('ios/App/App/AppDelegate.swift');
const workspace = read('ios/App/App.xcworkspace/contents.xcworkspacedata');
const runtime = read('native-runtime.js');
const buildScript = read('scripts/build-web.mjs');
const appCode = read('app.js');
const shell = read('index.html');
const authCode = read('auth.js');

assert.equal(capacitor.appName, 'GoHott');
assert.equal(capacitor.appId, 'com.placeholder.gohott');
assert.equal(capacitor.webDir, 'www');
assert.match(project, /PRODUCT_BUNDLE_IDENTIFIER = com\.placeholder\.gohott;/);
assert.doesNotMatch(project, /DEVELOPMENT_TEAM =/);
assert.match(workspace, /group:App\.xcodeproj/);

for (const key of ['NSCameraUsageDescription', 'NSPhotoLibraryUsageDescription', 'NSLocationWhenInUseUsageDescription']) assert.match(plist, new RegExp(`<key>${key}</key>`));
assert.doesNotMatch(plist, /NSAllowsArbitraryLoads/);
assert.doesNotMatch(plist, /NSLocationAlways/);
assert.match(appDelegate, /capacitorDidRegisterForRemoteNotifications/);
assert.match(appDelegate, /capacitorDidFailToRegisterForRemoteNotifications/);
assert.match(runtime, /camera\.takePhoto/);
assert.match(runtime, /camera\.chooseFromGallery/);
assert.doesNotMatch(runtime, /camera\.getPhoto/);
assert.match(buildScript, /vendor\/supabase\.js/);
assert.match(buildScript, /vendor\/leaflet\/leaflet\.js/);
assert.match(appCode, /addEventListener\('online', \(\) => loadVenues\(\)\)/);
assert.match(shell, /data-forgot-password>Forgot password\?<\/button>/);
assert.match(shell, /id="password-recovery-request-form"[\s\S]+id="password-recovery-update-form"/);
assert.match(shell, /name="password" minlength="6" autocomplete="new-password"/);
assert.match(authCode, /resetPasswordForEmail\(email, \{ redirectTo: recoveryRedirectUrl\(\) \}\)/);
assert.match(authCode, /updateUser\(\{ password \}\)/);
assert.match(authCode, /event === 'PASSWORD_RECOVERY'/);
assert.match(plist, /<string>gohott<\/string>/);

for (const [name, version] of Object.entries({ '@capacitor/core': '8.5.0', '@capacitor/camera': '8.2.3', '@capacitor/geolocation': '8.2.2', '@capacitor/push-notifications': '8.1.2' })) {
  assert.equal(packageJson.dependencies[name], version);
}

const listeners = {};
const nativeEvents = [];
const window = {
  Capacitor: { isNativePlatform: () => true, Plugins: { App: { addListener(name, callback) { listeners[name] = callback; } } } },
  location: { hash: '' },
  dispatchEvent(event) { nativeEvents.push(event); },
};
vm.runInNewContext(runtime, {
  window, URL, File: class File {}, fetch() {},
  CustomEvent: class CustomEvent { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } },
});
assert.equal(window.GoHottNative.isNative, true);
assert.equal(window.GoHottNative.normaliseDeepLink('https://gohott.example/venue/abc-123'), '#share/venue/abc-123');
assert.equal(window.GoHottNative.normaliseDeepLink('https://gohott.example/#share/venue/abc-123'), '#share/venue/abc-123');
assert.equal(window.GoHottNative.normaliseDeepLink('https://gohott.example/share/live-look/look-2'), '#share/live-look/look-2');
assert.equal(window.GoHottNative.normaliseDeepLink('gohott://profile/user-9'), '#share/profile/user-9');
assert.equal(window.GoHottNative.normaliseDeepLink('https://gohott.example/message/private'), null);
listeners.appUrlOpen({ url: 'https://gohott.example/live-look/look-2' });
assert.equal(window.location.hash, '#share/live-look/look-2');
for (const [type, id] of [['venue', 'venue-1'], ['profile', 'user-2'], ['live-look', 'look-3'], ['plan', 'plan-4']]) {
  window.location.hash = `#share/${type}/${id}`;
  listeners.appUrlOpen({ url: `gohott://${type}/${id}` });
  const event = nativeEvents.at(-1);
  assert.equal(event.type, 'gohott:native-link');
  assert.equal(event.detail.hash, `#share/${type}/${id}`);
}
assert.equal(nativeEvents.length, 4);
listeners.appUrlOpen({ url: 'gohott://auth/recovery#access_token=access&refresh_token=refresh&type=recovery' });
const authEvent = nativeEvents.at(-1);
assert.equal(authEvent.type, 'gohott:auth-callback');
assert.equal(authEvent.detail.url, 'gohott://auth/recovery#access_token=access&refresh_token=refresh&type=recovery');
assert.equal(window.GoHottNative.isAuthCallback('gohott://profile/user-9'), false);
assert.match(appCode, /addEventListener\('gohott:native-link',[\s\S]*handleDeepLink\(event\.detail\?\.hash\)/);

async function nativeRuntimeWith(overrides) {
  const nativeWindow = {
    Capacitor: { isNativePlatform: () => true, Plugins: { App: { addListener() {} }, ...overrides } },
    location: { hash: '' }, dispatchEvent() {},
  };
  const blobs = [];
  vm.runInNewContext(runtime, {
    window: nativeWindow, URL, CustomEvent: class CustomEvent {},
    File: class File { constructor(parts, name, options) { this.parts = parts; this.name = name; this.type = options.type; } },
    fetch: async (url) => ({ ok: true, blob: async () => { const blob = { type: 'image/jpeg', url }; blobs.push(blob); return blob; } }),
  });
  return { bridge: nativeWindow.GoHottNative, blobs };
}

(async () => {
  let galleryCalls = 0;
  const camera = await nativeRuntimeWith({ Camera: {
    takePhoto: async () => { throw Object.assign(new Error('No camera available'), { code: 'OS-PLUG-CAMR-0007' }); },
    chooseFromGallery: async () => { galleryCalls += 1; return { results: [{ webPath: 'capacitor://photo', format: 'jpeg' }] }; },
  } });
  const file = await camera.bridge.pickPhoto('camera');
  assert.equal(galleryCalls, 1); assert.equal(file.type, 'image/jpeg');

  const denied = await nativeRuntimeWith({ Geolocation: {
    checkPermissions: async () => ({ location: 'denied' }), requestPermissions: async () => ({ location: 'denied' }),
  } });
  await assert.rejects(denied.bridge.requestPosition(), (error) => error.code === 1);

  const restricted = await nativeRuntimeWith({ Geolocation: {
    checkPermissions: async () => { throw Object.assign(new Error('Location restricted'), { code: 'OS-PLUG-GLOC-0003' }); },
  } });
  await assert.rejects(restricted.bridge.requestPosition(), (error) => error.code === 1);

  const granted = await nativeRuntimeWith({ Geolocation: {
    checkPermissions: async () => ({ location: 'granted' }),
    getCurrentPosition: async () => ({ coords: { latitude: 27.33, longitude: -82.54, accuracy: 12 } }),
  } });
  assert.deepEqual(JSON.parse(JSON.stringify(await granted.bridge.requestPosition())), { latitude: 27.33, longitude: -82.54, accuracy: 12 });
})().catch((error) => { console.error(error); process.exitCode = 1; });

console.log('iOS launch contract tests passed');
