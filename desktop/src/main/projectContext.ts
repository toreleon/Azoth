import { mkdirSync } from "node:fs";
import type { Project } from "../shared/ipc.js";

let currentProjectId: string | null = null;

export function activateProject(project: Project): void {
  mkdirSync(project.rootPath, { recursive: true });
  process.chdir(project.rootPath);
  currentProjectId = project.id;
}

export function getCurrentProjectId(): string | null {
  return currentProjectId;
}
