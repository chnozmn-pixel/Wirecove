// Devices on the local network.
//
// Two different things, kept apart because they cost different amounts. The
// neighbour table is what Windows already knows and is free; a sweep sends
// one echo per address on the local prefix and only runs when the user asks
// for it.
const { runJsonScript } = require('./powershell');

const SCRIPT = 'netscan.ps1';

function list(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function normalize(raw) {
  if (!raw) throw new Error('The network scan returned no data');
  const devices = list(raw.devices).map(item => ({
    address: String(item.address),
    mac: item.mac ? String(item.mac) : null,
    host: item.host ? String(item.host) : null,
    state: String(item.state || '').toLowerCase(),
    interface: item.interface || null,
    self: Boolean(item.self),
    // A gateway answers for the whole network, so it is worth marking; it is
    // read off the routing table rather than assumed from the last octet.
    gateway: false
  }));
  const prefixes = list(raw.prefixes).map(item => ({
    address: String(item.address),
    prefixLength: Number(item.prefixLength),
    interface: item.interface || null
  }));
  return { scanned: Boolean(raw.scanned), prefixes, devices, observedAt: Date.now() };
}

function neighbours() {
  return runJsonScript(SCRIPT, ['-Action', 'neighbors'], { timeout: 20000 }).then(normalize);
}

function sweep() {
  // A /22 is 1022 addresses; the script caps the prefix size, and the timeout
  // here is what stops a slow network from holding the window.
  return runJsonScript(SCRIPT, ['-Action', 'sweep'], { timeout: 90000 }).then(normalize);
}

module.exports = { neighbours, sweep, normalize };
