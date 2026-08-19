const assert = require('node:assert/strict');
const fs = require('node:fs');

const read = (name) => fs.readFileSync(new URL(`../${name}`, `file://${__filename}`), 'utf8');
const pages = ['privacy.html', 'terms.html', 'support.html', 'privacy-choices.html'];
for (const page of pages) {
  const html = read(page);
  assert.match(html, /<meta name="viewport"[^>]+viewport-fit=cover/);
  assert.match(html, /href="legal\.css"/);
  assert.match(html, /href="privacy\.html"/);
  assert.match(html, /href="terms\.html"/);
  assert.match(html, /href="support\.html"/);
  assert.match(html, /href="privacy-choices\.html"/);
  assert.match(html, /href="\.\/#profile"/);
}

const privacy = read('privacy.html');
for (const phrase of ['Supabase', 'Vercel', 'OpenStreetMap', 'location', 'Live Look', 'saved venues', 'Messages', 'still photo', 'does not accept video uploads']) assert.match(privacy, new RegExp(phrase, 'i'));
assert.match(privacy, /current browser code does not transmit that queue/i);
assert.doesNotMatch(privacy, /we collect video/i);

const terms = read('terms.html');
for (const phrase of ['Acceptable use', 'User-generated content', 'Venue and ranking', 'Moderation', 'intellectual property', 'termination', 'Disclaimers', 'Limitation of liability']) assert.match(terms, new RegExp(phrase, 'i'));

const choices = read('privacy-choices.html');
assert.match(choices, /Profile.*Account controls/is);
assert.match(choices, /not immediate/i);
assert.match(choices, /de-identified form/i);

const app = read('app.js');
for (const target of ['privacy.html', 'terms.html', 'support.html', 'privacy-choices.html']) assert.match(app, new RegExp(target.replace('.', '\\.')));
const shell = read('sw.js');
for (const target of pages.concat('legal.css')) assert.match(shell, new RegExp(target.replace('.', '\\.')));

console.log('legal and support page contract tests passed');
