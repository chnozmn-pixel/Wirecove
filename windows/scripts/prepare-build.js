#!/usr/bin/env node
// Gets a checkout ready to be packaged, and refuses to package one that is not.
//
// Two things a build needs that a checkout does not: the brand mark in the
// place the installer looks for an icon, and the interpreter the observation
// layer runs on. Both are derived rather than committed, so this runs before
// electron-builder and says plainly what is missing.
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const buildDirectory = path.join(root, 'build');
const sharedMark = path.join(root, '..', 'assets', 'wirecove-mark.png');
const icon = path.join(buildDirectory, 'icon.png');

function copyIcon() {
  if (!fs.existsSync(sharedMark)) {
    throw new Error(`The brand mark is missing: ${sharedMark}`);
  }
  // The installer wants at least 256x256; the shared mark is 512x512 and
  // electron-builder converts it. Checking here turns a late, obscure
  // packaging error into an early sentence.
  const header = fs.readFileSync(sharedMark);
  const width = header.readUInt32BE(16), height = header.readUInt32BE(20);
  if (Math.min(width, height) < 256) {
    throw new Error(`The brand mark is ${width}x${height}; the icon needs at least 256x256`);
  }
  fs.mkdirSync(buildDirectory, { recursive: true });
  fs.copyFileSync(sharedMark, icon);
  return `${width}x${height}`;
}

function checkInterpreter() {
  const { bundled } = require('../native/python');
  const executable = bundled();
  if (!executable) {
    throw new Error(
      'No interpreter under vendor/. A packaged build carries its own so that\n' +
      'nobody has to install Python to run Wirecove. Run: npm run fetch:python');
  }
  return executable;
}

// The country table is optional in a way the interpreter is not: without it
// the Countries panel says the build carries no table and everything else
// works. The build therefore reports its absence rather than refusing.
function describeCountries() {
  const file = path.join(__dirname, '..', 'native', 'geo', 'ranges.bin');
  if (!fs.existsSync(file)) return 'absent - the Countries panel will say so (npm run fetch:geo)';
  const size = (fs.statSync(file).size / 1024 / 1024).toFixed(1);
  return file + ' (' + size + ' MB)';
}

try {
  process.stdout.write(`icon:        ${icon} (from a ${copyIcon()} mark)\n`);
  process.stdout.write(`interpreter: ${checkInterpreter()}\n`);
  process.stdout.write('countries:   ' + describeCountries() + '\n');
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
}
