#!/usr/bin/env node
// Proves the Protect switch does what it claims, against the real firewall.
//
// The switch writes a Windows Firewall rule. Nothing short of writing one and
// reading it back tells us it works, so this does exactly that on a harmless
// target and removes it again, printing what the firewall said at each step.
// It needs administrator rights, which is the point: without them the first
// write is expected to be refused.
const fs = require('node:fs');
const path = require('node:path');
const firewall = require('../native/firewall');

const TARGET = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'notepad.exe');
const output = process.argv[2] || path.join(__dirname, '..', 'firewall-verify.json');

const has = (state, program) =>
  state.blocked.some(entry => entry.program.toLowerCase() === program.toLowerCase());

(async () => {
  const report = { target: TARGET, steps: {} };
  try {
    if (!fs.existsSync(TARGET)) throw new Error(`No such program: ${TARGET}`);
    const before = await firewall.status();
    report.steps.alreadyBlocked = has(before, TARGET);
    if (report.steps.alreadyBlocked) {
      // Something else blocked it; leaving that alone is more important than
      // completing the check.
      throw new Error('notepad.exe is already blocked by a Wirecove rule; not touching it');
    }
    const blocked = await firewall.block(TARGET, 'notepad.exe');
    report.steps.blocked = has(blocked, TARGET);
    report.steps.directions = blocked.blocked
      .find(entry => entry.program.toLowerCase() === TARGET.toLowerCase())?.directions ?? [];

    // Writing it twice must leave one entry, not two: the page offers a
    // switch, and a switch that can be half on is not one.
    const again = await firewall.block(TARGET, 'notepad.exe');
    report.steps.blockIsIdempotent =
      again.blocked.filter(e => e.program.toLowerCase() === TARGET.toLowerCase()).length === 1;

    const cleared = await firewall.unblock(TARGET);
    report.steps.unblocked = !has(cleared, TARGET);
    report.steps.nothingElseTouched =
      cleared.blocked.length === before.blocked.length;
    report.ok = report.steps.blocked && report.steps.unblocked
      && report.steps.blockIsIdempotent && report.steps.nothingElseTouched
      && report.steps.directions.length === 2;
  } catch (error) {
    report.ok = false;
    report.error = error.message;
  }
  fs.writeFileSync(output, JSON.stringify(report, null, 1));
  process.stdout.write(`${JSON.stringify(report)}\n`);
  process.exit(report.ok ? 0 : 1);
})();
