import { useState } from "react";
import { useChatStore } from "../../store/chatStore.js";

export function ProjectList() {
  const { projects, activeProjectId, setActiveProject, setProjects } = useChatStore();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");

  async function activate(id: string) {
    if (id === activeProjectId) return;
    await window.azoth.invoke("project:activate", { id });
    setActiveProject(id);
  }

  async function submitCreate() {
    if (!name.trim()) {
      setCreating(false);
      return;
    }
    const project = await window.azoth.invoke("project:create", { name: name.trim() });
    const { projects: next, activeId } = await window.azoth.invoke("project:list", undefined);
    setProjects(next, activeId ?? project.id);
    setName("");
    setCreating(false);
  }

  return (
    <div className="flex flex-col gap-1 px-3 pb-1">
      {projects.map((p) => (
        <button
          key={p.id}
          onClick={() => activate(p.id)}
          className={`flex items-center gap-3 truncate rounded-md px-2.5 py-1.5 text-left text-sm transition ${
            p.id === activeProjectId
              ? "bg-azoth-accent/10 font-medium text-azoth-accent"
              : "text-azoth-text hover:bg-black/[0.04]"
          }`}
        >
          <ProjectIcon />
          <span className="truncate">{p.name}</span>
        </button>
      ))}
      {creating ? (
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={submitCreate}
          onKeyDown={(e) => {
            if (e.key === "Enter") submitCreate();
            if (e.key === "Escape") {
              setName("");
              setCreating(false);
            }
          }}
          placeholder="Project name"
          className="mx-2 mt-1 rounded-md border border-azoth-border bg-white px-2 py-1 text-sm outline-none focus:border-azoth-accent"
        />
      ) : (
        <button
          onClick={() => setCreating(true)}
          className="rounded-md px-2.5 py-1.5 text-left text-xs text-azoth-muted transition hover:bg-black/[0.04] hover:text-azoth-text"
        >
          + New project
        </button>
      )}
    </div>
  );
}

function ProjectIcon() {
  return (
    <svg
      className="h-4 w-4 shrink-0 text-current opacity-70"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2.5 4.5a1 1 0 0 1 1-1h3l1.2 1.5h4.8a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1v-7.5Z" />
    </svg>
  );
}
