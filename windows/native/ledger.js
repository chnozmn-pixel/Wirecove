// Wirecove's own record of what it has already seen.
//
// Two things are kept: how many bytes each program moved on each day, and
// what the program's file on disk looked like the first time it was seen
// going out. Both live in one JSON file in the application's data folder.
//
// Not a database, on purpose. What is stored is small - one line per program
// per day - and a plain file is one its owner can open in a text editor and
// read for themselves. Nothing here is sent anywhere.
const fs = require('node:fs');
const path = require('node:path');

const VERSION = 1;
const USAGE_DAYS = 90;
const MAX_EVENTS = 300;

function blank() {
  return { version: VERSION, seeded: false, usage: {}, programs: {}, events: [], settings: {} };
}

// The local day, not UTC: "today" has to mean the day the person is having.
// The text form sorts the same way the dates do, which is what the trimming
// and the month grouping below rely on.
function dayKey(when) {
  const date = new Date(when);
  const pad = value => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function sum(rows) {
  return rows.reduce((total, row) => ({ in: total.in + row.in, out: total.out + row.out }),
    { in: 0, out: 0 });
}

class Ledger {
  constructor(file) {
    this.file = file;
    this.data = blank();
    this.loaded = false;
  }

  load() {
    if (this.loaded) return this;
    this.loaded = true;
    try {
      const parsed = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      // A file written by a version this build does not understand is left
      // where it is and started again rather than half-read: a total that is
      // wrong is worse than a total that is missing.
      if (parsed && parsed.version === VERSION) this.data = Object.assign(blank(), parsed);
    } catch (_) { /* nothing recorded yet, or unreadable: start empty */ }
    return this;
  }

  save() {
    this.load();
    const temporary = `${this.file}.writing`;
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(temporary, JSON.stringify(this.data));
      // Written beside the real file and moved into place, so a crash
      // half-way through cannot leave a record that parses to nonsense.
      fs.renameSync(temporary, this.file);
      return true;
    } catch (_) {
      try { fs.unlinkSync(temporary); } catch (_) { /* nothing to clean up */ }
      return false;
    }
  }

  // `entries` are differences, not totals: how much moved since the last
  // time, already attributed to a program.
  addUsage(entries, when = Date.now()) {
    this.load();
    const day = dayKey(when);
    const table = this.data.usage[day] || (this.data.usage[day] = {});
    for (const entry of entries || []) {
      if (!entry || !entry.key) continue;
      const incoming = Math.max(0, Math.round(entry.in || 0));
      const outgoing = Math.max(0, Math.round(entry.out || 0));
      if (!incoming && !outgoing) continue;
      const row = table[entry.key]
        || (table[entry.key] = { in: 0, out: 0, name: entry.name || entry.key });
      row.in += incoming;
      row.out += outgoing;
      if (entry.name) row.name = entry.name;
    }
    this.trim(when);
    return this;
  }

  trim(when = Date.now()) {
    const cutoff = dayKey(when - USAGE_DAYS * 86400000);
    for (const day of Object.keys(this.data.usage)) {
      if (day < cutoff) delete this.data.usage[day];
    }
    if (this.data.events.length > MAX_EVENTS) {
      this.data.events = this.data.events.slice(-MAX_EVENTS);
    }
  }

  program(programPath) {
    this.load();
    const key = String(programPath).toLowerCase();
    return Object.prototype.hasOwnProperty.call(this.data.programs, key)
      ? this.data.programs[key] : null;
  }

  // What is new and what has changed.
  //
  // A program is remembered by the path it runs from. "Changed" means the
  // file at that path is no longer the file that was seen going out before:
  // a different size, a different write time, or a different signer. That is
  // a fact about the file, not a judgement about it.
  notePrograms(entries, when = Date.now()) {
    this.load();
    // On a fresh install every program already running would otherwise be
    // reported as connecting for the first time. Fifty alerts at once are
    // noise, not information, so the first pass only writes the baseline.
    const seeding = !this.data.seeded;
    const events = [];
    for (const entry of entries || []) {
      if (!entry || !entry.path) continue;
      const key = String(entry.path).toLowerCase();
      const known = this.data.programs[key] || null;
      const record = {
        path: entry.path,
        name: entry.name || (known && known.name) || null,
        size: entry.size ?? null,
        modified: entry.modified ?? null,
        signature: entry.signature ?? null,
        signer: entry.signer ?? null,
        firstSeen: known ? known.firstSeen : when,
        lastSeen: when
      };
      if (!known) {
        if (!seeding) {
          events.push({ kind: 'first-connection', path: record.path, name: record.name,
            signature: record.signature, signer: record.signer, at: when });
        }
      } else {
        const changed = [];
        if (known.size != null && record.size != null && known.size !== record.size) {
          changed.push('size');
        }
        if (known.modified != null && record.modified != null
            && known.modified !== record.modified) {
          changed.push('modified');
        }
        if (known.signer && record.signer && known.signer !== record.signer) {
          changed.push('signer');
        }
        if (changed.length) {
          events.push({ kind: 'binary-changed', path: record.path, name: record.name,
            changed, at: when,
            from: { size: known.size, modified: known.modified, signer: known.signer },
            to: { size: record.size, modified: record.modified, signer: record.signer } });
        }
      }
      this.data.programs[key] = record;
    }
    this.data.seeded = true;
    if (events.length) this.data.events.push(...events);
    this.trim(when);
    return events;
  }

  clearEvents() {
    this.load();
    this.data.events = [];
    return this;
  }

  setting(name, value) {
    this.load();
    if (value === undefined) return this.data.settings[name];
    this.data.settings[name] = value;
    return value;
  }

  report(when = Date.now()) {
    this.load();
    const today = dayKey(when);
    const month = today.slice(0, 7);
    const days = [];
    const programs = new Map();
    for (const [day, table] of Object.entries(this.data.usage)) {
      let incoming = 0;
      let outgoing = 0;
      for (const [key, row] of Object.entries(table)) {
        incoming += row.in;
        outgoing += row.out;
        const item = programs.get(key) || {
          key, name: row.name || key, path: key.startsWith('name:') ? null : key,
          today: { in: 0, out: 0 }, month: { in: 0, out: 0 }, total: { in: 0, out: 0 }
        };
        if (row.name) item.name = row.name;
        item.total.in += row.in;
        item.total.out += row.out;
        if (day === today) { item.today.in += row.in; item.today.out += row.out; }
        if (day.startsWith(month)) { item.month.in += row.in; item.month.out += row.out; }
        programs.set(key, item);
      }
      days.push({ day, in: incoming, out: outgoing });
    }
    days.sort((a, b) => (a.day < b.day ? -1 : 1));
    const known = this.data.programs;
    for (const item of programs.values()) {
      const record = item.path ? known[item.path] : null;
      item.signature = record ? record.signature : null;
      item.signer = record ? record.signer : null;
      item.firstSeen = record ? record.firstSeen : null;
    }
    return {
      today, month, days,
      retentionDays: USAGE_DAYS,
      totals: {
        today: sum(days.filter(day => day.day === today)),
        month: sum(days.filter(day => day.day.startsWith(month))),
        all: sum(days)
      },
      programs: [...programs.values()]
        .sort((a, b) => (b.month.in + b.month.out) - (a.month.in + a.month.out)),
      events: [...this.data.events].reverse(),
      settings: { ...this.data.settings }
    };
  }
}

module.exports = { Ledger, dayKey, USAGE_DAYS, MAX_EVENTS };
