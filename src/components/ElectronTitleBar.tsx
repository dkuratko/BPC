"use client";

import { useEffect, useState } from "react";

/**
 * The OUTER window chrome for the desktop app: the title, a draggable region,
 * and the minimize/maximize/close buttons a frameless BrowserWindow does not
 * provide on its own. Rendered once at the root of every page (including the
 * login screen) so the frameless window is always movable and closable.
 *
 * Renders nothing at all in a plain browser tab — it only appears once
 * `window.electronAPI` shows up, which only happens inside the Electron shell
 * (see electron/preload.js). This is a different thing from the per-panel
 * ".title-bar" headers used throughout the app (see components/ui.tsx `Win`):
 * those model classic MDI child windows inside the page and are purely
 * decorative, with no real window behind them.
 */
export function ElectronTitleBar() {
  const [ready, setReady] = useState(false);
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.electronAPI?.isElectron) return;
    setReady(true);
    // See the --electron-titlebar-height comment in globals.css: .desktop and
    // .login-screen size themselves around this so the page fills exactly the
    // remaining space instead of overflowing by the title bar's height.
    document.documentElement.style.setProperty("--electron-titlebar-height", "28px");
    const unsubscribe = window.electronAPI.onMaximizedChange(setMaximized);
    return () => {
      unsubscribe();
      document.documentElement.style.removeProperty("--electron-titlebar-height");
    };
  }, []);

  if (!ready) return null;

  return (
    <div className="electron-titlebar">
      <span className="electron-titlebar-title">Build Play Contracting — Estimating System</span>
      <div className="electron-titlebar-buttons">
        <button
          type="button"
          className="electron-titlebar-btn"
          aria-label="Minimize"
          onClick={() => window.electronAPI?.minimize()}
        >
          &#x2013;
        </button>
        <button
          type="button"
          className="electron-titlebar-btn"
          aria-label={maximized ? "Restore" : "Maximize"}
          onClick={() => window.electronAPI?.toggleMaximize()}
        >
          {maximized ? "❐" : "□"}
        </button>
        <button
          type="button"
          className="electron-titlebar-btn electron-titlebar-close"
          aria-label="Close"
          onClick={() => window.electronAPI?.close()}
        >
          &#x2715;
        </button>
      </div>
    </div>
  );
}
