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

for (const [name, version] of Object.entries({ '@capacitor/core': '8.5.0', '@capacitor/camera': '8.2.3', '@capacitor/geolocation': '8.2.2', '@capacitor/push-notifications': '8.1.2' })) {
  assert.equal(packageJson.dependencies[name], version);
}

const listeners = {};
const window = {
  Capacitor: { isNativePlatform: () => true, Plugins: { App: { addListener(name, callback) { listeners[name] = callback; } } } },
  location: { hash: '' },
  dispatchEvent() {},
};
vm.runInNewContext(runtime, { window, URL, File: class File {}, fetch() {}, CustomEvent: class CustomEvent {} });
assert.equal(window.GoHottNative.isNative, true);
assert.equal(window.GoHottNative.normaliseDeepLink('https://gohott.example/venue/abc-123'), '#share/venue/abc-123');
assert.equal(window.GoHottNative.normaliseDeepLink('gohott://profile/user-9'), '#share/profile/user-9');
assert.equal(window.GoHottNative.normaliseDeepLink('https://gohott.example/message/private'), null);
listeners.appUrlOpen({ url: 'https://gohott.example/live-look/look-2' });
assert.equal(window.location.hash, '#share/live-look/look-2');

console.log('iOS launch contract tests passed');
