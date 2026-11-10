const test = require('node:test');
const assert = require('node:assert');
const firewall = require('../native/firewall');
const netscan = require('../native/netscan');

test('the two rules that block one application are shown as one entry', () => {
  // Blocking writes an outbound and an inbound rule. The interface is about
  // applications, so a single switch must not appear as two.
  const state = firewall.normalize({
    profiles: [{ name: 'Private', enabled: true }],
    rules: [
      { id: '{1}', label: 'Wirecove: game.exe (Outbound)', direction: 'Outbound',
        enabled: true, program: 'C:\\Games\\game.exe' },
      { id: '{2}', label: 'Wirecove: game.exe (Inbound)', direction: 'Inbound',
        enabled: true, program: 'C:\\Games\\game.exe' }
    ]
  });
  assert.strictEqual(state.blocked.length, 1);
  assert.strictEqual(state.blocked[0].name, 'game.exe');
  assert.deepStrictEqual(state.blocked[0].directions.sort(), ['inbound', 'outbound']);
  assert.strictEqual(state.blocked[0].enabled, true);
});

test('a rule that is switched off is not reported as blocking', () => {
  const state = firewall.normalize({
    profiles: [],
    rules: [
      { id: '{1}', direction: 'Outbound', enabled: true, program: 'C:\\a\\x.exe' },
      { id: '{2}', direction: 'Inbound', enabled: false, program: 'C:\\a\\x.exe' }
    ]
  });
  assert.strictEqual(state.blocked[0].enabled, false);
});

test('PowerShell collapsing a one element list does not lose the rule', () => {
  // ConvertTo-Json writes a single object where a list was asked for.
  const state = firewall.normalize({
    profiles: { name: 'Public', enabled: false },
    rules: { id: '{1}', direction: 'Outbound', enabled: true, program: 'C:\\a\\x.exe' }
  });
  assert.strictEqual(state.profiles.length, 1);
  assert.strictEqual(state.profiles[0].enabled, false);
  assert.strictEqual(state.blocked.length, 1);
});

test('a rule with no program behind it is left out rather than shown blank', () => {
  const state = firewall.normalize({ profiles: [], rules: [{ id: '{1}', program: null }] });
  assert.deepStrictEqual(state.blocked, []);
});

test('blocking without a usable path is refused before PowerShell is reached', async () => {
  await assert.rejects(() => firewall.block(''), /program path is required/);
  await assert.rejects(() => firewall.block('C:\\a\\x.exe\nStop-Process'), /Invalid program path/);
});

test('writing a rule is reported as unavailable without administrator rights', () => {
  assert.strictEqual(firewall.available(false).supported, false);
  assert.strictEqual(firewall.available(false).reasonKey, 'elevation');
  assert.strictEqual(firewall.available(true).supported, true);
});

test('a neighbour entry keeps the name and the address apart', () => {
  const state = netscan.normalize({
    scanned: true,
    prefixes: { address: '192.168.1.10', prefixLength: 24, interface: 'Wi-Fi' },
    devices: { address: '192.168.1.1', mac: '48-22-54-F2-E4-5D', state: 'Reachable',
               interface: 'Wi-Fi', self: false, host: 'router.lan' }
  });
  assert.strictEqual(state.scanned, true);
  assert.strictEqual(state.prefixes.length, 1);
  assert.strictEqual(state.devices[0].host, 'router.lan');
  assert.strictEqual(state.devices[0].state, 'reachable');
});

test('a device with no reverse name carries null, not its own address', () => {
  // The interface falls back to the address itself; a name it invented here
  // would be indistinguishable from one DNS actually returned.
  const state = netscan.normalize({ devices: [{ address: '192.168.1.44', host: null }] });
  assert.strictEqual(state.devices[0].host, null);
});
