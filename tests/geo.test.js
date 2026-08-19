const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(new URL('../geo.js', `file://${__filename}`), 'utf8');

function loadGeo(getCurrentPosition) {
  const window = { GOHOTT_CONFIG: { trustedRadiusMeters: 500 } };
  const context = { window, navigator: { geolocation: { getCurrentPosition } }, console, Promise, Math };
  vm.runInNewContext(source, context);
  return window.GoHottGeo;
}

async function run() {
  const accepted = loadGeo((success) => success({ coords: { latitude: 27.3364, longitude: -82.5307, accuracy: 20 } }));
  const position = await accepted.requestPosition();
  assert.equal(position.latitude, 27.3364);
  assert.equal(accepted.assess(position, { latitude: 27.3365, longitude: -82.5307 }).status, 'client_nearby');
  assert.equal(accepted.assess(position, { latitude: null, longitude: null }).status, 'unassessed');
  assert.match(accepted.formatDistance(1609), /mi/);

  const deniedError = Object.assign(new Error('denied'), { code: 1 });
  const denied = loadGeo((_success, failure) => failure(deniedError));
  await assert.rejects(denied.requestPosition(), (error) => error.code === 1);
  console.log('geo tests passed');
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
