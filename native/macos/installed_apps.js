const { execFile } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const roots = ['/Applications', '/System/Applications', path.join(os.homedir(), 'Applications')];

function spotlight() {
  return new Promise(resolve => execFile('/usr/bin/mdfind',
    ['kMDItemContentType == "com.apple.application-bundle"'],
    { encoding: 'utf8', timeout: 10000, maxBuffer: 5 * 1024 * 1024 },
    (error, stdout) => resolve(error ? [] : stdout.split('\n').filter(Boolean))));
}

function walk(dir, depth, paths) {
  if (depth < 0) return;
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return; }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const full = path.join(dir, entry.name);
    if (entry.name.endsWith('.app')) paths.add(full);
    else if (!entry.name.startsWith('.') && depth) walk(full, depth - 1, paths);
  }
}

async function installedApps() {
  if (process.platform !== 'darwin') return [];
  const paths = new Set();
  for (const root of roots) walk(root, 2, paths);
  for (const item of await spotlight()) {
    const userPath = item.startsWith(`${os.homedir()}/`) &&
      !item.includes('/Library/') && !item.includes('/node_modules/') && !item.includes('/.Trash/');
    const standardPath = roots.some(root => item.startsWith(`${root}/`));
    if (!userPath && !standardPath) continue;
    if (item.slice(0, -4).includes('.app/')) continue;
    paths.add(item);
  }
  return [...paths].filter(item => item.endsWith('.app') && fs.existsSync(path.join(item, 'Contents', 'Info.plist')))
    .map(item => ({ name: path.basename(item, '.app'), path: item }))
    .sort((a,b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}

module.exports = { installedApps };
