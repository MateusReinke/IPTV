// Electron main process.
//
// The app itself is the existing Next.js server (frontend + the /api/xtream and
// /api/stream proxy routes) - Electron just launches that server as a local child
// process and shows it in a native window, so a desktop build needs no separate
// backend or Node.js install on the user's machine.
//
// Dev mode (npm run electron:dev): ELECTRON_START_URL points at `next dev`,
// already started by that script, so we just load it.
// Packaged/prod mode: we fork the Next.js "standalone" server.js bundled via
// electron-builder's extraResources and wait for it to answer before loading it.

const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const http = require('node:http');
const { fork } = require('node:child_process');

const PORT = process.env.IPTV_PORT || '3000';
const DEV_URL = process.env.ELECTRON_START_URL;

let serverProcess = null;
let mainWindow = null;

function resolveServerEntry() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'app', 'server.js');
  }
  // Lets `electron .` run against a local `npm run build` output without packaging,
  // for smoke-testing the same code path used in production.
  return path.join(__dirname, '..', '.next', 'standalone', 'server.js');
}

function startStandaloneServer() {
  const serverEntry = resolveServerEntry();
  serverProcess = fork(serverEntry, [], {
    cwd: path.dirname(serverEntry),
    env: { ...process.env, PORT, HOSTNAME: '127.0.0.1', NODE_ENV: 'production' },
    stdio: 'inherit',
  });
  serverProcess.on('exit', (code) => {
    serverProcess = null;
    if (code !== 0 && mainWindow) {
      app.quit();
    }
  });
}

function waitForServer(url, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const req = http.get(url, (res) => {
        res.destroy();
        resolve();
      });
      req.on('error', () => {
        if (Date.now() > deadline) {
          reject(new Error('Timed out waiting for the app server to start'));
          return;
        }
        setTimeout(attempt, 300);
      });
    };
    attempt();
  });
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: '#0c0808',
    autoHideMenuBar: true,
    icon: path.join(__dirname, '..', 'build', 'icon.ico'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  const url = DEV_URL || `http://127.0.0.1:${PORT}`;
  if (!DEV_URL) {
    startStandaloneServer();
    await waitForServer(url);
  }
  await mainWindow.loadURL(url);
}

function stopStandaloneServer() {
  if (serverProcess) {
    serverProcess.kill();
    serverProcess = null;
  }
}

app.whenReady().then(() => {
  createWindow().catch((err) => {
    console.error('Failed to start IPTV Player:', err);
    app.quit();
  });
});

app.on('window-all-closed', () => {
  stopStandaloneServer();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', stopStandaloneServer);

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow().catch((err) => console.error('Failed to reopen window:', err));
  }
});
