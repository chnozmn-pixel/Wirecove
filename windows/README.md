# Wirecove for Windows

The Windows application. It lives in the same repository as the macOS build but
is a **separate application**: its own `package.json`, its own Electron entry
point, its own interface and its own observation layer. Nothing here imports
from the macOS app, and nothing in the macOS app imports from here, so the two
can be worked on and released independently.

```
windows/
  src/        interface (main, preload, renderer, HTML, stylesheet)
  native/     observation and enforcement layer
  tests/      JavaScript and Python suites
```

The only shared files are the brand assets in the repository's `assets/`
folder, which the window references for its logo.

## What it observes

Everything on screen comes from the machine itself; nothing is sampled from a
service and nothing leaves the computer.

| Shown | Source | Rights needed |
| --- | --- | --- |
| Open TCP connections, per process | `GetExtendedTcpTable` (iphlpapi) | none |
| Download and upload rate, per process | TCP Extended Statistics (RFC 4898) | **administrator** |
| Connection history | the same, stored in a private SQLite database | none |
| Effective DNS resolvers, DoH state | `Get-DnsClientServerAddress`, `Get-NetRoute`, `Get-DnsClientDohServerAddress` | none |
| System proxy | per-user WinINET registry keys and `netsh winhttp show proxy` | none |
| Installed applications and icons | Start Menu shortcuts, Electron `getFileIcon` | none |
| Which hosts, which service, LAN or WAN | the same per-connection counters, grouped by the remote endpoint | **administrator** |
| Which country | the regional registries' delegation records, compiled at packaging time | **administrator** |
| Devices on the local network | the Windows neighbour table, and ICMP echo when the scan button is pressed | none |
| Per-application blocking | Windows Firewall rules in the `Wirecove` group | **administrator** |
| Rates while the window is closed | the collector keeps running behind a tray icon | as above |
| Every open connection, one row each | the same per-connection counters, joined to the owning process | **administrator** |
| Daily and monthly usage per application | the same counters, banked to a JSON file once a minute | **administrator** |
| First connection, and a changed program file | this machine's own record of what it has already seen | **administrator** |
| Who signed a program | `Get-AuthenticodeSignature`, against this machine's certificate stores | none |
| Start with Windows | the standard per-user startup entry | none |
| Target test (DNS, TCP, TLS) | Python standard library, with Windows building the certificate chain | none |
| DPI | GoodbyeDPI with the WinDivert driver | **administrator** |

### What it measures, and what it leaves out

**Per-process rates come from the kernel's own counters.** Windows keeps no
per-process byte counter an ordinary program can read, but it does keep TCP
Extended Statistics per connection: once collection is switched on, the kernel
counts the payload bytes that went each way. Summing those over the connections
a process owns is a measurement, not an estimate. Switching collection on needs
administrator rights, so without them the rate columns stay empty and the
window says why in one line rather than drawing a flat graph.

Performance counters such as `\Process(*)\IO Read Bytes/sec` are deliberately
**not** used as a substitute: they mix disk and pipe traffic with network
traffic and would put a wrong number on screen.

The figures are TCP payload only. UDP — so QUIC, and the video calls that use
it — is not counted, and neither are TCP/IP headers, so what is shown is what
the application sent and received, which is lower than what a packet capture at
the interface would see.

**The four breakdowns are one measurement, read four ways.** Every connection
has a remote address and a port, so the same byte counters that produce the
per-application rates also produce the hosts, the traffic type, the country and
the LAN/WAN split. Nothing is counted twice and the four views always add up to
the same total, because there is only ever one number behind them.

What each of those readings is worth is not the same, and the interface says
so rather than presenting them as equally solid:

- **LAN or WAN** is read off the address itself and is exact.
- **Traffic type** is the service the remote port is conventionally used for.
  A program is free to ignore the convention, so the column is the port's usual
  service, not a claim about what the bytes were. Because the measurement is
  TCP only, the UDP services a packet-level tool would show — DNS, mDNS, SSDP,
  QUIC — do not appear here at all.
- **Country** comes from the five regional internet registries' own delegation
  files, which state which country an address block was handed to. That is not
  where the machine is: a provider registered in one country may announce its
  addresses in another. The table is built by `npm run fetch:geo` at packaging
  time and never fetched while the application runs; a build without it says
  the table is missing instead of leaving the panel blank.
- **Host names** are reverse DNS, looked up on background threads. A name that
  has not come back yet simply is not shown; the address is never dressed up as
  a name. Where a name did come back, the address it resolved from is shown
  under it, because reverse DNS is whatever the holder of that address chose to
  publish and is worth being able to check. The same applies in the
  per-application panel and the history list, where the address is the primary
  text and the service, country and name sit beneath it.

**Blocking is a Windows Firewall rule, not a filter of our own.** Wirecove
installs no network driver to block with. The switch on the Protect page writes
an outbound and an inbound rule for that program's path, both carrying the
group name `Wirecove`. Two consequences, both deliberate: the rules are visible
and removable in Windows' own firewall interface even if this application is
never opened again, and nothing outside that group is ever touched, so a rule
the user or their workplace put there is safe. Writing a rule needs
administrator rights; reading them does not, so the page shows the real state
either way and the switches are simply not usable without them.

**Closing the window does not stop the measurement.** A traffic monitor that
only measures while someone is looking at it has a hole in its record exactly
where the interesting traffic is. Closing the window hides it to the
notification area and the collector keeps running; the tray icon's tooltip
carries the current rates, its menu reopens the window, and its Quit is the way
to actually stop. The first time the window is closed the application says what
it just did rather than appearing to have quit. Only one Wirecove runs at a
time: launching again raises the window that is already there, because two
would each switch collection on and report two different totals for the same
machine.

**The daily figures are the live measurement, written down.** Nothing new is
counted for the Usage page. Each second the collector reports how many bytes
every process has moved since it started; the difference between two reports
is what moved in between, and once a minute that difference is added to
today's row under the file the process runs from. So a figure outlives the
process that earned it: close the program, and what it used is still on
today's row. It is also why the Usage page has the same blind spots as the
live one - no administrator rights, no counters, no daily figures, and the
page says so instead of showing zeros. The record is ninety days of
`ledger.json` in Wirecove's own data folder: a plain file, so its owner can
open it and read exactly what was kept about them. Nothing is sent anywhere,
and a process whose executable cannot be read is banked under its name rather
than dropped, so a day's total stays true even where the file behind it is
unknown.

**Alerts are after the fact, and say so.** An application appears in the list
the first time it is seen connecting out, or when the file it runs from stops
being the file that was seen before - a different size, a different write
time, or a different signer. That is a fact about the file, not a judgement
about it. On a fresh install the first pass only writes the baseline: fifty
alerts at once would be noise, not information. Nothing is held back while you
decide, because nothing here can hold a packet.

**A signature says who vouches for a file, and nothing more.** It is read by
Windows from the certificate stores already on this machine, so no hash and no
program name leaves the computer. The status is shown in Windows' own words -
`Valid`, `NotSigned`, `HashMismatch` - and a signer's name is shown next to
it, never instead of it. A valid signature does not mean a program is safe and
is not presented as if it did.

**Starting with Windows starts without a window.** The switch writes the
ordinary per-user startup entry and is read back from the machine every time
the panel opens, so it cannot disagree with what Windows will actually do. An
autostarted Wirecove goes straight to the notification area and measures from
there.

**The device list is the neighbour table until you ask for more.** Opening the
Network page sends nothing: it reads the ARP and neighbour discovery entries
Windows already keeps, which is only what this machine has spoken to. The scan
button sends one ICMP echo to each address on the directly connected prefixes,
and only prefixes of /22 or smaller are swept so a large corporate network
cannot be scanned by accident.

**The certificate chain is built by Windows.** Python carries its own view of
the trusted roots and reads them from the store as it stands; Windows ships
only part of the public root store and fetches the rest on demand. A root no
program on the machine has needed yet is therefore absent, and Python calls the
certificate untrusted while a browser opens the site without a word. The
connection test asks Python first because it is already holding the socket, and
when Python refuses it opens the connection again and hands the certificate to
`CertGetCertificateChain`, which builds the chain the way the rest of the
system does. Only when Windows refuses too is the result reported as a failure,
and the result says which of the two answered. Revocation is deliberately not
requested, so an unreachable responder cannot turn into a difference between
the two answers.

**The connection list is TCP only.** Windows' UDP tables
(`MIB_UDPROW_OWNER_PID`) carry a local endpoint and an owning PID but no remote
address, even for connected sockets. There is no peer to record, so UDP rows
are skipped rather than written with an invented one.

**A process whose identity cannot be read is skipped.** A PID alone is not an
identity, because Windows reuses it. Each row is keyed by PID plus the process
creation time (`GetProcessTimes`), so one program's traffic is never attributed
to whatever takes its PID later. That identity is passed around as a string:
a creation time is a FILETIME, and past 2^53 it cannot survive a JSON number
intact — a reader that rounded it would stop matching the same process.

## DPI scope

The engine is GoodbyeDPI 0.2.3rc3 (Apache-2.0, unmodified), bundled with its
WinDivert driver under `native/dpi/goodbyedpi/` together with the GoodbyeDPI,
WinDivert, uthash and getline licences.

**It is not the equivalent of the macOS route.** WinDivert filters at the
network layer, so a selected mode applies to the **entire machine**; it cannot
be limited to one site or one application the way the macOS
`NETransparentProxyProvider` can. This application therefore offers no site or
application rule list, and never shows a per-app rule as protected.

The `tr*` modes are the GoodbyeDPI-Turkey community flag sets. Those carrying
`--dns-addr` make GoodbyeDPI capture outgoing DNS itself and send it to Yandex
on port 1253, because some Turkish ISPs redirect every port 53 query to their
own resolvers regardless of the configured DNS. While such a mode runs, the
machine's own resolver is bypassed, and the panel says so in a warning rather
than leaving the DNS page claiming a server that is no longer answering.
The list is ordered lightest first: TTL-only with DNS redirection before the
aggressive packet-splitting sets, because more aggressive is not more likely to
work and can leave pages loading forever on some lines.

Loading a kernel driver needs administrator rights, so the panel is disabled
with that reason until Wirecove is started elevated. ARM64 is reported as
unsupported because WinDivert ships no ARM64 driver. The engine's own output is
shown on the page: when it is "on but nothing changed", that log is what shows
whether the driver actually loaded or another VPN or DPI tool took it first.
The engine is stopped on quit, so the machine is never left filtered by a
Wirecove that is gone.

## Install

Windows 10 or 11, 64-bit. **Nothing has to be installed first** — not Python,
not Node: a packaged build carries the interpreter it needs.

Two builds come out of `npm run dist`:

| File | What it does |
| --- | --- |
| `Wirecove-Setup-<version>-x64.exe` | Installs for the current user, adds a Start Menu entry, and can be uninstalled from Settings |
| `Wirecove-<version>-x64-portable.exe` | Runs where it stands, installs nothing |

The installer asks for no administrator rights, because it installs only for
the person running it. The application itself starts the same way, and watches
connections, DNS, the proxy and the installed applications without any extra
rights.

**Rates and DPI need administrator rights**, so the window says so in one line
and offers a *Restart as administrator* button. Pressing it hands over to a new
elevated process and closes the current one — Windows cannot add rights to a
process that is already running, and this way the machine is never watched by
two Wirecoves at once. Nothing else changes: the window comes back where it was.

The builds are **not code signed**, so Windows SmartScreen will warn the first
time one is run ("More info" → "Run anyway"). Signing needs a certificate that
belongs to whoever publishes the build; until there is one, that warning is
honest and should not be explained away.

The application writes only inside its own folder under `%APPDATA%`: the
connection history database and a stable copy of the DPI engine. Uninstalling
leaves that folder, so a reinstall keeps the history; delete it by hand to
start over.

## Run from a checkout

Needs Node.js, and Python 3 unless `npm run fetch:python` has been run. The
interpreter is chosen in this order: `WIRECOVE_PYTHON` if it names one, then
the one under `vendor/`, then the `py` launcher, then `python` on PATH.

```sh
cd windows
npm install
npm start
```

To use the DPI engine, start the same command from an elevated terminal.

## Build the installer

```sh
cd windows
npm install
npm run fetch:python
npm run fetch:geo
npm run dist
```

`fetch:python` downloads the official embeddable Python distribution, checks it
against the SHA-256 published on python.org, unpacks it into `vendor/` and
writes the path file that lets the helpers import each other. It is a separate
step, and `vendor/` is not committed, so nobody has to take an interpreter on
trust from this repository.

`fetch:geo` downloads the five regional internet registries' delegation files
and compiles them into `native/geo/ranges.bin`, about 2.6 MB of sorted address
ranges. It is optional: a build without it works in every other respect and the
Countries panel says the table is missing. Re-run it from time to time, since
address blocks change hands.

`dist` writes the installer and the portable build into `dist/`.

Two things worth knowing before the first build:

- electron-builder extracts its signing tools from an archive that contains
  symbolic links, and creating those needs a privilege an ordinary account
  does not hold. The build stops with `Cannot create symbolic link: A required
  privilege is not held by the client`. Turning on Windows **Developer Mode**
  (Settings → System → For developers) grants that privilege and is the fix;
  running the build from an elevated terminal also works.
- The build is reproducible only down to the pinned versions: Electron and the
  Python distribution are pinned, GoodbyeDPI is vendored, but electron-builder
  fetches NSIS at build time.

## Verify

```sh
cd windows
npm test
npm run smoke
```

`npm test` runs the JavaScript suite (`node --test`) and the Python suite
(`tests/run.py`, which puts `native/` on `sys.path` so the command does not
depend on the shell's PYTHONPATH).

`npm run smoke` opens the real window, walks every page, and writes a
screenshot per page. It checks that the figures come from live data, that the
application list has icons and a working search, that the chosen ordering stays
put across a refresh, that DNS and the target test answer, and that the DPI
page shows a real engine state and the full mode list even when the engine
cannot start. On success it prints:

```
SMOKE_OK {"overview":true,"apps":true,"icons":true,...}
```

The same check runs against a packaged build, which is the only way to catch
what only breaks once installed — a path handed to the interpreter that still
points inside `app.asar`, for instance:

```sh
.\dist\win-unpacked\Wirecove.exe --smoke
```

From a checkout the screenshots land in `windows/`; from a packaged build they
land in the application's own folder under `%APPDATA%`, because the source
directory is then inside the archive and cannot be written to.

The result is also written to `smoke-result.json` beside the screenshots.
Electron is a windowed program on Windows and its standard output does not
always reach whoever started it - under an elevated launch in particular - and
a check whose answer cannot be read is not a check.

Run it from an elevated terminal as well: that is the path where the rates
exist, and the result gains a `rates` section. Under administrator rights the
checks tighten rather than relax: the three breakdown panels must have rows in
them rather than a stated reason, and every blocking switch must be usable. Everything else is asserted
either way, so a missing capability shows up as a stated reason rather than a
passing test over an empty screen.

Blocking is checked separately, because the only honest test of a firewall
rule is to write one:

```sh
node scripts/verify-firewall.js
```

Run from an elevated terminal it blocks `notepad.exe`, reads the rule back,
writes it a second time to prove the switch cannot end up half on, removes it
and confirms that nothing else in the `Wirecove` group changed. It refuses to
touch the target if something had already blocked it. Without administrator
rights the first write is refused, which is the expected answer there.

The smoke run does not start the DPI engine: that needs administrator rights
and changes how the whole machine's traffic is handled, so it is a deliberate,
separate test.

## Not done yet

- Rates without administrator rights. There is no counter for it: it would mean
  an elevated helper service that the unprivileged window talks to.
- UDP volume, and therefore QUIC - a large share of what a browser, a video
  call or a game actually moves. This is the biggest gap in the figures: the
  totals are systematically low and will not match a router's. There are two
  ways in, both needing administrator rights, which the counters already do:
  the kernel's own network events (ETW `Microsoft-Windows-Kernel-Network`
  carries UDP bytes with the owning process, which is exactly the shape needed
  but awkward to consume), or sniffing with WinDivert, which this build already
  carries, and joining each datagram's local port to `GetExtendedUdpTable`.
  WinDivert is the shorter path because the driver is already here and already
  proven; the risk is cost per packet, so it would have to be filtered to UDP
  and read in batches.
- Store (MSIX/UWP) applications in the inventory; they have no plain `.exe`
  path and need a package-family lookup.
- A live test of the DPI engine under administrator rights on a line that is
  actually filtered.
- Code signing, so the first run does not meet a SmartScreen warning.
- Asking before a connection rather than blocking after it. GlassWire's "ask to
  connect" holds the first packet of a new connection until the person answers.
  Windows Firewall cannot do that for an application it is not already
  blocking. It is not out of reach - WinDivert, which this build already ships
  for the DPI engine, can hold and release packets - but it is the one feature
  here that can take the whole machine's traffic down if it is got wrong, and
  attributing a packet to a process at the moment it leaves is a race that has
  to be won every time. Blocking is therefore a decision made in advance, and
  the page does not pretend otherwise.
- A reputation or malware verdict per application. Scoring and VirusTotal
  lookups mean sending a hash of the user's programs to someone else's service,
  on someone else's account. That is a different product decision, not a
  missing function, so there is no empty column waiting for it.
- Per-hour detail, and usage history for hosts and countries rather than only
  for applications. The daily rows are the measurement already being taken;
  these are the same measurement banked more finely, and the file would grow
  accordingly.
- Alerting on anything beyond a first connection and a changed file - a new
  listening port, say, or a program connecting somewhere it never has before.
  Both are reachable from what is already measured.
- MAC vendor names on the Network page, which need an OUI table of their own.
- Country for the machine rather than the registration. The registries say who
  a block was delegated to; where it is announced is a different question and a
  different data source.
