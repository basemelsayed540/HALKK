// HALKK desktop shell: opens the hosted web app in its own window (no browser needed).
// Electron 22 is the last line that runs on Windows 7 / 8 / 8.1.
const { app, BrowserWindow, Menu, shell, dialog, session } = require('electron');
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
let forceClose = false;
let closeDialogOpen = false;
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
    if (url === 'about:blank' || url.startsWith(APP_ORIGIN)) return { action: 'allow' };
    if (/^https?:|^tel:|^mailto:|^whatsapp:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (url.startsWith('file:') || url.startsWith(APP_ORIGIN)) return;
    e.preventDefault();
    if (/^https?:|^tel:|^mailto:|^whatsapp:/i.test(url)) shell.openExternal(url);
  });

  // ---- ask before closing, and warn about unsaved edits / running uploads ----
  win.on('close', async (e) => {
    if (forceClose) return;
    e.preventDefault();
    if (closeDialogOpen) return;
    closeDialogOpen = true;
    let st = { d: 0, w: false };
    try {
      st = await win.webContents.executeJavaScript(
        "(function(){try{return {d:(typeof housingDrafts!=='undefined'&&housingDrafts&&housingDrafts.size)|0,w:!!window.housingWriteOperationActive}}catch(e){return {d:0,w:false}}})()",
        true);
    } catch (_) {}
    let message = 'هل تريد إغلاق HALKK؟';
    let detail = '';
    let type = 'question';
    if (st && st.w) {
      type = 'warning';
      message = 'فيه عملية رفع أو حفظ شغالة دلوقتي';
      detail = 'لو قفلت التطبيق الآن ممكن العملية تتقطع وتتحفظ بيانات ناقصة. هل تريد الإغلاق فعلًا؟';
    } else if (st && st.d > 0) {
      type = 'warning';
      message = 'لديك تعديلات لم يتم حفظها';
      detail = 'لو قفلت التطبيق الآن هتضيع التعديلات اللي لسه ما اتحفظتش (' + st.d + '). هل تريد الإغلاق فعلًا؟';
    }
    const risky = type === 'warning';
    let r;
    try {
      r = await dialog.showMessageBox(win, {
        type, title: 'HALKK', message, detail, noLink: true,
        buttons: ['إغلاق', 'رجوع للتطبيق'],
        defaultId: risky ? 1 : 0, cancelId: 1
      });
    } catch (_) { r = { response: 0 }; }
    closeDialogOpen = false;
    if (r.response === 0) { forceClose = true; win.destroy(); }
  });

  // page-level beforeunload (reload / navigation away) with unsaved edits
  win.webContents.on('will-prevent-unload', (e) => {
    const r = dialog.showMessageBoxSync(win, {
      type: 'warning', title: 'HALKK', noLink: true,
      message: 'لديك تعديلات لم يتم حفظها',
      detail: 'لو غادرت الصفحة الآن هتضيع التعديلات. هل تريد المغادرة؟',
      buttons: ['مغادرة', 'البقاء في الصفحة'], defaultId: 1, cancelId: 1
    });
    if (r === 0) e.preventDefault();
  });

  // page crashed / frozen (low memory on weak PCs)
  win.webContents.on('render-process-gone', async () => {
    const r = await dialog.showMessageBox(win, {
      type: 'error', title: 'HALKK', noLink: true,
      message: 'حصلت مشكلة في الصفحة وتوقفت',
      detail: 'ممكن يكون السبب قلة الذاكرة. اضغط إعادة التحميل للمتابعة.',
      buttons: ['إعادة التحميل', 'إغلاق التطبيق'], defaultId: 0, cancelId: 1
    });
    if (r.response === 0) win.webContents.reload(); else { forceClose = true; win.destroy(); }
  });
  win.on('unresponsive', async () => {
    const r = await dialog.showMessageBox(win, {
      type: 'warning', title: 'HALKK', noLink: true,
      message: 'الصفحة مش بتستجيب',
      detail: 'ممكن تستنى شوية (لو العملية كبيرة)، أو تعيد التحميل.',
      buttons: ['انتظار', 'إعادة التحميل'], defaultId: 0, cancelId: 0
    });
    if (r.response === 1) win.webContents.reload();
  });

  win.loadURL(APP_URL);
}


// ---- downloads (Excel exports etc.): native "Save as" dialog + clear result / error message ----
app.whenReady().then(() => {
  session.defaultSession.on('will-download', (_event, item) => {
    item.once('done', (_e, state) => {
      if (state === 'cancelled' || !win || win.isDestroyed()) return;
      const p = item.getSavePath() || item.getFilename();
      if (state === 'completed') {
        dialog.showMessageBox(win, {
          type: 'info', title: 'HALKK', noLink: true, message: 'تم حفظ الملف', detail: p,
          buttons: ['فتح الملف', 'فتح المجلد', 'تم'], defaultId: 2, cancelId: 2
        }).then((r) => {
          if (r.response === 0) shell.openPath(p);
          else if (r.response === 1) shell.showItemInFolder(p);
        }).catch(() => {});
      } else {
        dialog.showMessageBox(win, {
          type: 'error', title: 'HALKK', noLink: true, message: 'تعذّر حفظ الملف',
          detail: 'اتأكد إن الملف مش مفتوح في Excel أو برنامج تاني، وإن فيه مساحة فاضية، وإن عندك صلاحية الكتابة في المكان ده، ثم جرّب تاني.\n\n' + p,
          buttons: ['حسنًا']
        }).catch(() => {});
      }
    });
  });
});

app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
