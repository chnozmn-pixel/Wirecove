const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('network', {
  platform: process.platform,
  onTraffic: (handler) => {
    const listener = (_event, data) => handler(data);
    ipcRenderer.on('traffic', listener);
    return () => ipcRenderer.removeListener('traffic', listener);
  },
  onStatus: (handler) => {
    const listener = (_event, data) => handler(data);
    ipcRenderer.on('status', listener);
    return () => ipcRenderer.removeListener('status', listener);
  },
  onAppIcon: (handler) => {
    const listener = (_event, data) => handler(data);
    ipcRenderer.on('app-icon', listener);
    return () => ipcRenderer.removeListener('app-icon', listener);
  },
  onDnsStatus: (handler) => {
    const listener = (_event, data) => handler(data);
    ipcRenderer.on('dns-status', listener);
    return () => ipcRenderer.removeListener('dns-status', listener);
  },
  onHistory: (handler) => {
    const listener = (_event, data) => handler(data);
    ipcRenderer.on('history', listener);
    return () => ipcRenderer.removeListener('history', listener);
  },
  clearHistory: () => ipcRenderer.invoke('history:clear'),
  diagnose: (target) => ipcRenderer.invoke('diagnose:run', target),
  onDpiStatus: (handler) => {
    const listener = (_event, data) => handler(data);
    ipcRenderer.on('dpi-status', listener);
    return () => ipcRenderer.removeListener('dpi-status', listener);
  },
  getDpiStatus: () => ipcRenderer.invoke('dpi:status'),
  connectDiscord: () => ipcRenderer.invoke('dpi:connect-discord'),
  disconnectDiscord: () => ipcRenderer.invoke('dpi:disconnect-discord'),
  compareSite: (target) => ipcRenderer.invoke('dpi:compare-site', target),
  installedApps: () => ipcRenderer.invoke('apps:installed'),
  onInstalledAppIcon: (handler) => {
    const listener = (_event, data) => handler(data);
    ipcRenderer.on('installed-app-icon', listener);
    return () => ipcRenderer.removeListener('installed-app-icon', listener);
  },
  sites: () => ipcRenderer.invoke('dpi:sites'),
  addSite: (value) => ipcRenderer.invoke('dpi:add-site', value),
  removeSite: (value) => ipcRenderer.invoke('dpi:remove-site', value),
  openSite: (value) => ipcRenderer.invoke('dpi:open-site', value),
  nativeSiteStatus: () => ipcRenderer.invoke('dpi:native-site-status'),
  connectNativeSite: (value) => ipcRenderer.invoke('dpi:native-site-connect', value),
  disconnectNativeSite: () => ipcRenderer.invoke('dpi:native-site-disconnect'),
  chromeStatus: () => ipcRenderer.invoke('dpi:chrome-status'),
  selectedApps: () => ipcRenderer.invoke('dpi:apps'),
  addSelectedApp: (appPath) => ipcRenderer.invoke('dpi:add-app', appPath),
  removeSelectedApp: (appPath) => ipcRenderer.invoke('dpi:remove-app', appPath)
});
