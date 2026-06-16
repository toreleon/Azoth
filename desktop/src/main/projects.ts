import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { azothHome } from "@azoth/core/runtime/paths.js";
import type { Project } from "../shared/ipc.js";

interface ProjectsFile {
  version: 1;
  onboarded: boolean;
  activeId: string | null;
  projects: Project[];
}

function projectsFilePath(): string {
  return resolve(azothHome(), "projects-desktop.json");
}

function defaultRootFor(id: string): string {
  return resolve(azothHome(), "desktop-projects", id);
}

function emptyFile(): ProjectsFile {
  return { version: 1, onboarded: false, activeId: null, projects: [] };
}

function readFile(): ProjectsFile {
  const path = projectsFilePath();
  if (!existsSync(path)) return emptyFile();
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as Partial<ProjectsFile>;
    return {
      version: 1,
      onboarded: Boolean(raw.onboarded),
      activeId: raw.activeId ?? null,
      projects: Array.isArray(raw.projects) ? (raw.projects as Project[]) : [],
    };
  } catch {
    return emptyFile();
  }
}

function writeFile(file: ProjectsFile): void {
  mkdirSync(resolve(azothHome()), { recursive: true });
  writeFileSync(projectsFilePath(), `${JSON.stringify(file, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
}

export function ensureDefaultProject(): { projects: Project[]; activeId: string } {
  const file = readFile();
  if (file.projects.length === 0) {
    const id = randomUUID();
    const root = defaultRootFor("personal");
    mkdirSync(root, { recursive: true });
    const project: Project = {
      id,
      name: "Personal",
      rootPath: root,
      createdAt: Date.now(),
      isDefault: true,
    };
    file.projects.push(project);
    file.activeId = id;
    writeFile(file);
  } else if (!file.activeId) {
    file.activeId = file.projects[0]!.id;
    writeFile(file);
  }
  return { projects: file.projects, activeId: file.activeId! };
}

export function listProjects(): { projects: Project[]; activeId: string | null } {
  const file = readFile();
  return { projects: file.projects, activeId: file.activeId };
}

export function getProject(id: string): Project | undefined {
  return readFile().projects.find((p) => p.id === id);
}

export function createProject(input: { name: string; rootPath?: string }): Project {
  const file = readFile();
  const id = randomUUID();
  const root = resolve(input.rootPath ?? defaultRootFor(id));
  mkdirSync(root, { recursive: true });
  const project: Project = {
    id,
    name: input.name,
    rootPath: root,
    createdAt: Date.now(),
  };
  file.projects.push(project);
  if (!file.activeId) file.activeId = id;
  writeFile(file);
  return project;
}

export function deleteProject(id: string): void {
  const file = readFile();
  file.projects = file.projects.filter((p) => p.id !== id);
  if (file.activeId === id) file.activeId = file.projects[0]?.id ?? null;
  writeFile(file);
}

export function setActiveProject(id: string): Project {
  const file = readFile();
  const project = file.projects.find((p) => p.id === id);
  if (!project) throw new Error(`Unknown project: ${id}`);
  file.activeId = id;
  writeFile(file);
  return project;
}

export function isOnboarded(): boolean {
  return readFile().onboarded;
}

export function setOnboarded(value: boolean): void {
  const file = readFile();
  file.onboarded = value;
  writeFile(file);
}
