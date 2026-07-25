import { app, BrowserWindow, desktopCapturer, ipcMain, session, clipboard } from 'electron';
import * as path from 'node:path';
import {
  getScreenSize,
  isControlAvailable,
  keyAction,
  mouseButton,
  moveMouse,
  scroll,
  typeText,
} from './input';
import type { KeyModifiers, MouseButtonName } from './control-types';

// process.platform: 'win32' | 'darwin' | 'linux'
const PLATFORM = process.platform;
const SIGNALING_SERVER = process.env.SIGNALING_SERVER ?? 'http://localhost:5000';
const VIEWER_URL = process.env.VIEWER_URL ?? 'http://localhost:3000';

let mainWindow: BrowserWindow | null = null;

function log(message: string, ...rest: unknown[]): void {
  console.log(`[Host] ${new Date().toISOString()} ${message}`, ...rest);
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 480,
    height: 640,
    minWidth: 360,
    minHeight: 480,
    title: 'Screen Sharing Host',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  // Fallback path: if the renderer calls getDisplayMedia() (e.g. desktopCapturer
  // returned nothing on Wayland), grant it the primary screen.
  session.defaultSession.setDisplayMediaRequestHandler((_request, callback) => {
    desktopCapturer
      .getSources({ types: ['screen'] })
      .then((sources) => {
        if (sources.length > 0) {
          callback({ video: sources[0] });
        } else {
          callback({});
        }
      })
      .catch((err) => {
        log('display-media fallback failed', err);
        callback({});
      });
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    void mainWindow.loadURL(devServerUrl);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    void mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  }

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    log(`renderer crashed (${details.reason}), reloading`);
    mainWindow?.webContents.reload();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  log(`window created on ${PLATFORM} (${process.arch})`);
}

// ---------------------------------------------------------------------------
// IPC handlers — renderer owns Socket.io + WebRTC; main owns OS capture APIs
// ---------------------------------------------------------------------------

ipcMain.handle('app:get-config', () => ({
  platform: PLATFORM,
  arch: process.arch,
  signalingServer: SIGNALING_SERVER,
  viewerUrl: VIEWER_URL,
}));

ipcMain.handle('screen:get-sources', async () => {
  try {
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 320, height: 180 },
    });
    return sources.map((s) => ({
      id: s.id,
      name: s.name,
      thumbnail: s.thumbnail.toDataURL(),
    }));
  } catch (err) {
    log('desktopCapturer.getSources failed', err);
    return [];
  }
});

ipcMain.handle('clipboard:write', (_event, text: string) => {
  clipboard.writeText(String(text));
});

ipcMain.handle('clipboard:read', () => clipboard.readText());

// --- Remote control input injection ---------------------------------------
// These are only reachable once the renderer has confirmed a viewer's control
// request was granted; the renderer gates every call behind that approval.

ipcMain.handle('control:available', () => isControlAvailable());
ipcMain.handle('control:screen-size', () => getScreenSize());

ipcMain.on('input:mouse-move', (_event, x: number, y: number) => {
  void moveMouse(x, y);
});

ipcMain.on(
  'input:mouse-button',
  (_event, button: MouseButtonName, down: boolean, x: number, y: number) => {
    void mouseButton(button, down, x, y);
  },
);

ipcMain.on('input:scroll', (_event, dx: number, dy: number) => {
  void scroll(dx, dy);
});

ipcMain.on(
  'input:key',
  (_event, code: string, down: boolean, modifiers: KeyModifiers) => {
    void keyAction(code, down, modifiers);
  },
);

ipcMain.on('input:text', (_event, text: string) => {
  void typeText(text);
});

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    // macOS: re-create window when dock icon is clicked
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (PLATFORM !== 'darwin') app.quit();
});

process.on('uncaughtException', (err) => {
  log('uncaught exception', err);
});
