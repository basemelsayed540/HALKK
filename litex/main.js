// liteX: lightweight Windows shell. Opens the web link the user types (saved on this PC).
// Electron 22 = last line that runs on Windows 7 / 8 / 8.1.
const { app, BrowserWindow, Menu, shell, dialog, session, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { normalizeUrl } = require('./url');

app.disableHardwareAcceleration();                       // old GPUs / weak PCs
app.commandLine.appendSwitch('renderer-process-limit', '1');
app.commandLine.appendSwitch('disk-cache-size', String(50 * 1024 * 1024));

if (!app.requestSingleInstanceLock()) { app.quit(); }

let win = null;
let forceClose = false;
let closeDialogOpen = false;
let appUrl = '';          // saved link
let appOrigin = '';

const cfgFile = () => path.join(app.getPath('userData'), 'litex-config.json');
function loadConfig() {
  try {
    const c = JSON.parse(fs.readFileSync(cfgFile(), 'utf8'));
    const r = normalizeUrl(c && c.url);
    if (r.url) { appUrl = r.url; appOrigin = new URL(appUrl).origin; }
  } catch (_) {}
}
function saveConfig(url) {
  try { fs.mkdirSync(path.dirname(cfgFile()), { recursive: true }); fs.writeFileSync(cfgFile(), JSON.stringify({ url })); return true; }
  catch (_) { return false; }
}

const isExternalOk = (u) => /^(https?:|tel:|mailto:|whatsapp:)/i.test(u);
function showSetup() { if (win && !win.isDestroyed()) win.loadFile(path.join(__dirname, 'setup.html')); }
function openApp() {
  if (!win || win.isDestroyed()) return;
  if (!appUrl) return showSetup();
  win.loadURL(appUrl);
}
function showOffline() {
  if (win && !win.isDestroyed()) win.loadFile(path.join(__dirname, 'offline.html'), { query: { u: appUrl } });
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280, height: 800, minWidth: 360, minHeight: 500,
    show: false, backgroundColor: '#071d44', title: 'liteX',
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false,
      preload: path.join(__dirname, 'preload.js') }
  });
  Menu.setApplicationMenu(null);
  win.setMenuBarVisibility(false);
  win.once('ready-to-show', () => { if (appUrl) win.maximize(); win.show(); });

  const wc = win.webContents;
  wc.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    const k = String(input.key || '').toLowerCase();
    if (input.control && input.shift && k === 'u') { e.preventDefault(); showSetup(); }
    else if (k === 'f5' || (input.control && k === 'r')) { e.preventDefault(); wc.reload(); }
  });
  wc.on('page-title-updated', (e) => { e.preventDefault(); });   // keep the window title "liteX"
  wc.on('did-fail-load', (_e, code, _d, url, isMainFrame) => {
    if (isMainFrame && code !== -3 && url && url.startsWith('http')) showOffline();
  });
  wc.setWindowOpenHandler(({ url }) => {
    if (url === 'about:blank' || (appOrigin && url.startsWith(appOrigin))) return { action: 'allow' };
    if (isExternalOk(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  wc.on('will-navigate', (e, url) => {
    if (url.startsWith('file:') || (appOrigin && url.startsWith(appOrigin))) return;
    e.preventDefault();
    if (isExternalOk(url)) shell.openExternal(url);
  });

  // ask before closing; the page's own "unsaved changes" warning is honoured too
  win.on('close', async (e) => {
    if (forceClose) return;
    e.preventDefault();
    if (closeDialogOpen) return;
    closeDialogOpen = true;
    let r;
    try {
      r = await dialog.showMessageBox(win, { type: 'question', title: 'liteX', noLink: true,
        message: 'هل تريد إغلاق liteX؟', buttons: ['إغلاق', 'رجوع للتطبيق'], defaultId: 0, cancelId: 1 });
    } catch (_) { r = { response: 0 }; }
    closeDialogOpen = false;
    if (r.response === 0) { forceClose = true; win.close(); }   // fires the page's beforeunload
  });
  wc.on('will-prevent-unload', (e) => {
    const r = dialog.showMessageBoxSync(win, { type: 'warning', title: 'liteX', noLink: true,
      message: 'الصفحة فيها تعديلات لم يتم حفظها',
      detail: 'لو غادرت الآن هتضيع التعديلات. هل تريد المغادرة؟',
      buttons: ['مغادرة', 'البقاء في الصفحة'], defaultId: 1, cancelId: 1 });
    if (r === 0) e.preventDefault(); else forceClose = false;
  });
  wc.on('render-process-gone', async () => {
    const r = await dialog.showMessageBox(win, { type: 'error', title: 'liteX', noLink: true,
      message: 'حصلت مشكلة في الصفحة وتوقفت', detail: 'ممكن يكون السبب قلة الذاكرة. اضغط إعادة التحميل للمتابعة.',
      buttons: ['إعادة التحميل', 'إغلاق التطبيق'], defaultId: 0, cancelId: 1 });
    if (r.response === 0) openApp(); else { forceClose = true; win.destroy(); }
  });
  win.on('unresponsive', async () => {
    const r = await dialog.showMessageBox(win, { type: 'warning', title: 'liteX', noLink: true,
      message: 'الصفحة مش بتستجيب', detail: 'ممكن تستنى شوية (لو العملية كبيرة)، أو تعيد التحميل.',
      buttons: ['انتظار', 'إعادة التحميل'], defaultId: 0, cancelId: 0 });
    if (r.response === 1) wc.reload();
  });

  openApp();
}

// ---- messages from our local pages (setup / offline) ----
const fromLocalPage = (ev) => ev.senderFrame && String(ev.senderFrame.url || '').startsWith('file:');
ipcMain.handle('litex:current', (ev) => (fromLocalPage(ev) ? appUrl : ''));
ipcMain.handle('litex:save', (ev, input) => {
  if (!fromLocalPage(ev)) return { error: 'غير مسموح' };
  const r = normalizeUrl(input);
  if (r.error) return r;
  appUrl = r.url; appOrigin = new URL(appUrl).origin;
  if (!saveConfig(appUrl)) dialog.showMessageBox(win, { type: 'warning', title: 'liteX', message: 'تعذّر حفظ الرابط على الجهاز', detail: 'هيشتغل المرة دي بس، وهتحتاج تكتبه تاني عند الفتح.' }).catch(() => {});
  openApp();
  return { ok: true, url: appUrl };
});
ipcMain.handle('litex:open', (ev) => { if (fromLocalPage(ev)) openApp(); });
ipcMain.handle('litex:change', (ev) => { if (fromLocalPage(ev)) showSetup(); });

// ---- downloads: native "Save as" + clear success / error message ----
function setupDownloads() {
  session.defaultSession.on('will-download', (_event, item) => {
    item.once('done', (_e, state) => {
      if (state === 'cancelled' || !win || win.isDestroyed()) return;
      const p = item.getSavePath() || item.getFilename();
      if (state === 'completed') {
        dialog.showMessageBox(win, { type: 'info', title: 'liteX', noLink: true, message: 'تم حفظ الملف', detail: p,
          buttons: ['فتح الملف', 'فتح المجلد', 'تم'], defaultId: 2, cancelId: 2 })
          .then((r) => { if (r.response === 0) shell.openPath(p); else if (r.response === 1) shell.showItemInFolder(p); })
          .catch(() => {});
      } else {
        dialog.showMessageBox(win, { type: 'error', title: 'liteX', noLink: true, message: 'تعذّر حفظ الملف',
          detail: 'اتأكد إن الملف مش مفتوح في Excel أو برنامج تاني، وإن فيه مساحة فاضية، وإن عندك صلاحية الكتابة في المكان ده، ثم جرّب تاني.\n\n' + p,
          buttons: ['حسنًا'] }).catch(() => {});
      }
    });
  });
}

app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.whenReady().then(() => { loadConfig(); setupDownloads(); createWindow(); });
app.on('window-all-closed', () => app.quit());
