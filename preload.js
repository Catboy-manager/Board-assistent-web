'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('KANBAN_LOCAL', {
  isDesktop: true,
  platform: process.platform,
  collectHistory: () => ipcRenderer.invoke('kanban:collect-history')
});
