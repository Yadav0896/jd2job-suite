const { app, BrowserWindow, systemPreferences, desktopCapturer, ipcMain, globalShortcut } = require('electron');
const path = require('path');

const isDev = process.env.NODE_ENV === 'development';

let mainWindow;
let stealthClickThrough = false; // true = window ignores mouse (click-through)

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: false,
      preload: path.join(__dirname, 'preload.js'),
    },
    transparent: false,
    frame: true,
  });

  // Enable screen content protection to hide from screen shares
  // On Windows: completely invisible. On macOS: black rectangle.
  mainWindow.setContentProtection(true);
  
  // Make the window float over everything including full-screen apps
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  if (isDev) {
    const loadDevURL = async () => {
      try {
        await mainWindow.loadURL('http://localhost:5173');
      } catch (err) {
        console.warn('Vite dev server is not ready yet, retrying in 500ms...');
        setTimeout(loadDevURL, 500);
      }
    };
    await loadDevURL();
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    // In production, load the built static files
    mainWindow.loadFile(path.join(__dirname, '../frontend/dist/index.html'));
  }

  mainWindow.webContents.session.setDisplayMediaRequestHandler((request, callback) => {
    desktopCapturer.getSources({ types: ['screen'] }).then((sources) => {
      if (sources && sources.length > 0) {
        callback({ video: sources[0], audio: 'loopback' });
      } else {
        console.warn('No screen sources found for display media capture.');
        callback();
      }
    }).catch(err => {
      console.error('Error getting sources:', err);
      callback();
    });
  });
}

app.whenReady().then(async () => {
  // Request microphone permissions on macOS
  if (process.platform === 'darwin') {
    const micAccess = await systemPreferences.askForMediaAccess('microphone');
    console.log('Microphone access granted:', micAccess);
  }
  
  createWindow();

  // ── Global Keyboard Shortcuts ─────────────────────────────────────────────
  // Option+Space → Trigger AI response immediately (sends IPC to renderer)
  globalShortcut.register('Alt+Space', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('shortcut:trigger-ai');
    }
  });

  // Option+S → Toggle stealth click-through mode
  globalShortcut.register('Alt+S', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      stealthClickThrough = !stealthClickThrough;
      mainWindow.setIgnoreMouseEvents(stealthClickThrough, { forward: true });
      mainWindow.webContents.send('shortcut:toggle-stealth', stealthClickThrough);
      console.log(`Stealth click-through: ${stealthClickThrough ? 'ON' : 'OFF'}`);
    }
  });

  // Option+H → Hide/Show the window
  globalShortcut.register('Alt+H', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isVisible()) {
        mainWindow.hide();
      } else {
        mainWindow.show();
      }
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('will-quit', () => {
  // Unregister all global shortcuts on exit
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// ── IPC: Fine-Grained Click-Through Control ───────────────────────────────
// Frontend sends this when mouse moves over an interactive element in stealth mode
ipcMain.on('set-ignore-mouse-events', (event, ignore, options) => {
  if (mainWindow) {
    mainWindow.setIgnoreMouseEvents(ignore, options || { forward: true });
  }
});

ipcMain.on('close-app', () => {
  app.quit();
});

ipcMain.on('minimize-app', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.on('hide-app', () => {
  if (mainWindow) mainWindow.hide();
});

ipcMain.on('show-app', () => {
  if (mainWindow) {
    mainWindow.showInactive();
  }
});
