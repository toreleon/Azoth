import { app, BrowserWindow, shell } from "electron";
import { resolve } from "node:path";
import { getDesktopSettings } from "./appSettings.js";

let appQuitting = false;

export function markAppQuitting(): void {
  appQuitting = true;
}

export function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    titleBarStyle: "hiddenInset",
    backgroundColor: "#fafafa",
    webPreferences: {
      preload: resolve(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  win.on("close", (event) => {
    if (process.platform === "darwin" && !appQuitting && getDesktopSettings().hideOnClose) {
      event.preventDefault();
      win.hide();
    }
  });

  const devUrl = process.env["ELECTRON_RENDERER_URL"];
  if (devUrl) {
    void win.loadURL(devUrl);
  } else {
    void win.loadFile(resolve(__dirname, "../renderer/index.html"));
  }
  return win;
}
