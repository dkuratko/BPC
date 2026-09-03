// @ts-check
"use strict";

/**
 * Runs in an isolated world with access to Node and Electron APIs, but the
 * renderer (the actual web app) only ever sees whatever is explicitly put on
 * `window.electronAPI` here. There is deliberately very little: window
 * controls for the frameless title bar, and a flag the UI uses to know it is
 * running as the desktop app at all (see ElectronTitleBar.tsx).
 */

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  isElectron: true,
  platform: process.platform,

  minimize: () => ipcRenderer.send("window:minimize"),
  toggleMaximize: () => ipcRenderer.send("window:toggle-maximize"),
  close: () => ipcRenderer.send("window:close"),

  /** @param {(isMaximized: boolean) => void} callback */
  onMaximizedChange: (callback) => {
    /** @param {unknown} _event @param {boolean} isMaximized */
    const handler = (_event, isMaximized) => callback(isMaximized);
    ipcRenderer.on("window:maximized-changed", handler);
    return () => ipcRenderer.removeListener("window:maximized-changed", handler);
  },
});
