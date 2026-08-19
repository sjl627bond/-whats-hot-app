const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = fs.readFileSync(new URL('../index.html', `file://${__filename}`), 'utf8');
const css = fs.readFileSync(new URL('../styles.css', `file://${__filename}`), 'utf8');
const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);

assert.equal(new Set(ids).size, ids.length, 'HTML ids must be unique');
assert.match(html, /<html lang="en">/);
assert.match(html, /<meta name="viewport"/);
assert.match(html, /<nav[^>]+aria-label="Primary navigation"/);
assert.equal((html.match(/role="dialog"/g) || []).length, (html.match(/aria-modal="true"/g) || []).length);
assert.match(html, /id="check-in-message" role="status"/);
assert.match(css, /:focus-visible/);
assert.match(css, /prefers-reduced-motion:reduce/);
assert.match(css, /min-height:44px/);
console.log('accessibility contract tests passed');
