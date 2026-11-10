// Windows DNS and proxy observation. Read-only: nothing here changes a
// resolver, a DoH entry or a proxy setting.
const { runJsonScript } = require('./powershell');

// ConvertTo-Json collapses a one-element array into the element itself, so
// every list has to be normalised before the interface sees it.
function list(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function normalize(raw) {
  if (!raw) throw new Error('DNS observation returned no data');
  const resolvers = list(raw.resolvers).map(item => ({
    number: item.number,
    scoped: Boolean(item.scoped),
    domain: item.domain || null,
    interface: item.interface,
    family: item.family,
    servers: list(item.servers)
  })).filter(item => item.servers.length);
  const doh = list(raw.doh);
  const effective = list(raw.servers);
  // A resolver is reported as DoH-upgraded only when Windows itself holds an
  // auto-upgrade entry for that exact address; nothing is inferred.
  const upgraded = new Set(doh.map(item => item.server));
  return {
    servers: effective,
    resolvers,
    doh: {
      servers: doh,
      // "active" means at least one server the system is actually using is
      // auto-upgraded, not merely that the table has entries.
      active: effective.some(server => upgraded.has(server))
    },
    proxy: {
      active: Boolean(raw.proxy?.active),
      enabled: raw.proxy?.enabled || {},
      server: raw.proxy?.server || '',
      pacUrl: raw.proxy?.pacUrl || '',
      winhttp: raw.proxy?.winhttp || ''
    },
    observedAt: Date.now()
  };
}

async function readDnsStatus() {
  return normalize(await runJsonScript('dns-status.ps1'));
}

module.exports = { normalize, readDnsStatus };
