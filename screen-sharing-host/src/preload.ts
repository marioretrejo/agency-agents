import { contextBridge, ipcRenderer } from 'electron';

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
};

export type ElectronAPI = typeof api;

contextBridge.exposeInMainWorld('electronAPI', api);
