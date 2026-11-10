// Resolves a path this layer hands to another program.
//
// In a packaged build the application lives inside app.asar. Electron serves
// files from the archive transparently to its own process, so `require` and
// `fs` keep working — but a path handed to python.exe, powershell.exe or
// goodbyedpi.exe is only text, and those programs cannot open anything inside
// an archive. The build keeps native/ and vendor/ unpacked beside it
// (`asarUnpack` in package.json); this points at that copy.
//
// Outside a packaged build there is no archive in the path and the argument
// comes back unchanged, so the same code runs from a checkout.
const path = require('node:path');

const PACKED = `app.asar${path.sep}`;
const UNPACKED = `app.asar.unpacked${path.sep}`;

function unpacked(target) {
  // Only the archive itself is rewritten: a path that already points at the
  // unpacked copy must not be rewritten twice.
  if (target.includes(UNPACKED) || !target.includes(PACKED)) return target;
  return target.replace(PACKED, UNPACKED);
}

module.exports = { unpacked };
