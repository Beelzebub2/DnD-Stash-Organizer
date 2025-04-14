const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
    // Screen capture
    captureScreen: (region) => ipcRenderer.invoke('capture-screen', region),

    // Configuration
    getConfig: () => ipcRenderer.invoke('get-config'),
    updateConfig: (config) => ipcRenderer.invoke('update-config', config),

    // Status updates
    onStatusUpdate: (callback) => {
        ipcRenderer.on('status-update', (event, ...args) => callback(event, ...args));
    },

    // Results
    getResults: () => ipcRenderer.invoke('get-results')
});