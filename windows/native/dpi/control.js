// GoodbyeDPI process lifecycle.
//
// One child process at a time. Turning the engine on is a change to how the
// whole machine's traffic is handled, so it is never started implicitly: the
// renderer has to ask for a named mode, and the process is stopped again on
// quit so the machine is never left filtered by a Wirecove that is gone.
const { spawn, spawnSync, execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { unpacked } = require('../unpacked');
const modes = require('./modes');

const BUNDLED = unpacked(path.join(__dirname, 'goodbyedpi'));
const LOG_LINES = 200;

let child = null;
let active = 'off';
let startedAt = null;
let lastError = null;
let log = [];
let runDirectory = null;

// WinDivert ships a 32-bit and a 64-bit driver and no ARM64 driver at all, so
// Wirecove reports arm64 as unsupported instead of starting a process that
// cannot load its driver.
function architecture() {
  if (process.arch === 'arm64') return null;
  const wow = process.env.PROCESSOR_ARCHITEW6432;
  const native = process.env.PROCESSOR_ARCHITECTURE || '';
  const is64 = (wow || native).toUpperCase() === 'AMD64' || process.arch === 'x64';
  return is64 ? 'x86_64' : 'x86';
}

function bundledDirectory() {
  const arch = architecture();
  return arch ? path.join(BUNDLED, arch) : null;
}

function version() {
  try { return fs.readFileSync(path.join(BUNDLED, 'VERSION.txt'), 'utf8').trim(); }
  catch (_) { return null; }
}

// fltmc needs administrator rights, which is exactly what loading a kernel
// driver needs, so its exit status answers the question we are actually
// asking: can this process load WinDivert?
function elevated() {
  const result = spawnSync('fltmc', ['filters'],
    { stdio: 'ignore', timeout: 4000, windowsHide: true });
  return result.status === 0;
}

function available() {
  const directory = bundledDirectory();
  if (!directory) {
    return { supported: false, reasonKey: 'arm64', reason: 'WinDivert has no ARM64 driver' };
  }
  if (!fs.existsSync(path.join(directory, 'goodbyedpi.exe'))) {
    return { supported: false, reasonKey: 'missing', reason: 'GoodbyeDPI is missing from this build' };
  }
  if (!elevated()) {
    return { supported: false, reasonKey: 'elevation',
      reason: 'Administrator rights are required to load the WinDivert driver' };
  }
  return { supported: true, reasonKey: null, reason: null };
}

// WinDivert is registered with Windows by the FULL PATH of its .sys file. In a
// packaged build the bundled copy lives inside app.asar, which cannot be
// executed at all, and any path that changes between launches can leave
// Windows pointing a service registration at a file that no longer exists -
// the driver then fails to load silently while goodbyedpi.exe still looks like
// it is running. Everything is therefore copied once to a fixed directory
// under the user's application data and always run from there.
function stableDirectory(app) {
  const arch = architecture();
  const source = bundledDirectory();
  const target = path.join(app.getPath('userData'), 'goodbyedpi', arch);
  try {
    fs.mkdirSync(target, { recursive: true });
    for (const name of fs.readdirSync(source)) {
      const from = path.join(source, name);
      if (!fs.statSync(from).isFile()) continue;
      const to = path.join(target, name);
      const stale = !fs.existsSync(to) || fs.statSync(to).size !== fs.statSync(from).size;
      if (stale) fs.copyFileSync(from, to);
    }
    return target;
  } catch (_) {
    // Falling back to the bundled directory keeps the feature usable on a
    // development checkout, where that path is already stable.
    return source;
  }
}

function killStray() {
  try {
    execFileSync('taskkill', ['/IM', 'goodbyedpi.exe', '/F'],
      { stdio: 'ignore', timeout: 5000, windowsHide: true });
  } catch (_) { /* nothing was running */ }
}

function status() {
  // The process can exit on its own: driver refused, another DPI or VPN tool
  // holding WinDivert, a crash. That has to surface as an error rather than
  // leaving the interface claiming the engine is on.
  if (child && child.exitCode !== null && active !== 'off') {
    lastError = `GoodbyeDPI exited unexpectedly (code ${child.exitCode}). ${log.slice(-5).join(' | ')}`.trim();
    child = null;
    active = 'off';
    startedAt = null;
  }
  const support = available();
  return {
    engine: 'goodbyedpi',
    version: version(),
    scope: 'global',
    supported: support.supported,
    reason: support.reason,
    reasonKey: support.reasonKey,
    running: Boolean(child && child.exitCode === null),
    mode: active,
    modes: modes.list(),
    redirectsDns: modes.redirectsDns(active),
    pid: child?.pid ?? null,
    startedAt,
    lastError,
    logTail: log.slice(-40)
  };
}

function stop() {
  if (child) {
    try {
      if (child.exitCode === null) {
        // GoodbyeDPI is a console program with no signal handling on Windows;
        // taskkill on the PID is what actually ends it and releases the
        // driver handle.
        execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'],
          { stdio: 'ignore', timeout: 5000, windowsHide: true });
      }
    } catch (_) { /* already gone */ }
    child = null;
  }
  killStray();
  active = 'off';
  startedAt = null;
  return status();
}

function start(app, mode) {
  const flags = modes.flags(mode);
  if (!flags) throw new Error(`Unknown DPI mode: ${mode}`);
  const support = available();
  if (!support.supported) throw new Error(support.reason);
  const resolved = modes.resolve(mode);
  if (child && child.exitCode === null && active === resolved) return status();

  stop();
  runDirectory = stableDirectory(app);
  const executable = path.join(runDirectory, 'goodbyedpi.exe');
  if (!fs.existsSync(executable)) throw new Error(`GoodbyeDPI not found at ${executable}`);

  log = [];
  lastError = null;
  child = spawn(executable, flags, {
    cwd: runDirectory,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  });
  active = resolved;
  startedAt = Date.now();

  const record = chunk => {
    for (const line of String(chunk).split(/\r?\n/)) {
      if (line.trim()) log.push(line.trim());
    }
    if (log.length > LOG_LINES) log = log.slice(-LOG_LINES);
  };
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', record);
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', record);
  child.on('error', error => {
    lastError = error.message;
    child = null;
    active = 'off';
    startedAt = null;
  });

  return status();
}

module.exports = { available, start, stop, status, version, architecture, elevated };
