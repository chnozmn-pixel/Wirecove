// Live per-process throughput, read from a long-running Python collector.
//
// The collector streams JSON Lines, one object per process per measurement,
// each carrying the sample number it belongs to. Rows are gathered until the
// number changes, so a measurement is only handed on once it is whole.
const { spawn, execFileSync } = require('node:child_process');
const readline = require('node:readline');
const { interpreter, scriptPath } = require('./python');

const SCRIPT = 'throughput.py';
const RESTART_DELAY = 4000;

// Asking the kernel is the only honest test of whether byte collection can be
// switched on: the answer depends on this process's token. It runs before the
// window opens so no rate control is ever drawn for a machine that has none.
function check() {
  const { command, prefix, fallback } = interpreter();
  const run = (exe, lead) => execFileSync(exe, [...lead, scriptPath(SCRIPT), '--check'],
    { encoding: 'utf8', timeout: 15000, windowsHide: true });
  let output;
  try {
    output = run(command, prefix);
  } catch (error) {
    if (!fallback || !(error.code === 'ENOENT' || error.status === 9009)) {
      return { supported: false, reasonKey: 'python',
               reason: (error.stderr || error.message || '').toString().trim()
                 || 'Python could not be run' };
    }
    try { output = run(fallback, []); }
    catch (second) {
      return { supported: false, reasonKey: 'python',
               reason: (second.stderr || second.message || '').toString().trim()
                 || 'Python could not be run' };
    }
  }
  try { return JSON.parse(output); }
  catch (_) { return { supported: false, reasonKey: 'python', reason: 'Unreadable reply' }; }
}

class Collector {
  constructor(interval = 1) {
    this.interval = interval;
    this.child = null;
    this.stopped = false;
    this.listeners = [];
    this.pending = [];
    this.sample = null;
    this.lastError = null;
    this.restart = null;
  }

  onSample(listener) {
    this.listeners.push(listener);
  }

  // One measurement reaches the interface as one object with both of its
  // views, so the per-application table and the host, service, country and
  // LAN/WAN breakdowns can never be drawn from different moments.
  emit(rows) {
    const measurement = {
      processes: rows.filter(row => row.kind !== 'endpoint'),
      endpoints: rows.filter(row => row.kind === 'endpoint')
    };
    for (const listener of this.listeners) {
      try { listener(measurement); } catch (_) { /* a listener must not stop the stream */ }
    }
  }

  start() {
    if (this.child || this.stopped) return;
    const { command, prefix, fallback } = interpreter();
    this.spawn(command, prefix, fallback);
  }

  spawn(exe, lead, fallback) {
    let child;
    try {
      child = spawn(exe, [...lead, scriptPath(SCRIPT), '--samples', '0',
                          '--interval', String(this.interval)],
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
      // 9009 is cmd's "not recognized"; both mean the `py` launcher is absent.
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
      if (!this.stopped) {
        this.lastError = stderr.trim() || `Collector stopped (${code})`;
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
    if (this.stopped || this.restart) return;
    this.restart = setTimeout(() => {
      this.restart = null;
      this.start();
    }, RESTART_DELAY);
  }

  stop() {
    this.stopped = true;
    if (this.restart) { clearTimeout(this.restart); this.restart = null; }
    if (this.child) {
      try { this.child.kill(); } catch (_) { /* already gone */ }
      this.child = null;
    }
  }
}

module.exports = { check, Collector };
