import type { KeyModifiers, MouseButtonName } from './control-types';

export interface HostConfig {
  platform: string;
  arch: string;
  signalingServer: string;
  viewerUrl: string;
}

export interface ScreenSource {
  id: string;
  name: string;
  thumbnail: string;
}

declare global {
  interface Window {
    electronAPI: {
      getConfig: () => Promise<HostConfig>;
      getScreenSources: () => Promise<ScreenSource[]>;
      copyToClipboard: (text: string) => Promise<void>;
      readClipboard: () => Promise<string>;
      isControlAvailable: () => Promise<boolean>;
      getControlScreenSize: () => Promise<{ width: number; height: number }>;
      inputMouseMove: (x: number, y: number) => void;
      inputMouseButton: (button: MouseButtonName, down: boolean, x: number, y: number) => void;
      inputScroll: (dx: number, dy: number) => void;
      inputKey: (code: string, down: boolean, modifiers: KeyModifiers) => void;
      inputText: (text: string) => void;
    };
  }
}

export {};
