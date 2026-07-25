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
    };
  }
}

export {};
