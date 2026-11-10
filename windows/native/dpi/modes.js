// GoodbyeDPI flag sets.
//
// GoodbyeDPI (https://github.com/ValdikSS/GoodbyeDPI, Apache-2.0) bypasses
// passive and active DPI blocking by splitting and rewriting packets in the
// kernel through the WinDivert driver. Wirecove ships the official,
// unmodified 0.2.3rc3 build under goodbyedpi/ and runs it as a separate
// process that the user turns on deliberately.
//
// Scope, stated plainly: WinDivert filters at the network layer, so a mode
// applies to the WHOLE MACHINE. It cannot be limited to one site or one
// application the way the macOS Network Extension can. Wirecove therefore
// reports the Windows DPI engine as global scope and never shows a per-app or
// per-site rule as "protected" here.
//
// The tr* sets are taken verbatim from https://github.com/cagritaskn/
// GoodbyeDPI-Turkey (same ValdikSS binary, different flags). Their decisive
// difference: --dns-addr/--dns-port send every outgoing DNS query through
// GoodbyeDPI itself to a non-standard port (1253), because some Turkish ISPs
// silently redirect all port 53 traffic to their own resolvers no matter what
// DNS the machine is configured with. While a tr* mode with --dns-addr is on,
// the machine's own DNS choice is effectively overridden - the interface says
// so rather than showing two conflicting states.
const MODES = {
  // 1-4: the older, most compatible methods (packet splitting only, no TTL or
  // checksum tricks).
  '1': ['-p', '-r', '-s', '-f', '2', '-k', '2', '-n', '-e', '2'],
  '2': ['-p', '-r', '-s', '-f', '2', '-k', '2', '-n', '-e', '40'],
  '3': ['-p', '-r', '-s', '-e', '40'],
  '4': ['-p', '-r', '-s'],
  // 5-9: current methods (fake packets plus splitting). 9 is GoodbyeDPI's own
  // default and the broadest, but not the best on every ISP.
  '5': ['-f', '2', '-e', '2', '--auto-ttl', '--reverse-frag', '--max-payload'],
  '6': ['-f', '2', '-e', '2', '--wrong-seq', '--reverse-frag', '--max-payload'],
  '7': ['-f', '2', '-e', '2', '--wrong-chksum', '--reverse-frag', '--max-payload'],
  '8': ['-f', '2', '-e', '2', '--wrong-seq', '--wrong-chksum', '--reverse-frag', '--max-payload'],
  '9': ['-f', '2', '-e', '2', '--wrong-seq', '--wrong-chksum', '--reverse-frag', '--max-payload', '-q'],
  // Splits the TLS ClientHello immediately before the SNI value, so a box that
  // decides by hostname cannot read which site the request is for. Useful
  // against active redirection (certificate name mismatch) rather than plain
  // packet dropping.
  sni: ['--frag-by-sni', '--wrong-seq', '--wrong-chksum'],
  // Turkey sets. Yandex DNS on port 1253 is the community-tested default.
  tr_a3: ['--set-ttl', '3', '--dns-addr', '77.88.8.8', '--dns-port', '1253',
    '--dnsv6-addr', '2a02:6b8::feed:0ff', '--dnsv6-port', '1253'],
  tr: ['-5', '--set-ttl', '5', '--dns-addr', '77.88.8.8', '--dns-port', '1253',
    '--dnsv6-addr', '2a02:6b8::feed:0ff', '--dnsv6-port', '1253'],
  tr_a5: ['-9', '--dns-addr', '77.88.8.8', '--dns-port', '1253',
    '--dnsv6-addr', '2a02:6b8::feed:0ff', '--dnsv6-port', '1253'],
  tr_a4: ['-5', '--dns-addr', '77.88.8.8', '--dns-port', '1253',
    '--dnsv6-addr', '2a02:6b8::feed:0ff', '--dnsv6-port', '1253'],
  // These three do not redirect DNS; the original project expects the machine
  // DNS to be set to Yandex or Cloudflare by hand, so they work alongside
  // whatever resolver the user already has rather than overriding it.
  tr_a1: ['--set-ttl', '3'],
  tr_a2: ['-5'],
  tr_a6: ['-9']
};

// The order the interface lists them in: lightest working combination first.
// tr_a3 leads because TTL-only plus DNS redirection was the combination that
// actually worked and stayed fast on a real Turkish ISP, while the aggressive
// packet-splitting sets (tr, tr_a5) left pages loading forever on the same
// line - more aggressive is not more likely to work.
const ORDER = ['tr_a3', 'tr', 'tr_a5', 'tr_a4', 'tr_a2', 'tr_a1', 'tr_a6',
  '1', '2', '3', '4', '5', '6', '7', '8', '9', 'sni'];

const LABELS = {
  tr_a3: { tr: 'Türkiye · TTL 3 + Yandex DNS yönlendirme', en: 'Turkey · TTL 3 + Yandex DNS redirect' },
  tr: { tr: 'Türkiye · parçalama + TTL 5 + DNS yönlendirme', en: 'Turkey · split + TTL 5 + DNS redirect' },
  tr_a5: { tr: 'Türkiye · mod 9 + DNS yönlendirme', en: 'Turkey · mode 9 + DNS redirect' },
  tr_a4: { tr: 'Türkiye · mod 5 + DNS yönlendirme', en: 'Turkey · mode 5 + DNS redirect' },
  tr_a2: { tr: 'Türkiye · mod 5 (DNS değişmez)', en: 'Turkey · mode 5 (DNS untouched)' },
  tr_a1: { tr: 'Türkiye · TTL 3 (DNS değişmez)', en: 'Turkey · TTL 3 (DNS untouched)' },
  tr_a6: { tr: 'Türkiye · mod 9 (DNS değişmez)', en: 'Turkey · mode 9 (DNS untouched)' },
  '1': { tr: 'Mod 1 · en uyumlu', en: 'Mode 1 · most compatible' },
  '2': { tr: 'Mod 2 · uyumlu', en: 'Mode 2 · compatible' },
  '3': { tr: 'Mod 3 · hafif', en: 'Mode 3 · light' },
  '4': { tr: 'Mod 4 · en hafif', en: 'Mode 4 · lightest' },
  '5': { tr: 'Mod 5 · otomatik TTL', en: 'Mode 5 · auto TTL' },
  '6': { tr: 'Mod 6 · hatalı sıra', en: 'Mode 6 · wrong sequence' },
  '7': { tr: 'Mod 7 · hatalı sağlama', en: 'Mode 7 · wrong checksum' },
  '8': { tr: 'Mod 8 · sıra + sağlama', en: 'Mode 8 · sequence + checksum' },
  '9': { tr: 'Mod 9 · GoodbyeDPI varsayılanı', en: 'Mode 9 · GoodbyeDPI default' },
  sni: { tr: 'SNI parçalama (deneysel)', en: 'SNI fragmentation (experimental)' }
};

// Names older configuration files may still hold.
const ALIASES = { modern: '9', legacy: '5' };

function resolve(mode) {
  return ALIASES[mode] || mode;
}

function flags(mode) {
  return MODES[resolve(mode)] || null;
}

// True when GoodbyeDPI itself captures DNS queries and sends them elsewhere.
// The interface has to say this, otherwise a DNS page showing the user's own
// resolver would be telling them something that is no longer true.
function redirectsDns(mode) {
  return (flags(mode) || []).includes('--dns-addr');
}

function list() {
  return ORDER.map(id => ({
    id,
    label: LABELS[id],
    redirectsDns: redirectsDns(id)
  }));
}

module.exports = { MODES, ORDER, LABELS, resolve, flags, redirectsDns, list };
