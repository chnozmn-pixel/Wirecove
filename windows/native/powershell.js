// Shared PowerShell runner for the Windows backend.
//
// Every observation script lives in its own .ps1 file next to this one and is
// run with -File: a script file keeps the quoting readable and means no
// command text is ever assembled from values read off the system.
const { execFile } = require('node:child_process');
const path = require('node:path');
const { unpacked } = require('./unpacked');

function runScript(name, args = [], options = {}) {
  const script = unpacked(path.join(__dirname, name));
  return new Promise((resolve, reject) => {
    execFile('powershell', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
      '-File', script, ...args],
      { encoding: 'utf8', timeout: options.timeout ?? 15000,
        maxBuffer: options.maxBuffer ?? 8 * 1024 * 1024, windowsHide: true },
      (error, stdout, stderr) => {
        if (error) return reject(new Error(stderr.trim() || error.message));
        resolve(stdout);
      });
  });
}

async function runJsonScript(name, args = [], options = {}) {
  const output = (await runScript(name, args, options)).trim();
  if (!output) return null;
  try { return JSON.parse(output); }
  catch (error) { throw new Error(`${name} returned unreadable output: ${error.message}`); }
}

module.exports = { runScript, runJsonScript };
