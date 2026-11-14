// HALKK desktop shell: opens the hosted web app in its own window (no browser needed).
// Electron 22 is the last line that runs on Windows 7 / 8 / 8.1.
const { app, BrowserWindow, Menu, shell } = require('electron');
const path = require('path');
const fs = require('fs');

// Weak / old PCs: software rendering avoids blank windows from old GPU drivers and uses less RAM.
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('renderer-process-limit', '1');
app.commandLine.appendSwitch('disk-cache-size', String(50 * 1024 * 1024));

let APP_URL = 'https://basemelsayed540.github.io/HALKK/';
try {
  const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'app-url.json'), 'utf8'));
  if (cfg && cfg.url) APP_URL = cfg.url;
} catch (_) {}
const APP_ORIGIN = new URL(APP_URL).origin;

if (!app.requestSingleInstanceLock()) { app.quit(); }

let win = null;
function showOffline() {
  if (!win || win.isDestroyed()) return;
  win.loadFile(path.join(__dirname, 'offline.html'), { query: { u: APP_URL } });
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280, height: 800, minWidth: 360, minHeight: 500,
    show: false, backgroundColor: '#071d44', title: 'HALKK',
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false }
  });
  Menu.setApplicationMenu(null);
  win.setMenuBarVisibility(false);
  win.once('ready-to-show', () => { win.maximize(); win.show(); });

  win.webContents.on('did-fail-load', (_e, code, _d, url, isMainFrame) => {
    if (isMainFrame && code !== -3 && url && url.startsWith('http')) showOffline();
  });
  // keep the app inside the window; open anything external in the default browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(APP_ORIGIN)) return { action: 'allow' };
    if (/^https?:|^tel:|^mailto:|^whatsapp:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (url.startsWith('file:') || url.startsWith(APP_ORIGIN)) return;
    e.preventDefault();
    if (/^https?:|^tel:|^mailto:|^whatsapp:/i.test(url)) shell.openExternal(url);
  });
  win.loadURL(APP_URL);
}

app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
