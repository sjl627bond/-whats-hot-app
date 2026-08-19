const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(new URL('../supabase.js', `file://${__filename}`), 'utf8');

function loadData(insertResults) {
  const inserts = [];
  const client = {
    from() {
      const query = {
        async insert(payload) {
          inserts.push(payload);
          return insertResults.shift() || { error: null };
        },
        select() { return query; },
        eq() { return query; },
        gte() { return query; },
        async limit() { return { data: [], error: null }; },
      };
      return query;
    },
    channel() { return { on() { return this; }, subscribe() { return this; } }; },
  };
  const window = {
    GOHOTT_CONFIG: {
      supabaseUrl: 'https://example.supabase.co',
      supabasePublishableKey: 'publishable-test-key',
      repeatCheckInMinutes: 15,
      liveWindowHours: 2,
    },
    supabase: { createClient: () => client },
  };
  vm.runInNewContext(source, { window, Date, Promise, Error });
  return { data: window.GoHottData, inserts };
}

async function run() {
  const afterMigration = loadData([{ error: null }]);
  await afterMigration.data.createCheckIn({
    venue_id: 'venue-1', crowd_level: 5, vibe: 'GOING OFF', user_id: null,
    proximity_status: 'client_nearby', distance_meters: 10,
  });
  assert.equal(JSON.stringify(afterMigration.inserts), JSON.stringify([{ venue_id: 'venue-1', crowd_level: 5, vibe: 'GOING OFF' }]));

  const beforeMigration = loadData([{ error: { message: "Could not find the 'user_id' column in the schema cache" } }, { error: null }]);
  await beforeMigration.data.createCheckIn({
    venue_id: 'venue-2', crowd_level: 2, vibe: 'CHILL', user_id: 'user-1',
    proximity_status: 'client_nearby', distance_meters: 25,
  });
  assert.equal(beforeMigration.inserts.length, 2);
  assert.equal(JSON.stringify(beforeMigration.inserts[1]), JSON.stringify({ venue_id: 'venue-2', crowd_level: 2, vibe: 'CHILL' }));
  console.log('check-in compatibility tests passed');
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
