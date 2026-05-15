import { useChatStore } from "../../store/chatStore.js";

const QUICK_ACTIONS = [
  { label: "Quote VNM", prompt: "/quote VNM" },
  { label: "Analyze HPG", prompt: "/analyze HPG" },
  { label: "Show positions", prompt: "/positions" },
  { label: "Health probe", prompt: "/health --probe" },
];

export function EmptyState() {
  // Surfaces a hint chip-bar; the composer itself owns the input.
  // Clicking a chip writes into the global pending prompt via a custom event.
  return (
    <section className="thread empty-thread">
      <article className="turn assistant">
        <div className="bubble md">
          <h2>What should we build in Azoth?</h2>
        </div>
      </article>
      <div className="quick-actions">
        {QUICK_ACTIONS.map((a) => (
          <button
            key={a.label}
            onClick={() => {
              window.dispatchEvent(
                new CustomEvent("azoth:prefill", { detail: a.prompt }),
              );
            }}
            className="picker"
          >
            {a.label}
          </button>
        ))}
      </div>
      <ProjectIndicator />
    </section>
  );
}

function ProjectIndicator() {
  const project = useChatStore((s) =>
    s.projects.find((p) => p.id === s.activeProjectId),
  );
  if (!project) return null;
  return (
    <div className="project-indicator">
      Project: <span className="text-azoth-text">{project.name}</span>
    </div>
  );
}
