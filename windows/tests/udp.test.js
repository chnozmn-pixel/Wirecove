const test = require('node:test');
const assert = require('node:assert');
const { Collector, MODES } = require('../native/udp');

// A collector that never spawns anything: what is under test here is the
// bookkeeping around the child, not Python.
function quiet() {
  const collector = new Collector(1);
  collector.started = 0;
  collector.stopped = 0;
  collector.start = () => { collector.started += 1; };
  const stopChild = collector.stopChild.bind(collector);
  collector.stopChild = () => { collector.stopped += 1; stopChild(); };
  return collector;
}

test('off is one of the modes, and is where a collector starts', () => {
  assert.deepStrictEqual(MODES, ['off', 'sockets', 'etw', 'windivert']);
  assert.strictEqual(quiet().mode, 'off');
});

test('a mode that does not exist is refused rather than treated as off', () => {
  const collector = quiet();
  assert.throws(() => collector.setMode('sniff-everything'), /No such UDP mode/);
  assert.strictEqual(collector.mode, 'off');
  assert.strictEqual(collector.started, 0);
});

test('switching to a mode stops whatever was running first', () => {
  // Two collectors counting at once would both see the same datagrams, so the
  // figures would be doubled rather than merely wrong.
  const collector = quiet();
  collector.setMode('sockets');
  assert.strictEqual(collector.started, 1);
  collector.setMode('etw');
  assert.strictEqual(collector.stopped, 2);
  assert.strictEqual(collector.started, 2);
  assert.strictEqual(collector.mode, 'etw');
});

test('setting the mode that is already running changes nothing', () => {
  const collector = quiet();
  collector.setMode('sockets');
  collector.setMode('sockets');
  assert.strictEqual(collector.started, 1);
});

test('switching off stops the collector and starts nothing', () => {
  const collector = quiet();
  collector.setMode('sockets');
  collector.setMode('off');
  assert.strictEqual(collector.mode, 'off');
  assert.strictEqual(collector.started, 1);
  assert.strictEqual(collector.stopped, 2);
});

test('a measurement is split into its processes and its endpoints', () => {
  const collector = quiet();
  collector.mode = 'etw';
  let seen = null;
  collector.onSample(measurement => { seen = measurement; });
  collector.emit([
    { kind: 'process', pid: 1, bytes_in: 10, bytes_out: 2 },
    { kind: 'endpoint', address: '1.1.1.1', port: 53 },
    { kind: 'process', pid: 2, bytes_in: 0, bytes_out: 5 }
  ]);
  assert.strictEqual(seen.processes.length, 2);
  assert.strictEqual(seen.endpoints.length, 1);
  assert.strictEqual(seen.mode, 'etw');
});

test('what the sample knows about itself is lifted out of the rows', () => {
  // The unattributed total belongs to the measurement, not to any row. Left
  // among the processes it would be drawn as a program; absent altogether the
  // interface could not say the per-application figures are a floor.
  const collector = quiet();
  collector.mode = 'windivert';
  let seen = null;
  collector.onSample(measurement => { seen = measurement; });
  collector.emit([
    { kind: 'process', pid: 1, bytes_in: 10, bytes_out: 2 },
    { kind: 'summary', unattributed_in: 400, unattributed_out: 7, packets: 99 }
  ]);
  assert.strictEqual(seen.processes.length, 1);
  assert.strictEqual(seen.unattributed_in, 400);
  assert.strictEqual(seen.unattributed_out, 7);
  assert.strictEqual(seen.packets, 99);
});

test('a listener that throws does not stop the others', () => {
  const collector = quiet();
  let reached = false;
  collector.onSample(() => { throw new Error('no'); });
  collector.onSample(() => { reached = true; });
  collector.emit([{ kind: 'process', pid: 1 }]);
  assert.ok(reached);
});

test('a stopped collector does not restart itself', () => {
  const collector = quiet();
  collector.setMode('sockets');
  collector.stop();
  collector.scheduleRestart();
  assert.strictEqual(collector.restart, null);
  assert.strictEqual(collector.mode, 'off');
});
