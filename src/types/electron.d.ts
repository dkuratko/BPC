export interface ElectronApi {
  isElectron: true;
  platform: string;
  minimize: () => void;
  toggleMaximize: () => void;
  close: () => void;
  onMaximizedChange: (callback: (isMaximized: boolean) => void) => () => void;
}

declare global {
  interface Window {
    /** Present only when the page is running inside the Electron desktop app. */
    electronAPI?: ElectronApi;
  }
}

export {};
