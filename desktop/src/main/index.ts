import { app, BrowserWindow } from "electron";
import { initializeAzothRuntime } from "@azoth/core/runtime/init.js";
import { loadConfig } from "@azoth/core/config/loader.js";
import { ensureDefaultProject, getProject } from "./projects.js";
import { activateProject } from "./projectContext.js";
import { createMainWindow } from "./window.js";
import { bindMainWindow } from "./streamBus.js";
import { abortAllTurns, registerIpcHandlers } from "./mainIpc.js";
import { installConsentBridge, clearConsent } from "./consent.js";

function boot(): void {
  initializeAzothRuntime();
  try {
    loadConfig();
  } catch (err) {
    // Config may be incomplete on first boot; ignored — onboarding will fix it.
    console.warn("[azoth] loadConfig failed during boot:", (err as Error).message);
  }
  const { activeId } = ensureDefaultProject();
  const project = getProject(activeId);
  if (project) activateProject(project);
  installConsentBridge();
  registerIpcHandlers();

  const win = createMainWindow();
  bindMainWindow(win);
}

app.whenReady().then(boot).catch((err) => {
  console.error("[azoth] fatal boot error:", err);
  app.exit(1);
});

app.on("window-all-closed", () => {
  abortAllTurns();
  clearConsent();
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    const win = createMainWindow();
    bindMainWindow(win);
  }
});

app.on("before-quit", () => {
  abortAllTurns();
});
