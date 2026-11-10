const labels = {
  tr: {overview:'Genel bakış',apps:'Uygulamalar',history:'Geçmiş',networkActivity:'Ağ etkinliği',download:'Alınan',upload:'Gönderilen',activeApps:'Aktif uygulama',liveTraffic:'Canlı trafik',busyApps:'En çok veri kullanan',showAll:'Tümünü gör →',now:'Şimdi',processes:'Uygulama trafiği',application:'Uygulama',protocol:'Protokol',connections:'Bağlantı',total:'Bu oturum',sum:'Toplam',waiting:'Veri bekleniyor…',search:'Uygulama ara',historySearch:'Uygulama veya hedef ara',target:'Hedef',state:'Durum',clearHistory:'Geçmişi temizle',measuring:'Canlı',starting:'Başlatılıyor',error:'Ölçüm hatası',withTraffic:'Trafiği olanlar',all:'Tümü',liveRate:'Anlık hız',sessionUsage:'Bu oturum',lastSeen:'Son görülen',active:'Etkin',inactive:'Etkin değil',close:'Kapat',dnsServers:'Etkin DNS sunucuları',systemProxy:'Sistem proxy',resolvers:'Resolver listesi',on:'Açık',off:'Kapalı',noServers:'Sunucu bulunamadı',defaultResolver:'Varsayılan',scopedResolver:'Arayüz',connectionTest:'Bağlantı testi',test:'Test et',testing:'Test ediliyor…',targetInput:'Alan adı veya IP:port',passed:'Başarılı',failed:'Başarısız',skipped:'Atlandı',noHistory:'Kayıt yok',dpiEngine:'DPI motoru',dpiScope:'Seçilen mod makinenin tamamına uygulanır; tek siteye veya tek uygulamaya sınırlanamaz.',engineLog:'Motor çıktısı',apply:'Uygula',applying:'Uygulanıyor…',turnOff:'Kapat',running:'Çalışıyor',stopped:'Kapalı',unavailable:'Kullanılamıyor',noLog:'Motor çalışmıyor.',dnsOverride:'Bu mod DNS sorgularını 77.88.8.8:1253 adresine yönlendirir; açık olduğu sürece makinenin kendi DNS sunucuları kullanılmaz.',noRates:'Hız ölçümü kapalı',restartElevated:'Yönetici olarak yeniden başlat',elevating:'Başlatılıyor…',needsElevation:'Hız ölçümü ve DPI için yönetici yetkisi gerekiyor.'},
  en: {overview:'Overview',apps:'Applications',history:'History',networkActivity:'Network activity',download:'Received',upload:'Sent',activeApps:'Active apps',liveTraffic:'Live traffic',busyApps:'Highest data usage',showAll:'View all →',now:'Now',processes:'Application traffic',application:'Application',protocol:'Protocol',connections:'Connections',total:'This session',sum:'Total',waiting:'Waiting for data…',search:'Search apps',historySearch:'Search app or target',target:'Target',state:'State',clearHistory:'Clear history',measuring:'Live',starting:'Starting',error:'Measurement error',withTraffic:'With traffic',all:'All',liveRate:'Current rate',sessionUsage:'This session',lastSeen:'Last seen',active:'Active',inactive:'Inactive',close:'Close',dnsServers:'Active DNS servers',systemProxy:'System proxy',resolvers:'Resolver list',on:'On',off:'Off',noServers:'No server found',defaultResolver:'Default',scopedResolver:'Interface',connectionTest:'Connection test',test:'Test',testing:'Testing…',targetInput:'Domain or IP:port',passed:'Passed',failed:'Failed',skipped:'Skipped',noHistory:'No records',dpiEngine:'DPI engine',dpiScope:'The selected mode applies to the whole machine; it cannot be limited to one site or one application.',engineLog:'Engine output',apply:'Apply',applying:'Applying…',turnOff:'Turn off',running:'Running',stopped:'Off',unavailable:'Unavailable',noLog:'The engine is not running.',dnsOverride:'This mode sends DNS queries to 77.88.8.8:1253; while it runs the machine’s own DNS servers are not used.',noRates:'Rate measurement off',restartElevated:'Restart as administrator',elevating:'Starting…',needsElevation:'Rate measurement and DPI need administrator rights.'}
};
Object.assign(labels.tr, {
  protect:'Koruma', network:'Ağ', hosts:'Sunucular', trafficType:'Trafik türü',
  countries:'Ülkeler', runningApps:'Çalışanlar', blocked:'Engellenen', port:'Port',
  outbound:'Engel', device:'Cihaz', interface:'Arayüz', scanNetwork:'Ağı tara',
  scanning:'Taranıyor…', noDevices:'Cihaz görünmüyor', unknownCountry:'Bilinmiyor',
  notRunning:'Çalışmıyor', firewallProfile:'Güvenlik duvarı',
  blockNeedsAdmin:'Uygulama engellemek için yönetici yetkisi gerekiyor.',
  blockWrites:'Engelleme, Windows Güvenlik Duvarı’na Wirecove grubunda bir kural yazar.',
  neighborsOnly:'Listede yalnızca bu makinenin konuştuğu cihazlar var. Tümünü görmek için tarayın.',
  swept:'Tarandı', noPeers:'Henüz ölçülmüş bağlantı yok',
  'reason.elevation':'WinDivert bir çekirdek sürücüsüdür; yüklenebilmesi için Wirecove yönetici olarak çalıştırılmalıdır.',
  'reason.arm64':'WinDivert sürücüsünün ARM64 derlemesi yok.',
  'reason.missing':'GoodbyeDPI bu derlemede yok.',
  'reason.python':'Python çalıştırılamadı.',
  'reason.idle':'Ölçülecek açık bir TCP bağlantısı yok.',
  'reason.unsupported':'Çekirdek bayt sayaçlarını açmayı reddetti.',
  'reason.table':'Bağlantı tablosu okunamadı.',
  'reason.platform':'Bu ölçüm yalnızca Windows üzerinde var.',
  'reason.unwritten':'Henüz yazılmadı.',
  'reason.missing.countries':'Ülke tablosu bu derlemede yok.'
});
Object.assign(labels.en, {
  protect:'Protect', network:'Network', hosts:'Hosts', trafficType:'Traffic type',
  countries:'Countries', runningApps:'Running', blocked:'Blocked', port:'Port',
  outbound:'Block', device:'Device', interface:'Interface', scanNetwork:'Scan network',
  scanning:'Scanning…', noDevices:'No device visible', unknownCountry:'Unknown',
  notRunning:'Not running', firewallProfile:'Firewall',
  blockNeedsAdmin:'Blocking an application needs administrator rights.',
  blockWrites:'Blocking writes a Windows Firewall rule in the Wirecove group.',
  neighborsOnly:'Only devices this machine has spoken to are listed. Scan to see the rest.',
  swept:'Scanned', noPeers:'Nothing measured yet',
  'reason.elevation':'WinDivert is a kernel driver; Wirecove has to run as administrator to load it.',
  'reason.arm64':'WinDivert ships no ARM64 driver.',
  'reason.missing':'GoodbyeDPI is missing from this build.',
  'reason.python':'Python could not be run.',
  'reason.idle':'No open TCP connection to measure.',
  'reason.unsupported':'The kernel refused to switch byte counters on.',
  'reason.table':'The connection table could not be read.',
  'reason.platform':'This measurement only exists on Windows.',
  'reason.unwritten':'Not written yet.',
  'reason.missing.countries':'This build carries no country table.'
});
Object.assign(labels.tr, {
  live:'Bağlantılar', usage:'Kullanım', internet:'İnternet', localNetwork:'Yerel ağ',
  country:'Ülke', thisMachine:'Bu makine',
  today:'Bugün', thisMonth:'Bu ay', recorded:'Kayıtlı toplam', daily:'Günlük kullanım',
  perApp:'Uygulama başına', signature:'İmza', alerts:'Uyarılar',
  clearAlerts:'Listeyi temizle', settings:'Ayarlar', autostart:'Windows ile başlat',
  recordKept:'Tutulan kayıt', connSearch:'Uygulama, adres veya ülke ara',
  noConnections:'Açık ölçülmüş bağlantı yok', noUsageYet:'Henüz kayıt yok',
  unknownApp:'Bilinmiyor', unsigned:'İmzasız', signatureUnknown:'Okunamadı',
  firstConnection:'İlk kez bağlandı', binaryChanged:'Dosyası değişti',
  noAlerts:'Uyarı yok', changedSize:'boyut', changedModified:'tarih',
  changedSigner:'imza sahibi',
  alertsNote:'Bir uygulama ilk kez dışarı bağlandığında veya çalıştığı dosya değiştiğinde burada yazar. Bağlantı engellenmez, olduktan sonra bildirilir.',
  autostartNote:'Oturum açıldığında Wirecove penceresiz başlar ve simge durumunda ölçmeye devam eder.',
  recordNote:'Günlük kullanım en fazla {days} gün, kendi veri klasöründeki ledger.json dosyasında tutulur. Hiçbir şey dışarı gönderilmez.'
});
Object.assign(labels.en, {
  live:'Connections', usage:'Usage', internet:'Internet', localNetwork:'Local network',
  country:'Country', thisMachine:'This machine',
  today:'Today', thisMonth:'This month', recorded:'Recorded total', daily:'Daily usage',
  perApp:'Per application', signature:'Signature', alerts:'Alerts',
  clearAlerts:'Clear list', settings:'Settings', autostart:'Start with Windows',
  recordKept:'What is kept', connSearch:'Search app, address or country',
  noConnections:'No measured connection open', noUsageYet:'Nothing recorded yet',
  unknownApp:'Unknown', unsigned:'Unsigned', signatureUnknown:'Unreadable',
  firstConnection:'Connected for the first time', binaryChanged:'Its file changed',
  noAlerts:'No alerts', changedSize:'size', changedModified:'write time',
  changedSigner:'signer',
  alertsNote:'An application appears here the first time it connects out, or when the file it runs from changes. Nothing is held back; it is reported after the fact.',
  autostartNote:'Wirecove starts with no window at sign-in and keeps measuring from the notification area.',
  recordNote:'Daily usage is kept for at most {days} days in ledger.json inside Wirecove’s own data folder. Nothing is sent anywhere.'
});

Object.assign(labels.tr, {
  udpTitle:'UDP ölçümü', udpChoose:'Yol seç',
  udpNote:"UDP'nin bağlantısı yok, bu yüzden Windows okunacak bir sayaç tutmuyor. Tek bir doğru yol değil, farklı bedelleri olan yollar var; seçim senin.",
  'udp.off':'Ölçme', 'udp.sockets':'Yalnızca soketler', 'udp.etw':"Windows'un olay akışı",
  'udp.windivert':'Paketleri dinle',
  'udpWhat.off':'Hiçbir şey okunmaz. Kullanım rakamları yalnızca TCP olur.',
  'udpWhat.sockets':'Hangi program hangi portu açık tutuyor. Bayt yok, çünkü okunacak bayt yok. Yönetici yetkisi gerekmez.',
  'udpWhat.etw':'Çekirdek her datagramı programıyla, boyutuyla ve iki ucuyla bildirir. Bu bir ölçümdür, tahmin değil. Yönetici yetkisi gerekir.',
  'udpWhat.windivert':'Paketler okunur; boyutlar ve adresler görünür ama paket hangi programa ait olduğunu söylemez, bu porttan geriye bağlanır. Kapanmış bir soketin baytları sahipsiz kalır. Yönetici yetkisi gerekir.',
  udpNotMeasured:'UDP ölçülmüyor. Aşağıdaki rakamlar ve günlük kullanım yalnızca TCP.',
  udpSocketsOnly:'Bu yol bayt saymıyor; yalnızca hangi programın UDP kullandığını gösterir.',
  udpSockets:'Soket', udpPorts:'Portlar', udpUnattributed:'Sahipsiz',
  udpUnattributedNote:'Sahibi belirlenemeyen {amount} bayt var; soket ölçüm anından önce kapanmış. Baytlar gerçek, program satırları bu yüzden alt sınır.',
  udpIncluded:'UDP dahil', udpExcluded:'yalnızca TCP',
  udpStopped:'UDP ölçümü durdu', udpNoRows:'Henüz UDP etkinliği görünmedi',
  udpRefused:'Bu yol bu makinede açılamıyor',
  'udpReason.etw.elevation':'Bir izleme oturumu açmak için Wirecove yönetici olarak çalıştırılmalıdır.',
  'udpReason.windivert.elevation':'WinDivert bir çekirdek sürücüsüdür; yüklenebilmesi için Wirecove yönetici olarak çalıştırılmalıdır.',
  'udpReason.windivert.missing':'WinDivert bu derlemede yok.',
  'udpReason.etw.python':'Python çalıştırılamadı.',
  'udpReason.windivert.python':'Python çalıştırılamadı.',
  'udpReason.sockets.python':'Python çalıştırılamadı.'
});
Object.assign(labels.en, {
  udpTitle:'UDP measurement', udpChoose:'Choose a route',
  udpNote:'UDP has no connection, so Windows keeps no counter to read. There is no single right route, only routes that cost different things; the choice is yours.',
  'udp.off':'Do not measure', 'udp.sockets':'Sockets only', 'udp.etw':"Windows' own event stream",
  'udp.windivert':'Sniff packets',
  'udpWhat.off':'Nothing is read. The usage figures are TCP only.',
  'udpWhat.sockets':'Which program holds which port open. No bytes, because there are none to read. Needs no administrator rights.',
  'udpWhat.etw':'The kernel reports every datagram with its process, its size and both ends. This is a measurement, not an estimate. Needs administrator rights.',
  'udpWhat.windivert':'Packets are read, so sizes and addresses are visible - but a packet does not say which program sent it, so the owner is joined back through the port. Bytes from a socket that has closed stay unattributed. Needs administrator rights.',
  udpNotMeasured:'UDP is not being measured. The figures here and the daily usage are TCP only.',
  udpSocketsOnly:'This route counts no bytes; it shows only which programs are using UDP.',
  udpSockets:'Sockets', udpPorts:'Ports', udpUnattributed:'Unattributed',
  udpUnattributedNote:'{amount} bytes could not be tied to a program; the socket closed before it was looked up. The bytes are real, which makes the per-application rows a floor.',
  udpIncluded:'UDP included', udpExcluded:'TCP only',
  udpStopped:'UDP measurement stopped', udpNoRows:'No UDP activity seen yet',
  udpRefused:'This route cannot be opened on this machine',
  'udpReason.etw.elevation':'Opening a trace session needs Wirecove to run as administrator.',
  'udpReason.windivert.elevation':'WinDivert is a kernel driver; Wirecove has to run as administrator to load it.',
  'udpReason.windivert.missing':'WinDivert is missing from this build.',
  'udpReason.etw.python':'Python could not be run.',
  'udpReason.windivert.python':'Python could not be run.',
  'udpReason.sockets.python':'Python could not be run.'
});

const $ = id => document.getElementById(id);
const features = window.wirecove.capabilities.features;
const rates = features.traffic.supported;
const elevated = window.wirecove.capabilities.elevated;
// One strip, one offer: both the counters and the driver want the same rights,
// so the window asks for them once rather than on every panel that lacks them.
const needsElevation = !elevated &&
  [features.traffic, features.dpi].some(feature => feature.reasonKey === 'elevation');
const OPEN_STATES = new Set(['ESTABLISHED','SYN_SENT','SYN_RCVD','FIN_WAIT1','FIN_WAIT2','CLOSE_WAIT','CLOSING','LAST_ACK','TIME_WAIT']);

let language = localStorage.getItem('language') || 'tr';
let page = 'overview';
let received = false;
let sort = {field:'name', direction:'asc'};
let chartRange = 60;
let hoverIndex = null;
let appView = 'traffic';
let selectedApp = null;
let dnsStatus = null;
let historyRows = [];
let historyObservedAt = 0;
let historyError = null;
let diagnosis = null;
let dpiState = null;
let dpiModes = [];
let dpiBusy = false;
let appOrder = [];
let measurementError = null;
const rows = new Map();
const usage = new Map();
const knownApps = new Map();
const icons = new Map();
const sortValues = new Map();
const history = Array.from({length:300}, () => ({rx:0,tx:0}));
// The other view of the same measurement: one entry per remote endpoint.
const peers = new Map();
const programs = new Map();      // app key -> executable path, or null
const pendingPaths = new Set();
let firewallState = null;
let firewallError = null;
let firewallBusy = new Set();
let fwView = 'active';
let netState = null;
let netError = null;
let netBusy = false;
const regionCache = new Map();

let connView = 'all';
let usageReport = null;
let usageError = null;
let alerts = [];
let settings = null;
let udpLive = null;
let udpError = null;

// Country names come from the runtime's own locale data rather than a table
// shipped here, so they are already written the way the rest of the system
// writes them and follow the language switch.
function countryName(code) {
  if (!code) return labels[language].unknownCountry;
  const key = `${language}:${code}`;
  if (!regionCache.has(key)) {
    let name = code;
    try { name = new Intl.DisplayNames([language], {type:'region'}).of(code) || code; }
    catch (_) { name = code; }
    regionCache.set(key, name);
  }
  return regionCache.get(key);
}

// Not a flag. Windows ships no flag glyphs, so a regional indicator pair
// renders as the two bare letters in the middle of the country's name, which
// reads as a mistake. The code is shown as what it is instead.
function codeChip(code) {
  if (!/^[A-Z]{2}$/.test(code || '')) return null;
  const chip = document.createElement('i');
  chip.className = 'breakdown-code';
  chip.textContent = code;
  return chip;
}

function reasonFor(feature) {
  return labels[language][`reason.${feature.reasonKey}`] || feature.reason || '';
}

function bytes(rate) {
  if (rate == null) return '—';
  if (rate < 1024) return `${Math.round(rate)} B/s`;
  if (rate < 1048576) return `${(rate/1024).toFixed(1)} KB/s`;
  return `${(rate/1048576).toFixed(2)} MB/s`;
}

function size(count) {
  if (count == null) return '—';
  if (count < 1024) return `${Math.round(count)} B`;
  if (count < 1048576) return `${(count/1024).toFixed(1)} KB`;
  return `${(count/1048576).toFixed(2)} MB`;
}

function freshRows(maxAge) {
  const now = Date.now();
  for (const [key,row] of rows) if (now-row.seen > 30000) rows.delete(key);
  return [...rows.values()].filter(row => now-row.seen <= maxAge);
}

// Open connections per application, counted from the newest snapshot only: a
// row whose last_seen predates it was seen earlier and is no longer open.
function openConnections() {
  const counts = new Map();
  const cutoff = historyObservedAt/1000 - 4;
  for (const row of historyRows) {
    if (row.last_seen < cutoff || !OPEN_STATES.has(row.state)) continue;
    const key = row.identity;
    counts.set(key, (counts.get(key)||0) + 1);
    if (!knownApps.has(key)) {
      knownApps.set(key, {pid:row.pid, name:row.process, seen:row.last_seen*1000});
    }
  }
  return counts;
}

function aggregateApps() {
  const apps = new Map();
  const open = openConnections();
  const now = Date.now();
  for (const [key,item] of knownApps) {
    const totals = usage.get(key) || {rx:0,tx:0};
    apps.set(key, {...item, key, rx:0, tx:0, measured:false, open:open.get(key)||0,
      bytesIn:totals.rx, bytesOut:totals.tx, total:totals.rx+totals.tx});
  }
  for (const row of freshRows(10000)) {
    const item = apps.get(row.identity);
    if (!item) continue;
    if (now-row.seen <= 2600 && row.state === 'measured') {
      item.rx += row.rx; item.tx += row.tx; item.measured = true;
    }
  }
  return apps;
}

function valueForSort(item) {
  if (sort.field === 'name') return item.name.toLocaleLowerCase(language);
  if (sort.field === 'total') return item.total;
  if (sort.field === 'pid') return item.pid;
  return item.measured ? item[sort.field] : -1;
}

function compareKeys(a,b,apps) {
  const av = sortValues.get(a), bv = sortValues.get(b);
  let result = typeof av === 'string' ? av.localeCompare(bv) : av-bv;
  if (sort.direction === 'desc') result = -result;
  return result || apps.get(a).name.localeCompare(apps.get(b).name) || apps.get(a).pid-apps.get(b).pid;
}

// The displayed order only changes when the user asks for it, so a row never
// moves out from under the pointer while the figures underneath refresh.
function updateOrder(apps, refresh=false) {
  if (refresh) { appOrder=[]; sortValues.clear(); }
  appOrder = appOrder.filter(key => apps.has(key));
  let added = false;
  for (const [key,item] of apps) {
    if (!sortValues.has(key)) sortValues.set(key, valueForSort(item));
    if (!appOrder.includes(key)) { appOrder.push(key); added = true; }
  }
  if (added || refresh) appOrder.sort((a,b)=>compareKeys(a,b,apps));
  for (const key of sortValues.keys()) if (!apps.has(key)) sortValues.delete(key);
}

function appCell(item) {
  const cell = document.createElement('div'); cell.className = 'app-name';
  const data = icons.get(item.key);
  if (data) {
    const image = document.createElement('img'); image.className='app-image';
    image.src = data; image.alt = ''; cell.append(image);
  } else {
    const fallback = document.createElement('span'); fallback.className='app-icon';
    fallback.textContent = (item.name||'?').slice(0,1).toUpperCase(); cell.append(fallback);
  }
  const title = document.createElement('b'); title.textContent=item.name; title.title=item.name;
  cell.append(title);
  return cell;
}

function empty(container, text) {
  const element = document.createElement('div'); element.className='empty';
  element.textContent = text || labels[language].waiting; container.append(element);
}

function renderOverview(live, apps) {
  const ready = rates && received;
  $('rx').textContent = ready ? bytes(live.reduce((n,x)=>n+x.rx,0)) : '—';
  $('tx').textContent = ready ? bytes(live.reduce((n,x)=>n+x.tx,0)) : '—';
  const active = [...apps.values()].filter(item => item.rx+item.tx > 0 || item.open > 0);
  $('app-count').textContent = active.length ? String(active.length) : '—';
  const container = $('rows'); container.replaceChildren();
  const top = [...apps.values()]
    .filter(item => (item.measured && item.rx+item.tx > 0) || item.open > 0)
    .sort((a,b)=>(b.rx+b.tx)-(a.rx+a.tx) || b.open-a.open).slice(0,6);
  if (!top.length) return empty(container);
  for (const item of top) {
    const element = document.createElement('div'); element.className='row';
    element.append(appCell(item));
    for (const value of [String(item.pid), bytes(item.measured?item.rx:null),
                         bytes(item.measured?item.tx:null), String(item.open)]) {
      const span = document.createElement('span'); span.className='numeric';
      span.textContent = value; element.append(span);
    }
    container.append(element);
  }
}

function renderTopApps(apps) {
  const container = $('top-apps'); container.replaceChildren();
  const top = [...apps.values()].filter(item => item.total > 0)
    .sort((a,b)=>b.total-a.total).slice(0,5);
  if (!top.length) return empty(container, rates ? undefined : labels[language].noRates);
  const max = top[0].total;
  for (const item of top) {
    const element = document.createElement('div'); element.className='top-app';
    element.append(appCell(item));
    const amount = document.createElement('span'); amount.className='numeric';
    amount.textContent = size(item.total); element.append(amount);
    const bar = document.createElement('div'); bar.className='top-app-bar';
    const fill = document.createElement('span');
    fill.style.width = `${Math.max(2, item.total/max*100)}%`;
    bar.append(fill); element.append(bar);
    container.append(element);
  }
}

function renderApps(apps) {
  updateOrder(apps);
  const filter = $('app-search').value.trim().toLocaleLowerCase(language);
  const keys = appOrder.filter(key => {
    const item = apps.get(key);
    return (appView==='all' || item.total>0 || item.rx+item.tx>0 || item.open>0)
      && item.name.toLocaleLowerCase(language).includes(filter);
  });
  $('apps-count').textContent = String(keys.length);
  const container = $('apps-rows'); container.replaceChildren();
  if (!keys.length) return empty(container);
  for (const key of keys) {
    const item = apps.get(key);
    const element = document.createElement('div'); element.className='apps-row';
    element.dataset.key = key;
    element.tabIndex = 0; element.setAttribute('role','button');
    element.setAttribute('aria-label', item.name);
    element.addEventListener('click', ()=>openDetail(key));
    element.addEventListener('keydown', event => {
      if (event.key==='Enter'||event.key===' ') { event.preventDefault(); openDetail(key); }
    });
    element.append(appCell(item));
    for (const value of [bytes(item.measured?item.rx:null), bytes(item.measured?item.tx:null),
                         rates?size(item.total):'—', String(item.pid)]) {
      const span = document.createElement('span'); span.className='numeric';
      span.textContent = value; element.append(span);
    }
    container.append(element);
  }
  if (selectedApp) renderDetail(apps);
}

function detailMetric(label, value) {
  const item = document.createElement('div'); item.className='detail-metric';
  const name = document.createElement('span'); name.textContent=label;
  const number = document.createElement('b'); number.textContent=value;
  item.append(name, number); return item;
}

// A history row names its peer as text; the measurement knows that peer by
// address and port. This is the join, and it answers nothing when the two do
// not match rather than guessing at a near miss.
function peerFor(remote) {
  const match = /^(?:\[(.+)\]|([^:]+)):(\d+)$/.exec(remote || '');
  if (!match) return null;
  return peers.get(`${match[1] || match[2]}:${Number(match[3])}`) || null;
}

function renderDetail(apps=aggregateApps()) {
  const item = apps.get(selectedApp);
  if (!item) return closeDetail();
  const body = $('detail-body'); body.replaceChildren();
  const title = appCell(item); title.classList.add('detail-app'); body.append(title);
  const meta = document.createElement('div'); meta.className='detail-meta';
  meta.textContent = `PID ${item.pid}  ·  ${item.open>0?labels[language].active:labels[language].inactive}`;
  body.append(meta);
  const current = document.createElement('div'); current.className='detail-section';
  const currentTitle = document.createElement('h3'); currentTitle.textContent=labels[language].liveRate;
  current.append(currentTitle,
    detailMetric(labels[language].download, bytes(item.measured?item.rx:null)),
    detailMetric(labels[language].upload, bytes(item.measured?item.tx:null)));
  body.append(current);
  const session = document.createElement('div'); session.className='detail-section';
  const sessionTitle = document.createElement('h3'); sessionTitle.textContent=labels[language].sessionUsage;
  session.append(sessionTitle,
    detailMetric(labels[language].download, rates?size(item.bytesIn):'—'),
    detailMetric(labels[language].upload, rates?size(item.bytesOut):'—'),
    detailMetric(labels[language].sum, rates?size(item.total):'—'),
    detailMetric(labels[language].connections, String(item.open)));
  body.append(session);
  const targets = historyRows.filter(row => row.pid===item.pid &&
    OPEN_STATES.has(row.state) && row.last_seen >= historyObservedAt/1000 - 4).slice(0,14);
  if (targets.length) {
    const section = document.createElement('div'); section.className='detail-section';
    const heading = document.createElement('h3'); heading.textContent=labels[language].target;
    section.append(heading);
    for (const row of targets) {
      const line = document.createElement('div'); line.className='detail-connection';
      const address = document.createElement('b');
      address.textContent = row.remote;
      line.append(address);
      const known = peerFor(row.remote);
      // Everything after the address is a reading of it, so it is shown as a
      // second, quieter line rather than mixed into the address itself.
      const parts = [];
      if (known?.service) parts.push(known.service);
      if (known?.country) parts.push(countryName(known.country));
      if (known?.host) parts.push(known.host);
      if (parts.length) {
        const note = document.createElement('small');
        note.textContent = parts.join('  ·  ');
        line.append(note);
      }
      line.title = `${row.local} → ${row.remote}`;
      section.append(line);
    }
    body.append(section);
  }
  const seen = document.createElement('p'); seen.className='detail-seen';
  seen.textContent = `${labels[language].lastSeen}: ${new Date(item.seen).toLocaleTimeString(language==='tr'?'tr-TR':'en-US')}`;
  body.append(seen);
}

function openDetail(key) {
  selectedApp = key; renderDetail();
  $('app-detail').classList.remove('hidden'); $('detail-close').focus();
}

function closeDetail() { selectedApp = null; $('app-detail').classList.add('hidden'); }

function renderDns() {
  if (!dnsStatus) return;
  const servers = $('dns-servers'), resolvers = $('dns-resolvers');
  servers.replaceChildren(); resolvers.replaceChildren();
  if (dnsStatus.error) {
    empty(servers, dnsStatus.error);
    $('proxy-state').textContent = '—'; $('dns-observed').textContent = ''; return;
  }
  if (!dnsStatus.servers.length) empty(servers, labels[language].noServers);
  for (const address of dnsStatus.servers) {
    const row = document.createElement('div'); row.className='dns-server';
    const value = document.createElement('b'); value.textContent=address;
    const family = document.createElement('span'); family.className='dns-family';
    family.textContent = address.includes(':')?'IPv6':'IPv4';
    row.append(value, family); servers.append(row);
  }
  $('proxy-state').textContent = labels[language][dnsStatus.proxy.active?'on':'off'];
  $('proxy-state').classList.toggle('proxy-on', dnsStatus.proxy.active);
  $('proxy-modes').textContent = Object.entries(dnsStatus.proxy.enabled)
    .filter(([,enabled])=>enabled).map(([name])=>name).join(' · ');
  for (const item of dnsStatus.resolvers) {
    const row = document.createElement('div'); row.className='dns-resolver';
    const name = document.createElement('span');
    name.textContent = item.interface || labels[language].defaultResolver;
    const address = document.createElement('b'); address.textContent=item.servers.join(', ');
    const scope = document.createElement('small');
    scope.textContent = item.scoped ? labels[language].scopedResolver : '';
    row.append(name, address, scope); resolvers.append(row);
  }
  $('dns-observed').textContent = new Date(dnsStatus.observedAt)
    .toLocaleTimeString(language==='tr'?'tr-TR':'en-US');
}

function renderHistory() {
  const container = $('history-rows'); container.replaceChildren();
  if (historyError) return empty(container, historyError);
  const filter = $('history-search').value.trim().toLocaleLowerCase(language);
  const visible = historyRows.filter(row =>
    `${row.process} ${row.remote} ${row.protocol}`.toLocaleLowerCase(language).includes(filter));
  $('history-count').textContent = String(visible.length);
  if (!visible.length) return empty(container, labels[language].noHistory);
  for (const row of visible) {
    const element = document.createElement('div'); element.className='history-row';
    element.append(appCell({key:row.identity, name:row.process}));
    const target = document.createElement('button'); target.className='history-target';
    target.textContent = row.remote; target.title = `${row.local} → ${row.remote}`;
    const known = peerFor(row.remote);
    if (known) {
      const parts = [known.host, known.service, known.country && countryName(known.country)]
        .filter(Boolean);
      if (parts.length) target.title = parts.join('  ·  ');
    }
    target.addEventListener('click', () => {
      const host = row.remote.replace(/^\[(.+)\]:\d+$/, '$1').replace(/:\d+$/, '');
      $('diagnose-target').value = host; runDiagnostic(host);
    });
    const protocol = document.createElement('span'); protocol.className='tag';
    protocol.textContent = row.protocol.toUpperCase();
    const state = document.createElement('span'); state.className='history-state';
    state.textContent = row.state || '—';
    const seen = document.createElement('span'); seen.className='numeric';
    seen.textContent = new Date(row.last_seen*1000).toLocaleString(
      language==='tr'?'tr-TR':'en-US',
      {month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'});
    element.append(target, protocol, state, seen); container.append(element);
  }
}

function renderDiagnostic() {
  const container = $('diagnose-results'); container.replaceChildren();
  container.classList.toggle('hidden', !diagnosis);
  if (!diagnosis) return;
  if (diagnosis.error) { container.textContent = diagnosis.error; return; }
  for (const [key,title] of [['dns','DNS'],['tcp','TCP'],['tls','TLS']]) {
    const stage = diagnosis[key];
    if (!stage) continue;
    const row = document.createElement('div'); row.className='diagnose-stage';
    const name = document.createElement('b'); name.textContent=title;
    const status = document.createElement('span');
    status.className = stage.ok?'diagnose-pass':stage.skipped?'diagnose-skip':'diagnose-fail';
    status.textContent = labels[language][stage.ok?'passed':stage.skipped?'skipped':'failed'];
    const detail = document.createElement('small');
    detail.textContent = stage.error||stage.addresses?.join(', ')||stage.address||stage.version||'';
    row.append(name, status, detail); container.append(row);
  }
}

async function runDiagnostic(target) {
  $('diagnose-button').disabled = true;
  $('diagnose-button').textContent = labels[language].testing;
  try { diagnosis = await window.wirecove.diagnose(target); }
  catch (error) { diagnosis = {error:error.message}; }
  finally {
    $('diagnose-button').disabled = false;
    $('diagnose-button').textContent = labels[language].test;
    renderDiagnostic();
  }
}

function fillModes() {
  const select = $('dpi-mode');
  const chosen = select.value;
  select.replaceChildren();
  for (const mode of dpiModes) {
    const option = document.createElement('option');
    option.value = mode.id;
    option.textContent = mode.label[language] || mode.label.en;
    select.append(option);
  }
  if (chosen && dpiModes.some(mode => mode.id === chosen)) select.value = chosen;
  else if (dpiState?.mode) select.value = dpiState.mode;
}

function renderDpi() {
  const supported = features.dpi.supported;
  const running = Boolean(dpiState?.running);
  $('dpi-state').textContent = labels[language][!supported?'unavailable':running?'running':'stopped'];
  $('dpi-state').classList.toggle('active', running);
  $('dpi-engine').textContent = features.dpi.version
    ? `GoodbyeDPI ${features.dpi.version}` : labels[language].unavailable;
  $('dpi-mode').disabled = !supported || dpiBusy;
  $('dpi-apply').disabled = !supported || dpiBusy;
  $('dpi-stop').disabled = !supported || dpiBusy || !running;
  $('dpi-apply').textContent = dpiBusy ? labels[language].applying : labels[language].apply;
  const chosen = dpiModes.find(item => item.id === $('dpi-mode').value);
  const active = running ? dpiModes.find(item => item.id === dpiState.mode) : null;
  $('dpi-warning').textContent = labels[language].dnsOverride;
  $('dpi-warning').classList.toggle('hidden',
    !((active || chosen)?.redirectsDns));
  $('dpi-message').textContent = dpiState?.lastError || (supported ? '' : reasonFor(features.dpi));
  const log = Array.isArray(dpiState?.logTail) ? dpiState.logTail.join('\n').trim() : '';
  $('dpi-log').textContent = log || labels[language].noLog;
}

// --- the host, service, country and LAN/WAN views ---------------------------
// All four add up the same endpoint rows; none of them counts anything twice.

function livePeers() {
  const now = Date.now();
  for (const [key, row] of peers) if (now - row.seen > 30000) peers.delete(key);
  return [...peers.values()];
}

function groupPeers(rows, keyOf, labelOf, subOf) {
  const groups = new Map();
  for (const row of rows) {
    const key = keyOf(row);
    if (key == null) continue;
    const entry = groups.get(key)
      || {key, label: labelOf(row), sub: subOf ? subOf(row) : null,
          total: 0, rate: 0, sockets: 0, code: null};
    entry.total += row.bytes_in + row.bytes_out;
    entry.rate += (row.bytes_in_per_second || 0) + (row.bytes_out_per_second || 0);
    entry.sockets += row.sockets || 0;
    groups.set(key, entry);
  }
  return [...groups.values()].filter(item => item.total > 0)
    .sort((a, b) => b.total - a.total);
}

function renderBreakdownList(container, items, feature) {
  container.replaceChildren();
  if (!feature.supported) return empty(container, reasonFor(feature));
  if (!items.length) return empty(container, labels[language].noPeers);
  const max = items[0].total || 1;
  for (const item of items.slice(0, 8)) {
    const element = document.createElement('div');
    element.className = 'breakdown-row';
    const name = document.createElement('span');
    name.className = 'breakdown-name';
    // The label and the address it resolved from are two lines, each clipped
    // on its own. Left as bare text they run together and read as one word.
    const label = document.createElement('span');
    label.className = 'breakdown-label';
    const chip = item.code ? codeChip(item.code) : null;
    if (chip) label.append(chip);
    label.append(document.createTextNode(item.label));
    name.append(label);
    name.title = item.sub ? `${item.label} (${item.sub})` : item.label;
    if (item.sub) {
      const sub = document.createElement('small');
      sub.className = 'breakdown-sub';
      sub.textContent = item.sub;
      name.append(sub);
    }
    const bar = document.createElement('div');
    bar.className = 'breakdown-bar';
    const fill = document.createElement('i');
    fill.style.width = `${Math.max(2, Math.round(item.total / max * 100))}%`;
    bar.append(fill);
    const value = document.createElement('b');
    value.className = 'numeric';
    value.textContent = size(item.total);
    element.append(name, bar, value);
    container.append(element);
  }
}

function renderBreakdown() {
  const rows = livePeers();
  renderBreakdownList($('hosts-list'),
    groupPeers(rows, row => row.address, row => row.host || row.address,
      // The address is shown even when a name came back: the name is reverse
      // DNS, which is whatever the address holder chose to publish.
      row => (row.host ? row.address : null)),
    features.hosts);
  renderBreakdownList($('services-list'),
    groupPeers(rows, row => row.service || `:${row.port}`,
      row => row.service || `${labels[language].port} ${row.port}`),
    features.services);
  const countries = groupPeers(rows.filter(row => row.scope === 'wan'),
    row => row.country || '??', row => countryName(row.country));
  for (const item of countries) item.code = item.key;
  renderBreakdownList($('countries-list'), countries,
    features.countries.supported ? features.countries
      : {supported: false,
         reasonKey: features.countries.reasonKey === 'missing'
           ? 'missing.countries' : features.countries.reasonKey,
         reason: features.countries.reason});
  // The split is read off the addresses themselves, so it is exact whenever
  // the bytes behind it are.
  let wan = 0, lan = 0;
  for (const row of rows) {
    const total = row.bytes_in + row.bytes_out;
    if (row.scope === 'lan') lan += total; else wan += total;
  }
  const ceiling = Math.max(wan, lan, 1);
  $('wan-value').textContent = rates ? size(wan) : '\u2014';
  $('lan-value').textContent = rates ? size(lan) : '\u2014';
  $('wan-bar').style.width = `${Math.round(wan / ceiling * 100)}%`;
  $('lan-bar').style.width = `${Math.round(lan / ceiling * 100)}%`;
}

// --- blocking ---------------------------------------------------------------
// An application is blocked by the path it runs from, so the interface has to
// know that path before it can offer the switch. A process whose path cannot
// be read keeps the switch off rather than blocking whatever else shares a PID.

function resolvePaths(items) {
  let started = 0;
  for (const item of items) {
    if (programs.has(item.key) || pendingPaths.has(item.key) || started >= 6) continue;
    pendingPaths.add(item.key);
    started += 1;
    window.wirecove.pathForPid(item.pid)
      .then(path => { programs.set(item.key, path || null); })
      .catch(() => { programs.set(item.key, null); })
      .finally(() => {
        pendingPaths.delete(item.key);
        if (page === 'firewall') renderFirewall();
      });
  }
}

function blockedSet() {
  const blocked = new Map();
  for (const entry of firewallState?.blocked || []) {
    blocked.set(entry.program.toLowerCase(), entry);
  }
  return blocked;
}

async function toggleBlock(program, label, on) {
  if (!features.firewall.supported || firewallBusy.has(program)) return;
  firewallBusy.add(program);
  firewallError = null;
  renderFirewall();
  try {
    firewallState = on ? await window.wirecove.blockApp(program, label)
                       : await window.wirecove.unblockApp(program);
  } catch (error) {
    firewallError = error.message;
  } finally {
    firewallBusy.delete(program);
    renderFirewall();
  }
}

function firewallRow(item, blocked) {
  const element = document.createElement('div');
  element.className = 'row fw-row';
  element.append(appCell(item));
  for (const value of [bytes(item.measured ? item.rx : null),
                       bytes(item.measured ? item.tx : null),
                       item.pid ? String(item.open) : '\u2014']) {
    const span = document.createElement('span');
    span.className = 'numeric';
    span.textContent = value;
    element.append(span);
  }
  const cell = document.createElement('span');
  cell.className = 'fw-toggle-cell';
  const program = item.program;
  if (!program) {
    cell.textContent = '\u2014';
  } else {
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = `switch fw-toggle${blocked ? ' on' : ''}`;
    toggle.setAttribute('role', 'switch');
    toggle.setAttribute('aria-checked', blocked ? 'true' : 'false');
    toggle.disabled = !features.firewall.supported || firewallBusy.has(program);
    toggle.title = program;
    toggle.append(document.createElement('i'));
    toggle.addEventListener('click', () => toggleBlock(program, item.name, !blocked));
    cell.append(toggle);
  }
  element.append(cell);
  return element;
}

function renderFirewall() {
  const profiles = $('fw-profiles');
  profiles.replaceChildren();
  for (const profile of firewallState?.profiles || []) {
    const chip = document.createElement('span');
    chip.className = `fw-chip${profile.enabled ? ' on' : ''}`;
    chip.textContent = `${profile.name} \u00b7 ${labels[language][profile.enabled ? 'on' : 'off']}`;
    profiles.append(chip);
  }
  $('fw-note').textContent = firewallError
    || (features.firewall.supported ? labels[language].blockWrites
                                    : labels[language].blockNeedsAdmin);
  const blocked = blockedSet();
  const apps = [...aggregateApps().values()]
    .map(item => ({...item, program: programs.get(item.key) || null}));
  resolvePaths(apps);
  const query = $('fw-search').value.trim().toLocaleLowerCase(language);
  let items = apps.filter(item => item.open > 0 || item.measured || item.total > 0);
  if (fwView === 'blocked') {
    // Something that is blocked must stay visible whether or not it is
    // running, or there would be no way to let it out again.
    const running = new Set(items.map(item => (item.program || '').toLowerCase()));
    items = items.filter(item => blocked.has((item.program || '').toLowerCase()));
    for (const [key, entry] of blocked) {
      if (running.has(key)) continue;
      items.push({key: `blocked:${key}`, name: entry.name, pid: 0, rx: 0, tx: 0,
                  measured: false, open: 0, total: 0, program: entry.program});
    }
  }
  if (query) items = items.filter(item => item.name.toLocaleLowerCase(language).includes(query));
  items.sort((a, b) => (b.rx + b.tx) - (a.rx + a.tx) || a.name.localeCompare(b.name));
  $('fw-count').textContent = String(items.length);
  const container = $('fw-rows');
  container.replaceChildren();
  if (!items.length) return empty(container, labels[language].noHistory);
  for (const item of items.slice(0, 200)) {
    container.append(firewallRow(item, blocked.has((item.program || '').toLowerCase())));
  }
}

// --- the local network ------------------------------------------------------

function renderNetwork() {
  const container = $('net-rows');
  container.replaceChildren();
  const devices = netState?.devices || [];
  $('net-count').textContent = String(devices.length);
  $('net-summary').textContent = netError
    || (netBusy ? labels[language].scanning
      : netState?.scanned ? labels[language].swept : labels[language].neighborsOnly);
  $('net-scan').disabled = netBusy;
  $('net-scan').textContent = labels[language][netBusy ? 'scanning' : 'scanNetwork'];
  if (!devices.length) return empty(container, labels[language].noDevices);
  for (const device of devices) {
    const element = document.createElement('div');
    element.className = 'row net-row';
    for (const value of [device.host || device.address, device.address,
                         device.mac || '\u2014', device.interface || '\u2014',
                         device.state]) {
      const span = document.createElement('span');
      span.textContent = value;
      span.title = value;
      element.append(span);
    }
    container.append(element);
  }
}

// --- live connections -------------------------------------------------------
// The same endpoint rows the breakdowns are built from, listed one at a time
// instead of grouped, with the process that holds each one joined on from the
// connection snapshot. Two sources, one row: the bytes are measured, the
// owner is observed, and where the two cannot be joined the owner is left
// blank rather than guessed.

// 127.0.0.1 and ::1 are this machine talking to itself. Calling that the
// local network would be wrong in a way that matters: nothing left the box.
function loopback(address) {
  return address === '::1' || /^127\./.test(address);
}

function peerOwners() {
  const owners = new Map();
  const cutoff = historyObservedAt / 1000 - 6;
  for (const row of historyRows) {
    if (!OPEN_STATES.has(row.state) || row.last_seen < cutoff) continue;
    const match = /^(?:\[(.+)\]|([^:]+)):(\d+)$/.exec(row.remote || '');
    if (!match) continue;
    const key = `${match[1] || match[2]}:${Number(match[3])}`;
    const held = owners.get(key) || [];
    if (!held.some(item => item.identity === row.identity)) {
      held.push({ identity: row.identity, pid: row.pid, name: row.process });
    }
    owners.set(key, held);
  }
  return owners;
}

function connectionRows() {
  const owners = peerOwners();
  const term = $('conn-search').value.trim().toLowerCase();
  return livePeers()
    .filter(row => row.bytes_in + row.bytes_out > 0)
    .filter(row => connView === 'all' || row.scope === connView)
    .map(row => {
      const held = owners.get(`${row.address}:${row.port}`) || [];
      return { ...row, held, app: held.length ? held[0].name : null };
    })
    .filter(row => !term || [row.app, row.address, row.host, row.service,
      row.country && countryName(row.country)]
      .some(value => value && String(value).toLowerCase().includes(term)))
    .sort((a, b) => (b.rx + b.tx) - (a.rx + a.tx)
      || (b.bytes_in + b.bytes_out) - (a.bytes_in + a.bytes_out));
}

function twoLineCell(primary, secondary, className) {
  const cell = document.createElement('div');
  cell.className = className;
  const top = document.createElement('b');
  top.textContent = primary;
  cell.append(top);
  if (secondary) {
    const under = document.createElement('small');
    under.textContent = secondary;
    cell.append(under);
  }
  cell.title = secondary ? `${primary} · ${secondary}` : primary;
  return cell;
}

function renderConnections() {
  renderUdpCard();
  const container = $('conn-rows');
  container.replaceChildren();
  if (!features.hosts.supported) {
    $('conn-count').textContent = '0';
    return empty(container, reasonFor(features.hosts));
  }
  const rows = connectionRows();
  $('conn-count').textContent = String(rows.length);
  if (!rows.length) return empty(container, labels[language].noConnections);
  for (const row of rows.slice(0, 300)) {
    const element = document.createElement('div');
    element.className = 'row conn-row';
    if (row.held.length) {
      const cell = appCell({ key: row.held[0].identity, name: row.app });
      if (row.held.length > 1) {
        const more = document.createElement('small');
        more.className = 'conn-more';
        more.textContent = `+${row.held.length - 1}`;
        more.title = row.held.map(item => `${item.name} (PID ${item.pid})`).join('\n');
        cell.append(more);
      }
      element.append(cell);
    } else {
      element.append(twoLineCell(labels[language].unknownApp, null, 'app-name plain'));
    }
    const shown = row.address.includes(':') ? `[${row.address}]:${row.port}`
      : `${row.address}:${row.port}`;
    element.append(twoLineCell(shown, row.host, 'conn-target'));
    const service = document.createElement('span');
    service.textContent = row.service || `${labels[language].port} ${row.port}`;
    element.append(service);
    const country = document.createElement('span');
    country.className = 'conn-country';
    if (row.country) {
      country.append(codeChip(row.country));
      country.append(document.createTextNode(countryName(row.country)));
    } else {
      country.textContent = loopback(row.address) ? labels[language].thisMachine
        : row.scope === 'lan' ? labels[language].localNetwork : '—';
    }
    element.append(country);
    for (const amount of [size(row.bytes_in), size(row.bytes_out)]) {
      const span = document.createElement('span');
      span.className = 'numeric';
      span.textContent = amount;
      element.append(span);
    }
    container.append(element);
  }
}

// --- the lasting record -----------------------------------------------------

function usageDays(report, count = 30) {
  const byDay = new Map(report.days.map(row => [row.day, row]));
  const pad = value => String(value).padStart(2, '0');
  const start = new Date(`${report.today}T00:00:00`);
  const days = [];
  for (let back = count - 1; back >= 0; back--) {
    const date = new Date(start);
    date.setDate(date.getDate() - back);
    const key = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    const row = byDay.get(key);
    // A day with no row is a day nothing was recorded, which is not the same
    // as a day with no traffic; the bar is drawn empty and says so.
    days.push({ day: key, in: row ? row.in : 0, out: row ? row.out : 0,
      recorded: Boolean(row) });
  }
  return days;
}

function signatureCell(item) {
  const span = document.createElement('span');
  span.className = 'sig';
  if (!item.signature) {
    span.textContent = '—';
    return span;
  }
  if (item.signature === 'Valid') {
    span.classList.add('ok');
    span.textContent = item.signer || 'Valid';
  } else if (item.signature === 'NotSigned') {
    span.classList.add('warn');
    span.textContent = labels[language].unsigned;
  } else {
    span.classList.add('warn');
    span.textContent = item.signature;
  }
  // The word Windows used is kept in the tooltip even when the cell shows the
  // signer: the status is the fact, the name is the convenience.
  span.title = item.signer ? `${item.signature} · ${item.signer}` : item.signature;
  return span;
}

function renderUsage() {
  const bars = $('usage-days');
  const container = $('usage-rows');
  bars.replaceChildren();
  container.replaceChildren();
  if (!features.usage.supported) {
    for (const id of ['usage-today', 'usage-month', 'usage-all']) $(id).textContent = '—';
    $('usage-count').textContent = '0';
    $('usage-note').textContent = '';
    empty(bars, reasonFor(features.usage));
    return empty(container, reasonFor(features.usage));
  }
  if (usageError) {
    $('usage-note').textContent = usageError;
    return empty(container, usageError);
  }
  if (!usageReport) return empty(container, labels[language].waiting);
  $('usage-today').textContent = size(usageReport.totals.today.in + usageReport.totals.today.out);
  $('usage-month').textContent = size(usageReport.totals.month.in + usageReport.totals.month.out);
  $('usage-all').textContent = size(usageReport.totals.all.in + usageReport.totals.all.out);
  // Whether these totals include UDP is the single most important thing to
  // say about them: the same number means two different things depending on
  // the route, and a figure whose scope is unstated is a figure that misleads.
  $('usage-note').textContent = `${labels[language].recordNote
    .replace('{days}', String(usageReport.retentionDays))} · ${
    udpRoute().bytes ? labels[language].udpIncluded : labels[language].udpExcluded}`;

  const days = usageDays(usageReport);
  const ceiling = Math.max(1, ...days.map(day => day.in + day.out));
  for (const day of days) {
    const column = document.createElement('div');
    column.className = `usage-day${day.recorded ? '' : ' blank'}`;
    const stack = document.createElement('div');
    stack.className = 'usage-stack';
    for (const [amount, name] of [[day.in, 'down'], [day.out, 'up']]) {
      const part = document.createElement('i');
      part.className = name;
      part.style.height = `${(amount / ceiling) * 100}%`;
      stack.append(part);
    }
    column.append(stack);
    column.title = `${day.day}\n${labels[language].download}: ${size(day.in)}\n`
      + `${labels[language].upload}: ${size(day.out)}`;
    if (day.day.endsWith('-01') || day.day === usageReport.today) {
      const tick = document.createElement('small');
      tick.textContent = day.day.slice(8);
      column.append(tick);
    }
    bars.append(column);
  }

  const programs = usageReport.programs.filter(item => item.total.in + item.total.out > 0);
  $('usage-count').textContent = String(programs.length);
  if (!programs.length) return empty(container, labels[language].noUsageYet);
  for (const item of programs.slice(0, 200)) {
    const element = document.createElement('div');
    element.className = 'row usage-row';
    element.append(twoLineCell(item.name, item.path, 'app-name plain'));
    element.append(signatureCell(item));
    for (const total of [item.today, item.month, item.total]) {
      const span = document.createElement('span');
      span.className = 'numeric';
      span.textContent = total.in + total.out ? size(total.in + total.out) : '—';
      span.title = `${labels[language].download} ${size(total.in)} · `
        + `${labels[language].upload} ${size(total.out)}`;
      element.append(span);
    }
    container.append(element);
  }
}

async function loadUsage() {
  try {
    usageReport = await window.wirecove.usageReport();
    usageError = null;
  } catch (error) {
    usageError = error.message;
  }
  if (page === 'usage') renderUsage();
}

// --- alerts -----------------------------------------------------------------
// After the fact, and said so. Nothing here held a packet back to ask first;
// these are things that already happened.

function renderAlerts() {
  const container = $('alerts-list');
  container.replaceChildren();
  $('alerts-note').textContent = labels[language].alertsNote;
  if (!features.alerts.supported) return empty(container, reasonFor(features.alerts));
  if (!alerts.length) return empty(container, labels[language].noAlerts);
  for (const item of alerts.slice(0, 60)) {
    const element = document.createElement('div');
    element.className = `alert alert-${item.kind}`;
    const head = document.createElement('b');
    head.textContent = item.name || item.path;
    head.title = item.path;
    element.append(head);
    const what = document.createElement('span');
    what.className = 'alert-kind';
    const names = { size: 'changedSize', modified: 'changedModified', signer: 'changedSigner' };
    what.textContent = item.kind === 'binary-changed'
      ? `${labels[language].binaryChanged} (${(item.changed || [])
          .map(field => labels[language][names[field]] || field).join(', ')})`
      : labels[language].firstConnection;
    element.append(what);
    const when = document.createElement('small');
    when.textContent = new Date(item.at).toLocaleString(language);
    element.append(when);
    container.append(element);
  }
}

async function loadAlerts() {
  try { alerts = await window.wirecove.readAlerts() || []; }
  catch (_) { alerts = []; }
  renderAlerts();
}

// --- settings ---------------------------------------------------------------

function renderSettings() {
  const toggle = $('autostart-toggle');
  const on = Boolean(settings && settings.autostart);
  toggle.classList.toggle('on', on);
  toggle.setAttribute('aria-checked', on ? 'true' : 'false');
  toggle.disabled = !features.autostart.supported || settings === null;
  $('settings-record').textContent = labels[language].recordNote
    .replace('{days}', String(features.usage.retentionDays || 90));
  renderUdpModes();
}


// --- the UDP route ----------------------------------------------------------
// Which route is running and what it gives. The chosen mode comes from the
// machine once settings have been read, and from the capability table before
// that, so this never reports a route as counting bytes on the strength of
// what was stored rather than what is running.
function udpRoute() {
  const mode = (settings && settings.udpMode) || 'off';
  const table = (settings && settings.udpModes) || features.udp.modes || {};
  return { mode, ...(table[mode] || { supported: false, bytes: false, peers: false }) };
}

// Four options, each carrying what it gives and, where it cannot run, the
// reason in one line. An option this machine refuses is drawn disabled with
// its reason rather than left clickable and allowed to fail.
function renderUdpModes() {
  const container = $('udp-modes');
  if (!container) return;
  container.textContent = '';
  const available = (settings && settings.udpModes) || features.udp.modes || {};
  const current = (settings && settings.udpMode) || 'off';
  for (const mode of ['off', 'sockets', 'etw', 'windivert']) {
    const info = available[mode] || { supported: false, reason: null };
    const option = document.createElement('button');
    option.className = `udp-mode${mode === current ? ' selected' : ''}`;
    option.type = 'button';
    option.setAttribute('role', 'radio');
    option.setAttribute('aria-checked', mode === current ? 'true' : 'false');
    option.disabled = !info.supported || settings === null;
    const name = document.createElement('b');
    name.textContent = labels[language][`udp.${mode}`];
    const what = document.createElement('small');
    // What it cannot do comes before what it does: a reason the user cannot
    // act on is worse than useless if it is hidden under a description.
    what.textContent = info.supported
      ? labels[language][`udpWhat.${mode}`]
      : udpReasonFor(mode, info);
    option.append(name, what);
    if (!option.disabled) option.addEventListener('click', () => chooseUdpMode(mode));
    container.append(option);
  }
  const error = $('udp-error');
  const message = (settings && settings.udpError) || udpError;
  error.classList.toggle('hidden', !message);
  error.textContent = message ? `${labels[language].udpStopped}: ${message}` : '';
}

// Why one route in particular is refused. Keyed by the route as well as the
// reason: these two both report 'elevation', but for different reasons, and
// the shared reason table says WinDivert - which has nothing to do with the
// kernel's event stream. Falls back to what the measurement layer itself
// said rather than inventing a line.
function udpReasonFor(mode, info) {
  return labels[language][`udpReason.${mode}.${info.reasonKey}`]
    || info.reason || labels[language].udpRefused;
}

async function chooseUdpMode(mode) {
  for (const option of document.querySelectorAll('.udp-mode')) option.disabled = true;
  udpError = null;
  udpLive = null;
  try {
    const result = await window.wirecove.setUdpMode(mode);
    // The main process answers with the mode that is actually running, which
    // is not always the one asked for: a route it refuses leaves the old one
    // in place and says why.
    settings = { ...(settings || {}), udpMode: result.mode };
    if (result.refused) udpError = result.reason || labels[language].udpRefused;
  } catch (error) {
    udpError = error && error.message ? error.message : labels[language].udpRefused;
  }
  renderUdpModes();
  renderUdpCard();
}

// What the chosen route knows, on the page that lists connections. The columns
// change with the route, because the routes do not know the same things: one
// has bytes and the other has only sockets, and a byte column full of dashes
// would read as zero traffic rather than as no measurement.
function renderUdpCard() {
  const rows = $('udp-rows');
  const head = $('udp-head');
  const meta = $('udp-meta');
  if (!rows) return;
  rows.textContent = '';
  const route = udpRoute();
  const mode = route.mode;
  if (mode === 'off') {
    head.classList.add('hidden');
    meta.textContent = labels[language]['udp.off'];
    return empty(rows, labels[language].udpNotMeasured);
  }
  meta.textContent = labels[language][`udp.${mode}`];
  const counts = Boolean(route.bytes);
  head.classList.remove('hidden');
  head.className = `table-head udp-head${counts ? ' counts' : ''}`;
  head.textContent = '';
  const columns = counts
    ? ['application', 'download', 'upload']
    : ['application', 'udpSockets', 'udpPorts'];
  for (const key of columns) {
    const cell = document.createElement('span');
    cell.textContent = labels[language][key];
    head.append(cell);
  }
  if (udpError) return empty(rows, `${labels[language].udpStopped}: ${udpError}`);
  if (!udpLive) return empty(rows, labels[language].waiting);
  const processes = [...udpLive.processes];
  if (!processes.length) return empty(rows, labels[language].udpNoRows);
  processes.sort((left, right) => counts
    ? (right.bytes_in + right.bytes_out) - (left.bytes_in + left.bytes_out)
    : right.sockets - left.sockets);
  for (const row of processes.slice(0, 80)) {
    const line = document.createElement('div');
    line.className = `udp-row${counts ? ' counts' : ''}`;
    line.append(twoLineCell(row.process || labels[language].unknownApp,
                            `PID ${row.pid}`, 'udp-app'));
    if (counts) {
      const received = document.createElement('span');
      received.textContent = size(row.bytes_in);
      const sent = document.createElement('span');
      sent.textContent = size(row.bytes_out);
      line.append(received, sent);
    } else {
      const sockets = document.createElement('span');
      sockets.textContent = String(row.sockets);
      const ports = document.createElement('span');
      ports.className = 'udp-ports';
      ports.textContent = (row.ports || []).join(', ');
      line.append(sockets, ports);
    }
    rows.append(line);
  }
  if (!counts) {
    const note = document.createElement('div');
    note.className = 'udp-foot';
    note.textContent = labels[language].udpSocketsOnly;
    rows.append(note);
  } else if (udpLive.unattributed_in || udpLive.unattributed_out) {
    const note = document.createElement('div');
    note.className = 'udp-foot';
    note.textContent = labels[language].udpUnattributedNote.replace(
      '{amount}', size(udpLive.unattributed_in + udpLive.unattributed_out));
    rows.append(note);
  }
}

async function loadSettings() {
  // Asked of the machine, not remembered: Windows' own startup list can be
  // changed from outside this application.
  try { settings = await window.wirecove.readSettings(); }
  catch (_) { settings = null; }
  renderSettings();
}

async function toggleAutostart() {
  if (!features.autostart.supported) return;
  const next = !(settings && settings.autostart);
  $('autostart-toggle').disabled = true;
  try { settings = { ...(settings || {}), ...await window.wirecove.setAutostart(next) }; }
  catch (_) { /* unchanged, and the switch re-reads below */ }
  renderSettings();
}

function render() {
  const live = freshRows(2600).filter(row => row.state === 'measured');
  const apps = aggregateApps();
  renderOverview(live, apps);
  renderTopApps(apps);
  renderBreakdown();
  if (page === 'apps') renderApps(apps);
  if (page === 'firewall') renderFirewall();
  if (page === 'connections') renderConnections();
}

function markSort() {
  document.querySelectorAll('[data-sort]').forEach(button => {
    const selected = button.dataset.sort === sort.field;
    const name = button.dataset.i18n ? labels[language][button.dataset.i18n] : 'PID';
    button.textContent = selected ? `${name} ${sort.direction==='asc'?'↑':'↓'}` : name;
    button.classList.toggle('selected', selected);
  });
}

function renderWarning() {
  const strip = $('warning');
  const message = measurementError
    || (needsElevation ? labels[language].needsElevation : rates ? '' : reasonFor(features.traffic));
  $('warning-text').textContent = message;
  $('elevate').classList.toggle('hidden', !needsElevation || Boolean(measurementError));
  strip.classList.toggle('hidden', !message);
}

function statusText() {
  if (measurementError) return labels[language].error;
  if (!rates) return labels[language].noRates;
  return labels[language][received?'measuring':'starting'];
}

function translate() {
  document.documentElement.lang = language;
  // The tray menu lives in the main process and would otherwise be stuck in
  // whichever language the application started in.
  window.wirecove.setLanguage(language);
  document.querySelectorAll('[data-i18n]').forEach(el =>
    el.textContent = labels[language][el.dataset.i18n]);
  $('language').textContent = language.toUpperCase();
  $('main-title').textContent = page==='dns' ? 'DNS' : page==='dpi' ? 'DPI'
    : page==='firewall' ? labels[language].protect
    : page==='network' ? labels[language].network
    : page==='connections' ? labels[language].live
    : page==='usage' ? labels[language].usage
    : labels[language][page==='apps'?'apps':page==='history'?'history':'networkActivity'];
  // In a narrow window the bar shows icons only, so each one has to carry
  // its own name rather than relying on a label that is not there.
  document.querySelectorAll('.nav[data-page]').forEach(button => {
    const label = button.querySelector('b');
    if (label) button.title = label.textContent;
  });
  $('conn-search').placeholder = labels[language].connSearch;
  $('conn-search').setAttribute('aria-label', labels[language].connSearch);
  $('settings').title = labels[language].settings;
  $('app-search').placeholder = labels[language].search;
  $('app-search').setAttribute('aria-label', labels[language].search);
  $('history-search').placeholder = labels[language].historySearch;
  $('history-search').setAttribute('aria-label', labels[language].historySearch);
  $('diagnose-target').placeholder = labels[language].targetInput;
  $('diagnose-target').setAttribute('aria-label', labels[language].targetInput);
  document.querySelector('[data-range="60"]').textContent = language==='tr'?'1 dk':'1 min';
  document.querySelector('[data-range="300"]').textContent = language==='tr'?'5 dk':'5 min';
  $('status-text').textContent = statusText();
  renderWarning();
  $('fw-search').placeholder = labels[language].search;
  $('fw-search').setAttribute('aria-label', labels[language].search);
  markSort(); fillModes(); renderDpi(); renderDns(); renderHistory(); renderDiagnostic();
  renderFirewall(); renderNetwork();
  renderConnections(); renderUsage(); renderAlerts(); renderSettings();
  renderUdpModes(); renderUdpCard();
  render();
}

function chart() {
  const canvas = $('chart'), ratio = devicePixelRatio||1, rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  canvas.width = Math.max(1, Math.floor(rect.width*ratio));
  canvas.height = Math.max(1, Math.floor(rect.height*ratio));
  const ctx = canvas.getContext('2d'); ctx.scale(ratio, ratio);
  const samples = history.slice(-chartRange);
  const w = rect.width, h = rect.height;
  const max = Math.max(1024, ...samples.map(x=>Math.max(x.rx,x.tx)))*1.16;
  $('axis-max').textContent = rates ? bytes(max) : '—';
  $('axis-mid').textContent = rates ? bytes(max/2) : '—';
  ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--line');
  ctx.lineWidth = .7;
  for (let i=0;i<4;i++) {
    const y = 8+(h-16)*i/3;
    ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(w,y); ctx.stroke();
  }
  // Without byte counters there is no series to draw: the grid stays, the
  // area does not, so the card never shows a flat line that looks like zero.
  if (!rates) return;
  for (const [key,color] of [['tx','#75b9c0'],['rx','#ff9a19']]) {
    const points = samples.map((p,i)=>({x:w*i/(samples.length-1), y:h-8-(p[key]/max)*(h-16)}));
    ctx.beginPath(); points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));
    ctx.lineTo(w,h-8); ctx.lineTo(0,h-8); ctx.closePath();
    const gradient = ctx.createLinearGradient(0,0,0,h);
    gradient.addColorStop(0, `${color}70`); gradient.addColorStop(1, `${color}08`);
    ctx.fillStyle = gradient; ctx.fill();
    ctx.strokeStyle = color; ctx.lineWidth = 1.8; ctx.lineJoin = 'round';
    ctx.beginPath(); points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y)); ctx.stroke();
  }
  if (hoverIndex !== null) {
    const x = w*hoverIndex/(samples.length-1), sample = samples[hoverIndex];
    ctx.strokeStyle = '#cfcfcf70'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x,8); ctx.lineTo(x,h-8); ctx.stroke();
    const tip = $('chart-tooltip');
    tip.textContent = `${labels[language].download}  ${bytes(sample.rx)}\n${labels[language].upload}  ${bytes(sample.tx)}`;
    tip.style.left = `${Math.min(w-96, Math.max(74, x+74))}px`;
    tip.classList.remove('hidden');
  }
}

function setRange(seconds) {
  chartRange = seconds; hoverIndex = null; $('chart-tooltip').classList.add('hidden');
  document.querySelectorAll('[data-range]').forEach(button =>
    button.classList.toggle('selected', Number(button.dataset.range)===seconds));
  const times = seconds===60 ? ['60 sn','45 sn','30 sn','15 sn'] : ['5 dk','3:45','2:30','1:15'];
  ['time-start','time-quarter','time-half','time-threequarter']
    .forEach((id,i)=>$(id).textContent=times[i]);
  chart();
}

window.wirecove.onTraffic(measurement => {
  const sample = measurement?.processes || [];
  const endpoints = measurement?.endpoints || [];
  if (!sample.length && !endpoints.length) return;
  received = true;
  measurementError = null;
  renderWarning();
  for (const row of sample) {
    const key = row.identity;
    const previous = rows.get(key);
    if (row.state==='measured' && previous &&
        row.bytes_in>=previous.bytesIn && row.bytes_out>=previous.bytesOut) {
      const totals = usage.get(key) || {rx:0,tx:0};
      usage.set(key, {rx:totals.rx+row.bytes_in-previous.bytesIn,
                      tx:totals.tx+row.bytes_out-previous.bytesOut});
    }
    knownApps.set(key, {pid:row.pid, name:row.process, seen:Date.now()});
    rows.set(key, {pid:row.pid, identity:key, name:row.process,
      rx:row.bytes_in_per_second||0, tx:row.bytes_out_per_second||0,
      bytesIn:row.bytes_in, bytesOut:row.bytes_out, state:row.state, seen:Date.now()});
  }
  for (const row of endpoints) {
    peers.set(`${row.address}:${row.port}`,
      {...row, rx: row.bytes_in_per_second || 0, tx: row.bytes_out_per_second || 0,
       seen: Date.now()});
  }
  renderBreakdown();
  if (page === 'connections') renderConnections();
  $('status-text').textContent = statusText();
});

window.wirecove.onFirewallStatus(state => {
  firewallState = state;
  if (page === 'firewall') renderFirewall();
});

window.wirecove.onConnections(data => {
  historyError = data.error || null;
  if (data.rows) historyRows = data.rows;
  if (data.observedAt) historyObservedAt = data.observedAt;
  if (page === 'history') renderHistory();
  render();
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') $('settings-panel').classList.add('hidden');
});

window.wirecove.onAppIcon(({key,dataUrl}) => {
  icons.set(key, dataUrl);
  render();
  if (page === 'history') renderHistory();
});

window.wirecove.onDnsStatus(data => { dnsStatus = data; renderDns(); });
window.wirecove.onDpiStatus(data => { dpiState = data; renderDpi(); });
window.wirecove.onStatus(data => {
  measurementError = data.error || null;
  renderWarning();
  $('status-text').textContent = statusText();
});

document.querySelectorAll('.nav[data-page]').forEach(button => button.addEventListener('click', () => {
  closeDetail();
  page = button.dataset.page;
  document.querySelectorAll('.nav[data-page]').forEach(item =>
    item.classList.toggle('active', item===button));
  $('overview-page').classList.toggle('hidden', page!=='overview');
  $('apps-page').classList.toggle('hidden', page!=='apps');
  $('connections-page').classList.toggle('hidden', page!=='connections');
  $('usage-page').classList.toggle('hidden', page!=='usage');
  $('dns-page').classList.toggle('hidden', page!=='dns');
  $('history-page').classList.toggle('hidden', page!=='history');
  $('dpi-page').classList.toggle('hidden', page!=='dpi');
  $('firewall-page').classList.toggle('hidden', page!=='firewall');
  $('network-page').classList.toggle('hidden', page!=='network');
  if (page === 'firewall') { loadFirewall(); loadAlerts(); }
  if (page === 'network' && !netState && !netBusy) loadNetwork(false);
  // Re-read every time the page is opened: the figures are banked once a
  // minute by the process doing the measuring, so a report held from an
  // earlier visit would be behind.
  if (page === 'usage') loadUsage();
  translate(); chart();
}));

// The rules are re-read every time the page is opened: Windows' own interface
// can change them while this window is up, and a stale switch would be a lie.
async function loadFirewall() {
  try {
    firewallState = await window.wirecove.firewallStatus();
    firewallError = null;
  } catch (error) {
    firewallError = error.message;
  }
  renderFirewall();
}

async function loadNetwork(sweep) {
  netBusy = true;
  netError = null;
  renderNetwork();
  try {
    netState = sweep ? await window.wirecove.sweepNetwork()
                     : await window.wirecove.scanNetwork();
  } catch (error) {
    netError = error.message;
  } finally {
    netBusy = false;
    renderNetwork();
  }
}

$('conn-search').addEventListener('input', renderConnections);
document.querySelectorAll('[data-connview]').forEach(button =>
  button.addEventListener('click', () => {
    connView = button.dataset.connview;
    document.querySelectorAll('[data-connview]').forEach(item =>
      item.classList.toggle('selected', item === button));
    renderConnections();
  }));

$('alerts-clear').addEventListener('click', async () => {
  try { alerts = await window.wirecove.clearAlerts() || []; }
  catch (_) { /* the list is left as it is rather than cleared on screen only */ }
  renderAlerts();
});
// The UDP measurement arrives whether or not its page is open: the record is
// banked in the main process, and the card is only redrawn when it is visible.
window.wirecove.onUdp(measurement => {
  udpLive = measurement;
  udpError = null;
  // The measurement says which route produced it, which is the truth about
  // what is running. The stored choice can disagree - it is restored at
  // startup before the settings are read, and it can be changed from outside
  // this window - and a card drawn from the stale answer would show the wrong
  // columns, or none at all, for a route that is working.
  if (settings && settings.udpMode !== measurement.mode) {
    settings = { ...settings, udpMode: measurement.mode };
    if (!$('settings-panel').classList.contains('hidden')) renderUdpModes();
  }
  if (page === 'connections') renderUdpCard();
});
window.wirecove.onUdpStatus(status => {
  udpError = status && status.error ? status.error : null;
  if (page === 'connections') renderUdpCard();
  if (!$('settings-panel').classList.contains('hidden')) renderUdpModes();
});
window.wirecove.onAlerts(events => {
  alerts = [...(events || []), ...alerts].slice(0, 200);
  if (page === 'firewall') renderAlerts();
});

// Read once at startup too, not only when the panel opens: the connections
// page has to know which route is running before anyone opens settings.
loadSettings().then(() => { if (page === 'connections') renderUdpCard(); });

// The settings panel is read from the machine each time it opens.
$('settings').addEventListener('click', () => {
  $('settings-panel').classList.remove('hidden');
  loadSettings();
});
$('settings-close').addEventListener('click', () =>
  $('settings-panel').classList.add('hidden'));
$('settings-panel').addEventListener('click', event => {
  if (event.target === $('settings-panel')) $('settings-panel').classList.add('hidden');
});
$('autostart-toggle').addEventListener('click', toggleAutostart);

$('fw-search').addEventListener('input', renderFirewall);
document.querySelectorAll('[data-fwview]').forEach(button =>
  button.addEventListener('click', () => {
    fwView = button.dataset.fwview;
    document.querySelectorAll('[data-fwview]').forEach(item =>
      item.classList.toggle('selected', item === button));
    renderFirewall();
  }));
// A sweep sends packets, so it happens because this was pressed and for no
// other reason.
$('net-scan').addEventListener('click', () => { if (!netBusy) loadNetwork(true); });

document.querySelectorAll('[data-sort]').forEach(button => button.addEventListener('click', () => {
  const field = button.dataset.sort;
  sort = {field, direction: field===sort.field && sort.direction==='asc' ? 'desc'
    : field==='name' ? 'asc' : 'desc'};
  updateOrder(aggregateApps(), true); markSort(); renderApps(aggregateApps());
}));

document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => {
  appView = button.dataset.view;
  document.querySelectorAll('[data-view]').forEach(item =>
    item.classList.toggle('selected', item===button));
  renderApps(aggregateApps());
}));

$('app-search').addEventListener('input', ()=>renderApps(aggregateApps()));
$('history-search').addEventListener('input', renderHistory);
$('diagnose-form').addEventListener('submit', event => {
  event.preventDefault(); runDiagnostic($('diagnose-target').value);
});
$('history-clear').addEventListener('click', async () => {
  $('history-clear').disabled = true;
  try { await window.wirecove.clearHistory(); }
  catch (error) { historyError = error.message; renderHistory(); }
  finally { $('history-clear').disabled = false; }
});
$('detail-close').addEventListener('click', closeDetail);
$('app-detail').addEventListener('click', event => {
  if (event.target === $('app-detail')) closeDetail();
});
document.addEventListener('keydown', event => { if (event.key==='Escape') closeDetail(); });
$('show-all-apps').addEventListener('click', ()=>document.querySelector('[data-page="apps"]').click());
document.querySelectorAll('[data-range]').forEach(button =>
  button.addEventListener('click', ()=>setRange(Number(button.dataset.range))));
$('chart').addEventListener('mousemove', event => {
  if (!rates) return;
  const rect = $('chart').getBoundingClientRect();
  hoverIndex = Math.max(0, Math.min(chartRange-1,
    Math.round(event.offsetX/rect.width*(chartRange-1))));
  chart();
});
$('chart').addEventListener('mouseleave', () => {
  hoverIndex = null; $('chart-tooltip').classList.add('hidden'); chart();
});
$('dpi-mode').addEventListener('change', renderDpi);
$('dpi-form').addEventListener('submit', async event => {
  event.preventDefault();
  dpiBusy = true; renderDpi();
  try { dpiState = await window.wirecove.startDpi($('dpi-mode').value); }
  catch (error) { dpiState = {...(dpiState||{}), lastError:error.message}; }
  finally { dpiBusy = false; renderDpi(); }
});
$('dpi-stop').addEventListener('click', async () => {
  dpiBusy = true; renderDpi();
  try { dpiState = await window.wirecove.stopDpi(); }
  catch (error) { dpiState = {...(dpiState||{}), lastError:error.message}; }
  finally { dpiBusy = false; renderDpi(); }
});
$('language').addEventListener('click', () => {
  language = language==='tr' ? 'en' : 'tr';
  localStorage.setItem('language', language);
  updateOrder(aggregateApps(), true); translate();
});
$('theme').addEventListener('click', () => {
  const light = document.documentElement.classList.toggle('light');
  localStorage.setItem('theme', light?'light':'dark');
  $('theme').textContent = light?'☀':'☾';
  chart();
});
if (localStorage.getItem('theme')==='light') {
  document.documentElement.classList.add('light'); $('theme').textContent='☀';
}

window.wirecove.dpiModes()
  .then(modes => { dpiModes = modes; fillModes(); renderDpi(); })
  .catch(error => { $('dpi-message').textContent = error.message; });
window.wirecove.dpiStatus().then(state => { dpiState = state; renderDpi(); }).catch(()=>{});
$('elevate').addEventListener('click', async () => {
  const button = $('elevate');
  button.disabled = true;
  button.textContent = labels[language].elevating;
  try { await window.wirecove.relaunchElevated(); }
  catch (error) {
    button.disabled = false;
    button.textContent = labels[language].restartElevated;
    $('warning-text').textContent = error.message;
  }
});
translate(); setRange(60);
setInterval(() => {
  const live = freshRows(2600).filter(row => row.state === 'measured');
  history.shift();
  history.push({rx:live.reduce((n,x)=>n+x.rx,0), tx:live.reduce((n,x)=>n+x.tx,0)});
  render(); chart();
}, 1000);
window.addEventListener('resize', chart);
