const { app, BrowserWindow, session, nativeImage, ipcMain, shell } = require('electron');
const { spawn, spawnSync, execFile, execFileSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { randomUUID } = require('node:crypto');
const { readDnsStatus } = require('../native/macos/dns');
const dpi = require('../native/macos/dpi/control');
const { installedApps } = require('../native/macos/installed_apps');
const siteRules = require('../native/macos/dpi/site_rules');
const appRules = require('../native/macos/dpi/app_rules');
const chromeSite = require('../native/macos/dpi/chrome_site');
const nativeSite = require('../native/macos/host/control');

let window;
const children = new Set();
const iconRequests = new Set();
const iconQueue = [];
let iconWorkers = 0;
let historyBusy = false;
let dpiMutation = Promise.resolve();
let installedCache = null;
const routeSmoke = process.argv.includes('--route-list-smoke');
const routeSmokeDir = routeSmoke ? fs.mkdtempSync(path.join(os.tmpdir(), 'wirecove-route-smoke-')) : null;
if (routeSmokeDir) app.setPath('userData', routeSmokeDir);

function signingIdentifier(appPath) {
  const result = spawnSync('/usr/bin/codesign', ['-dv', '--verbose=4', appPath],
    { encoding: 'utf8', timeout: 5000, maxBuffer: 64 * 1024 });
  const identifier = result.stderr?.match(/^Identifier=(.+)$/m)?.[1]?.trim();
  if (result.status !== 0 || !identifier) throw new Error('Application has no usable signing identifier');
  return identifier;
}

function appIdentifiers(items) {
  return items.map(item => item.signingIdentifier || signingIdentifier(item.path));
}

function serializeDpi(action) {
  const pending = dpiMutation.then(action);
  dpiMutation = pending.catch(() => {});
  return pending;
}

function queueIcon(row) {
  const key = `${row.pid}:${row.process_unique_id}`;
  if (iconRequests.has(key)) return;
  iconRequests.add(key);
  iconQueue.push({ key, pid: row.pid });
  drainIcons();
}

function drainIcons() {
  while (iconWorkers < 3 && iconQueue.length) {
    const item = iconQueue.shift();
    iconWorkers++;
    execFile('/bin/ps', ['-p', String(item.pid), '-o', 'comm='],
      { timeout: 2000 }, async (error, stdout) => {
        try {
          if (error) return;
          const executable = stdout.trim();
          const bundle = executable.match(/^(.+?\.app)(?:\/|$)/)?.[1];
          const target = bundle || executable;
          if (!path.isAbsolute(target) || !fs.existsSync(target)) return;
          let icon = nativeImage.createEmpty();
          if (bundle) {
            try {
              const iconFile = execFileSync('/usr/bin/plutil',
                ['-extract', 'CFBundleIconFile', 'raw', '-o', '-', path.join(bundle, 'Contents', 'Info.plist')],
                { encoding: 'utf8', timeout: 2000 }).trim();
              const iconPath = path.join(bundle, 'Contents', 'Resources',
                iconFile.endsWith('.icns') ? iconFile : `${iconFile}.icns`);
              const pngPath = path.join(os.tmpdir(), `wirecove-${randomUUID()}.png`);
              try {
                await new Promise((resolve,reject) => execFile('/usr/bin/sips',
                  ['-s', 'format', 'png', iconPath, '--out', pngPath],
                  { timeout: 3000 }, error => error ? reject(error) : resolve()));
                icon = nativeImage.createFromPath(pngPath);
              } finally {
                fs.rmSync(pngPath, { force: true });
              }
            } catch (_) { /* Some bundles have no icon file. */ }
          }
          if (!icon.isEmpty() && !window?.isDestroyed()) {
            window.webContents.send('app-icon', { key: item.key,
              dataUrl: icon.resize({ width: 32, height: 32 }).toDataURL() });
          }
        } catch (_) { /* Icon unavailable; renderer keeps the fallback. */ }
        finally { iconWorkers--; drainIcons(); }
      });
  }
}

function createWindow() {
  window = new BrowserWindow({
    width: 1280, height: 820, minWidth: 960, minHeight: 620,
    backgroundColor: '#202020', titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: true
    }
  });
  window.loadFile(path.join(__dirname, 'index.html'));
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event) => event.preventDefault());
  window.webContents.on('did-finish-load', () => {
    for (const protocol of ['tcp', 'udp']) startCollector(protocol);
    refreshDns();
    setInterval(refreshDns, 15000);
    refreshHistory();
    setInterval(refreshHistory, 5000);
    refreshDpi();
    setInterval(refreshDpi, 4000);
  });
}

async function refreshDpi() {
  try {
    const state = await dpi.status();
    if (!window?.isDestroyed()) window.webContents.send('dpi-status', state);
  } catch (_) { /* Status remains unknown until the next poll. */ }
}

function runHistory(action) {
  const python = [process.env.WIRECOVE_PYTHON, '/usr/local/bin/python3',
    '/opt/homebrew/bin/python3', '/usr/bin/python3'].find(p => p && fs.existsSync(p)) || 'python3';
  const script = path.join(__dirname, '..', 'native', 'connection_history.py');
  const db = path.join(app.getPath('userData'), 'connections.sqlite3');
  return new Promise((resolve, reject) => {
    execFile(python, [script, '--db', db, '--action', action],
      { encoding: 'utf8', timeout: 12000, maxBuffer: 2 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) return reject(new Error(stderr.trim() || error.message));
        try { resolve(JSON.parse(stdout)); }
        catch (parseError) { reject(parseError); }
      });
  });
}

function runDiagnostic(target) {
  if (typeof target !== 'string' || target.length > 2048) return Promise.reject(new Error('Invalid target'));
  const python = [process.env.WIRECOVE_PYTHON, '/usr/local/bin/python3',
    '/opt/homebrew/bin/python3', '/usr/bin/python3'].find(p => p && fs.existsSync(p)) || 'python3';
  const script = path.join(__dirname, '..', 'native', 'diagnose.py');
  return new Promise((resolve, reject) => {
    execFile(python, [script, target],
      { encoding: 'utf8', timeout: 12000, maxBuffer: 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) return reject(new Error(stderr.trim() || error.message));
        try { resolve(JSON.parse(stdout)); }
        catch (parseError) { reject(parseError); }
      });
  });
}

async function refreshHistory() {
  if (historyBusy) return;
  historyBusy = true;
  try {
    const data = await runHistory('sample');
    if (!window?.isDestroyed()) window.webContents.send('history', data);
  } catch (error) {
    if (!window?.isDestroyed()) window.webContents.send('history', { error: error.message });
  } finally { historyBusy = false; }
}

async function refreshDns() {
  try {
    const status = await readDnsStatus();
    if (!window?.isDestroyed()) window.webContents.send('dns-status', status);
  } catch (error) {
    if (!window?.isDestroyed()) window.webContents.send('dns-status', { error: error.message });
  }
}

function startCollector(protocol) {
  const collector = path.join(__dirname, '..', 'native', 'netwatch.py');
  const python = [process.env.WIRECOVE_PYTHON, '/usr/local/bin/python3',
    '/opt/homebrew/bin/python3', '/usr/bin/python3'].find(p => p && fs.existsSync(p));
  const child = spawn(python || 'python3', [collector, '--protocol', protocol, '--samples', '0'],
    { stdio: ['ignore', 'pipe', 'pipe'] });
  children.add(child);
  let buffer = '';
  let error = '';
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', chunk => {
    buffer += chunk;
    let cut;
    while ((cut = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, cut);
      buffer = buffer.slice(cut + 1);
      try {
        const row = JSON.parse(line);
        if (!window?.isDestroyed()) {
          window.webContents.send('traffic', row);
          queueIcon(row);
        }
      } catch (_) { /* incomplete or malformed line; ignore */ }
    }
  });
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', chunk => { error = (error + chunk).slice(-500); });
  child.on('exit', code => {
    children.delete(child);
    if (!window?.isDestroyed()) window.webContents.send('status',
      { protocol, code, error: error.trim() || `Collector exited (${code})` });
  });
  child.on('error', err => {
    if (!window?.isDestroyed()) window.webContents.send('status',
      { protocol, error: err.message });
  });
}

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  ipcMain.handle('history:clear', async () => {
    const data = await runHistory('clear');
    if (!window?.isDestroyed()) window.webContents.send('history', data);
    return data;
  });
  ipcMain.handle('diagnose:run', (_event, target) => runDiagnostic(target));
  ipcMain.handle('dpi:status', () => dpi.status());
  ipcMain.handle('dpi:connect-discord', () => serializeDpi(async () => {
    const result = await dpi.connectDiscord();
    await refreshDpi();
    return result;
  }));
  ipcMain.handle('dpi:disconnect-discord', () => serializeDpi(async () => {
    const result = await dpi.disconnectDiscord();
    await refreshDpi();
    return result;
  }));
  ipcMain.handle('dpi:compare-site', (_event, target) => serializeDpi(() => dpi.compareSite(target)));
  ipcMain.handle('apps:installed', async () => {
    if (!installedCache) installedCache = await installedApps();
    let index = 0;
    async function icons() {
      while (index < installedCache.length) {
        const item = installedCache[index++];
        try {
          const iconName = execFileSync('/usr/bin/plutil',
            ['-extract', 'CFBundleIconFile', 'raw', '-o', '-', path.join(item.path, 'Contents', 'Info.plist')],
            { encoding: 'utf8', timeout: 2000 }).trim();
          const iconPath = path.join(item.path, 'Contents', 'Resources',
            iconName.endsWith('.icns') ? iconName : `${iconName}.icns`);
          const pngPath = path.join(os.tmpdir(), `wirecove-installed-${randomUUID()}.png`);
          let icon;
          try {
            await new Promise((resolve,reject) => execFile('/usr/bin/sips',
              ['-s', 'format', 'png', iconPath, '--out', pngPath],
              { timeout: 3000 }, error => error ? reject(error) : resolve()));
            icon = nativeImage.createFromPath(pngPath).resize({ width: 32, height: 32 });
          } finally { fs.rmSync(pngPath, { force: true }); }
          if (!icon.isEmpty() && !window?.isDestroyed())
            window.webContents.send('installed-app-icon', { path: item.path, dataUrl: icon.toDataURL() });
        } catch (_) { /* Keep the text fallback. */ }
      }
    }
    for (let worker = 0; worker < 3; worker++) icons();
    return installedCache;
  });
  const siteRuleFile = path.join(app.getPath('userData'), 'dpi-sites.json');
  const appRuleFile = path.join(app.getPath('userData'), 'dpi-apps.json');
  const nativeSiteFile = path.join(app.getPath('userData'), 'native-site.json');
  const routeEnabledFile = path.join(app.getPath('userData'), 'dpi-enabled.json');
  const routeEnabled = () => {
    try { return JSON.parse(fs.readFileSync(routeEnabledFile, 'utf8')).enabled === true; }
    catch { return false; }
  };
  const setRouteEnabled = enabled => fs.writeFileSync(routeEnabledFile,
    JSON.stringify({ enabled }) + '\n', { mode: 0o600 });
  const applyRoutes = (sites, apps) => nativeSite.connectPolicies(
    sites, appIdentifiers(apps), nativeSiteFile);
  ipcMain.handle('dpi:native-site-status', () => nativeSite.status(nativeSiteFile));
  ipcMain.handle('dpi:native-site-connect', () => serializeDpi(async () => {
    const route = await applyRoutes(siteRules.readRules(siteRuleFile), appRules.readRules(appRuleFile));
    setRouteEnabled(true);
    return route;
  }));
  ipcMain.handle('dpi:native-site-disconnect', () => serializeDpi(async () => {
    const route = await nativeSite.disconnect(nativeSiteFile);
    setRouteEnabled(false);
    return route;
  }));
  ipcMain.handle('dpi:sites', () => siteRules.readRules(siteRuleFile));
  ipcMain.handle('dpi:add-site', (_event, value) => serializeDpi(async () => {
    const domain = siteRules.domainFromInput(value);
    const previous = siteRules.readRules(siteRuleFile);
    const apps = appRules.readRules(appRuleFile);
    const wasEnabled = routeEnabled();
    const sites = [...new Set([...previous, domain])].sort();
    let route;
    try { route = await applyRoutes(sites, apps); }
    catch (error) {
      if (wasEnabled && (previous.length || apps.length)) await applyRoutes(previous, apps).catch(() => {});
      throw error;
    }
    siteRules.addRule(siteRuleFile, domain);
    setRouteEnabled(true);
    if (!routeSmoke) await chromeSite.refreshChromeRoutes(false, siteRuleFile).catch(() => {});
    return { sites, route };
  }));
  ipcMain.handle('dpi:remove-site', (_event, value) => serializeDpi(async () => {
    const previous = siteRules.readRules(siteRuleFile);
    const apps = appRules.readRules(appRuleFile);
    const wasEnabled = routeEnabled();
    const sites = previous.filter(domain => domain !== value);
    let route;
    try { route = wasEnabled ? await applyRoutes(sites, apps) : await nativeSite.status(nativeSiteFile); }
    catch (error) {
      if (wasEnabled && (previous.length || apps.length)) await applyRoutes(previous, apps).catch(() => {});
      throw error;
    }
    siteRules.removeRule(siteRuleFile, value);
    if (sites.length === 0 && apps.length === 0) setRouteEnabled(false);
    return { sites, route };
  }));
  ipcMain.handle('dpi:open-site', (_event, value) => serializeDpi(async () => {
    const domain = siteRules.domainFromInput(value);
    if (!siteRules.readRules(siteRuleFile).includes(domain)) throw new Error('Site is not saved');
    await shell.openExternal(`https://${domain}/`);
    return { opened: true };
  }));
  ipcMain.handle('dpi:chrome-status', () => chromeSite.chromeStatus(siteRuleFile));
  ipcMain.handle('dpi:apps', () => appRules.readRules(appRuleFile));
  ipcMain.handle('dpi:add-app', (_event, appPath) => serializeDpi(async () => {
    if (typeof appPath !== 'string') throw new Error('Invalid application');
    if (!installedCache) installedCache = await installedApps();
    const item = installedCache.find(app => app.path === appPath);
    if (!item) throw new Error('Application not found');
    const previous = appRules.readRules(appRuleFile);
    const wasEnabled = routeEnabled();
    const apps = [...previous.filter(app => app.path !== appPath),
      { ...item, signingIdentifier: signingIdentifier(appPath) }];
    const sites = siteRules.readRules(siteRuleFile);
    let route;
    try { route = await applyRoutes(sites, apps); }
    catch (error) {
      if (wasEnabled && (sites.length || previous.length)) await applyRoutes(sites, previous).catch(() => {});
      throw error;
    }
    const savedApps = appRules.addRule(appRuleFile, apps[apps.length - 1]);
    setRouteEnabled(true);
    return { apps: savedApps, route };
  }));
  ipcMain.handle('dpi:remove-app', (_event, appPath) => serializeDpi(async () => {
    const previous = appRules.readRules(appRuleFile);
    const wasEnabled = routeEnabled();
    const apps = previous.filter(item => item.path !== appPath);
    const sites = siteRules.readRules(siteRuleFile);
    let route;
    try { route = wasEnabled ? await applyRoutes(sites, apps) : await nativeSite.status(nativeSiteFile); }
    catch (error) {
      if (wasEnabled && (sites.length || previous.length)) await applyRoutes(sites, previous).catch(() => {});
      throw error;
    }
    const savedApps = appRules.removeRule(appRuleFile, appPath);
    if (sites.length === 0 && savedApps.length === 0) setRouteEnabled(false);
    return { apps: savedApps, route };
  }));
  createWindow();
  if (!routeSmoke && routeEnabled()) serializeDpi(() => applyRoutes(
    siteRules.readRules(siteRuleFile), appRules.readRules(appRuleFile))).catch(() => {});
  if (routeSmoke) {
    setTimeout(async () => {
      let exitCode = 0;
      try {
        const result = await window.webContents.executeJavaScript(`(async () => {
          document.querySelector('[data-page="dpi"]').click();
          const wait=async predicate=>{for(let i=0;i<150;i++) {
            if(predicate()) return true;await new Promise(resolve=>setTimeout(resolve,100));
          }return false;};
          document.getElementById('site-add-input').value='example.com';
          document.getElementById('site-add-form').requestSubmit();
          const site=await wait(()=>document.getElementById('site-route-state').textContent.includes('DPI açık')&&
            [...document.querySelectorAll('.saved-site-row b')].some(item=>item.textContent==='example.com'));
          document.getElementById('installed-search').value='Safari';
          document.getElementById('installed-search').dispatchEvent(new Event('input'));
          const safari=await wait(()=>[...document.querySelectorAll('.installed-row')].some(row=>row.textContent.includes('Safari')));
          const row=[...document.querySelectorAll('.installed-row')].find(row=>row.textContent.includes('Safari'));
          row?.querySelector('button')?.click();
          const app=await wait(()=>[...document.querySelectorAll('.installed-row')]
            .some(item=>item.textContent.includes('Safari')&&item.textContent.includes('DPI açık')));
          return {site, safari, app, siteError:document.getElementById('site-add-error').textContent,
            appError:document.getElementById('dpi-message').textContent};
        })()`);
        if (!result.site || !result.safari || !result.app || result.siteError || result.appError)
          throw new Error(JSON.stringify(result));
        process.stdout.write(`ROUTE_LIST_SMOKE_OK ${JSON.stringify(result)}\n`);
      } catch (error) {
        process.stderr.write(`ROUTE_LIST_SMOKE_FAIL ${error.message}\n`);
        exitCode = 1;
      } finally {
        await nativeSite.disconnect(nativeSiteFile).catch(() => {});
        fs.rmSync(routeSmokeDir, { recursive: true, force: true });
        app.exit(exitCode);
      }
    }, 3000);
  }
  if (process.argv.includes('--smoke')) {
    setTimeout(async () => {
      try {
        const png = await window.webContents.capturePage();
        require('node:fs').writeFileSync(path.join(__dirname, '..', 'smoke.png'), png.toPNG());
        const brandTop = await window.webContents.executeJavaScript(
          "document.querySelector('.app-header .brand').getBoundingClientRect().top"
        );
        if (process.platform === 'darwin' && brandTop < 42)
          throw new Error(`Brand overlaps macOS window controls (${brandTop}px)`);
        const chartControls = await window.webContents.executeJavaScript(`(() => {
          document.querySelector('[data-range="300"]').click();
          const rangeWorks = document.querySelector('[data-range="300"]').classList.contains('selected');
          document.querySelector('[data-range="60"]').click();
          const canvas = document.getElementById('chart');
          const bounds = canvas.getBoundingClientRect();
          canvas.dispatchEvent(new MouseEvent('mousemove', { bubbles: true,
            clientX: bounds.left + bounds.width / 2, clientY: bounds.top + 20 }));
          const tooltipWorks = !document.getElementById('chart-tooltip').classList.contains('hidden');
          canvas.dispatchEvent(new MouseEvent('mouseleave'));
          return rangeWorks && tooltipWorks;
        })()`);
        if (!chartControls) throw new Error('Chart controls failed');
        const count = await window.webContents.executeJavaScript(
          "document.querySelector('[data-page=apps]').click(); document.querySelectorAll('.apps-row').length"
        );
        await new Promise(resolve => setTimeout(resolve, 400));
        const appsPng = await window.webContents.capturePage();
        require('node:fs').writeFileSync(path.join(__dirname, '..', 'apps-smoke.png'), appsPng.toPNG());
        const icons = await window.webContents.executeJavaScript(
          "document.querySelectorAll('.apps-row img').length"
        );
        const detailWorks = await window.webContents.executeJavaScript(`(() => {
          const first = document.querySelector('.apps-row');
          if (!first) return false;
          first.click();
          const panel = document.getElementById('app-detail');
          const shown = !panel.classList.contains('hidden') &&
            document.getElementById('detail-body').textContent.includes('PID');
          return shown;
        })()`);
        if (detailWorks) {
          await new Promise(resolve => setTimeout(resolve, 250));
          const detailPng = await window.webContents.capturePage();
          require('node:fs').writeFileSync(path.join(__dirname, '..', 'detail-smoke.png'), detailPng.toPNG());
        }
        const filtersWork = await window.webContents.executeJavaScript(`(() => {
          document.getElementById('detail-close').click();
          const panel = document.getElementById('app-detail');
          document.querySelector('[data-view="all"]').click();
          const allCount = document.querySelectorAll('.apps-row').length;
          document.querySelector('[data-view="traffic"]').click();
          return panel.classList.contains('hidden') && allCount >= 1;
        })()`);
        const before = await window.webContents.executeJavaScript(
          "document.querySelector('[data-sort=total]').click(); [...document.querySelectorAll('.apps-row')].map(x=>x.dataset.key)"
        );
        await new Promise(resolve => setTimeout(resolve, 1500));
        const after = await window.webContents.executeJavaScript(
          "[...document.querySelectorAll('.apps-row')].map(x=>x.dataset.key)"
        );
        const shared = before.filter(key => after.includes(key));
        const stable = shared.slice(0,-1).every((key,index) =>
          after.indexOf(key) < after.indexOf(shared[index+1]));
        const dnsWorks = await window.webContents.executeJavaScript(`(() => {
          document.querySelector('[data-page="dns"]').click();
          return !document.getElementById('dns-page').classList.contains('hidden') &&
            document.querySelectorAll('.dns-server').length > 0 &&
            document.getElementById('proxy-state').textContent !== '—';
        })()`);
        if (dnsWorks) {
          await new Promise(resolve => setTimeout(resolve, 250));
          const dnsPng = await window.webContents.capturePage();
          require('node:fs').writeFileSync(path.join(__dirname, '..', 'dns-smoke.png'), dnsPng.toPNG());
        }
        const historyWorks = await window.webContents.executeJavaScript(`(() => {
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
        if (historyWorks) {
          await new Promise(resolve => setTimeout(resolve, 250));
          const historyPng = await window.webContents.capturePage();
          require('node:fs').writeFileSync(path.join(__dirname, '..', 'history-smoke.png'), historyPng.toPNG());
        }
        const diagnosticWorks = await window.webContents.executeJavaScript(`(async () => {
          const target = document.getElementById('diagnose-target');
          target.value = '127.0.0.1:1';
          document.getElementById('diagnose-form').requestSubmit();
          for (let i = 0; i < 30; i++) {
            if (document.querySelectorAll('.diagnose-stage').length >= 2) break;
            await new Promise(resolve => setTimeout(resolve, 100));
          }
          return document.querySelectorAll('.diagnose-stage').length >= 2 &&
            document.getElementById('diagnose-results').textContent.includes('DNS');
        })()`);
        if (diagnosticWorks) {
          await new Promise(resolve => setTimeout(resolve, 200));
          const diagnosticPng = await window.webContents.capturePage();
          require('node:fs').writeFileSync(path.join(__dirname, '..', 'diagnostic-smoke.png'), diagnosticPng.toPNG());
        }
        const dpiWorks = await window.webContents.executeJavaScript(`(async () => {
          document.querySelector('[data-page="dpi"]').click();
          for (let i=0;i<30 && document.getElementById('site-route-state').textContent==='—';i++)
            await new Promise(resolve=>setTimeout(resolve,100));
          return !document.getElementById('dpi-page').classList.contains('hidden') &&
            document.getElementById('site-route-state').textContent!=='—' &&
            !!document.getElementById('dpi-site-form') &&
            Number(document.getElementById('installed-count').textContent)>0 &&
            document.querySelectorAll('.installed-row').length>0 &&
            !!document.getElementById('site-add-form') &&
            !!document.getElementById('site-route-state') &&
            !!document.getElementById('site-route-toggle');
        })()`);
        if (dpiWorks) {
          await new Promise(resolve => setTimeout(resolve, 300));
          const dpiPng = await window.webContents.capturePage();
          require('node:fs').writeFileSync(path.join(__dirname, '..', 'dpi-smoke.png'), dpiPng.toPNG());
        }
        if (count < 1 || icons < 1 || !stable || !detailWorks || !filtersWork || !dnsWorks || !historyWorks || !diagnosticWorks || !dpiWorks)
          throw new Error('Application view, DNS, history, diagnostics or stable ordering failed');
        process.stdout.write(`SMOKE_OK apps=${count} icons=${icons} stable=${stable} detail=${detailWorks} dns=${dnsWorks} history=${historyWorks} diagnostic=${diagnosticWorks} dpi=${dpiWorks}\n`);
        app.exit(0);
      } catch (err) {
        process.stderr.write(`SMOKE_FAIL ${err.message}\n`);
        app.exit(1);
      }
    }, 8000);
  }
});

app.on('before-quit', () => {
  for (const child of children) child.kill('SIGTERM');
});
app.on('window-all-closed', () => app.quit());
