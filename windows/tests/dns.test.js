const test = require('node:test');
const assert = require('node:assert/strict');
const { normalize } = require('../native/dns');

test('a single resolver survives PowerShell collapsing one-element arrays', () => {
  // ConvertTo-Json turns a one-element array into the element itself; parsing
  // that as a list is what makes a machine with one adapter show nothing.
  const status = normalize({
    servers: '9.9.9.9',
    resolvers: { number: 5, scoped: false, domain: null, interface: 'Ethernet', family: 'IPv4', servers: '9.9.9.9' },
    proxy: { active: false, enabled: {} },
    doh: []
  });
  assert.deepEqual(status.servers, ['9.9.9.9']);
  assert.equal(status.resolvers.length, 1);
  assert.deepEqual(status.resolvers[0].servers, ['9.9.9.9']);
});

test('DoH counts as active only for a server the system is actually using', () => {
  const unused = normalize({
    servers: ['192.168.1.1'],
    resolvers: [{ number: 1, scoped: false, interface: 'Wi-Fi', servers: ['192.168.1.1'] }],
    proxy: { active: false, enabled: {} },
    // Windows ships this table pre-filled; an entry is not evidence that
    // queries are being upgraded.
    doh: [{ server: '1.1.1.1', template: 'https://cloudflare-dns.com/dns-query', autoUpgrade: true }]
  });
  assert.equal(unused.doh.active, false);

  const used = normalize({
    servers: ['1.1.1.1'],
    resolvers: [{ number: 1, scoped: false, interface: 'Wi-Fi', servers: ['1.1.1.1'] }],
    proxy: { active: false, enabled: {} },
    doh: [{ server: '1.1.1.1', template: 'https://cloudflare-dns.com/dns-query', autoUpgrade: true }]
  });
  assert.equal(used.doh.active, true);
});

test('a resolver with no servers is dropped instead of shown empty', () => {
  const status = normalize({
    servers: [],
    resolvers: [{ number: 3, interface: 'Bluetooth', servers: [] }],
    proxy: { active: false, enabled: {} },
    doh: []
  });
  assert.deepEqual(status.resolvers, []);
});

test('proxy details are carried through without being re-interpreted', () => {
  const status = normalize({
    servers: ['1.1.1.1'],
    resolvers: [],
    proxy: {
      active: true,
      enabled: { HTTP: true, HTTPS: true, SOCKS: false, ProxyAutoConfig: false, ProxyAutoDiscovery: false },
      server: 'proxy.example:8080',
      pacUrl: '',
      winhttp: 'Direct access (no proxy server).'
    },
    doh: []
  });
  assert.equal(status.proxy.active, true);
  assert.equal(status.proxy.server, 'proxy.example:8080');
  assert.equal(status.proxy.enabled.SOCKS, false);
});

test('missing data is an error, not an empty but confident report', () => {
  assert.throws(() => normalize(null), /no data/);
});
