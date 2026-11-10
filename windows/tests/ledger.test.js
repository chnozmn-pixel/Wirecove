const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Ledger, dayKey } = require('../native/ledger');
const signature = require('../native/signature');

function temporary() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'wirecove-ledger-'));
  return path.join(directory, 'ledger.json');
}

const DAY = 86400000;
// A fixed moment, so "today" and "this month" mean the same thing on every
// machine this runs on. Noon, so a timezone cannot move the date.
const NOON = new Date(2026, 2, 15, 12, 0, 0).getTime();

test('bytes banked twice on the same day add up rather than replace', () => {
  const ledger = new Ledger(temporary());
  ledger.addUsage([{ key: 'c:\\app.exe', in: 100, out: 40, name: 'app.exe' }], NOON);
  ledger.addUsage([{ key: 'c:\\app.exe', in: 60, out: 10, name: 'app.exe' }], NOON);
  const report = ledger.report(NOON);
  assert.strictEqual(report.totals.today.in, 160);
  assert.strictEqual(report.totals.today.out, 50);
  assert.strictEqual(report.programs.length, 1);
  assert.strictEqual(report.programs[0].today.in, 160);
});

test('yesterday stays in the month total and out of today', () => {
  const ledger = new Ledger(temporary());
  ledger.addUsage([{ key: 'c:\\app.exe', in: 500, out: 0, name: 'app.exe' }], NOON - DAY);
  ledger.addUsage([{ key: 'c:\\app.exe', in: 7, out: 0, name: 'app.exe' }], NOON);
  const report = ledger.report(NOON);
  assert.strictEqual(report.totals.today.in, 7);
  assert.strictEqual(report.totals.month.in, 507);
  assert.strictEqual(report.totals.all.in, 507);
  assert.strictEqual(report.programs[0].total.in, 507);
});

test('a day older than the retention window is dropped', () => {
  const ledger = new Ledger(temporary());
  ledger.addUsage([{ key: 'c:\\old.exe', in: 1, out: 1, name: 'old.exe' }], NOON - 400 * DAY);
  ledger.addUsage([{ key: 'c:\\new.exe', in: 2, out: 2, name: 'new.exe' }], NOON);
  const report = ledger.report(NOON);
  assert.strictEqual(report.days.length, 1);
  assert.strictEqual(report.days[0].day, dayKey(NOON));
});

test('nothing is banked for a difference of zero', () => {
  const ledger = new Ledger(temporary());
  ledger.addUsage([{ key: 'c:\\idle.exe', in: 0, out: 0, name: 'idle.exe' }], NOON);
  assert.deepStrictEqual(ledger.report(NOON).programs, []);
});

test('what was banked survives being written and read back', () => {
  const file = temporary();
  new Ledger(file)
    .addUsage([{ key: 'c:\\app.exe', in: 11, out: 22, name: 'app.exe' }], NOON)
    .save();
  const report = new Ledger(file).load().report(NOON);
  assert.strictEqual(report.totals.today.in, 11);
  assert.strictEqual(report.totals.today.out, 22);
});

test('an unreadable file leaves an empty record rather than throwing', () => {
  const file = temporary();
  fs.writeFileSync(file, 'this is not json');
  const report = new Ledger(file).load().report(NOON);
  assert.deepStrictEqual(report.days, []);
});

test('the first pass records programs without reporting them', () => {
  // On a fresh install every program already running would otherwise be
  // announced as new, which is noise rather than information.
  const ledger = new Ledger(temporary());
  const events = ledger.notePrograms([
    { path: 'C:\\A\\one.exe', name: 'one.exe', size: 10, modified: 1 },
    { path: 'C:\\A\\two.exe', name: 'two.exe', size: 20, modified: 2 }
  ], NOON);
  assert.deepStrictEqual(events, []);
  assert.ok(ledger.program('c:\\a\\one.exe'));
});

test('a program seen after the baseline is reported once', () => {
  const ledger = new Ledger(temporary());
  ledger.notePrograms([{ path: 'C:\\A\\one.exe', name: 'one.exe', size: 10, modified: 1 }], NOON);
  const first = ledger.notePrograms(
    [{ path: 'C:\\A\\new.exe', name: 'new.exe', size: 5, modified: 3 }], NOON);
  assert.strictEqual(first.length, 1);
  assert.strictEqual(first[0].kind, 'first-connection');
  assert.strictEqual(first[0].path, 'C:\\A\\new.exe');
  const again = ledger.notePrograms(
    [{ path: 'C:\\A\\new.exe', name: 'new.exe', size: 5, modified: 3 }], NOON);
  assert.deepStrictEqual(again, []);
});

test('a changed file is reported, and says what changed about it', () => {
  const ledger = new Ledger(temporary());
  ledger.notePrograms([{ path: 'C:\\A\\one.exe', name: 'one.exe', size: 10, modified: 1,
    signature: 'Valid', signer: 'Example Ltd' }], NOON);
  const events = ledger.notePrograms([{ path: 'C:\\A\\one.exe', name: 'one.exe',
    size: 99, modified: 1, signature: 'Valid', signer: 'Someone Else' }], NOON);
  assert.strictEqual(events.length, 1);
  assert.strictEqual(events[0].kind, 'binary-changed');
  assert.deepStrictEqual(events[0].changed.sort(), ['signer', 'size']);
  assert.strictEqual(events[0].from.size, 10);
  assert.strictEqual(events[0].to.size, 99);
});

test('the first time a program was seen is not overwritten by seeing it again', () => {
  const ledger = new Ledger(temporary());
  ledger.notePrograms([{ path: 'C:\\A\\seed.exe', name: 'seed.exe' }], NOON - 30 * DAY);
  ledger.notePrograms([{ path: 'C:\\A\\one.exe', name: 'one.exe', size: 1, modified: 1 }],
    NOON - 10 * DAY);
  ledger.notePrograms([{ path: 'C:\\A\\one.exe', name: 'one.exe', size: 1, modified: 1 }], NOON);
  assert.strictEqual(ledger.program('C:\\A\\one.exe').firstSeen, NOON - 10 * DAY);
  assert.strictEqual(ledger.program('C:\\A\\one.exe').lastSeen, NOON);
});

test('a program with no path keeps its own row rather than being dropped', () => {
  // A process whose executable cannot be read still moved bytes. The daily
  // total has to stay true even where the file behind it is unknown.
  const ledger = new Ledger(temporary());
  ledger.addUsage([{ key: 'name:mystery.exe', in: 9, out: 1, name: 'mystery.exe' }], NOON);
  const report = ledger.report(NOON);
  assert.strictEqual(report.totals.today.in, 9);
  assert.strictEqual(report.programs[0].path, null);
  assert.strictEqual(report.programs[0].name, 'mystery.exe');
});

test('the per-program rows add up to the daily totals', () => {
  const ledger = new Ledger(temporary());
  ledger.addUsage([
    { key: 'c:\\a.exe', in: 10, out: 1, name: 'a' },
    { key: 'c:\\b.exe', in: 20, out: 2, name: 'b' },
    { key: 'name:c', in: 30, out: 3, name: 'c' }
  ], NOON);
  const report = ledger.report(NOON);
  const summed = report.programs.reduce((total, item) => total + item.today.in + item.today.out, 0);
  assert.strictEqual(summed, report.totals.today.in + report.totals.today.out);
});

test('a path that is not one is refused before it reaches PowerShell', () => {
  assert.strictEqual(signature.guardPath(''), null);
  assert.strictEqual(signature.guardPath('C:\\a.exe\r\nStop-Process'), null);
  assert.strictEqual(signature.guardPath(42), null);
  assert.strictEqual(signature.guardPath('  C:\\a.exe  '), 'C:\\a.exe');
});
