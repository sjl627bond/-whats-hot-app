const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(new URL('../ranking.js', `file://${__filename}`), 'utf8');
const window = {};
vm.runInNewContext(source, { window, Date, Math, Set, String });
const ranking = window.GoHottRanking;
const now = Date.parse('2026-08-19T03:00:00Z');
const report = (minutesAgo, overrides = {}) => ({
  venue_id: 'venue-1', crowd_level: 5, vibe: 'GOING OFF',
  created_at: new Date(now - minutesAgo * 60000).toISOString(), trust_tier: 'legacy', ...overrides,
});

assert.equal(ranking.recencyWeight(5), 1);
assert.equal(ranking.recencyWeight(60), 0.45);
assert.equal(ranking.recencyWeight(121), 0);

const trusted = ranking.scoreVenue({ hot_score: 50 }, [report(5, { trust_tier: 'server_assessed_nearby' })], now);
const legacy = ranking.scoreVenue({ hot_score: 50 }, [report(5)], now);
assert.ok(trusted.live_score > legacy.live_score, 'server-assessed activity should carry more weight');

const suspicious = ranking.scoreVenue({ hot_score: 50 }, [report(1, { trust_tier: 'suspicious' })], now);
assert.equal(suspicious.live_score, 50, 'suspicious reports must not affect ranking');

const duplicateUser = ranking.scoreVenue({ hot_score: 50 }, [
  report(1, { user_id: 'user-1', trust_tier: 'server_assessed_nearby' }),
  report(2, { user_id: 'user-1', trust_tier: 'server_assessed_nearby' }),
], now);
assert.equal(duplicateUser.recent_report_count, 1, 'only the newest report per account should count');

const anonymousFlood = ranking.scoreVenue({ hot_score: 50 }, Array.from({ length: 12 }, (_, index) => report(index)), now);
assert.equal(anonymousFlood.recent_report_count, 5, 'anonymous activity must have a strict per-venue influence cap');

const capped = ranking.scoreVenue({ hot_score: 95 }, Array.from({ length: 30 }, (_, index) => report(index)), now);
assert.equal(capped.live_score, 100);
assert.ok(capped.score_adjustment <= 15);
console.log('ranking tests passed');
