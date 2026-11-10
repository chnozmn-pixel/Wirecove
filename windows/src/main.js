const { app, BrowserWindow, Menu, Tray, nativeImage, session, ipcMain, shell } = require('electron');
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const backend = require('../native');
const modes = require('../native/dpi/modes');

let window;
let tray = null;
let quitting = false;
let language = 'tr';
const iconRequests = new Set();
const iconQueue = [];
let iconWorkers = 0;
let snapshotBusy = false;
let mutation = Promise.resolve();
const capabilities = backend.capabilities();
const collector = new backend.traffic.Collector(1);
const timers = [];

// The record that outlives this run: per-day bytes per program, and what
// each program's file looked like the first time it was seen going out.
let ledger = null;
let alerts = [];
const previousTotals = new Map();   // identity -> [bytes in, bytes out] last seen
const pendingUsage = new Map();     // identity -> bytes moved since the last bank
const pathByPid = new Map();        // pid -> executable path, or null if unreadable
const pathPending = new Set();
const signatures = new Map();       // lowercase path -> signature, asked once
// An autostarted Wirecove has no business taking the screen. It goes
// straight to the notification area and measures from there.
const hiddenStart = process.argv.includes('--hidden') && !process.argv.includes('--smoke');

// Launching again raises the window that is already running. The smoke check
// is exempt: it is a self-contained run that has to be able to start while an
// ordinary window is open.
if (!process.argv.includes('--smoke') && !app.requestSingleInstanceLock()) {
  app.exit(0);
}
app.on('second-instance', () => showWindow());

function send(channel, payload) {
  if (!window?.isDestroyed()) window.webContents.send(channel, payload);
}

// Engine changes are applied one at a time. Two overlapping start/stop calls
// could leave a WinDivert handle open with no process owning it.
function serialize(action) {
  const pending = mutation.then(action);
  mutation = pending.catch(() => {});
  return pending;
}

function queueIcon(key, pid) {
  if (!capabilities.icons.supported || iconRequests.has(key)) return;
  iconRequests.add(key);
  iconQueue.push({ key, pid });
  drainIcons();
}

function drainIcons() {
  while (iconWorkers < 3 && iconQueue.length) {
    const item = iconQueue.shift();
    iconWorkers++;
    backend.iconForPid(item.pid)
      .then(dataUrl => { if (dataUrl) send('app-icon', { key: item.key, dataUrl }); })
      .catch(() => { /* icon unavailable; the renderer keeps its initial */ })
      .finally(() => { iconWorkers--; drainIcons(); });
  }
}

// Closing the window leaves the measurement running, which is the point of a
// traffic monitor: a gap in the record is worse than a window nobody is
// looking at. The tray is how that is made visible - there is always a way
// back to the window and a way to stop the application for good, and the
// first time the window is closed the application says what it just did
// rather than appearing to have quit.
const TRAY_TEXT = {
  tr: { show: 'Göster', quit: 'Çıkış', hidden: 'Wirecove arka planda ölçmeye devam ediyor.',
        hiddenTitle: 'Wirecove kapanmadı', rates: 'Hız ölçümü kapalı',
        firstTitle: 'İlk kez bağlanan uygulama',
        changedTitle: 'Uygulamanın dosyası değişti' },
  en: { show: 'Show', quit: 'Quit', hidden: 'Wirecove keeps measuring in the background.',
        hiddenTitle: 'Wirecove is still running', rates: 'Rate measurement off',
        firstTitle: 'An application connected for the first time',
        changedTitle: 'An application’s file has changed' }
};

function words() { return TRAY_TEXT[language] || TRAY_TEXT.tr; }

function showWindow() {
  if (!window || window.isDestroyed()) return createWindow();
  if (window.isMinimized()) window.restore();
  window.show();
  window.focus();
}

function buildTrayMenu() {
  if (!tray) return;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: words().show, click: showWindow },
    { type: 'separator' },
    { label: words().quit, click: () => { quitting = true; app.quit(); } }
  ]));
}

function createTray() {
  if (tray) return;
  const file = path.join(__dirname, '..', '..', 'assets', 'wirecove-mark.png');
  const image = nativeImage.createFromPath(file);
  tray = new Tray(image.isEmpty() ? image : image.resize({ width: 16, height: 16 }));
  tray.setToolTip('Wirecove');
  buildTrayMenu();
  tray.on('click', () => {
    if (window && !window.isDestroyed() && window.isVisible() && !window.isMinimized()) {
      window.hide();
    } else {
      showWindow();
    }
  });
}

function rate(value) {
  if (value == null) return '—';
  if (value < 1024) return `${Math.round(value)} B/s`;
  if (value < 1048576) return `${(value / 1024).toFixed(1)} KB/s`;
  return `${(value / 1048576).toFixed(2)} MB/s`;
}

function updateTooltip(measurement) {
  if (!tray || tray.isDestroyed()) return;
  if (!capabilities.traffic.supported) return tray.setToolTip(`Wirecove — ${words().rates}`);
  let incoming = 0, outgoing = 0;
  for (const row of measurement.processes) {
    if (row.state !== 'measured') continue;
    incoming += row.bytes_in_per_second || 0;
    outgoing += row.bytes_out_per_second || 0;
  }
  tray.setToolTip(`Wirecove\n↓ ${rate(incoming)}   ↑ ${rate(outgoing)}`);
}

// --- the lasting record ------------------------------------------------------
// The collector reports each process's cumulative bytes. The difference
// between two samples is what moved in between, and it is banked under the
// file the process runs from, so a figure survives the process that earned
// it: close the program, and what it used is still on today's row.

function resolvePath(pid) {
  if (pathPending.has(pid) || pathByPid.has(pid)) return;
  pathPending.add(pid);
  backend.pathForPid(pid)
    .then(value => pathByPid.set(pid, value || null))
    .catch(() => pathByPid.set(pid, null))
    .finally(() => pathPending.delete(pid));
}

function accumulate(processes) {
  for (const row of processes) {
    const previous = previousTotals.get(row.identity);
    previousTotals.set(row.identity, [row.bytes_in, row.bytes_out]);
    // Only a measured row, and only a pair of readings, is a difference.
    // Anything else would be banking a number nobody counted.
    if (row.state !== 'measured' || !previous) continue;
    if (row.bytes_in < previous[0] || row.bytes_out < previous[1]) continue;
    const incoming = row.bytes_in - previous[0];
    const outgoing = row.bytes_out - previous[1];
    if (!incoming && !outgoing) continue;
    resolvePath(row.pid);
    // Held against the process identity and only turned into a program at
    // banking time: the path lookup is asynchronous, and splitting one
    // program across two rows while it arrived would be a bookkeeping bug
    // that looked like two programs.
    const bucket = pendingUsage.get(row.identity)
      || { pid: row.pid, name: row.process, in: 0, out: 0 };
    bucket.in += incoming;
    bucket.out += outgoing;
    bucket.name = row.process;
    pendingUsage.set(row.identity, bucket);
  }
}

function programKey(bucket) {
  const executable = pathByPid.get(bucket.pid);
  if (executable) return { key: executable.toLowerCase(), path: executable };
  // A process whose path cannot be read still moved bytes, so it is banked
  // under its name rather than dropped. The daily total stays true; what is
  // lost is the ability to tie that row to a file on disk.
  return { key: `name:${bucket.name.toLowerCase()}`, path: null };
}

function drain() {
  const entries = [];
  const programs = new Map();
  for (const bucket of pendingUsage.values()) {
    const { key, path: executable } = programKey(bucket);
    entries.push({ key, in: bucket.in, out: bucket.out, name: bucket.name });
    if (executable) programs.set(key, { path: executable, name: bucket.name });
  }
  pendingUsage.clear();
  return { entries, programs: [...programs.values()] };
}

// What the file on disk is now. Asked only about programs that were seen
// going out, and only about their size, write time and signer - nothing is
// read out of the file itself.
async function describe(item) {
  const key = item.path.toLowerCase();
  let size = null;
  let modified = null;
  try {
    const info = fs.statSync(item.path);
    size = info.size;
    modified = Math.round(info.mtimeMs);
  } catch (_) { /* unreadable: recorded without those, not guessed at */ }
  const known = ledger ? ledger.program(item.path) : null;
  // If the file changed, what Windows says about its signature may have
  // changed too, so the cached answer is thrown away rather than repeated.
  if (known && (known.size !== size || known.modified !== modified)) signatures.delete(key);
  if (!signatures.has(key)) {
    signatures.set(key, await backend.signature.read(item.path).catch(() => null));
  }
  const sign = signatures.get(key);
  return { path: item.path, name: item.name, size, modified,
    signature: sign ? sign.status : null, signer: sign ? sign.signer : null };
}

function announce(events) {
  if (!tray || tray.isDestroyed() || !events.length) return;
  const first = events[0];
  const subject = first.name || first.path;
  try {
    tray.displayBalloon({
      title: first.kind === 'binary-changed' ? words().changedTitle : words().firstTitle,
      content: events.length > 1 ? `${subject} (+${events.length - 1})` : subject
    });
  } catch (_) { /* balloons are a Windows courtesy, not a requirement */ }
}

async function bank() {
  if (!ledger || !pendingUsage.size) return;
  const { entries, programs } = drain();
  if (entries.length) ledger.addUsage(entries);
  const described = [];
  for (const item of programs) described.push(await describe(item));
  const events = described.length ? ledger.notePrograms(described) : [];
  ledger.save();
  if (events.length) {
    alerts = [...events, ...alerts].slice(0, 200);
    send('alerts', events);
    announce(events);
  }
}

// On the way out there is no time to ask Windows about signatures, so the
// bytes are banked and the describing is skipped. Losing the figures would
// be the worse of the two.
function bankNow() {
  if (!ledger || !pendingUsage.size) return;
  const { entries } = drain();
  if (entries.length) ledger.addUsage(entries).save();
}

// Windows' own startup entry, read back from the machine rather than from
// what was stored: a switch that disagrees with the system is a lie.
function autostart(value) {
  if (value !== undefined) {
    app.setLoginItemSettings({ openAtLogin: Boolean(value), args: ['--hidden'] });
    if (ledger) {
      ledger.setting('autostart', Boolean(value));
      ledger.save();
    }
  }
  try { return app.getLoginItemSettings({ args: ['--hidden'] }).openAtLogin; }
  catch (_) { return false; }
}

function createWindow() {
  window = new BrowserWindow({
    width: 1400, height: 840, minWidth: 960, minHeight: 620,
    backgroundColor: '#202020',
    show: !hiddenStart,
    icon: path.join(__dirname, '..', '..', 'assets', 'wirecove-mark.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: true,
      // Chromium slows timers in a hidden window. The measurement is taken in
      // the main process, but the window still has to add up what it is sent,
      // and a throttled window would under-report the session totals the
      // moment it was minimised.
      backgroundThrottling: false
    }
  });

  // A close is a request to get out of the way, not to stop measuring. The
  // tray menu's Quit is the way out, and so is the window's own quit.
  window.on('close', event => {
    if (quitting) return;
    event.preventDefault();
    window.hide();
    if (tray && !tray.isDestroyed() && !window.toldAboutTray) {
      window.toldAboutTray = true;
      try {
        tray.displayBalloon({ title: words().hiddenTitle, content: words().hidden });
      } catch (_) { /* balloons are a Windows courtesy, not a requirement */ }
    }
  });
  window.loadFile(path.join(__dirname, 'index.html'));
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  window.webContents.on('did-finish-load', () => {
    poll(refreshConnections, 3000);
    poll(refreshDns, 15000);
    poll(refreshDpi, 4000);
    startTraffic();
  });
}

function startTraffic() {
  if (!capabilities.traffic.supported) return;
  collector.onSample(measurement => {
    send('traffic', measurement);
    updateTooltip(measurement);
    accumulate(measurement.processes);
    for (const row of measurement.processes) queueIcon(row.identity, row.pid);
    if (collector.lastError) {
      collector.lastError = null;
      send('status', { error: null });
    }
  });
  collector.start();
  // A collector that dies restarts itself; the interface is told so it does
  // not keep showing the last rate as if it were current.
  timers.push(setInterval(() => {
    if (collector.lastError) send('status', { error: collector.lastError });
  }, 5000));
  // Banked once a minute rather than once a second: the figures are the same
  // either way, and a file rewritten every second for no reason is a file
  // that will be rewritten during a crash.
  timers.push(setInterval(() => { bank().catch(() => {}); }, 60000));
}

function poll(run, interval) {
  const tick = () => Promise.resolve().then(run).catch(() => {});
  tick();
  timers.push(setInterval(tick, interval));
}

function database() {
  return path.join(app.getPath('userData'), 'connections.sqlite3');
}

async function refreshConnections() {
  if (snapshotBusy) return;
  snapshotBusy = true;
  try {
    const data = await backend.history.snapshot(database());
    send('connections', data);
    if (data.rows) {
      for (const row of data.rows) queueIcon(row.identity, row.pid);
    }
  } catch (error) {
    send('connections', { error: error.message });
  } finally { snapshotBusy = false; }
}

async function refreshDns() {
  try { send('dns-status', await backend.readDnsStatus()); }
  catch (error) { send('dns-status', { error: error.message }); }
}

function refreshDpi() {
  send('dpi-status', backend.dpi.status());
}

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  ledger = new backend.Ledger(path.join(app.getPath('userData'), 'ledger.json')).load();
  alerts = ledger.report().events;

  const report = {
    platform: 'win32', displayName: 'Windows', features: capabilities,
    // Whether this process holds administrator rights, asked of the machine
    // rather than assumed: the rate counters and the DPI driver both need it.
    elevated: backend.dpi.elevated(),
    packaged: app.isPackaged
  };
  ipcMain.handle('platform:capabilities', () => report);
  // The preload script reads this before the first paint, so no control is
  // ever drawn enabled for a feature this machine cannot provide.
  ipcMain.on('platform:capabilities-sync', event => { event.returnValue = report; });

  ipcMain.handle('history:clear', async () => {
    const data = await backend.history.clear(database());
    send('connections', data);
    return data;
  });
  ipcMain.handle('diagnose:run', (_event, target) => backend.diagnose(target));
  ipcMain.handle('apps:installed', async () => {
    const items = await backend.installedApps();
    let index = 0;
    const worker = async () => {
      while (index < items.length) {
        const item = items[index++];
        const dataUrl = await backend.iconForPath(item.path).catch(() => null);
        if (dataUrl) send('installed-app-icon', { path: item.path, dataUrl });
      }
    };
    for (let count = 0; count < 3; count++) worker();
    return items;
  });

  ipcMain.handle('dpi:modes', () => modes.list());
  ipcMain.handle('dpi:status', () => backend.dpi.status());
  ipcMain.handle('dpi:start', (_event, mode) => serialize(async () => {
    if (typeof mode !== 'string') throw new Error('Invalid mode');
    const state = backend.dpi.start(app, mode);
    send('dpi-status', state);
    return state;
  }));
  ipcMain.handle('dpi:stop', () => serialize(async () => {
    const state = backend.dpi.stop();
    send('dpi-status', state);
    return state;
  }));
  // Starting elevated is a separate launch: Windows cannot add rights to a
  // process that is already running. The current one quits so the machine is
  // never watched by two Wirecoves at once.
  ipcMain.handle('app:relaunch-elevated', () => {
    if (backend.dpi.elevated()) return { alreadyElevated: true };
    const quote = value => `'${String(value).replace(/'/g, "''")}'`;
    const args = process.argv.slice(1).filter(argument => argument !== '--smoke');
    const command = ['Start-Process', '-FilePath', quote(process.execPath), '-Verb', 'RunAs']
      .concat(args.length ? ['-ArgumentList', args.map(quote).join(',')] : []).join(' ');
    const child = spawn('powershell',
      ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', command],
      { detached: true, stdio: 'ignore', windowsHide: true });
    child.unref();
    // The prompt the person answers belongs to the new process; this one
    // leaves once it has been handed over.
    setTimeout(() => app.quit(), 1200);
    return { relaunching: true };
  });
  // The firewall rules are read by anyone and written only with
  // administrator rights. A write that is refused says so; it is never
  // reported as done.
  ipcMain.handle('firewall:status', () => backend.firewall.status());
  ipcMain.handle('firewall:block', (_event, program, label) => serialize(async () => {
    if (!capabilities.firewall.supported) throw new Error(capabilities.firewall.reason);
    const state = await backend.firewall.block(program, label);
    send('firewall-status', state);
    return state;
  }));
  ipcMain.handle('firewall:unblock', (_event, program) => serialize(async () => {
    if (!capabilities.firewall.supported) throw new Error(capabilities.firewall.reason);
    const state = await backend.firewall.unblock(program);
    send('firewall-status', state);
    return state;
  }));
  ipcMain.handle('apps:path', (_event, pid) =>
    Number.isInteger(pid) ? backend.pathForPid(pid) : null);

  // The neighbour table costs nothing; the sweep sends packets and therefore
  // only ever runs because someone pressed the button.
  ipcMain.handle('scanner:read', () => backend.netscan.neighbours());
  ipcMain.handle('scanner:sweep', () => backend.netscan.sweep());

  // The lasting record is read, cleared and switched from here. Reading is
  // free; the only write is the person asking for it.
  ipcMain.handle('usage:report', () => (ledger ? ledger.report() : null));
  ipcMain.handle('alerts:read', () => alerts);
  ipcMain.handle('alerts:clear', () => {
    alerts = [];
    if (ledger) ledger.clearEvents().save();
    return alerts;
  });
  ipcMain.handle('settings:read', () => ({ autostart: autostart(), startedHidden: hiddenStart }));
  ipcMain.handle('settings:autostart', (_event, value) =>
    ({ autostart: autostart(Boolean(value)) }));
  ipcMain.handle('signature:read', async (_event, program) => {
    const executable = backend.signature.guardPath(program);
    if (!executable) return null;
    const key = executable.toLowerCase();
    if (!signatures.has(key)) {
      signatures.set(key, await backend.signature.read(executable).catch(() => null));
    }
    return signatures.get(key);
  });

  ipcMain.on('app:language', (_event, value) => {
    if (value !== 'tr' && value !== 'en') return;
    language = value;
    buildTrayMenu();
  });

  ipcMain.handle('open-site', async (_event, value) => {
    if (typeof value !== 'string' || !/^[a-z0-9.-]{1,253}$/i.test(value)) {
      throw new Error('Invalid domain');
    }
    await shell.openExternal(`https://${value}/`);
    return { opened: true };
  });

  createWindow();
  createTray();
  if (process.argv.includes('--smoke')) runSmoke();
});

app.on('before-quit', () => { quitting = true; });
// Everything that matters keeps running without a window on Windows, so the
// usual "last window closed, so quit" is wrong here.
app.on('window-all-closed', () => { if (!tray) app.quit(); });
app.on('activate', showWindow);

function runSmoke() {
  const rates = capabilities.traffic.supported;
  // In a packaged build the source directory lives inside the asar and cannot
  // be written to, so the screenshots go where the application is allowed to
  // write. The check is then the same check either way.
  const shotDirectory = app.isPackaged ? app.getPath('userData') : path.join(__dirname, '..');
  // Declared out here, not inside the try: the failure path needs to report
  // what had already passed, and a catch block that cannot see the results is
  // a catch block that replaces the real error with its own.
  const results = {};
  // The result is written beside the screenshots as well as printed. Electron
  // is a windowed program on Windows and its standard output is not always
  // carried back to whoever started it - under an elevated launch in
  // particular - and a check whose answer cannot be read is not a check.
  const record = () => {
    try {
      fs.writeFileSync(path.join(shotDirectory, 'smoke-result.json'),
        JSON.stringify(results, null, 1));
    } catch (_) { /* the console output is still the primary answer */ }
  };
  setTimeout(async () => {
    try {
      const shot = async name => {
        await new Promise(resolve => setTimeout(resolve, 300));
        const png = await window.webContents.capturePage();
        fs.writeFileSync(path.join(shotDirectory, `${name}-smoke.png`), png.toPNG());
      };

      // The overview has to be built from live data: open connections and the
      // applications that own them, plus rates wherever they are measurable.
      results.overview = await window.webContents.executeJavaScript(`(() => {
          const apps = Number(document.getElementById('app-count').textContent);
          const rows = [...document.querySelectorAll('#rows .row')];
          // The last column is the live connection count, which comes from the
          // snapshot rather than from the byte counters: if every row reads 0
          // the two sources are no longer keyed to the same process.
          const open = rows.reduce((sum, row) =>
            sum + Number(row.lastElementChild.textContent || 0), 0);
          return apps > 0 && rows.length > 0 && open > 0;
        })()`);
      // The chart grid is always drawn; the series only where bytes are counted.
      results.chart = await window.webContents.executeJavaScript(`(() => {
          const canvas = document.getElementById('chart');
          const ctx = canvas.getContext('2d');
          const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
          let drawn = 0;
          for (let i = 3; i < pixels.length; i += 4) if (pixels[i] > 0) drawn++;
          return drawn > 0;
        })()`);
      if (rates) {
        results.rates = await window.webContents.executeJavaScript(`(() => {
            const rx = document.getElementById('rx').textContent;
            const tx = document.getElementById('tx').textContent;
            return rx !== '—' && tx !== '—' &&
              document.querySelectorAll('.top-app').length > 0;
          })()`);
      }
      // The three breakdowns are the same measurement grouped differently.
      // Where it cannot be made they must say why rather than sit blank, and
      // where it can they must have rows in them.
      results.breakdown = await window.webContents.executeJavaScript(`(() => {
          const lists = ['hosts-list', 'services-list', 'countries-list']
            .map(id => document.getElementById(id));
          if (!lists.every(Boolean)) return false;
          const measured = ${rates ? 'true' : 'false'};
          // A resolved host keeps its address on a line of its own. Run
          // together they read as one nonsense word, which is how this was
          // found in the first place.
          const hosts = [...document.querySelectorAll('#hosts-list .breakdown-row')];
          const split = hosts.every(row => {
            const sub = row.querySelector('.breakdown-sub');
            const label = row.querySelector('.breakdown-label');
            return !sub || !label || !label.textContent.includes(sub.textContent);
          });
          if (!split) return false;
          return lists.every(list => measured
            ? list.querySelectorAll('.breakdown-row').length > 0
            : list.querySelector('.empty') && list.querySelector('.empty').textContent.trim());
        })()`);
      await shot('overview');

      results.apps = await window.webContents.executeJavaScript(`(() => {
          document.querySelector('[data-page="apps"]').click();
          return document.querySelectorAll('.apps-row').length > 0;
        })()`);
      // Icons arrive from a per-process path lookup, so they are waited for
      // rather than sampled once: slow is not the same as unavailable.
      results.icons = await window.webContents.executeJavaScript(`(async () => {
          for (let i = 0; i < 100; i++) {
            if (document.querySelectorAll('.apps-row img').length) return true;
            await new Promise(resolve => setTimeout(resolve, 150));
          }
          return false;
        })()`);
      results.detail = await window.webContents.executeJavaScript(`(() => {
          document.querySelector('.apps-row').click();
          const panel = document.getElementById('app-detail');
          return !panel.classList.contains('hidden') &&
            document.getElementById('detail-body').textContent.includes('PID');
        })()`);
      await shot('apps');
      results.search = await window.webContents.executeJavaScript(`(() => {
          document.getElementById('detail-close').click();
          const search = document.getElementById('app-search');
          search.value = '___no_such_application___';
          search.dispatchEvent(new Event('input', { bubbles: true }));
          const empty = document.querySelectorAll('.apps-row').length === 0;
          search.value = '';
          search.dispatchEvent(new Event('input', { bubbles: true }));
          return empty && document.querySelectorAll('.apps-row').length > 0;
        })()`);
      // Ordering must stay put while the list refreshes underneath, or a row
      // moves out from under the pointer mid-click.
      const before = await window.webContents.executeJavaScript(
        "document.querySelector('[data-sort=pid]').click(); [...document.querySelectorAll('.apps-row')].map(x=>x.dataset.key)");
      await new Promise(resolve => setTimeout(resolve, 3500));
      const after = await window.webContents.executeJavaScript(
        "[...document.querySelectorAll('.apps-row')].map(x=>x.dataset.key)");
      const shared = before.filter(key => after.includes(key));
      results.stable = shared.slice(0, -1).every((key, index) =>
        after.indexOf(key) < after.indexOf(shared[index + 1]));

      // Protect lists applications and the real firewall profiles. The switch
      // may only be usable where a rule can actually be written, which is the
      // whole rule this interface is held to.
      results.firewall = await window.webContents.executeJavaScript(`(async () => {
          document.querySelector('[data-page="firewall"]').click();
          for (let i = 0; i < 100; i++) {
            if (document.querySelectorAll('.fw-chip').length) break;
            await new Promise(resolve => setTimeout(resolve, 150));
          }
          const profiles = document.querySelectorAll('.fw-chip').length;
          const rows = document.querySelectorAll('.fw-row').length;
          const toggles = [...document.querySelectorAll('.fw-toggle')];
          const writable = ${capabilities.firewall.supported ? 'true' : 'false'};
          const honest = toggles.length === 0 ||
            toggles.every(toggle => toggle.disabled === !writable);
          return profiles === 3 && rows > 0 && honest;
        })()`);
      await shot('firewall');

      // The device list is the neighbour table; nothing is sent to build it.
      results.network = await window.webContents.executeJavaScript(`(async () => {
          document.querySelector('[data-page="network"]').click();
          for (let i = 0; i < 120; i++) {
            if (document.querySelectorAll('.net-row').length) return true;
            await new Promise(resolve => setTimeout(resolve, 150));
          }
          return false;
        })()`);
      await shot('network');

      results.dns = await window.webContents.executeJavaScript(`(() => {
          document.querySelector('[data-page="dns"]').click();
          return !document.getElementById('dns-page').classList.contains('hidden') &&
            document.querySelectorAll('.dns-server').length > 0 &&
            document.getElementById('proxy-state').textContent !== '—';
        })()`);
      await shot('dns');

      results.history = await window.webContents.executeJavaScript(`(() => {
          document.querySelector('[data-page="history"]').click();
          const rows = document.querySelectorAll('.history-row').length;
          const search = document.getElementById('history-search');
          search.value = '___no_matching_app___';
          search.dispatchEvent(new Event('input', { bubbles: true }));
          const filtered = document.querySelectorAll('.history-row').length === 0;
          search.value = '';
          search.dispatchEvent(new Event('input', { bubbles: true }));
          return rows > 0 && filtered && document.querySelectorAll('.history-row').length === rows;
        })()`);
      results.diagnose = await window.webContents.executeJavaScript(`(async () => {
          document.getElementById('diagnose-target').value = '127.0.0.1:1';
          document.getElementById('diagnose-form').requestSubmit();
          for (let i = 0; i < 150; i++) {
            if (document.querySelectorAll('.diagnose-stage').length >= 2) break;
            await new Promise(resolve => setTimeout(resolve, 100));
          }
          return document.querySelectorAll('.diagnose-stage').length >= 2 &&
            document.getElementById('diagnose-results').textContent.includes('DNS');
        })()`);
      await shot('history');

      // The DPI page must show a real engine state and the full mode list even
      // when the engine cannot start for want of administrator rights.
      results.dpi = await window.webContents.executeJavaScript(`(async () => {
          document.querySelector('[data-page="dpi"]').click();
          for (let i = 0; i < 40 && document.getElementById('dpi-state').textContent === '—'; i++)
            await new Promise(resolve => setTimeout(resolve, 100));
          const select = document.getElementById('dpi-mode');
          return !document.getElementById('dpi-page').classList.contains('hidden') &&
            document.getElementById('dpi-state').textContent !== '—' &&
            select.options.length > 10 &&
            document.getElementById('dpi-log').textContent.length > 0;
        })()`);
      await shot('dpi');

      // Connections list the same measurement one endpoint at a time. Where
      // it can be made there must be rows; where it cannot, a reason.
      results.connections = await window.webContents.executeJavaScript(`(async () => {
          document.querySelector('[data-page="connections"]').click();
          for (let i = 0; i < 80; i++) {
            if (document.querySelectorAll('.conn-row').length) break;
            await new Promise(resolve => setTimeout(resolve, 150));
          }
          const rows = [...document.querySelectorAll('.conn-row')];
          if (!${rates ? 'true' : 'false'}) {
            const note = document.querySelector('#conn-rows .empty');
            return Boolean(note && note.textContent.trim()) && rows.length === 0;
          }
          // Every row must name a real endpoint; a row whose target cell is
          // empty would be a row with nothing measured behind it.
          return rows.length > 0 && rows.every(row => {
            const target = row.querySelector('.conn-target b');
            return target && /:\\d+$/.test(target.textContent.trim());
          });
        })()`);
      await shot('connections');

      // The record on disk, end to end: what the collector measured is banked
      // and then read back through the same path the window uses.
      await bank();
      results.usage = await window.webContents.executeJavaScript(`(async () => {
          document.querySelector('[data-page="usage"]').click();
          for (let i = 0; i < 60; i++) {
            if (document.getElementById('usage-today').textContent !== '\\u2014') break;
            await new Promise(resolve => setTimeout(resolve, 150));
          }
          const measured = ${rates ? 'true' : 'false'};
          if (!measured) {
            const note = document.querySelector('#usage-rows .empty');
            return Boolean(note && note.textContent.trim());
          }
          // Thirty days are always drawn, including the ones with nothing in
          // them, so a gap in the record reads as a gap and not as zero.
          const days = document.querySelectorAll('.usage-day').length;
          const rows = [...document.querySelectorAll('.usage-row')];
          const stated = document.getElementById('usage-today').textContent !== '\\u2014';
          return days === 30 && rows.length > 0 && stated;
        })()`);
      await shot('usage');

      // The alerts list and the startup switch. Both must say what is true of
      // this machine rather than showing a default.
      results.settings = await window.webContents.executeJavaScript(`(async () => {
          document.querySelector('[data-page="firewall"]').click();
          const alerts = document.getElementById('alerts-list');
          const noted = document.getElementById('alerts-note').textContent.trim().length > 20;
          const listed = alerts.querySelectorAll('.alert').length > 0
            || Boolean(alerts.querySelector('.empty'));
          document.getElementById('settings').click();
          for (let i = 0; i < 60; i++) {
            if (!document.getElementById('autostart-toggle').disabled) break;
            await new Promise(resolve => setTimeout(resolve, 100));
          }
          const toggle = document.getElementById('autostart-toggle');
          const open = !document.getElementById('settings-panel').classList.contains('hidden');
          const honest = toggle.getAttribute('aria-checked') ===
            (toggle.classList.contains('on') ? 'true' : 'false');
          document.getElementById('settings-close').click();
          return noted && listed && open && honest && !toggle.disabled;
        })()`);

      results.tray = await (async () => {
        if (!tray || tray.isDestroyed()) return false;
        const before = collector.child ? collector.child.pid : null;
        window.close();
        const hidden = !window.isDestroyed() && !window.isVisible();
        // The collector is what keeps measuring; a close that restarted or
        // stopped it would leave a hole in the record exactly when nobody is
        // watching the window.
        const running = collector.child ? collector.child.pid === before : before === null;
        window.show();
        return hidden && running;
      })();

      const failed = Object.entries(results).filter(([, ok]) => !ok).map(([name]) => name);
      if (failed.length) throw new Error(`Failed sections: ${failed.join(', ')}`);
      record();
      process.stdout.write(`SMOKE_OK ${JSON.stringify(results)}\n`);
      app.exit(0);
    } catch (error) {
      results.failed = error.message;
      record();
      process.stderr.write(`SMOKE_FAIL ${error.message}\n`);
      app.exit(1);
    }
  }, rates ? 9000 : 7000);
}

app.on('before-quit', () => {
  for (const timer of timers) clearInterval(timer);
  // Whatever was measured since the last minute mark is banked before the
  // process goes, so quitting never costs the person a figure.
  try { bankNow(); } catch (_) { /* best effort */ }
  collector.stop();
  // Never leave the machine filtered by a Wirecove that has quit.
  try { backend.dpi.stop(); } catch (_) { /* best effort */ }
});
