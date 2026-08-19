const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const window = { location: { href: 'https://gohott.example/#discover' }, navigator: { clipboard: { writeText: async (value) => { window.copied = value; } } } };
vm.runInNewContext(fs.readFileSync(new URL('../social.js', `file://${__filename}`), 'utf8'), { window, URL });
const social = window.GoHottSocial;

assert.equal(social.normaliseUsername('  Night_Owl  '), 'night_owl');
assert.throws(() => social.normaliseUsername('no spaces'), /3–24/);
assert.equal(social.validateBio(' hello '), 'hello');
assert.throws(() => social.validateBio('x'.repeat(161)), /160/);
assert.equal(social.validateMessage(' hello '), 'hello');
assert.throws(() => social.validateMessage(''), /1–2,000/);
assert.equal(JSON.stringify(social.validatePlan('going', 'followers')), JSON.stringify({ status: 'going', visibility: 'followers' }));
assert.throws(() => social.validatePlan('here_now', 'public'), /valid plan/);
assert.equal(social.sharePath('venue', 'abc'), '#share/venue/abc');
social.share({ type: 'profile', id: 'p1', title: 'Profile', text: 'See profile' }).then((result) => {
  assert.equal(result, 'copied');
  assert.match(window.copied, /#share\/profile\/p1$/);
  console.log('social unit tests passed');
});
