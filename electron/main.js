// @ts-check
"use strict";

/**
 * Desktop shell for Build Play Estimating.
 *
 * Two very different modes, chosen by `app.isPackaged`:
 *
 *   DEV   `npm run electron:dev` opens a frameless window pointed at
 *         `npm run dev` (localhost:3000), which talks to whatever MongoDB
 *         `.env.local` points at (normally the docker-compose one). Nothing
 *         here is spawned or managed in this mode -- it is just a window.
 *
 *   PROD  The packaged app is meant to be double-clicked with nothing else
 *         installed. On first launch it:
 *           1. downloads a real `mongod` binary (cached for next time) and
 *              starts it against a database directory under this app's
 *              per-user data folder -- a real, persistent MongoDB, not an
 *              in-memory one, so the data survives a restart;
 *           2. spawns the built Next.js server (`.next/standalone/server.js`,
 *              bundled into the app as a resource) as a plain Node process,
 *              pointed at that database;
 *           3. opens a window at it once it responds.
 *         Both child processes are tied to the app's lifecycle: closing the
 *         window shuts them down; a second launch focuses the existing
 *         window instead of starting a second copy of the database.
 *
 * The window itself is frameless (see ElectronTitleBar.tsx on the web side)
 * so the whole app -- including the login screen -- keeps the Windows
 * 98/2000 look rather than switching to a native title bar.
 */

const { app, BrowserWindow, Menu, ipcMain, dialog, shell, screen } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const net = require("node:net");
const http = require("node:http");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");

const isDev = !app.isPackaged;
const MONGOD_VERSION = "7.0.14";
const APP_TITLE = "Build Play Contracting — Estimating System";

// Electron otherwise derives app.getPath('userData') (where the database and
// app-config.json live) from package.json's "name" -- "buildplay-estimating".
// Naming it explicitly keeps the on-disk folder readable and stable even if
// the npm package name ever changes.
app.setName("Build Play Estimating");

/** @type {BrowserWindow | null} */
let mainWindow = null;
/** @type {BrowserWindow | null} */
let splashWindow = null;
/** @type {import('node:child_process').ChildProcess | null} */
let nextServerProcess = null;
/** @type {import('node:child_process').ChildProcess | null} */
let mongodProcess = null;
let quitting = false;

// -------------------------------------------------------------- app paths

function userDataPath(...segments) {
  return path.join(app.getPath("userData"), ...segments);
}

const paths = {
  windowState: () => userDataPath("window-state.json"),
  appConfig: () => userDataPath("app-config.json"),
  mongoDbDir: () => userDataPath("database"),
  mongoBinaryCacheDir: () => userDataPath("mongodb-binaries"),
};

/**
 * The one secret this app needs (session signing) is generated once on first
 * launch and kept in the per-user data folder -- never hard-coded, never
 * shipped in the installer.
 */
function loadOrCreateAppConfig() {
  const configPath = paths.appConfig();
  try {
    const existing = JSON.parse(fs.readFileSync(configPath, "utf8"));
    if (typeof existing.authSecret === "string" && existing.authSecret.length >= 32) {
      return existing;
    }
  } catch {
    // No config yet, or it is corrupt -- fall through and write a fresh one.
  }
  const config = { authSecret: crypto.randomBytes(32).toString("base64") };
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  return config;
}

// ------------------------------------------------------------- small utils

function findFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

function waitForHttpOk(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const req = http.get(url, (res) => {
        res.resume(); // drain, we don't care about the body
        resolve(undefined);
      });
      req.on("error", () => {
        if (Date.now() > deadline) reject(new Error(`Timed out waiting for ${url} to respond`));
        else setTimeout(attempt, 300);
      });
    };
    attempt();
  });
}

function waitForTcpPort(port, host, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const socket = net.connect({ port, host }, () => {
        socket.end();
        resolve(undefined);
      });
      socket.on("error", () => {
        socket.destroy();
        if (Date.now() > deadline) reject(new Error(`Timed out waiting for ${host}:${port}`));
        else setTimeout(attempt, 250);
      });
    };
    attempt();
  });
}

// -------------------------------------------------------------- database

/**
 * Provision (downloading a cached copy the first time) and start a real,
 * persistent `mongod` -- not the ephemeral in-memory server the same package
 * is normally used for in tests. Data lives under the app's userData folder
 * for as long as the app is installed.
 */
async function startMongod() {
  // Required lazily: in dev mode this module (and its binary download) is
  // never touched at all.
  const { MongoBinary } = require("mongodb-memory-server-core");

  const dbPath = paths.mongoDbDir();
  fs.mkdirSync(dbPath, { recursive: true });

  const binaryPath = await MongoBinary.getPath({
    version: MONGOD_VERSION,
    downloadDir: paths.mongoBinaryCacheDir(),
  });

  const port = await findFreePort();

  const child = spawn(
    binaryPath,
    ["--dbpath", dbPath, "--port", String(port), "--bind_ip", "127.0.0.1", "--quiet", "--noauth"],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  child.stdout?.on("data", (chunk) => process.stdout.write(`[mongod] ${chunk}`));
  child.stderr?.on("data", (chunk) => process.stderr.write(`[mongod] ${chunk}`));

  await new Promise((resolve, reject) => {
    const onEarlyExit = (code) => reject(new Error(`mongod exited during startup (code ${code})`));
    child.once("exit", onEarlyExit);
    waitForTcpPort(port, "127.0.0.1", 30_000)
      .then(() => {
        child.off("exit", onEarlyExit);
        resolve(undefined);
      })
      .catch((err) => {
        child.off("exit", onEarlyExit);
        reject(err);
      });
  });

  mongodProcess = child;
  return { port, uri: `mongodb://127.0.0.1:${port}/buildplay` };
}

function stopChild(child, signal = "SIGTERM") {
  return new Promise((resolve) => {
    if (!child || child.exitCode !== null || child.signalCode) {
      resolve(undefined);
      return;
    }
    const timer = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {
        // already gone
      }
    }, 5_000);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve(undefined);
    });
    try {
      child.kill(signal);
    } catch {
      clearTimeout(timer);
      resolve(undefined);
    }
  });
}

// -------------------------------------------------------------- next.js

/**
 * Runs the bundled `.next/standalone/server.js` as a plain Node process using
 * the Electron binary itself (`ELECTRON_RUN_AS_NODE`), which is how a
 * packaged Electron app runs a Node script without shipping a second Node
 * binary alongside it.
 */
function startNextServer({ port, mongoUri, authSecret }) {
  const serverEntry = isDev
    ? path.join(__dirname, "..", ".next", "standalone", "server.js")
    : path.join(process.resourcesPath, "app", "server.js");

  const child = spawn(process.execPath, [serverEntry], {
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      NODE_ENV: "production",
      PORT: String(port),
      HOSTNAME: "127.0.0.1",
      MONGODB_URI: mongoUri,
      AUTH_SECRET: authSecret,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout?.on("data", (chunk) => process.stdout.write(`[server] ${chunk}`));
  child.stderr?.on("data", (chunk) => process.stderr.write(`[server] ${chunk}`));
  nextServerProcess = child;
  return child;
}

// -------------------------------------------------------------- windows

function readWindowState() {
  try {
    const raw = JSON.parse(fs.readFileSync(paths.windowState(), "utf8"));
    if (typeof raw.width === "number" && typeof raw.height === "number") return raw;
  } catch {
    // No saved state yet.
  }
  return null;
}

function saveWindowState(win) {
  if (!win || win.isDestroyed()) return;
  const bounds = win.isMaximized() ? win.getNormalBounds() : win.getBounds();
  try {
    fs.mkdirSync(path.dirname(paths.windowState()), { recursive: true });
    fs.writeFileSync(
      paths.windowState(),
      JSON.stringify({ ...bounds, isMaximized: win.isMaximized() }, null, 2),
    );
  } catch {
    // Not worth failing over -- the window just opens at the default size next time.
  }
}

/** A small "starting up" window shown while mongod/Next.js boot on first launch. */
function createSplashWindow() {
  const win = new BrowserWindow({
    width: 420,
    height: 220,
    frame: false,
    resizable: false,
    movable: true,
    center: true,
    show: true,
    backgroundColor: "#3a6ea5",
    webPreferences: { contextIsolation: true, sandbox: true },
  });

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Starting…</title>
    <style>
      html,body{margin:0;height:100%;background:#c0c0c0;font-family:Tahoma,Geneva,Verdana,sans-serif;color:#000;}
      .box{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;text-align:center;padding:0 24px;}
      .title{font-weight:bold;font-size:13px;}
      .msg{font-size:11px;color:#333;max-width:340px;}
      .bar{width:280px;height:16px;border:1px solid #808080;border-right-color:#fff;border-bottom-color:#fff;background:#fff;overflow:hidden;}
      .chunk{width:40%;height:100%;background:#000080;animation:slide 1.2s ease-in-out infinite;}
      @keyframes slide{0%{transform:translateX(-100%)}100%{transform:translateX(350%)}}
    </style></head>
    <body><div class="box">
      <div class="title">Build Play Contracting</div>
      <div class="bar"><div class="chunk"></div></div>
      <div class="msg">Starting the estimating system&hellip; the first launch sets up a local
      database and can take a minute or two. Later launches are fast.</div>
    </div></body></html>`;

  win.loadURL(`data:text/html,${encodeURIComponent(html)}`);
  return win;
}

function createMainWindow(url) {
  const saved = readWindowState();
  const primary = screen.getPrimaryDisplay().workAreaSize;

  const win = new BrowserWindow({
    title: APP_TITLE,
    width: saved?.width ?? Math.min(1400, primary.width - 80),
    height: saved?.height ?? Math.min(900, primary.height - 80),
    x: saved?.x,
    y: saved?.y,
    minWidth: 1024,
    minHeight: 680,
    frame: false,
    backgroundColor: "#3a6ea5",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  if (saved?.isMaximized) win.maximize();

  // Anything that is not our own local server opens in the OS browser instead
  // of inside the app window -- there is no reason for an outside link to
  // hijack the desktop app's single window.
  win.webContents.setWindowOpenHandler(({ url: targetUrl }) => {
    if (targetUrl.startsWith(url)) return { action: "allow" };
    shell.openExternal(targetUrl);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (event, targetUrl) => {
    if (!targetUrl.startsWith(url)) {
      event.preventDefault();
      shell.openExternal(targetUrl);
    }
  });

  win.once("ready-to-show", () => {
    splashWindow?.close();
    splashWindow = null;
    win.show();
  });

  const sendMaximizedState = () => win.webContents.send("window:maximized-changed", win.isMaximized());
  win.on("maximize", sendMaximizedState);
  win.on("unmaximize", sendMaximizedState);

  let saveTimer = null;
  const scheduleSave = () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => saveWindowState(win), 400);
  };
  win.on("resize", scheduleSave);
  win.on("move", scheduleSave);
  win.on("close", () => saveWindowState(win));

  win.loadURL(url);
  mainWindow = win;
  return win;
}

// -------------------------------------------------------------- ipc

ipcMain.on("window:minimize", (event) => {
  BrowserWindow.fromWebContents(event.sender)?.minimize();
});
ipcMain.on("window:toggle-maximize", (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return;
  if (win.isMaximized()) win.unmaximize();
  else win.maximize();
});
ipcMain.on("window:close", (event) => {
  BrowserWindow.fromWebContents(event.sender)?.close();
});

// -------------------------------------------------------------- menu

// No visible menu bar (the frameless window has no chrome to hang one off),
// but the standard accelerators -- reload, dev tools, quit -- still work,
// since a Menu's keyboard shortcuts are registered whether or not it is shown.
function installAppMenu() {
  const template = [
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
      ],
    },
    { role: "quit" },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// -------------------------------------------------------------- boot

async function boot() {
  installAppMenu();

  if (isDev) {
    const url = process.env.ELECTRON_START_URL || "http://localhost:3000";
    try {
      await waitForHttpOk(url, 15_000);
    } catch {
      dialog.showErrorBox(
        "Dev server is not running",
        `Could not reach ${url}.\n\nStart it first in another terminal:\n\n    npm run dev\n\nthen run npm run electron:dev again.`,
      );
      app.quit();
      return;
    }
    createMainWindow(url);
    return;
  }

  splashWindow = createSplashWindow();

  try {
    const config = loadOrCreateAppConfig();
    const { uri: mongoUri } = await startMongod();
    const appPort = await findFreePort();
    startNextServer({ port: appPort, mongoUri, authSecret: config.authSecret });

    const url = `http://127.0.0.1:${appPort}`;
    // First boot also runs the automatic seed (src/instrumentation.ts), so
    // give it real headroom rather than the couple of seconds a warm start needs.
    await waitForHttpOk(url, 120_000);
    createMainWindow(url);
  } catch (err) {
    dialog.showErrorBox(
      "Could not start Build Play Estimating",
      (err && err.stack) || String(err) ||
        "An unknown error occurred while starting the local database or the app server.",
    );
    app.quit();
  }
}

async function shutdown() {
  if (quitting) return;
  quitting = true;
  await stopChild(nextServerProcess, "SIGTERM");
  // mongod handles SIGINT as a clean shutdown request.
  await stopChild(mongodProcess, "SIGINT");
}

// -------------------------------------------------------------- lifecycle

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  // Another copy is already starting the database / server -- do not start a
  // second one on top of it. Just hand focus to the existing window.
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(boot);

  app.on("window-all-closed", async () => {
    await shutdown();
    app.quit();
  });

  app.on("before-quit", async (event) => {
    if (quitting) return;
    event.preventDefault();
    await shutdown();
    app.exit(0);
  });
}
