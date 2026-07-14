const { ipcRenderer } = require('electron');

// Expose a safe mock of require('electron') to the renderer process
window.require = (moduleName) => {
  if (moduleName === 'electron') {
    return {
      ipcRenderer: {
        send: (channel, ...args) => ipcRenderer.send(channel, ...args),
        on: (channel, listener) => ipcRenderer.on(channel, listener),
        once: (channel, listener) => ipcRenderer.once(channel, listener),
        removeListener: (channel, listener) => ipcRenderer.removeListener(channel, listener),
      }
    };
  }
  throw new Error(`Module "${moduleName}" is not available in the renderer process.`);
};
