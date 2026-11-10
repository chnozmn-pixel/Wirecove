// Live per-process UDP activity, read from a long-running Python collector.
//
// The shape is the same as traffic.js - JSON Lines, one object per process per
// measurement, gathered until the sample number changes so a measurement is
// only handed on once it is whole - but the lifecycle is not. The TCP
// collector runs for as long as the application does. This one runs only while
// the user has chosen a mode, and has to be able to stop and start again
// without restarting anything else.
const { spawn, execFileSync } = require('node:child_process');
const readline = require('node:readline');
const { interpreter, scriptPath } = require('./python');

const SCRIPT = 'udp.py';
const RESTART_DELAY = 4000;
const MODES = ['off', 'sockets', 'etw', 'windivert'];

let cache = null;

// Asking the system is the only honest test of whether a mode can run: a trace
// session and a driver handle both depend on this process's token. The answer
// is cached because the token does not change while the application runs.
function check() {
  if (cache) return cache;
  const { command, prefix, fallback } = interpreter();
  const run = (exe, lead) => execFileSync(exe, [...lead, scriptPath(SCRIPT), '--check'],
    { encoding: 'utf8', timeout: 30000, windowsHide: true });
  let output;
  try {
    output = run(command, prefix);
  } catch (error) {
    if (!fallback || !(error.code === 'ENOENT' || error.status === 9009)) {
      cache = unavailable((error.stderr || error.message || '').toString().trim()
        || 'Python could not be run');
      return cache;
    }
    try { output = run(fallback, []); }
    catch (second) {
      cache = unavailable((second.stderr || second.message || '').toString().trim()
        || 'Python could not be run');
      return cache;
    }
  }
  try {
    const parsed = JSON.parse(output);
    cache = parsed && parsed.modes ? parsed : unavailable('Unreadable reply');
  } catch (_) {
    cache = unavailable('Unreadable reply');
  }
  return cache;
}

// Every mode reported as refused for one stated reason, rather than a missing
// table the interface would have to guess the meaning of.
function unavailable(reason) {
  const modes = {};
  for (const mode of MODES) {
    modes[mode] = mode === 'off'
      ? { supported: true, reasonKey: null, reason: null, bytes: false, peers: false, elevation: false }
      : { supported: false, reasonKey: 'python', reason, bytes: mode !== 'sockets',
          peers: mode !== 'sockets', elevation: mode !== 'sockets' };
  }
  return { modes };
}

class Collector {
  constructor(interval = 1) {
    this.interval = interval;
    this.mode = 'off';
    this.child = null;
    this.listeners = [];
    this.pending = [];
    this.sample = null;
    this.lastError = null;
    this.restart = null;
  }

  onSample(listener) {
    this.listeners.push(listener);
  }

  emit(rows) {
    // The summary line carries what the sample knows about itself - bytes with
    // no owner, events not parsed - and is spread over the measurement rather
    // than left among the rows, where the interface would have to filter it
    // out of every list it draws.
    const summary = rows.find(row => row.kind === 'summary') || {};
    const measurement = {
      ...summary,
      kind: undefined,
      mode: this.mode,
      processes: rows.filter(row => row.kind === 'process'),
      endpoints: rows.filter(row => row.kind === 'endpoint')
    };
    for (const listener of this.listeners) {
      try { listener(measurement); } catch (_) { /* a listener must not stop the stream */ }
    }
  }

  // Switching mode stops whatever was running first. Two collectors must never
  // overlap: both would be counting the same datagrams, and the figures would
  // be doubled rather than merely wrong.
  setMode(mode) {
    if (!MODES.includes(mode)) throw new Error(`No such UDP mode: ${mode}`);
    if (mode === this.mode) return;
    this.stopChild();
    this.mode = mode;
    this.lastError = null;
    if (mode !== 'off') this.start();
  }

  start() {
    if (this.child || this.mode === 'off') return;
    const { command, prefix, fallback } = interpreter();
    this.spawn(command, prefix, fallback);
  }

  spawn(exe, lead, fallback) {
    const mode = this.mode;
    let child;
    try {
      child = spawn(exe, [...lead, scriptPath(SCRIPT), '--mode', mode,
                          '--samples', '0', '--interval', String(this.interval)],
        { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (error) {
      this.lastError = error.message;
      return;
    }
    this.child = child;
    let stderr = '';
    child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-2000); });
    child.on('error', error => {
      this.child = null;
      if (fallback && (error.code === 'ENOENT' || error.errno === -4058)) {
        return this.spawn(fallback, [], null);
      }
      this.lastError = error.message;
      this.scheduleRestart();
    });
    child.on('exit', code => {
      this.child = null;
      this.sample = null;
      this.pending = [];
      // A mode the user has since switched away from is not restarted, and a
      // mode that exited because it was refused is not retried for ever: the
      // reason is kept so the interface can say the measurement stopped.
      if (this.mode === mode && this.mode !== 'off') {
        this.lastError = stderr.trim() || `UDP collector stopped (${code})`;
        this.scheduleRestart();
      }
    });
    readline.createInterface({ input: child.stdout }).on('line', line => {
      let row;
      try { row = JSON.parse(line); } catch (_) { return; }
      if (this.sample !== null && row.sample !== this.sample) {
        this.emit(this.pending);
        this.pending = [];
      }
      this.sample = row.sample;
      this.pending.push(row);
    });
  }

  scheduleRestart() {
    if (this.mode === 'off' || this.restart) return;
    this.restart = setTimeout(() => {
      this.restart = null;
      this.start();
    }, RESTART_DELAY);
  }

  stopChild() {
    if (this.restart) { clearTimeout(this.restart); this.restart = null; }
    if (this.child) {
      // SIGTERM reaches the Python side as a clean stop, which is what closes
      // the trace session or the driver handle. Killing it outright would
      // leave a real-time session running for nobody.
      try { this.child.kill(); } catch (_) { /* already gone */ }
      this.child = null;
    }
    this.sample = null;
    this.pending = [];
  }

  stop() {
    this.mode = 'off';
    this.stopChild();
  }
}

module.exports = { check, Collector, MODES };
