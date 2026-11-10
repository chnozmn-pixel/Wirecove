const test = require('node:test');
const assert = require('node:assert/strict');
const { parseDns, parseProxy } = require('../native/macos/dns');

test('uses the unscoped default resolver and keeps IPv6 and scoped details', () => {
  const output = `DNS configuration
resolver #1
  nameserver[0] : 192.168.1.1
  nameserver[1] : 2001:db8::53
  flags    : Request A records
resolver #2
  domain   : corp.example
  nameserver[0] : 10.0.0.2
DNS configuration (for scoped queries)
resolver #1
  nameserver[0] : 172.16.0.1
  if_index : 6 (en0)
`;
  const result = parseDns(output);
  assert.deepEqual(result.servers, ['192.168.1.1', '2001:db8::53']);
  assert.equal(result.resolvers[1].domain, 'corp.example');
  assert.equal(result.resolvers[2].interface, 'en0');
  assert.equal(result.resolvers[2].scoped, true);
});

test('recognizes system proxy modes without treating absent keys as enabled', () => {
  assert.equal(parseProxy('<dictionary> {\n  FTPPassive : 1\n}').active, false);
  const proxy = parseProxy('  HTTPEnable : 0\n  HTTPSEnable : 1\n  ProxyAutoConfigEnable : 0');
  assert.equal(proxy.active, true);
  assert.equal(proxy.enabled.HTTPS, true);
  assert.equal(proxy.enabled.HTTP, false);
});
