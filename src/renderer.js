const labels = {
  tr: {overview:'Genel bakış',apps:'Uygulamalar',history:'Geçmiş',networkActivity:'Ağ etkinliği',download:'Alınan',upload:'Gönderilen',activeApps:'Aktif uygulama',liveTraffic:'Canlı trafik',busyApps:'En çok veri kullanan',showAll:'Tümünü gör →',now:'Şimdi',processes:'Uygulama trafiği',application:'Uygulama',protocol:'Protokol',total:'Bu oturum',sum:'Toplam',waiting:'Veri bekleniyor…',search:'Uygulama ara',historySearch:'Uygulama veya hedef ara',target:'Hedef',state:'Durum',clearHistory:'Geçmişi temizle',measuring:'Canlı',starting:'Başlatılıyor',error:'Ölçüm hatası',withTraffic:'Trafiği olanlar',all:'Tümü',liveRate:'Anlık hız',sessionUsage:'Bu oturum',lastSeen:'Son görülen',active:'Etkin',inactive:'Etkin değil',close:'Kapat',dnsServers:'Etkin DNS sunucuları',systemProxy:'Sistem proxy',resolvers:'Resolver listesi',on:'Açık',off:'Kapalı',noServers:'Sunucu bulunamadı',defaultResolver:'Varsayılan',scopedResolver:'Arayüz'},
  en: {overview:'Overview',apps:'Applications',history:'History',networkActivity:'Network activity',download:'Received',upload:'Sent',activeApps:'Active apps',liveTraffic:'Live traffic',busyApps:'Highest data usage',showAll:'View all →',now:'Now',processes:'Application traffic',application:'Application',protocol:'Protocol',total:'This session',sum:'Total',waiting:'Waiting for data…',search:'Search apps',historySearch:'Search app or target',target:'Target',state:'State',clearHistory:'Clear history',measuring:'Live',starting:'Starting',error:'Measurement error',withTraffic:'With traffic',all:'All',liveRate:'Current rate',sessionUsage:'This session',lastSeen:'Last seen',active:'Active',inactive:'Inactive',close:'Close',dnsServers:'Active DNS servers',systemProxy:'System proxy',resolvers:'Resolver list',on:'On',off:'Off',noServers:'No server found',defaultResolver:'Default',scopedResolver:'Interface'}
};
Object.assign(labels.tr,{connectionTest:'Bağlantı testi',test:'Test et',testing:'Test ediliyor…',targetInput:'Alan adı veya IP:port',passed:'Başarılı',failed:'Başarısız',skipped:'Atlandı',noHistory:'Kayıt yok'});
Object.assign(labels.en,{connectionTest:'Connection test',test:'Test',testing:'Testing…',targetInput:'Domain or IP:port',passed:'Passed',failed:'Failed',skipped:'Skipped',noHistory:'No records'});
Object.assign(labels.tr,{supportedApps:'Uygulamalar',discordScope:'Discord için DPI bağlantısı',connect:'Bağlan',directOpen:'Doğrudan aç',siteTest:'Web sitesi testi',siteScope:'Doğrudan ve DPI destekli erişimi karşılaştırır. Tarayıcının bağlantısını değiştirmez.',connected:'DPI bağlı',direct:'Doğrudan',closed:'Kapalı',connecting:'Bağlanıyor…',disconnecting:'Açılıyor…',directTest:'Doğrudan',dpiTest:'DPI ile',reachable:'Erişilebilir',unreachable:'Erişilemedi'});
Object.assign(labels.en,{supportedApps:'Applications',discordScope:'DPI connection for Discord',connect:'Connect',directOpen:'Open directly',siteTest:'Website test',siteScope:'Compares direct and DPI-assisted access. It does not change your browser connection.',connected:'DPI connected',direct:'Direct',closed:'Closed',connecting:'Connecting…',disconnecting:'Opening…',directTest:'Direct',dpiTest:'With DPI',reachable:'Reachable',unreachable:'Failed'});
Object.assign(labels.tr,{installedApps:'Uygulamalar',appRoutingNote:'Seçilen uygulamaların TCP web bağlantıları yerel DPI üzerinden geçer.',savedSites:'Site listesi',add:'Ekle',remove:'Sil',pending:'Bekliyor',available:'Hazır',select:'Ekle'});
Object.assign(labels.en,{installedApps:'Applications',appRoutingNote:'Selected apps’ TCP web connections use local DPI.',savedSites:'Site list',add:'Add',remove:'Remove',pending:'Pending',available:'Ready',select:'Add'});
Object.assign(labels.tr,{siteRoutingNote:'Listedeki alan adlarının TCP bağlantıları yerel DPI üzerinden geçer.',openInBrowser:'Tarayıcıda aç',applying:'Uygulanıyor…',turnOff:'Tümünü kapat',turnOn:'Tümünü aç',nativeUnavailable:'Uzantı kurulu değil',nativeActive:'DPI açık',nativeInactive:'Kapalı'});
Object.assign(labels.en,{siteRoutingNote:'TCP connections to listed domains use local DPI.',openInBrowser:'Open in browser',applying:'Applying…',turnOff:'Turn off all',turnOn:'Turn on all',nativeUnavailable:'Extension not installed',nativeActive:'DPI on',nativeInactive:'Off'});
const $ = id => document.getElementById(id);
document.documentElement.classList.add(window.network.platform);
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
let historyError = null;
let diagnosis = null;
let dpiSiteResult = null;
let installedApps = [];
let installedIcons = new Map();
let selectedApps = [];
let savedSites = [];
let nativeSiteState = null;
let nativeSiteBusy = false;
let appOrder = [];
const rows = new Map();
const usage = new Map();
const knownApps = new Map();
const icons = new Map();
const sortValues = new Map();
const history = Array.from({length:300}, () => ({rx:0,tx:0}));
const failed = new Map();

function bytes(rate) {
  if (rate == null) return '—';
  if (rate < 1024) return `${Math.round(rate)} B/s`;
  if (rate < 1048576) return `${(rate/1024).toFixed(1)} KB/s`;
  return `${(rate/1048576).toFixed(2)} MB/s`;
}

function size(count) {
  if (count < 1024) return `${Math.round(count)} B`;
  if (count < 1048576) return `${(count/1024).toFixed(1)} KB`;
  return `${(count/1048576).toFixed(2)} MB`;
}

function freshRows(maxAge) {
  const now = Date.now();
  for (const [key,row] of rows) if (now-row.seen > 30000) rows.delete(key);
  return [...rows.values()].filter(row => now-row.seen <= maxAge);
}

function aggregateApps() {
  const apps = new Map();
  const now = Date.now();
  for (const [key,item] of knownApps) {
    const totals=usage.get(key)||{rx:0,tx:0};
    apps.set(key,{...item,key,rx:0,tx:0,measured:false,bytesIn:totals.rx,bytesOut:totals.tx,total:totals.rx+totals.tx});
  }
  for (const row of freshRows(10000)) {
    const key = `${row.pid}:${row.unique}`;
    const item = apps.get(key);
    if (!item) continue;
    if (now-row.seen <= 2600 && row.state === 'measured') {
      item.rx += row.rx; item.tx += row.tx; item.measured=true;
    }
  }
  return apps;
}

function valueForSort(item) {
  if (sort.field === 'name') return item.name.toLocaleLowerCase(language);
  if (sort.field === 'total') return item.total;
  return item.measured ? item[sort.field] : -1;
}

function compareKeys(a,b,apps) {
  const av=sortValues.get(a), bv=sortValues.get(b);
  let result = typeof av === 'string' ? av.localeCompare(bv) : av-bv;
  if (sort.direction === 'desc') result=-result;
  return result || apps.get(a).name.localeCompare(apps.get(b).name) || apps.get(a).pid-apps.get(b).pid;
}

function updateOrder(apps,refresh=false) {
  if (refresh) { appOrder=[]; sortValues.clear(); }
  appOrder=appOrder.filter(key=>apps.has(key));
  let added=false;
  for (const [key,item] of apps) {
    if (!sortValues.has(key)) sortValues.set(key,valueForSort(item));
    if (!appOrder.includes(key)) { appOrder.push(key); added=true; }
  }
  if (added || refresh) appOrder.sort((a,b)=>compareKeys(a,b,apps));
  for (const key of sortValues.keys()) if (!apps.has(key)) sortValues.delete(key);
}

function appCell(item) {
  const cell=document.createElement('div'); cell.className='app-name';
  const data=icons.get(item.key);
  if (data) {
    const image=document.createElement('img'); image.className='app-image'; image.src=data; image.alt=''; cell.append(image);
  } else {
    const fallback=document.createElement('span'); fallback.className='app-icon'; fallback.textContent=item.name.slice(0,1).toUpperCase(); cell.append(fallback);
  }
  const title=document.createElement('b'); title.textContent=item.name; title.title=item.name; cell.append(title);
  return cell;
}

function empty(container) {
  const element=document.createElement('div'); element.className='empty'; element.textContent=labels[language].waiting; container.append(element);
}

function renderOverview(live,apps) {
  $('rx').textContent=received?bytes(live.reduce((n,x)=>n+x.rx,0)):'—';
  $('tx').textContent=received?bytes(live.reduce((n,x)=>n+x.tx,0)):'—';
  $('app-count').textContent=received?String([...apps.values()].filter(x=>x.rx+x.tx>0).length):'—';
  const container=$('rows'); container.replaceChildren();
  const top=[...live].sort((a,b)=>b.rx+b.tx-a.rx-a.tx).slice(0,6);
  if (!top.length) return empty(container);
  for (const row of top) {
    const element=document.createElement('div'); element.className='row';
    element.append(appCell({...row,key:`${row.pid}:${row.unique}`}));
    for (const value of [String(row.pid),bytes(row.rx),bytes(row.tx)]) {
      const span=document.createElement('span'); span.className='numeric'; span.textContent=value; element.append(span);
    }
    const protocol=document.createElement('span'); protocol.className='tag'; protocol.textContent=row.protocol.toUpperCase(); element.append(protocol);
    container.append(element);
  }
}

function renderTopApps(apps) {
  const container=$('top-apps'); container.replaceChildren();
  const top=[...apps.values()].filter(item=>item.total>0)
    .sort((a,b)=>b.total-a.total).slice(0,5);
  if (!top.length) return empty(container);
  const max=top[0].total;
  for (const item of top) {
    const element=document.createElement('div'); element.className='top-app';
    element.append(appCell(item));
    const speed=document.createElement('span'); speed.className='numeric'; speed.textContent=size(item.total); element.append(speed);
    const bar=document.createElement('div'); bar.className='top-app-bar';
    const fill=document.createElement('span'); fill.style.width=`${Math.max(2,item.total/max*100)}%`; bar.append(fill); element.append(bar);
    container.append(element);
  }
}

function renderApps(apps) {
  updateOrder(apps);
  const filter=$('app-search').value.trim().toLocaleLowerCase(language);
  const keys=appOrder.filter(key=>{
    const item=apps.get(key);
    return (appView==='all'||item.total>0||item.rx+item.tx>0)&&item.name.toLocaleLowerCase(language).includes(filter);
  });
  $('apps-count').textContent=String(keys.length);
  const container=$('apps-rows'); container.replaceChildren();
  if (!keys.length) return empty(container);
  for (const key of keys) {
    const item=apps.get(key);
    const element=document.createElement('div'); element.className='apps-row'; element.dataset.key=key;
    element.tabIndex=0; element.setAttribute('role','button'); element.setAttribute('aria-label',item.name);
    element.addEventListener('click',()=>openDetail(key));
    element.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();openDetail(key);}});
    element.append(appCell(item));
    for (const value of [bytes(item.measured?item.rx:null),bytes(item.measured?item.tx:null),size(item.total),String(item.pid)]) {
      const span=document.createElement('span'); span.className='numeric'; span.textContent=value; element.append(span);
    }
    container.append(element);
  }
  if (selectedApp) renderDetail(apps);
}

function detailMetric(label,value) {
  const item=document.createElement('div'); item.className='detail-metric';
  const name=document.createElement('span'); name.textContent=label;
  const number=document.createElement('b'); number.textContent=value;
  item.append(name,number); return item;
}

function renderDetail(apps=aggregateApps()) {
  const item=apps.get(selectedApp);
  if (!item) return closeDetail();
  const body=$('detail-body'); body.replaceChildren();
  const title=appCell(item); title.classList.add('detail-app'); body.append(title);
  const meta=document.createElement('div'); meta.className='detail-meta';
  meta.textContent=`PID ${item.pid}  ·  ${Date.now()-item.seen<3000?labels[language].active:labels[language].inactive}`;
  body.append(meta);
  const current=document.createElement('div'); current.className='detail-section';
  const currentTitle=document.createElement('h3'); currentTitle.textContent=labels[language].liveRate; current.append(currentTitle);
  current.append(detailMetric(labels[language].download,bytes(item.measured?item.rx:null)),detailMetric(labels[language].upload,bytes(item.measured?item.tx:null)));
  body.append(current);
  const session=document.createElement('div'); session.className='detail-section';
  const sessionTitle=document.createElement('h3'); sessionTitle.textContent=labels[language].sessionUsage; session.append(sessionTitle);
  session.append(detailMetric(labels[language].download,size(item.bytesIn)),detailMetric(labels[language].upload,size(item.bytesOut)),detailMetric(labels[language].sum,size(item.total)));
  body.append(session);
  const seen=document.createElement('p'); seen.className='detail-seen';
  seen.textContent=`${labels[language].lastSeen}: ${new Date(item.seen).toLocaleTimeString(language==='tr'?'tr-TR':'en-US')}`;
  body.append(seen);
}

function openDetail(key) {
  selectedApp=key; renderDetail(); $('app-detail').classList.remove('hidden'); $('detail-close').focus();
}

function closeDetail() { selectedApp=null; $('app-detail').classList.add('hidden'); }

function renderDns() {
  if (!dnsStatus) return;
  const servers=$('dns-servers'), resolvers=$('dns-resolvers');
  servers.replaceChildren(); resolvers.replaceChildren();
  if (dnsStatus.error) {
    const message=document.createElement('div'); message.className='empty'; message.textContent=dnsStatus.error;
    servers.append(message); $('proxy-state').textContent='—'; $('dns-observed').textContent=''; return;
  }
  if (!dnsStatus.servers.length) {
    const message=document.createElement('div'); message.className='empty'; message.textContent=labels[language].noServers; servers.append(message);
  }
  for (const address of dnsStatus.servers) {
    const row=document.createElement('div'); row.className='dns-server';
    const value=document.createElement('b'); value.textContent=address;
    const family=document.createElement('span'); family.className='dns-family'; family.textContent=address.includes(':')?'IPv6':'IPv4';
    row.append(value,family); servers.append(row);
  }
  $('proxy-state').textContent=labels[language][dnsStatus.proxy.active?'on':'off'];
  $('proxy-state').classList.toggle('proxy-on',dnsStatus.proxy.active);
  $('proxy-modes').textContent=Object.entries(dnsStatus.proxy.enabled).filter(([,enabled])=>enabled).map(([name])=>name).join(' · ');
  for (const item of dnsStatus.resolvers) {
    const row=document.createElement('div'); row.className='dns-resolver';
    const name=document.createElement('span'); name.textContent=item.domain||(item.scoped?item.interface||`#${item.number}`:labels[language].defaultResolver);
    const address=document.createElement('b'); address.textContent=item.servers.join(', ');
    const scope=document.createElement('small'); scope.textContent=item.scoped?labels[language].scopedResolver:'';
    row.append(name,address,scope); resolvers.append(row);
  }
  $('dns-observed').textContent=new Date(dnsStatus.observedAt).toLocaleTimeString(language==='tr'?'tr-TR':'en-US');
}

function renderHistory() {
  const container=$('history-rows'); container.replaceChildren();
  if (historyError) {
    const message=document.createElement('div'); message.className='empty'; message.textContent=historyError; container.append(message); return;
  }
  const filter=$('history-search').value.trim().toLocaleLowerCase(language);
  const rows=historyRows.filter(row=>`${row.process} ${row.remote} ${row.protocol}`.toLocaleLowerCase(language).includes(filter));
  $('history-count').textContent=String(rows.length);
  if (!rows.length) {
    const message=document.createElement('div'); message.className='empty'; message.textContent=labels[language].noHistory; container.append(message); return;
  }
  for (const row of rows) {
    const element=document.createElement('div'); element.className='history-row';
    element.append(appCell({key:row.identity,name:row.process}));
    const target=document.createElement('button'); target.className='history-target'; target.textContent=row.remote; target.title=row.remote;
    target.addEventListener('click',()=>{ $('diagnose-target').value=row.remote; runDiagnostic(row.remote); });
    const protocol=document.createElement('span'); protocol.className='tag'; protocol.textContent=row.protocol.toUpperCase();
    const state=document.createElement('span'); state.className='history-state'; state.textContent=row.state||'—';
    const seen=document.createElement('span'); seen.className='numeric';
    seen.textContent=new Date(row.last_seen*1000).toLocaleString(language==='tr'?'tr-TR':'en-US',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'});
    element.append(target,protocol,state,seen); container.append(element);
  }
}

function renderDiagnostic() {
  const container=$('diagnose-results'); container.replaceChildren();
  container.classList.toggle('hidden',!diagnosis);
  if (!diagnosis) return;
  if (diagnosis.error) { container.textContent=diagnosis.error; return; }
  for (const [key,title] of [['dns','DNS'],['tcp','TCP'],['tls','TLS']]) {
    const stage=diagnosis[key];
    if (!stage) continue;
    const row=document.createElement('div'); row.className='diagnose-stage';
    const name=document.createElement('b'); name.textContent=title;
    const status=document.createElement('span');
    status.className=stage.ok?'diagnose-pass':stage.skipped?'diagnose-skip':'diagnose-fail';
    status.textContent=labels[language][stage.ok?'passed':stage.skipped?'skipped':'failed'];
    const detail=document.createElement('small');
    detail.textContent=stage.error||stage.addresses?.join(', ')||stage.address||stage.version||'';
    row.append(name,status,detail); container.append(row);
  }
}

async function runDiagnostic(target) {
  $('diagnose-button').disabled=true;
  $('diagnose-button').textContent=labels[language].testing;
  try { diagnosis=await window.network.diagnose(target); }
  catch(error) { diagnosis={error:error.message}; }
  finally {
    $('diagnose-button').disabled=false;
    $('diagnose-button').textContent=labels[language].test;
    renderDiagnostic();
  }
}

function render() {
  const live=freshRows(2600).filter(row=>row.state==='measured');
  const apps=aggregateApps();
  renderOverview(live,apps);
  renderTopApps(apps);
  if (page==='apps') renderApps(apps);
}

function markSort() {
  document.querySelectorAll('[data-sort]').forEach(button=>{
    const selected=button.dataset.sort===sort.field;
    const name=button.dataset.i18n?labels[language][button.dataset.i18n]:'PID';
    button.textContent=selected?`${name} ${sort.direction==='asc'?'↑':'↓'}`:name;
    button.classList.toggle('selected',selected);
  });
}

function translate() {
  document.documentElement.lang=language;
  document.querySelectorAll('[data-i18n]').forEach(el=>el.textContent=labels[language][el.dataset.i18n]);
  $('language').textContent=language.toUpperCase();
  $('main-title').textContent=page==='dns'?'DNS':page==='dpi'?'DPI':labels[language][page==='apps'?'apps':page==='history'?'history':'networkActivity'];
  $('app-search').placeholder=labels[language].search;
  $('app-search').setAttribute('aria-label',labels[language].search);
  $('history-search').placeholder=labels[language].historySearch;
  $('history-search').setAttribute('aria-label',labels[language].historySearch);
  $('diagnose-target').placeholder=labels[language].targetInput;
  $('diagnose-target').setAttribute('aria-label',labels[language].targetInput);
  document.querySelector('[data-range="60"]').textContent=language==='tr'?'1 dk':'1 min';
  document.querySelector('[data-range="300"]').textContent=language==='tr'?'5 dk':'5 min';
  $('status-text').textContent=labels[language][failed.size?'error':received?'measuring':'starting'];
  $('installed-search').placeholder=labels[language].search;
  $('installed-search').setAttribute('aria-label',labels[language].search);
  markSort(); render(); renderDns(); renderHistory(); renderDiagnostic(); renderDpi(); renderInstalledApps(); renderSavedSites(); renderSiteRoute();
}

function renderSiteRoute() {
  const connected=nativeSiteState?.state==='connected';
  const available=nativeSiteState?.available===true;
  const badge=$('site-route-state');
  badge.textContent=connected
    ? `${labels[language].nativeActive} · ${nativeSiteState.domains.length+nativeSiteState.apps.length}`
    : available?labels[language].nativeInactive:labels[language].nativeUnavailable;
  badge.classList.toggle('active',connected);
  const toggle=$('site-route-toggle');
  toggle.textContent=labels[language][connected?'turnOff':'turnOn'];
  toggle.disabled=nativeSiteBusy||!available||(savedSites.length===0&&selectedApps.length===0);
  $('site-add-button').disabled=nativeSiteBusy||!available;
}

function renderInstalledApps() {
  const filter=$('installed-search').value.trim().toLocaleLowerCase(language);
  const matches=installedApps.filter(item=>item.name.toLocaleLowerCase(language).includes(filter));
  $('installed-count').textContent=String(installedApps.length);
  const target=$('installed-rows');target.replaceChildren();
  for (const item of matches) {
    const row=document.createElement('div');row.className='installed-row';
    const name=document.createElement('div');name.className='installed-name';
    const icon=document.createElement('span');icon.className='installed-icon';
    const dataUrl=installedIcons.get(item.path);
    if (dataUrl) {const img=document.createElement('img');img.src=dataUrl;img.alt='';icon.append(img);}
    else icon.textContent=item.name.slice(0,1).toUpperCase();
    const text=document.createElement('span');text.textContent=item.name;text.title=item.path;
    name.append(icon,text);
    const state=document.createElement('span');state.className='dpi-pending';
    const rule=selectedApps.find(rule=>rule.path===item.path);
    const selected=!!rule;
    const active=selected&&nativeSiteState?.state==='connected'&&nativeSiteState.apps.includes(rule.signingIdentifier);
    state.textContent=labels[language][active?'nativeActive':selected?'pending':'nativeInactive'];
    row.append(name,state);
    const action=document.createElement('button');action.textContent=labels[language][selected?'remove':'select'];
    action.disabled=nativeSiteBusy;
    action.addEventListener('click',async()=>{
      nativeSiteBusy=true;action.disabled=true;renderSiteRoute();
      $('dpi-message').textContent=labels[language].applying;
      try {
        const response=await (selected?window.network.removeSelectedApp(item.path):window.network.addSelectedApp(item.path));
        selectedApps=response.apps;nativeSiteState=response.route;$('dpi-message').textContent='';
      } catch(error) {$('dpi-message').textContent=error.message;}
      finally {nativeSiteBusy=false;renderInstalledApps();renderSavedSites();renderSiteRoute();}
    });
    row.append(action);
    target.append(row);
  }
}

function renderSavedSites() {
  const target=$('saved-site-rows');target.replaceChildren();
  for (const domain of savedSites) {
    const row=document.createElement('div');row.className='saved-site-row';
    const name=document.createElement('b');name.textContent=domain;
    const state=document.createElement('span');
    state.textContent=labels[language][nativeSiteState?.state==='connected'&&nativeSiteState.domains.includes(domain)?'nativeActive':'nativeInactive'];
    const open=document.createElement('button');open.textContent=labels[language].openInBrowser;
    open.addEventListener('click',async()=>{
      open.disabled=true;$('site-add-error').textContent=labels[language].applying;
      try {await window.network.openSite(`https://${domain}/`);$('site-add-error').textContent='';renderSavedSites();}
      catch(error) {$('site-add-error').textContent=error.message;open.disabled=false;}
    });
    const remove=document.createElement('button');remove.textContent=labels[language].remove;
    remove.addEventListener('click',async()=>{
      nativeSiteBusy=true;renderSiteRoute();remove.disabled=true;
      try {const response=await window.network.removeSite(domain);savedSites=response.sites;nativeSiteState=response.route;$('site-add-error').textContent='';}
      catch(error) {$('site-add-error').textContent=error.message;}
      finally {nativeSiteBusy=false;renderSavedSites();renderInstalledApps();renderSiteRoute();}
    });
    row.append(name,state,open,remove);target.append(row);
  }
}

function renderDpi() {
  const container=$('dpi-site-result');
  container.replaceChildren();
  container.classList.toggle('hidden',!dpiSiteResult);
  if (!dpiSiteResult) return;
  if (dpiSiteResult.error) {container.textContent=dpiSiteResult.error;return;}
  for (const [key,label] of [['direct','directTest'],['dpi','dpiTest']]) {
    const result=dpiSiteResult[key];
    const row=document.createElement('div');row.className='dpi-result-row';
    const name=document.createElement('b');name.textContent=labels[language][label];
    const value=document.createElement('span');value.className=result.ok?'diagnose-pass':'diagnose-fail';
    value.textContent=`${labels[language][result.ok?'reachable':'unreachable']}${result.code?' · HTTP '+result.code:''}${result.ms!=null?' · '+result.ms+' ms':''}`;
    row.append(name,value);
    if (result.error) {const detail=document.createElement('small');detail.textContent=result.error;row.append(detail);}
    container.append(row);
  }
}

function chart() {
  const canvas=$('chart'), ratio=devicePixelRatio||1, rect=canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  canvas.width=Math.max(1,Math.floor(rect.width*ratio)); canvas.height=Math.max(1,Math.floor(rect.height*ratio));
  const ctx=canvas.getContext('2d'); ctx.scale(ratio,ratio);
  const samples=history.slice(-chartRange);
  const w=rect.width,h=rect.height,max=Math.max(1024,...samples.map(x=>Math.max(x.rx,x.tx)))*1.16;
  $('axis-max').textContent=bytes(max);
  $('axis-mid').textContent=bytes(max/2);
  ctx.strokeStyle=getComputedStyle(document.documentElement).getPropertyValue('--line'); ctx.lineWidth=.7;
  for(let i=0;i<4;i++){const y=8+(h-16)*i/3;ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke();}
  for(const [key,color] of [['tx','#75b9c0'],['rx','#ff9a19']]){
    const points=samples.map((p,i)=>({x:w*i/(samples.length-1),y:h-8-(p[key]/max)*(h-16)}));
    ctx.beginPath(); points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));
    ctx.lineTo(w,h-8);ctx.lineTo(0,h-8);ctx.closePath();
    const gradient=ctx.createLinearGradient(0,0,0,h);gradient.addColorStop(0,`${color}70`);gradient.addColorStop(1,`${color}08`);
    ctx.fillStyle=gradient;ctx.fill();
    ctx.strokeStyle=color;ctx.lineWidth=1.8;ctx.lineJoin='round';ctx.beginPath();
    points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.stroke();
  }
  if (hoverIndex!==null) {
    const x=w*hoverIndex/(samples.length-1), sample=samples[hoverIndex];
    ctx.strokeStyle='#cfcfcf70';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x,8);ctx.lineTo(x,h-8);ctx.stroke();
    const tip=$('chart-tooltip');
    tip.textContent=`${labels[language].download}  ${bytes(sample.rx)}\n${labels[language].upload}  ${bytes(sample.tx)}`;
    tip.style.left=`${Math.min(w-96,Math.max(74,x+74))}px`;
    tip.classList.remove('hidden');
  }
}

function setRange(seconds) {
  chartRange=seconds; hoverIndex=null; $('chart-tooltip').classList.add('hidden');
  document.querySelectorAll('[data-range]').forEach(button=>button.classList.toggle('selected',Number(button.dataset.range)===seconds));
  const times=seconds===60?['60 sn','45 sn','30 sn','15 sn']:['5 dk','3:45','2:30','1:15'];
  ['time-start','time-quarter','time-half','time-threequarter'].forEach((id,i)=>$(id).textContent=times[i]);
  chart();
}

window.network.onTraffic(row=>{
  received=true; failed.delete(row.protocol);
  const key=`${row.protocol}:${row.pid}:${row.process_unique_id}`;
  const previous=rows.get(key);
  const appKey=`${row.pid}:${row.process_unique_id}`;
  if (row.state==='measured' && previous && row.bytes_in>=previous.bytesIn && row.bytes_out>=previous.bytesOut) {
    const totals=usage.get(appKey)||{rx:0,tx:0};
    usage.set(appKey,{rx:totals.rx+row.bytes_in-previous.bytesIn,tx:totals.tx+row.bytes_out-previous.bytesOut});
  }
  knownApps.set(appKey,{pid:row.pid,name:row.process,seen:Date.now()});
  rows.set(key,{protocol:row.protocol,pid:row.pid,unique:row.process_unique_id,name:row.process,
    rx:row.bytes_in_per_second||0,tx:row.bytes_out_per_second||0,bytesIn:row.bytes_in,bytesOut:row.bytes_out,
    state:row.state,seen:Date.now()});
  $('status-text').textContent=labels[language].measuring;
});
window.network.onAppIcon(({key,dataUrl})=>{icons.set(key,dataUrl);render();});
window.network.onDnsStatus(data=>{dnsStatus=data;renderDns();});
window.network.onHistory(data=>{
  historyError=data.error||null;
  if (data.rows) historyRows=data.rows;
  if (page==='history') renderHistory();
});
window.network.onStatus(data=>{
  failed.set(data.protocol,data.error);
  $('warning').textContent=`${data.protocol.toUpperCase()}: ${data.error}`;
  $('warning').classList.remove('hidden');
  $('status-text').textContent=labels[language].error;
});
document.querySelectorAll('.nav[data-page]').forEach(button=>button.addEventListener('click',()=>{
  closeDetail();
  page=button.dataset.page;
  document.querySelectorAll('.nav[data-page]').forEach(item=>item.classList.toggle('active',item===button));
  $('overview-page').classList.toggle('hidden',page!=='overview');
  $('apps-page').classList.toggle('hidden',page!=='apps');
  $('dns-page').classList.toggle('hidden',page!=='dns');
  $('history-page').classList.toggle('hidden',page!=='history');
  $('dpi-page').classList.toggle('hidden',page!=='dpi');
  translate(); chart();
}));
async function refreshNativeSite() {
  if (nativeSiteBusy) return;
  try {
    nativeSiteState=await window.network.nativeSiteStatus();
    renderSiteRoute();renderSavedSites();renderInstalledApps();
  }
  catch(error) {$('site-add-error').textContent=error.message;}
}
$('site-route-toggle').addEventListener('click',async()=>{
  nativeSiteBusy=true;renderSiteRoute();
  $('site-add-error').textContent=labels[language].applying;
  try {
    nativeSiteState=await (nativeSiteState?.state==='connected'
      ?window.network.disconnectNativeSite():window.network.connectNativeSite());
    $('site-add-error').textContent='';
  } catch(error) {$('site-add-error').textContent=error.message;}
  finally {nativeSiteBusy=false;renderSavedSites();renderInstalledApps();renderSiteRoute();}
});
refreshNativeSite();
setInterval(refreshNativeSite,4000);
$('dpi-site-form').addEventListener('submit',async event=>{
  event.preventDefault();
  const button=$('dpi-site-button');button.disabled=true;button.textContent=labels[language].testing;
  dpiSiteResult=null;renderDpi();
  try {dpiSiteResult=await window.network.compareSite($('dpi-site-input').value);}
  catch(error) {dpiSiteResult={error:error.message};}
  finally {button.disabled=false;button.textContent=labels[language].test;renderDpi();}
});
window.network.onInstalledAppIcon(({path,dataUrl})=>{installedIcons.set(path,dataUrl);if(page==='dpi')renderInstalledApps();});
window.network.installedApps().then(items=>{installedApps=items;renderInstalledApps();}).catch(error=>{$('installed-rows').textContent=error.message;});
window.network.selectedApps().then(items=>{selectedApps=items;renderInstalledApps();renderSiteRoute();}).catch(error=>{$('dpi-message').textContent=error.message;});
window.network.sites().then(items=>{savedSites=items;renderSavedSites();renderSiteRoute();}).catch(error=>{$('site-add-error').textContent=error.message;});
$('installed-search').addEventListener('input',renderInstalledApps);
$('site-add-form').addEventListener('submit',async event=>{
  event.preventDefault();
  nativeSiteBusy=true;renderSiteRoute();
  const button=$('site-add-button');button.textContent=labels[language].applying;
  $('site-add-error').textContent='';
  try {
    const response=await window.network.addSite($('site-add-input').value);
    savedSites=response.sites;nativeSiteState=response.route;
    $('site-add-input').value='';renderSavedSites();
  } catch(error) {
    $('site-add-error').textContent=error.message;
    savedSites=await window.network.sites();renderSavedSites();
  } finally {nativeSiteBusy=false;button.textContent=labels[language].add;renderSiteRoute();renderInstalledApps();}
});
document.querySelectorAll('[data-sort]').forEach(button=>button.addEventListener('click',()=>{
  const field=button.dataset.sort;
  sort={field,direction:field===sort.field&&sort.direction==='asc'?'desc':field==='name'?'asc':'desc'};
  updateOrder(aggregateApps(),true); markSort(); renderApps(aggregateApps());
}));
$('app-search').addEventListener('input',()=>renderApps(aggregateApps()));
$('history-search').addEventListener('input',renderHistory);
$('diagnose-form').addEventListener('submit',event=>{event.preventDefault();runDiagnostic($('diagnose-target').value);});
$('history-clear').addEventListener('click',async()=>{
  $('history-clear').disabled=true;
  try { await window.network.clearHistory(); }
  catch(error) { historyError=error.message; renderHistory(); }
  finally { $('history-clear').disabled=false; }
});
document.querySelectorAll('[data-view]').forEach(button=>button.addEventListener('click',()=>{
  appView=button.dataset.view;
  document.querySelectorAll('[data-view]').forEach(item=>item.classList.toggle('selected',item===button));
  renderApps(aggregateApps());
}));
$('detail-close').addEventListener('click',closeDetail);
$('app-detail').addEventListener('click',event=>{if(event.target===$('app-detail'))closeDetail();});
document.addEventListener('keydown',event=>{if(event.key==='Escape')closeDetail();});
$('show-all-apps').addEventListener('click',()=>document.querySelector('[data-page="apps"]').click());
document.querySelectorAll('[data-range]').forEach(button=>button.addEventListener('click',()=>setRange(Number(button.dataset.range))));
$('chart').addEventListener('mousemove',event=>{
  const rect=$('chart').getBoundingClientRect();
  hoverIndex=Math.max(0,Math.min(chartRange-1,Math.round(event.offsetX/rect.width*(chartRange-1))));
  chart();
});
$('chart').addEventListener('mouseleave',()=>{hoverIndex=null;$('chart-tooltip').classList.add('hidden');chart();});
$('language').addEventListener('click',()=>{language=language==='tr'?'en':'tr';localStorage.setItem('language',language);updateOrder(aggregateApps(),true);translate();});
$('theme').addEventListener('click',()=>{
  const light=document.documentElement.classList.toggle('light');localStorage.setItem('theme',light?'light':'dark');
  $('theme').textContent=light?'☀':'☾';chart();
});
if(localStorage.getItem('theme')==='light'){document.documentElement.classList.add('light');$('theme').textContent='☀';}
translate();setRange(60);
setInterval(()=>{
  const live=freshRows(2600).filter(row=>row.state==='measured');
  history.shift();history.push({rx:live.reduce((n,x)=>n+x.rx,0),tx:live.reduce((n,x)=>n+x.tx,0)});
  render();chart();
},1000);
window.addEventListener('resize',chart);
