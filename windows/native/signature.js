// Who signed a program, asked of Windows.
//
// This is deliberately all the checking that is done. Sending a hash of the
// person's programs to an outside service would tell that service what is
// installed on this machine; Windows already holds the certificate stores
// needed to answer the same question locally, and that answer is kept.
//
// A signature says who vouches for a file. It does not say the file is safe,
// and nothing here pretends otherwise.
const { runJsonScript } = require('./powershell');

const SCRIPT = 'signature.ps1';
// Windows' own word for a signature that checked out. Everything else is
// reported as it came back rather than being folded into "bad".
const VALID = 'Valid';

function guardPath(value) {
  if (typeof value !== 'string') return null;
  const executable = value.trim();
  // A path carrying a newline or a null byte is not a path; refusing it here
  // means no such value is ever handed to PowerShell.
  if (!executable || /[\r\n\0]/.test(executable)) return null;
  if (executable.length > 32767) return null;
  return executable;
}

async function read(programPath) {
  const executable = guardPath(programPath);
  if (!executable) return null;
  const raw = await runJsonScript(SCRIPT, ['-Path', executable], { timeout: 25000 })
    .catch(() => null);
  if (!raw || !raw.status) return null;
  const status = String(raw.status);
  return {
    status,
    signer: raw.signer ? String(raw.signer) : null,
    // A single boolean for the interface to colour a row with, next to the
    // status word it came from.
    valid: status === VALID
  };
}

module.exports = { read, guardPath, VALID };
