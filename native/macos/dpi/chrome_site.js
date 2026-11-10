const fs = require('node:fs');
const { createHash } = require('node:crypto');
const os = require('node:os');
const path = require('node:path');
const { command, ensureProxy } = require('./control');

const PAC_URL = 'http://127.0.0.1:18090/proxy.pac';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

function ruleVersion(ruleFile) {
  return createHash('sha256').update(fs.readFileSync(ruleFile)).digest('hex').slice(0, 12);
}

async function chromeStatus(ruleFile = null) {
  const ps = await command('/bin/ps', ['-axo', 'command=']);
  const processLine = ps.split('\n').find(line => line === CHROME || line.startsWith(CHROME + ' '));
  const pacActive = !!processLine?.includes(`--proxy-pac-url=${PAC_URL}`);
  const routeCurrent = pacActive && !!ruleFile && fs.existsSync(ruleFile) &&
    processLine.includes(`--proxy-pac-url=${PAC_URL}?v=${ruleVersion(ruleFile)}`);
  return { running: !!processLine, pacActive, routeCurrent };
}

async function pacAvailable() {
  try {
    const body = await command('/usr/bin/curl', ['--fail', '--silent', '--show-error',
      '--noproxy', '*', '--max-time', '2', PAC_URL], 4000);
    return body.includes('FindProxyForURL');
  } catch (_) { return false; }
}

async function ensurePacServer(ruleFile) {
  if (await pacAvailable()) return;
  await command('/bin/launchctl', ['remove', 'wirecove.dpi.pac']).catch(() => {});
  const runtime = path.join(os.tmpdir(), 'wirecove-dpi');
  fs.mkdirSync(runtime, { recursive: true });
  const python = ['/usr/local/bin/python3', '/opt/homebrew/bin/python3']
    .find(item => fs.existsSync(item));
  if (!python) throw new Error('Python 3 required for Chrome PAC service');
  await command('/bin/launchctl', ['submit', '-l', 'wirecove.dpi.pac',
    '-o', path.join(runtime, 'pac.stdout.log'),
    '-e', path.join(runtime, 'pac.stderr.log'), '--',
    python, path.join(__dirname, 'pac_server.py'), ruleFile]);
  for (let attempt=0; attempt<10; attempt++) {
    if (await pacAvailable()) return;
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  throw new Error('Chrome PAC service did not start');
}

async function chromeTabs() {
  const script = `tell application "Google Chrome"
set resultText to ""
repeat with aWindow in windows
  repeat with aTab in tabs of aWindow
    set resultText to resultText & (URL of aTab) & linefeed
  end repeat
end repeat
return resultText
end tell`;
  const output = await command('/usr/bin/osascript', ['-e', script], 10000);
  return output.split('\n').map(item => item.trim()).filter(item => /^https?:\/\//.test(item));
}

async function restartChrome(pac, targetUrl = null, ruleFile = null) {
  const current = await chromeStatus();
  let previousTabs = [];
  if (current.running) {
    previousTabs = await chromeTabs();
    await command('/usr/bin/osascript', ['-e', 'tell application "Google Chrome" to quit'], 10000);
    for (let attempt=0; attempt<30; attempt++) {
      if (!(await chromeStatus()).running) break;
      await new Promise(resolve => setTimeout(resolve, 300));
    }
    if ((await chromeStatus()).running) throw new Error('Chrome did not quit');
  }
  const args = ['-a', 'Google Chrome'];
  if (pac) args.push('--args', `--proxy-pac-url=${PAC_URL}?v=${ruleVersion(ruleFile)}`);
  await command('/usr/bin/open', args, 15000);
  for (let attempt=0; attempt<30; attempt++) {
    const state = await chromeStatus(ruleFile);
    if (state.running && state.pacActive === pac) {
      const alreadyOpen = new Set(await chromeTabs());
      for (const previousTab of previousTabs) {
        if (!alreadyOpen.has(previousTab)) {
          await command('/usr/bin/open', ['-a', 'Google Chrome', previousTab], 15000);
          alreadyOpen.add(previousTab);
        }
      }
      if (targetUrl && !alreadyOpen.has(targetUrl))
        await command('/usr/bin/open', ['-a', 'Google Chrome', targetUrl], 15000);
      return state;
    }
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  throw new Error('Chrome did not start with the selected route');
}

async function activateChromeSite(url, ruleFile) {
  if (process.platform !== 'darwin') throw new Error('macOS required');
  if (!fs.existsSync('/Applications/Google Chrome.app')) throw new Error('Google Chrome not installed');
  await ensureProxy();
  await ensurePacServer(ruleFile);
  return restartChrome(true, url, ruleFile);
}

async function refreshChromeRoutes(hasSites, ruleFile) {
  const current = await chromeStatus();
  if (!current.pacActive) return current;
  const result = await restartChrome(hasSites, null, ruleFile);
  if (!hasSites) await command('/bin/launchctl', ['remove', 'wirecove.dpi.pac']).catch(() => {});
  return result;
}

module.exports = { PAC_URL, chromeStatus, ensurePacServer, activateChromeSite, refreshChromeRoutes };
