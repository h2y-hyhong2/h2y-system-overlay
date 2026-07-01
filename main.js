const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, screen } = require('electron');
const path = require('path');
const si = require('systeminformation');
const os = require('os');

// Disable unneeded features to reduce RAM footprint drastically
app.commandLine.appendSwitch('disable-webgl');
app.commandLine.appendSwitch('disable-webgl2');
app.commandLine.appendSwitch('disable-speech-api');
app.commandLine.appendSwitch('disable-audio-output');
app.commandLine.appendSwitch('disable-background-networking');

let win = null;
let tray = null;
let statsInterval = null;
let isClickThrough = false;
let isPositionLocked = false;
let isAlwaysOnTop = true;
let layoutMode = 'landscape';

function setLayoutMode(mode) {
  if (layoutMode === mode) return;
  layoutMode = mode;
  if (win) {
    const w = layoutMode === 'portrait' ? 240 : 750;
    const h = layoutMode === 'portrait' ? 225 : 46;
    win.setResizable(true);
    win.setSize(w, h);
    win.setResizable(false);
    win.webContents.send('layout-mode-changed', layoutMode);
    setTimeout(() => {
      if (win && !win.isDestroyed()) {
        win.webContents.invalidate();
      }
    }, 50);
  }
}

function createTray() {
  const iconPath = path.join(__dirname, 'tray-icon.png');
  const icon = nativeImage.createFromPath(iconPath);
  tray = new Tray(icon.resize({ width: 16, height: 16 }));
  
  const contextMenu = Menu.buildFromTemplate([
    { label: 'PC 성능 오버레이', enabled: false },
    { type: 'separator' },
    {
      label: '레이아웃 모드',
      submenu: [
        {
          label: '세로 모드',
          type: 'radio',
          checked: layoutMode === 'portrait',
          click: () => setLayoutMode('portrait')
        },
        {
          label: '가로 모드',
          type: 'radio',
          checked: layoutMode === 'landscape',
          click: () => setLayoutMode('landscape')
        }
      ]
    },
    { type: 'separator' },
    { 
      label: '항상 위에 노출', 
      type: 'checkbox', 
      checked: isAlwaysOnTop, 
      click: (item) => {
        isAlwaysOnTop = item.checked;
        if (win) win.setAlwaysOnTop(isAlwaysOnTop, 'screen-saver');
      } 
    },
    { 
      label: '마우스 클릭 통과', 
      type: 'checkbox', 
      checked: isClickThrough, 
      click: (item) => {
        isClickThrough = item.checked;
        if (win) {
          win.setIgnoreMouseEvents(isClickThrough, { forward: true });
          win.webContents.send('click-through-changed', isClickThrough);
        }
      } 
    },
    { 
      label: '위치 고정 (드래그 금지)', 
      type: 'checkbox', 
      checked: isPositionLocked, 
      click: (item) => {
        isPositionLocked = item.checked;
        if (win) {
          win.webContents.send('position-lock-changed', isPositionLocked);
        }
      } 
    },
    { type: 'separator' },
    { 
      label: '종료', 
      click: () => {
        app.quit();
      } 
    }
  ]);
  
  tray.setToolTip('PC 성능 오버레이');
  tray.setContextMenu(contextMenu);
}

function createWindow() {
  const initialWidth = layoutMode === 'portrait' ? 240 : 750;
  const initialHeight = layoutMode === 'portrait' ? 225 : 46;

  win = new BrowserWindow({
    width: initialWidth,
    height: initialHeight,
    type: 'toolbar', // Prevents showing in taskbar preview on some Windows configs
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    hasShadow: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  // Windows-specific config to keep it floating above all windows including fullscreen games (sometimes)
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true);

  win.loadFile(path.join(__dirname, 'index.html'));

  win.webContents.on('did-finish-load', () => {
    win.webContents.send('layout-mode-changed', layoutMode);
    win.webContents.send('position-lock-changed', isPositionLocked);
    win.webContents.send('click-through-changed', isClickThrough);
  });

  // Open DevTools in dev mode if needed for debugging
  // win.webContents.openDevTools({ mode: 'detach' });

  win.on('closed', () => {
    win = null;
  });
}

// IPC Handlers
let dragOffset = { x: 0, y: 0 };
ipcMain.on('window-drag-start', (event, { x, y }) => {
  dragOffset = { x, y };
});

ipcMain.on('window-drag', (event) => {
  if (isPositionLocked) return;
  const currentWindow = BrowserWindow.fromWebContents(event.sender);
  if (currentWindow) {
    const cursor = screen.getCursorScreenPoint();
    currentWindow.setPosition(cursor.x - dragOffset.x, cursor.y - dragOffset.y);
  }
});

ipcMain.on('window-close', () => {
  app.quit();
});

ipcMain.on('window-toggle-layout', () => {
  setLayoutMode(layoutMode === 'portrait' ? 'landscape' : 'portrait');
});

// Helper to query system metrics safely without throwing uncaught promise rejections on other PCs
let lastCpuTime = getCpuTime();

function getCpuTime() {
  const cpus = os.cpus();
  let user = 0, nice = 0, sys = 0, idle = 0, irq = 0;
  for (const cpu of cpus) {
    user += cpu.times.user;
    nice += cpu.times.nice;
    sys += cpu.times.sys;
    idle += cpu.times.idle;
    irq += cpu.times.irq;
  }
  const total = user + nice + sys + idle + irq;
  return { active: total - idle, total };
}

function getCpuLoad() {
  const current = getCpuTime();
  const idleDelta = current.total - lastCpuTime.total;
  const activeDelta = current.active - lastCpuTime.active;
  lastCpuTime = current;
  if (idleDelta === 0) return 0;
  return Math.round((activeDelta / idleDelta) * 100);
}

// Helper to query system metrics safely without throwing uncaught promise rejections on other PCs
async function safeQuery(fn, fallback) {
  try {
    return await fn();
  } catch (err) {
    console.error('Error querying system metric:', err);
    return fallback;
  }
}

// System Info Monitoring Loop
async function startMonitoring() {
  // Pre-initialize network stats safely
  await safeQuery(() => si.networkStats(), []);

  statsInterval = setInterval(async () => {
    if (!win) return;

    try {
      // 1. Native CPU load (Zero cost)
      const cpuUsage = getCpuLoad();

      // 2. Native RAM memory (Zero cost)
      const totalMem = os.totalmem();
      const freeMem = os.freemem();
      const activeMem = totalMem - freeMem;
      const ramUsage = Math.round((activeMem / totalMem) * 100);

      // 3. Network speed (Only query needed through systeminformation)
      const netStats = await safeQuery(() => si.networkStats(), []);

      // Parse Network speed
      let rxSec = 0; // Download bytes/sec
      let txSec = 0; // Upload bytes/sec
      if (Array.isArray(netStats)) {
        netStats.forEach(stat => {
          if (stat.operstate === 'up' || (stat.rx_sec > 0 || stat.tx_sec > 0)) {
            rxSec += stat.rx_sec || 0;
            txSec += stat.tx_sec || 0;
          }
        });
      }

      const stats = {
        cpu: {
          usage: cpuUsage
        },
        ram: {
          usage: ramUsage
        },
        network: {
          rx: rxSec,
          tx: txSec
        }
      };

      win.webContents.send('stats-update', stats);
    } catch (err) {
      console.error('Monitoring loop error:', err);
    }
  }, 1000);
}

app.whenReady().then(() => {
  createTray();
  createWindow();
  startMonitoring();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  if (statsInterval) {
    clearInterval(statsInterval);
  }
});
