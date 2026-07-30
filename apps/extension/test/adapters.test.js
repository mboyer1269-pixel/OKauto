const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const content = fs.readFileSync(path.join(__dirname, '..', 'content.js'), 'utf8');
assert.match(content, /captchaBypassForbidden/);
assert.match(content, /SELECTOR_ADAPTERS/);
assert.doesNotMatch(content, /bypass captcha/i);
console.log('extension adapter policy tests passed');
