#!/usr/bin/env node
// Fetches the Python runtime the packaged application carries with it.
//
// The observation layer reads iphlpapi and the TCP Extended Statistics through
// ctypes, which needs a real interpreter. Asking the person installing
// Wirecove to install Python first would be asking them to do the build's job,
// so a packaged build carries its own: the official embeddable distribution,
// unmodified apart from the path file described below.
//
// It is not committed. Run `npm run fetch:python` once before packaging; the
// result lands in vendor/python/ and is ignored by git.
const { execFileSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const VERSION = '3.14.10';
const BUILDS = {
  x64: {
    url: `https://www.python.org/ftp/python/${VERSION}/python-${VERSION}-embed-amd64.zip`,
    // Published on python.org's release page for 3.14.10 and checked against
    // the downloaded file: a build must not ship an archive nobody verified.
    sha256: '90905e64a840557d8c1bc4f5b74db3d7ee85e3ffb217611cac1c7813acea4159'
  },
  ia32: {
    url: `https://www.python.org/ftp/python/${VERSION}/python-${VERSION}-embed-win32.zip`,
    sha256: null
  }
};

const root = path.join(__dirname, '..');
const vendor = path.join(root, 'vendor');

function digest(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

async function download(url, destination) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);
  fs.writeFileSync(destination, Buffer.from(await response.arrayBuffer()));
}

function expand(archive, destination) {
  fs.rmSync(destination, { recursive: true, force: true });
  execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-Command',
    `Expand-Archive -LiteralPath '${archive}' -DestinationPath '${destination}' -Force`],
    { stdio: 'inherit' });
}

// The embeddable distribution starts from a ._pth file instead of the usual
// path search, and that file replaces sys.path entirely: without it the
// helpers could not import each other, because their own directory would not
// be on the path.
function writePathFile(directory) {
  const marker = fs.readdirSync(directory).find(name => name.endsWith('._pth'));
  if (!marker) throw new Error('No ._pth file in the embeddable distribution');
  const zip = fs.readdirSync(directory).find(name => /^python\d+\.zip$/.test(name));
  fs.writeFileSync(path.join(directory, marker),
    [zip, '.', '..\\..\\native', '', '# Wirecove: the helpers import each other,',
     '# so their directory has to stay on sys.path.', ''].join('\n'));
}

async function main() {
  const wanted = process.argv.slice(2).filter(name => name in BUILDS);
  const targets = wanted.length ? wanted : ['x64'];
  fs.mkdirSync(vendor, { recursive: true });
  for (const target of targets) {
    const build = BUILDS[target];
    const archive = path.join(vendor, `python-${VERSION}-${target}.zip`);
    const directory = path.join(vendor, `python-${target}`);
    if (!fs.existsSync(archive)) {
      process.stdout.write(`Fetching ${build.url}\n`);
      await download(build.url, archive);
    }
    const actual = digest(archive);
    if (build.sha256 && actual !== build.sha256) {
      fs.rmSync(archive, { force: true });
      throw new Error(`${target}: archive digest ${actual} does not match the expected one`);
    }
    if (!build.sha256) process.stdout.write(`${target}: sha256 ${actual}\n`);
    expand(archive, directory);
    writePathFile(directory);
    process.stdout.write(`${target}: ready in ${directory}\n`);
  }
}

main().catch(error => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});
