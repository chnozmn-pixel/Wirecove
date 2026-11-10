const { execFile } = require('node:child_process');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = __dirname;
const BINARY = path.join(ROOT, 'spoofdpi');
const SHA256 = '5664471d9d9aa6faaf9d3275dcbe9c37b7cfd637ac39a501b63949daa9709db5';
const PROXY = 'http://127.0.0.1:18089';

function command(file, args, timeout = 15000) {
  return new Promise((resolve, reject) => execFile(file, args,
    { encoding: 'utf8', timeout, maxBuffer: 2 * 1024 * 1024 },
    (error, stdout, stderr) => error ? reject(new Error(stderr.trim() || error.message)) : resolve(stdout)));
}

function verifyBinary() {
  const actual = createHash('sha256').update(fs.readFileSync(BINARY)).digest('hex');
  if (actual !== SHA256) throw new Error('SpoofDPI binary checksum mismatch');
}

async function script(name, timeout = 75000) {
  return command('/bin/bash', [path.join(ROOT, `${name}.sh`)], timeout);
}

async function ensureProxy() {
  if (process.platform !== 'darwin') throw new Error('macOS required');
  if (!(await status()).proxyRunning) { verifyBinary(); await script('start-proxy', 12000); }
}

async function status() {
  const output = await command('/bin/ps', ['-axo', 'pid=,command=']);
  const lines = output.split('\n');
  const proxyRunning = lines.some(line => line.includes(`${BINARY} --clean --no-tui`));
  const discord = lines.find(line => /\s\/Applications\/Discord\.app\/Contents\/MacOS\/Discord(?:\s|$)/.test(line));
  const discordMode = discord?.includes(`--proxy-server=${PROXY}`) ? 'dpi' : discord ? 'direct' : 'closed';
  return { proxyRunning, discordMode, active: proxyRunning && discordMode === 'dpi' };
}

async function connectDiscord() {
  if (process.platform !== 'darwin') throw new Error('macOS required');
  if (!fs.existsSync('/Applications/Discord.app')) throw new Error('Discord not installed');
  verifyBinary();
  await script('start-discord');
  const result = await status();
  if (!result.active) throw new Error('Discord DPI route was not confirmed');
  return result;
}

async function disconnectDiscord() {
  if (process.platform !== 'darwin') throw new Error('macOS required');
  await script('stop-discord', 30000);
  for (let attempt = 0; attempt < 10; attempt++) {
    const result = await status();
    if (result.discordMode === 'direct') return result;
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  return status();
}

function siteUrl(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 2048) throw new Error('Invalid URL');
  const url = new URL(value.includes('://') ? value : `https://${value}`);
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password)
    throw new Error('Use an HTTP(S) site without credentials');
  return url.toString();
}

function curl(url, assisted) {
  const args = ['--silent', '--show-error', '--output', '/dev/null',
    '--write-out', '%{http_code}|%{remote_ip}|%{time_total}',
    '--connect-timeout', '4', '--max-time', '12'];
  args.push(assisted ? '--proxy' : '--noproxy', assisted ? PROXY : '*');
  args.push(url);
  return new Promise(resolve => execFile('/usr/bin/curl', args,
    { encoding: 'utf8', timeout: 14000, maxBuffer: 1024 * 1024 },
    (error, stdout, stderr) => {
      const [code, remote, seconds] = stdout.trim().split('|');
      resolve({ ok: !error && Number(code) > 0, code: Number(code) || null,
        remote: remote || null, ms: Number.isFinite(Number(seconds)) ? Math.round(Number(seconds) * 1000) : null,
        error: error ? (stderr.trim().split('\n')[0] || error.message) : null });
    }));
}

async function compareSite(value) {
  if (process.platform !== 'darwin') throw new Error('macOS required');
  const url = siteUrl(value);
  const hadProxy = (await status()).proxyRunning;
  if (!hadProxy) { verifyBinary(); await script('start-proxy', 12000); }
  try {
    const [direct, dpi] = await Promise.all([curl(url, false), curl(url, true)]);
    return { url, direct, dpi };
  } finally {
    if (!hadProxy) await script('stop-proxy', 5000);
  }
}

module.exports = { status, connectDiscord, disconnectDiscord, compareSite, siteUrl, ensureProxy, command };
