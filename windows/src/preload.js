const { contextBridge, ipcRenderer } = require('electron');

// Read synchronously so the renderer knows what this machine can do before its
// first paint: a control must never appear enabled, not even for one frame,
// for a feature that cannot work here.
const capabilities = ipcRenderer.sendSync('platform:capabilities-sync');

function subscribe(channel) {
  return handler => {
    const listener = (_event, data) => handler(data);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  };
}

contextBridge.exposeInMainWorld('wirecove', {
  platform: 'win32',
  capabilities,
  onTraffic: subscribe('traffic'),
  onConnections: subscribe('connections'),
  onDnsStatus: subscribe('dns-status'),
  onDpiStatus: subscribe('dpi-status'),
  onFirewallStatus: subscribe('firewall-status'),
  onAppIcon: subscribe('app-icon'),
  onInstalledAppIcon: subscribe('installed-app-icon'),
  onStatus: subscribe('status'),
  onAlerts: subscribe('alerts'),
  onUdp: subscribe('udp'),
  onUdpStatus: subscribe('udp-status'),
  usageReport: () => ipcRenderer.invoke('usage:report'),
  readAlerts: () => ipcRenderer.invoke('alerts:read'),
  clearAlerts: () => ipcRenderer.invoke('alerts:clear'),
  readSettings: () => ipcRenderer.invoke('settings:read'),
  setAutostart: value => ipcRenderer.invoke('settings:autostart', value),
  setUdpMode: mode => ipcRenderer.invoke('settings:udp-mode', mode),
  udpRead: () => ipcRenderer.invoke('udp:read'),
  signatureFor: program => ipcRenderer.invoke('signature:read', program),
  clearHistory: () => ipcRenderer.invoke('history:clear'),
  diagnose: target => ipcRenderer.invoke('diagnose:run', target),
  installedApps: () => ipcRenderer.invoke('apps:installed'),
  dpiModes: () => ipcRenderer.invoke('dpi:modes'),
  dpiStatus: () => ipcRenderer.invoke('dpi:status'),
  startDpi: mode => ipcRenderer.invoke('dpi:start', mode),
  stopDpi: () => ipcRenderer.invoke('dpi:stop'),
  firewallStatus: () => ipcRenderer.invoke('firewall:status'),
  blockApp: (program, label) => ipcRenderer.invoke('firewall:block', program, label),
  unblockApp: program => ipcRenderer.invoke('firewall:unblock', program),
  pathForPid: pid => ipcRenderer.invoke('apps:path', pid),
  scanNetwork: () => ipcRenderer.invoke('scanner:read'),
  sweepNetwork: () => ipcRenderer.invoke('scanner:sweep'),
  setLanguage: value => ipcRenderer.send('app:language', value),
  relaunchElevated: () => ipcRenderer.invoke('app:relaunch-elevated'),
  openSite: domain => ipcRenderer.invoke('open-site', domain)
});
