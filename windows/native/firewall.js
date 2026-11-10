// Per-application blocking, written into the firewall Windows already runs.
//
// Reading the rules needs nothing special. Writing one needs administrator
// rights, and that is checked by asking rather than assumed, because it is the
// difference between a switch that works and a switch that lies.
const { runJsonScript } = require('./powershell');

const SCRIPT = 'firewall.ps1';

// ConvertTo-Json turns a one-element array into the element itself.
function list(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function normalize(raw) {
  if (!raw) throw new Error('The firewall returned no data');
  const rules = list(raw.rules).map(rule => ({
    id: rule.id,
    label: rule.label,
    direction: String(rule.direction || '').toLowerCase(),
    enabled: Boolean(rule.enabled),
    program: rule.program || null
  })).filter(rule => rule.program);
  // One blocked application is two rules. The interface shows applications,
  // so they are folded back into one entry per program here.
  const blocked = new Map();
  for (const rule of rules) {
    const key = rule.program.toLowerCase();
    const entry = blocked.get(key) || {
      program: rule.program,
      name: rule.program.split('\\').pop(),
      directions: [], enabled: true
    };
    entry.directions.push(rule.direction);
    entry.enabled = entry.enabled && rule.enabled;
    blocked.set(key, entry);
  }
  return {
    profiles: list(raw.profiles).map(item => ({
      name: String(item.name), enabled: Boolean(item.enabled)
    })),
    blocked: [...blocked.values()].sort((a, b) => a.name.localeCompare(b.name)),
    rules
  };
}

function status() {
  return runJsonScript(SCRIPT, ['-Action', 'status'], { timeout: 20000 }).then(normalize);
}

function guardPath(program) {
  if (typeof program !== 'string' || !program.trim() || program.length > 1024) {
    throw new Error('A program path is required');
  }
  // The path reaches PowerShell as an argument to -File, never as command
  // text, but a value carrying a line break has no business being a path.
  if (/[\r\n\0]/.test(program)) throw new Error('Invalid program path');
  return program;
}

async function block(program, label) {
  const args = ['-Action', 'block', '-Program', guardPath(program)];
  if (label && !/[\r\n\0]/.test(label)) args.push('-Label', String(label).slice(0, 120));
  return runJsonScript(SCRIPT, args, { timeout: 25000 }).then(normalize);
}

async function unblock(program) {
  return runJsonScript(SCRIPT, ['-Action', 'unblock', '-Program', guardPath(program)],
    { timeout: 25000 }).then(normalize);
}

// Whether a rule can actually be written. Writing one needs administrator
// rights; the DPI engine already answers that question for this process, so it
// is asked rather than guessed at a second time.
function available(elevated) {
  if (!elevated) {
    return { supported: false, reasonKey: 'elevation',
             reason: 'Writing a firewall rule needs administrator rights' };
  }
  return { supported: true, reasonKey: null, reason: null };
}

module.exports = { status, block, unblock, available, normalize };
