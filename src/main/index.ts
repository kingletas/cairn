/** Electron main. Owns the vault, the network gate and every write. */

import { app, BrowserWindow, Menu, shell } from 'electron';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Vault } from './vault.js';
import { registerHandlers } from './ipc/handlers.js';
import { crashLogPath, startDiagnostics, watchWindow } from './diagnostics.js';
import { answeredOnTheCommandLine, graphicsCrashedBefore, markerPath } from './graphics.js';

const graphicsMarker = markerPath(app.getPath('userData'));

// Two flags answer and stop rather than opening a window, and both have to be handled
// before anything else starts.
if (answeredOnTheCommandLine(process.argv, crashLogPath(), graphicsMarker)) {
  app.exit(0);
}

// A machine that has already taken the window down with the graphics card is not asked
// to prove it again. `cairn --try-graphics` undoes this.
if (graphicsCrashedBefore(graphicsMarker)) {
  app.disableHardwareAcceleration();
  app.commandLine.appendSwitch('disable-gpu-compositing');
}

// Before anything else: a crash during startup is one of the ones worth catching.
startDiagnostics();

const here = dirname(fileURLToPath(import.meta.url));
const vault = new Vault();

/** A menu of Cairn's own. */
function applicationMenu(): Menu {
  return Menu.buildFromTemplate([
    { label: 'File', submenu: [{ role: 'close' }, { role: 'quit' }] },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
        { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' },
        { type: 'separator' }, { role: 'togglefullscreen' },
      ],
    },
  ]);
}

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 720,
    minHeight: 560,
    backgroundColor: '#e6e8e3',
    title: 'Cairn',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(here, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webviewTag: false,
      spellcheck: false,
    },
  });

  // Nothing in this app opens a page in itself. A link goes to the user's browser,
  // where they can see where it leads before it loads.
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url);
    return { action: 'deny' };
  });
  // A renderer that can navigate is a renderer that can be sent somewhere. The cost is
  // that `location.reload()` does nothing, so every redraw goes through this channel.
  window.webContents.on('will-navigate', (event) => event.preventDefault());

  vault.onLock(() => {
    if (!window.isDestroyed()) window.webContents.send('vault:locked');
  });

  // A preload that fails to load leaves a blank window and says nothing, so it says
  // something here instead.
  window.webContents.on('preload-error', (_event, path, error) => {
    console.error(`Cairn's preload script failed to load (${path}):`, error);
  });

  watchWindow(window);

  void window.loadFile(join(here, '../renderer/index.html'));
  window.once('ready-to-show', () => window.show());
  return window;
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(applicationMenu());
  registerHandlers(vault);
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}).catch((error: unknown) => {
  console.error('Cairn could not start:', error);
  app.quit();
});

// Locking on suspend and on screen lock is the point of locking at all -- a laptop
// closed on a train is the case this is for.
app.on('before-quit', () => vault.lock());
app.on('window-all-closed', () => {
  vault.lock();
  if (process.platform !== 'darwin') app.quit();
});
