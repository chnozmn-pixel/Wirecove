const fs = require('node:fs');
const { execFile } = require('node:child_process');
const { domainFromInput } = require('../dpi/site_rules');
const dpi = require('../dpi/control');

const HOST = '/Applications/WirecoveMacHost.app/Contents/MacOS/WirecoveMacHost';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function command(args, timeout = 25000) {
  return new Promise((resolve, reject) => execFile(HOST, args,
    { encoding: 'utf8', timeout, maxBuffer: 64 * 1024 },
    (error, stdout, stderr) => error
      ? reject(new Error(stdout.trim() || stderr.trim() || error.message))
      : resolve(stdout.trim())));
}

function savedPolicy(file) {
  try {
    const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
    return {
      domains: Array.isArray(saved.domains) ? saved.domains : saved.domain ? [saved.domain] : [],
      apps: Array.isArray(saved.apps) ? saved.apps : []
    };
  } catch { return { domains: [], apps: [] }; }
}

async function status(file) {
  if (process.platform !== 'darwin' || !fs.existsSync(HOST))
    return { available: false, state: 'unavailable', domains: [], apps: [] };
  const output = await command(['status'], 12000);
  const state = output.match(/^Proxy status: (.+)$/)?.[1];
  if (!state) throw new Error(`Unexpected proxy status: ${output}`);
  return { available: true, state, ...(state === 'connected'
    ? savedPolicy(file) : { domains: [], apps: [] }) };
}

async function connectPolicies(values, identifiers, file) {
  if (process.platform !== 'darwin' || !fs.existsSync(HOST))
    throw new Error('Wirecove Mac extension is not installed');
  if (!Array.isArray(values) || !Array.isArray(identifiers)) throw new Error('Invalid route list');
  const domains = [...new Set(values.map(domainFromInput))].sort();
  const apps = [...new Set(identifiers)].sort();
  if (domains.some(domain => !/^[a-z0-9.-]+$/i.test(domain) || !domain.includes('.') || domain.includes('..')))
    throw new Error('Enter valid domains');
  if (apps.some(id => typeof id !== 'string' || !/^[A-Za-z0-9._-]+$/.test(id)))
    throw new Error('Invalid application identifier');
  if (domains.length === 0 && apps.length === 0) return disconnect(file);
  const current = await status(file);
  if (current.state === 'connected' && JSON.stringify(current.domains) === JSON.stringify(domains) &&
      JSON.stringify(current.apps) === JSON.stringify(apps)) return current;
  if (current.state !== 'not configured') await disconnect(file);
  await dpi.ensureProxy();
  try {
    await command(['connect', ...domains, ...apps.flatMap(id => ['--app', id])]);
    for (let attempt = 0; attempt < 12; attempt++) {
      const result = await status(file);
      if (result.state === 'connected') {
        fs.writeFileSync(file, JSON.stringify({ domains, apps }) + '\n', { mode: 0o600 });
        return { ...result, domains, apps };
      }
      if (result.state === 'disconnected' || result.state === 'invalid') break;
      await sleep(500);
    }
    throw new Error('Mac proxy did not connect');
  } catch (error) {
    await command(['disconnect'], 12000).catch(() => {});
    fs.rmSync(file, { force: true });
    throw error;
  }
}

async function connectDomains(values, file) { return connectPolicies(values, [], file); }
async function connect(value, file) { return connectDomains([value], file); }

async function disconnect(file) {
  if (process.platform !== 'darwin' || !fs.existsSync(HOST))
    throw new Error('Wirecove Mac extension is not installed');
  await command(['disconnect'], 12000);
  fs.rmSync(file, { force: true });
  return status(file);
}

module.exports = { status, connect, connectDomains, connectPolicies, disconnect };
