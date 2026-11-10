const test = require('node:test');
const assert = require('node:assert/strict');
const modes = require('../native/dpi/modes');

test('every listed mode has flags and a label in both languages', () => {
  for (const mode of modes.list()) {
    assert.ok(modes.flags(mode.id), `${mode.id} has flags`);
    assert.ok(mode.label.tr, `${mode.id} has a Turkish label`);
    assert.ok(mode.label.en, `${mode.id} has an English label`);
  }
});

test('a mode that redirects DNS is marked, so the DNS page is not left lying', () => {
  // While --dns-addr is in force the machine's own resolver is bypassed. The
  // interface has to say so; the DNS page would otherwise show a server that
  // is no longer answering the queries.
  assert.equal(modes.redirectsDns('tr_a3'), true);
  assert.equal(modes.redirectsDns('tr'), true);
  assert.equal(modes.redirectsDns('tr_a1'), false);
  assert.equal(modes.redirectsDns('9'), false);
  assert.equal(modes.redirectsDns('sni'), false);
});

test('every DNS-redirecting mode names both an address and a port', () => {
  for (const mode of modes.list().filter(item => item.redirectsDns)) {
    const flags = modes.flags(mode.id);
    assert.ok(flags.includes('--dns-port'), `${mode.id} sets a port`);
    assert.ok(flags.includes('--dnsv6-addr'), `${mode.id} covers IPv6 as well`);
    // A redirect to port 53 would be caught by the very hijacking boxes these
    // modes exist to get past.
    assert.notEqual(flags[flags.indexOf('--dns-port') + 1], '53');
  }
});

test('old configuration names still resolve to a real mode', () => {
  assert.equal(modes.resolve('modern'), '9');
  assert.equal(modes.resolve('legacy'), '5');
  assert.deepEqual(modes.flags('modern'), modes.flags('9'));
});

test('an unknown mode has no flags rather than a silent default', () => {
  assert.equal(modes.flags('definitely-not-a-mode'), null);
});
