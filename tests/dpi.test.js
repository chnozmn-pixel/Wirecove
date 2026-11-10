const test = require('node:test');
const assert = require('node:assert/strict');
const { siteUrl } = require('../native/macos/dpi/control');
const { domainFromInput, readRules, addRule, removeRule } = require('../native/macos/dpi/site_rules');
const appRules = require('../native/macos/dpi/app_rules');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

test('accepts HTTP(S) sites and rejects other schemes and credentials', () => {
  assert.equal(siteUrl('example.com'), 'https://example.com/');
  assert.equal(siteUrl('http://example.com/path'), 'http://example.com/path');
  assert.throws(() => siteUrl('file:///etc/passwd'));
  assert.throws(() => siteUrl('https://user:secret@example.com'));
});

test('application selections persist without duplicates', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wirecove-apps-'));
  const file = path.join(dir, 'apps.json');
  const item = { path: '/Applications/Example.app', name: 'Example' };
  try {
    assert.deepEqual(appRules.addRule(file, item), [item]);
    assert.deepEqual(appRules.addRule(file, item), [item]);
    assert.deepEqual(appRules.readRules(file), [item]);
    assert.deepEqual(appRules.removeRule(file, item.path), []);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('site rules persist normalized domains without duplicates', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wirecove-sites-'));
  const file = path.join(dir, 'sites.json');
  try {
    assert.equal(domainFromInput('https://www.funpic.hu/path'), 'funpic.hu');
    assert.deepEqual(addRule(file, 'www.funpic.hu'), ['funpic.hu']);
    assert.deepEqual(addRule(file, 'https://funpic.hu/'), ['funpic.hu']);
    assert.deepEqual(readRules(file), ['funpic.hu']);
    assert.deepEqual(removeRule(file, 'funpic.hu'), []);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
