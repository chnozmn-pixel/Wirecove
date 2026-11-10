// Windows observation and enforcement layer.
//
// What this layer can and cannot do is published as a capability table. The
// interface only enables a control where its feature reports supported: true,
// and otherwise shows the reason. Nothing here guesses at a number it did not
// measure.
const python = require('./python');
const { readDnsStatus } = require('./dns');
const { runJsonScript } = require('./powershell');
const dpi = require('./dpi/control');
const traffic = require('./traffic');
const udp = require('./udp');
const firewall = require('./firewall');
const netscan = require('./netscan');
const signature = require('./signature');
const ledger = require('./ledger');

let installedCache = null;
let trafficCache = null;
let processPaths = new Map();
let processPathsAt = 0;

function trafficState() {
  // Checked once, before the window opens: the answer depends on this
  // process's token, which does not change while it runs.
  if (!trafficCache) trafficCache = traffic.check();
  return trafficCache;
}

function capabilities() {
  const engine = dpi.available();
  const rates = trafficState();
  const elevated = dpi.elevated();
  const countries = rates.countries
    || { supported: false, reasonKey: 'missing', reason: null };
  return {
    // Per-process bytes come from TCP Extended Statistics, which the kernel
    // only collects for a caller with administrator rights.
    traffic: {
      supported: rates.supported, reason: rates.reason, reasonKey: rates.reasonKey,
      source: 'tcp-estats', note: 'tcp-payload'
    },
    // Windows' UDP tables carry a local endpoint and an owning PID but no
    // remote address, so there is no peer to record and UDP rows are skipped.
    connections: { supported: true, reason: null, note: 'tcp-only' },
    // UDP has no per-connection counter to read, so there is no single answer
    // here - only routes that cost different things. The table says which of
    // them this machine will allow; which one to use is the user's choice, and
    // 'off' is always one of them.
    udp: {
      supported: true, reason: null, note: 'user-chosen',
      modes: udp.check().modes
    },
    icons: { supported: true, reason: null },
    dns: { supported: true, reason: null },
    diagnose: { supported: true, reason: null },
    inventory: { supported: true, reason: null },
    dpi: {
      supported: engine.supported,
      reason: engine.reason,
      reasonKey: engine.reasonKey,
      // WinDivert filters at the network layer: a mode applies to the whole
      // machine and cannot be limited to one site or one application.
      scope: 'global',
      engine: 'goodbyedpi',
      version: dpi.version()
    },
    // The host, service and LAN/WAN breakdowns are the same measurement as
    // the per-application rates, read a different way, so they live or die
    // with it. The country column needs a table built at packaging time.
    hosts: { supported: rates.supported, reasonKey: rates.reasonKey, reason: rates.reason },
    services: {
      supported: rates.supported, reasonKey: rates.reasonKey, reason: rates.reason,
      note: 'port-convention'
    },
    countries: {
      supported: Boolean(rates.supported && countries.supported),
      reasonKey: rates.supported ? countries.reasonKey : rates.reasonKey,
      reason: rates.supported ? countries.reason : rates.reason,
      generated: countries.generated || null,
      note: 'registry-delegation'
    },
    // Blocking writes an ordinary Windows Firewall rule, which needs
    // administrator rights. Reading the rules does not.
    firewall: Object.assign(firewall.available(elevated), { readable: true }),
    scanner: { supported: true, reason: null, note: 'arp-and-echo' },
    // Daily and monthly figures are the same per-process measurement, banked
    // to a file as it is taken. Without the byte counters there is nothing to
    // bank, so this cannot outlive that limitation.
    usage: {
      supported: rates.supported, reasonKey: rates.reasonKey, reason: rates.reason,
      retentionDays: ledger.USAGE_DAYS, note: 'daily-ledger'
    },
    // Alerts are after the fact: a program is reported once it has already
    // connected, because nothing here holds a packet back to ask first.
    alerts: {
      supported: rates.supported, reasonKey: rates.reasonKey, reason: rates.reason,
      note: 'after-the-fact'
    },
    // Who signed a program, checked against this machine's own certificate
    // stores. No hash leaves the machine, and no reputation service is asked.
    signatures: { supported: true, reason: null, note: 'authenticode-local' },
    autostart: { supported: true, reason: null, note: 'login-item' }
  };
}

async function refreshProcessPaths() {
  if (Date.now() - processPathsAt < 5000) return processPaths;
  const rows = await runJsonScript('process-paths.ps1', [], { timeout: 8000 }).catch(() => null);
  if (rows) {
    const list = Array.isArray(rows) ? rows : [rows];
    processPaths = new Map(list.map(item => [item.pid, item.path]));
    processPathsAt = Date.now();
  }
  return processPaths;
}

async function iconForPath(executable) {
  try {
    const { app } = require('electron');
    const icon = await app.getFileIcon(executable, { size: 'normal' });
    if (!icon || icon.isEmpty()) return null;
    return icon.resize({ width: 32, height: 32 }).toDataURL();
  } catch (_) { return null; }
}

async function iconForPid(pid) {
  return pathForPid(pid).then(executable => executable ? iconForPath(executable) : null);
}

// Blocking an application means writing a rule about a file on disk, so the
// interface has to be able to turn the process it is showing into that file.
// A PID whose path cannot be read answers null and the control stays off
// rather than blocking whatever else holds that PID.
async function pathForPid(pid) {
  const paths = await refreshProcessPaths();
  return paths.get(pid) || null;
}

async function installedApps() {
  if (installedCache) return installedCache;
  const rows = await runJsonScript('installed-apps.ps1', [], { timeout: 30000 });
  installedCache = (Array.isArray(rows) ? rows : rows ? [rows] : [])
    .map(item => ({ name: String(item.name).trim(), path: item.path }))
    .filter(item => item.name && item.path);
  return installedCache;
}

function historyAction(action, dbPath) {
  return python.runJson(python.scriptPath('connection_history.py'),
    ['--db', dbPath, '--action', action]);
}

function diagnose(target) {
  if (typeof target !== 'string' || target.length > 2048) {
    return Promise.reject(new Error('Invalid target'));
  }
  return python.runJson(python.scriptPath('diagnose.py'), [target], { maxBuffer: 1024 * 1024 });
}

module.exports = {
  capabilities,
  trafficState,
  iconForPid,
  iconForPath,
  pathForPid,
  installedApps,
  readDnsStatus,
  history: {
    snapshot: dbPath => historyAction('sample', dbPath),
    clear: dbPath => historyAction('clear', dbPath)
  },
  diagnose,
  dpi,
  traffic,
  udp,
  firewall,
  netscan,
  signature,
  Ledger: ledger.Ledger
};
