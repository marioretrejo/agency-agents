import { contextBridge, ipcRenderer } from 'electron';
import type { KeyModifiers, MouseButtonName } from './control-types';

export interface HostConfig {
  platform: NodeJS.Platform;
  arch: string;
  signalingServer: string;
  viewerUrl: string;
}

export interface ScreenSource {
  id: string;
  name: string;
  thumbnail: string;
}

const api = {
  getConfig: (): Promise<HostConfig> => ipcRenderer.invoke('app:get-config'),
  getScreenSources: (): Promise<ScreenSource[]> => ipcRenderer.invoke('screen:get-sources'),
  copyToClipboard: (text: string): Promise<void> => ipcRenderer.invoke('clipboard:write', text),
  readClipboard: (): Promise<string> => ipcRenderer.invoke('clipboard:read'),

  // Remote control — the renderer only calls these after approving a viewer.
  isControlAvailable: (): Promise<boolean> => ipcRenderer.invoke('control:available'),
  getControlScreenSize: (): Promise<{ width: number; height: number }> =>
    ipcRenderer.invoke('control:screen-size'),
  inputMouseMove: (x: number, y: number): void =>
    ipcRenderer.send('input:mouse-move', x, y),
  inputMouseButton: (button: MouseButtonName, down: boolean, x: number, y: number): void =>
    ipcRenderer.send('input:mouse-button', button, down, x, y),
  inputScroll: (dx: number, dy: number): void => ipcRenderer.send('input:scroll', dx, dy),
  inputKey: (code: string, down: boolean, modifiers: KeyModifiers): void =>
    ipcRenderer.send('input:key', code, down, modifiers),
  inputText: (text: string): void => ipcRenderer.send('input:text', text),
};

export type ElectronAPI = typeof api;

contextBridge.exposeInMainWorld('electronAPI', api);
