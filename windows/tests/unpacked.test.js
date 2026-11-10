const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { unpacked } = require('../native/unpacked');

const resources = path.join('C:', 'Program Files', 'Wirecove', 'resources');

test('a path inside the archive is answered with the unpacked copy', () => {
  // python.exe is handed this path as text and cannot open an archive, so a
  // build that returned the app.asar path would fail only once installed.
  assert.strictEqual(
    unpacked(path.join(resources, 'app.asar', 'native', 'throughput.py')),
    path.join(resources, 'app.asar.unpacked', 'native', 'throughput.py'));
});

test('a path that is already unpacked is left alone', () => {
  const target = path.join(resources, 'app.asar.unpacked', 'vendor', 'python-x64', 'python.exe');
  assert.strictEqual(unpacked(target), target);
});

test('a checkout has no archive in the path and is unchanged', () => {
  const target = path.join('C:', 'src', 'Wirecove', 'windows', 'native', 'connections.py');
  assert.strictEqual(unpacked(target), target);
});

test('only the archive segment is rewritten, not a lookalike name', () => {
  // A folder merely called app.asarbackup is not the archive.
  const target = path.join('C:', 'keep', 'app.asarbackup', 'native', 'x.py');
  assert.strictEqual(unpacked(target), target);
});
