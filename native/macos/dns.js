const { execFile } = require('node:child_process');

function parseDns(output) {
  const resolvers = [];
  let scoped = false;
  let current = null;
  for (const line of output.split(/\r?\n/)) {
    if (line.startsWith('DNS configuration (for scoped queries)')) scoped = true;
    const header = line.match(/^resolver #(\d+)/);
    if (header) {
      current = { number: Number(header[1]), scoped, domain: null, interface: null, servers: [] };
      resolvers.push(current);
      continue;
    }
    if (!current) continue;
    const server = line.match(/^\s*nameserver\[\d+\]\s*:\s*(\S+)/);
    if (server) current.servers.push(server[1]);
    const domain = line.match(/^\s*domain\s*:\s*(.+)$/);
    if (domain) current.domain = domain[1].trim();
    const iface = line.match(/^\s*if_index\s*:\s*\d+\s*\(([^)]+)\)/);
    if (iface) current.interface = iface[1];
  }
  const active = resolvers.filter(item => item.servers.length && !item.scoped);
  const preferred = active.find(item => !item.domain) || active[0];
  return { servers: preferred?.servers || [], resolvers: resolvers.filter(item => item.servers.length) };
}

function parseProxy(output) {
  const enabled = {};
  for (const name of ['HTTP', 'HTTPS', 'SOCKS', 'ProxyAutoConfig', 'ProxyAutoDiscovery']) {
    const match = output.match(new RegExp(`^\\s*${name}Enable\\s*:\\s*(\\d+)`, 'm'));
    enabled[name] = match?.[1] === '1';
  }
  return { active: Object.values(enabled).some(Boolean), enabled };
}

function scutil(argument) {
  return new Promise((resolve, reject) => {
    execFile('/usr/sbin/scutil', [argument], { encoding: 'utf8', timeout: 4000, maxBuffer: 1024 * 1024 },
      (error, stdout) => error ? reject(error) : resolve(stdout));
  });
}

async function readDnsStatus() {
  const [dns, proxy] = await Promise.all([scutil('--dns'), scutil('--proxy')]);
  return { ...parseDns(dns), proxy: parseProxy(proxy), observedAt: Date.now() };
}

module.exports = { parseDns, parseProxy, readDnsStatus };
