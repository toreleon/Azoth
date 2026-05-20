import type { BrowserWindow } from "electron";
import { STREAM_CHANNEL, type StreamEvent } from "../shared/ipc.js";

let mainWindow: BrowserWindow | null = null;

export function bindMainWindow(win: BrowserWindow): void {
  mainWindow = win;
  win.on("closed", () => {
    if (mainWindow === win) mainWindow = null;
  });
}

export function sendStream(event: StreamEvent): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send(STREAM_CHANNEL, event);
}
