/* Incog Electric Lab - Electron entry point.
 * Opens src/index.html in a desktop window, fully offline. Handles saving / opening .incog files and asks before updating.
 * Run with:  npm install   (once, needs internet)   then   npm run dev  (or  npm start) */
const { app, BrowserWindow, Menu, shell, dialog, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

let win = null;
let dirty = false;
const allowed = new Set();            // the page may only re-save to paths the user picked in a dialog (or double-clicked)
const FILTERS = [{ name: 'Incog circuit', extensions: ['incog'] }, { name: 'All files', extensions: ['*'] }];

function fileFromArgs(argv) { return argv.slice(1).find((a) => /\.incog$/i.test(a) && fs.existsSync(a)); }
function sendFile(p) {
  try {
    const text = fs.readFileSync(p, 'utf8'); allowed.add(p);
    if (win) win.webContents.send('file:opened', { path: p, text });
  } catch (e) { dialog.showErrorBox('Could not open file', String(e.message)); }
}

ipcMain.handle('file:save', async (e, a) => {
  a = a || {};
  let target = a.path && allowed.has(a.path) ? a.path : null;
  if (!target) {
    const r = await dialog.showSaveDialog(win, {
      title: 'Save circuit', filters: FILTERS,
      defaultPath: path.join(app.getPath('documents'), String(a.name || 'circuit.incog')),
    });
    if (r.canceled || !r.filePath) return { canceled: true };
    target = /\.[^\\/]+$/.test(r.filePath) ? r.filePath : r.filePath + '.incog';
  }
  fs.writeFileSync(target, String(a.text || ''), 'utf8');
  allowed.add(target);
  return { path: target };
});

ipcMain.handle('file:open', async (e, p) => {
  let target = p && allowed.has(p) ? p : null;
  if (!target) {
    const r = await dialog.showOpenDialog(win, { title: 'Open circuit', filters: FILTERS, properties: ['openFile'], defaultPath: app.getPath('documents') });
    if (r.canceled || !r.filePaths.length) return { canceled: true };
    target = r.filePaths[0];
  }
  allowed.add(target);
  return { path: target, text: fs.readFileSync(target, 'utf8') };
});
ipcMain.on('file:dirty', (e, d) => { dirty = !!d; });

// ---------------------------------------------------------------- updates (asks first, never installs on its own)
let autoUpdater = null, manualCheck = false;
function setupUpdater() {
  if (!app.isPackaged || process.env.PORTABLE_EXECUTABLE_FILE) return;     // only the installed (Setup) app can update itself
  try { autoUpdater = require('electron-updater').autoUpdater; } catch (e) { return; }
  autoUpdater.autoDownload = false;                                         // nothing downloads until the user says yes
  autoUpdater.autoInstallOnAppQuit = true;                                  // "Later" after downloading = installs when they close the app
  autoUpdater.on('update-available', async (info) => {
    const r = await dialog.showMessageBox(win, {
      type: 'question', buttons: ['Update now', 'Not now'], defaultId: 0, cancelId: 1, title: 'Update available',
      message: 'Version ' + info.version + ' is available (you have ' + app.getVersion() + ').',
      detail: 'Do you want to update? Your saved circuit files are not affected. If you choose Not now, you can keep using this version.',
    });
    if (r.response === 0) { if (win) win.setTitle('Downloading update...'); autoUpdater.downloadUpdate().catch(() => {}); }
  });
  autoUpdater.on('update-not-available', () => {
    if (manualCheck) dialog.showMessageBox(win, { type: 'info', title: 'Up to date', message: 'You have the latest version (' + app.getVersion() + ').' });
    manualCheck = false;
  });
  autoUpdater.on('download-progress', (p) => { if (win) win.setProgressBar(p.percent / 100); });
  autoUpdater.on('update-downloaded', async () => {
    if (win) { win.setProgressBar(-1); win.setTitle('Incog Electric Lab'); }
    const r = await dialog.showMessageBox(win, {
      type: 'info', buttons: ['Restart now', 'Later'], defaultId: 0, cancelId: 1, title: 'Update ready',
      message: 'The update is downloaded.', detail: dirty ? 'You have unsaved changes: choose Later, save your circuit, then close the app. The update installs when it closes.' : 'Restart now to finish updating, or choose Later and it installs when you close the app.',
    });
    if (r.response === 0 && !dirty) autoUpdater.quitAndInstall();
  });
  autoUpdater.on('error', () => {
    if (win) { win.setProgressBar(-1); win.setTitle('Incog Electric Lab'); }
    if (manualCheck) dialog.showMessageBox(win, { type: 'info', title: 'Could not check for updates', message: 'Could not reach the update server.', detail: 'Check your internet connection and try again. The app works fine offline.' });
    manualCheck = false;                                                    // on the automatic check at startup: stay silent
  });
}
function checkForUpdates(manual) {
  manualCheck = !!manual;
  if (!autoUpdater) {
    if (manual) dialog.showMessageBox(win, { type: 'info', title: 'Updates', message: 'Updates work in the installed app.', detail: 'This copy (portable or development) is updated by downloading the newest version.' });
    return;
  }
  autoUpdater.checkForUpdates().catch(() => {});
}
ipcMain.on('app:check-update', () => checkForUpdates(true));

function createWindow() {
  win = new BrowserWindow({
    width: 1500, height: 920, minWidth: 1000, minHeight: 640,
    title: 'Incog Electric Lab', backgroundColor: '#0b1017', icon: path.join(__dirname, '..', 'assets', 'icon.png'),
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, preload: path.join(__dirname, 'preload.js') },
  });
  Menu.setApplicationMenu(null);                       // remove the default menu bar
  win.loadFile(path.join(__dirname, '..', 'src', 'index.html'));
  if (process.argv.includes('--dev')) win.webContents.openDevTools({ mode: 'detach' }); // npm run dev
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  // F12 opens developer tools, F5 reloads
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F12') win.webContents.toggleDevTools();
    if (input.key === 'F5') win.webContents.reload();
  });
  // closing with unsaved changes asks first
  win.on('close', (e) => {
    if (!dirty) return;
    const choice = dialog.showMessageBoxSync(win, {
      type: 'question', buttons: ['Leave without saving', 'Stay'], defaultId: 1, cancelId: 1,
      title: 'Unsaved changes', message: 'This circuit has changes that are not saved to a file.',
    });
    if (choice === 1) e.preventDefault();
  });
  win.on('closed', () => { win = null; });
  const first = fileFromArgs(process.argv);              // app launched by double-clicking a .incog file
  if (first) win.webContents.once('did-finish-load', () => sendFile(first));
  win.webContents.once('did-finish-load', () => setTimeout(() => checkForUpdates(false), 4000));   // quiet check a few seconds after opening
}

// only one window: a second launch (e.g. double-clicking another .incog file) goes to the open one
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', (e, argv) => {
    if (win) { if (win.isMinimized()) win.restore(); win.focus(); const f = fileFromArgs(argv); if (f) sendFile(f); }
  });
  app.whenReady().then(() => {
    setupUpdater();
    createWindow();
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  });
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
}