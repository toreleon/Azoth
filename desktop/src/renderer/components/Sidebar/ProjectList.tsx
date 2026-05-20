import { useState } from "react";
import { FolderIcon } from "../Icon.js";
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
    <div className="project-list">
      {projects.map((p) => (
        <button
          key={p.id}
          onClick={() => activate(p.id)}
          className="project-item"
          aria-current={p.id === activeProjectId ? "true" : "false"}
        >
          <FolderIcon className="project-icon" />
          <span>{p.name}</span>
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
          className="ds-input project-create-input"
        />
      ) : (
        <button
          onClick={() => setCreating(true)}
          className="project-create-button"
        >
          + New project
        </button>
      )}
    </div>
  );
}
