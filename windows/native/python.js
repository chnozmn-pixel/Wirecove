// Python launcher for the Windows app.
//
// An installed build carries its own interpreter under vendor/, so nobody has
// to install Python to run Wirecove. A checkout that has not fetched one falls
// back to the machine's: the `py` launcher resolves the newest install and
// `python` covers PATH-only and Store installs. WIRECOVE_PYTHON names one
// explicitly and wins over both, because an explicit choice is a choice.
const { execFile } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { unpacked } = require('./unpacked');

function bundled() {
  // Resolves in a checkout and in an installed build alike: both keep vendor/
  // beside native/, the second inside app.asar.unpacked.
  const executable = unpacked(path.join(__dirname, '..', 'vendor',
    `python-${process.arch}`, 'python.exe'));
  return fs.existsSync(executable) ? executable : null;
}

function interpreter() {
  const override = process.env.WIRECOVE_PYTHON;
  if (override && fs.existsSync(override)) return { command: override, prefix: [] };
  const carried = bundled();
  if (carried) return { command: carried, prefix: [] };
  return { command: 'py', prefix: ['-3'], fallback: 'python' };
}

// The interpreter is another program: it is handed a path, not a module.
function scriptPath(name) {
  return unpacked(path.join(__dirname, name));
}

// The helpers import each other (connection_history imports connections and
// proc_identity), so the script directory has to stay on sys.path. Every path
// passed here is absolute and inside this application.
function runJson(script, args = [], options = {}) {
  const { command, prefix, fallback } = interpreter();
  const invoke = (exe, lead) => new Promise((resolve, reject) => {
    execFile(exe, [...lead, script, ...args],
      { encoding: 'utf8', timeout: options.timeout ?? 12000,
        maxBuffer: options.maxBuffer ?? 2 * 1024 * 1024, windowsHide: true },
      (error, stdout, stderr) => {
        if (error) {
          error.stderr = stderr;
          return reject(error);
        }
        try { resolve(JSON.parse(stdout)); }
        catch (parseError) { reject(new Error(stderr.trim() || parseError.message)); }
      });
  });
  return invoke(command, prefix).catch(error => {
    // 9009 is cmd's "not recognized"; both mean the launcher is absent.
    if (fallback && (error.code === 'ENOENT' || error.code === 9009)) return invoke(fallback, []);
    throw new Error(error.stderr?.trim() || error.message);
  });
}

module.exports = { bundled, interpreter, runJson, scriptPath };
