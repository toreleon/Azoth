import { randomUUID } from "node:crypto";
import { z } from "zod";
import { runRole, type RoleRunOptions } from "./runner.js";
import type {
  RoleName,
  RoleUsage,
  TeamEvent,
  TeamMessage,
  TeamParticipant,
  TeamTask,
} from "./state.js";

export interface TeamOrchestratorOptions {
  runId: string;
  emit: (event: TeamEvent) => void;
}

export interface TeamTaskSpec {
  id: string;
  title: string;
  role: RoleName;
  round?: number;
  dependsOn?: string[];
}

type RunRoleTaskOptions<T> = Omit<RoleRunOptions<T>, "role" | "round" | "emit"> & {
  taskId: string;
  summary: (output: T) => string;
};

export class TeamOrchestrator {
  private readonly taskMap = new Map<string, TeamTask>();
  private readonly mailbox: TeamMessage[] = [];

  constructor(private readonly opts: TeamOrchestratorOptions) {}

  get tasks(): TeamTask[] {
    return [...this.taskMap.values()];
  }

  get messages(): TeamMessage[] {
    return [...this.mailbox];
  }

  createTask(spec: TeamTaskSpec): TeamTask {
    if (this.taskMap.has(spec.id)) {
      throw new Error(`duplicate team task id: ${spec.id}`);
    }
    const now = Date.now();
    const task: TeamTask = {
      id: spec.id,
      title: spec.title,
      role: spec.role,
      round: spec.round,
      dependsOn: spec.dependsOn ?? [],
      status: "pending",
      createdAt: now,
      updatedAt: now,
    };
    this.taskMap.set(task.id, task);
    this.opts.emit({ type: "task_created", task });
    return task;
  }

  createTasks(specs: TeamTaskSpec[]): TeamTask[] {
    return specs.map((spec) => this.createTask(spec));
  }

  sendMessage(
    from: TeamParticipant,
    to: TeamParticipant,
    text: string,
    taskId?: string,
  ): TeamMessage {
    const message: TeamMessage = {
      id: randomUUID(),
      from,
      to,
      taskId,
      text: compact(text, 900),
      createdAt: Date.now(),
    };
    this.mailbox.push(message);
    this.opts.emit({ type: "message", message });
    return message;
  }

  async runRoleTask<T>(
    opts: RunRoleTaskOptions<T>,
  ): Promise<{ output: T; raw: { text: string; toolCount: number; usage: RoleUsage; sessionId?: string } }> {
    const task = this.claimTask(opts.taskId);
    try {
      const { output, raw } = await runRole({
        ...opts,
        role: task.role,
        round: task.round,
        emit: this.opts.emit,
        userPrompt: this.withCoordinationContext(task, opts.userPrompt),
      });
      const summary = opts.summary(output);
      this.completeTask(task.id, summary);
      this.sendMessage(task.role, "lead", summary, task.id);
      return { output, raw };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.failTask(task.id, message);
      throw err;
    }
  }

  private claimTask(taskId: string): TeamTask {
    const task = this.requireTask(taskId);
    if (task.status !== "pending") {
      throw new Error(`task ${taskId} is ${task.status}, expected pending`);
    }
    const blockedBy = task.dependsOn.filter((dep) => this.requireTask(dep).status !== "completed");
    if (blockedBy.length) {
      throw new Error(`task ${taskId} is blocked by ${blockedBy.join(", ")}`);
    }
    const next: TeamTask = {
      ...task,
      status: "in_progress",
      claimedBy: task.role,
      updatedAt: Date.now(),
    };
    this.taskMap.set(taskId, next);
    this.opts.emit({ type: "task_started", task: next });
    return next;
  }

  private completeTask(taskId: string, outputSummary: string): void {
    const task = this.requireTask(taskId);
    const next: TeamTask = {
      ...task,
      status: "completed",
      outputSummary: compact(outputSummary, 900),
      updatedAt: Date.now(),
    };
    this.taskMap.set(taskId, next);
    this.opts.emit({ type: "task_completed", task: next });
  }

  private failTask(taskId: string, message: string): void {
    const task = this.requireTask(taskId);
    const next: TeamTask = {
      ...task,
      status: "failed",
      outputSummary: compact(message, 900),
      updatedAt: Date.now(),
    };
    this.taskMap.set(taskId, next);
    this.opts.emit({ type: "task_failed", task: next, message: compact(message, 240) });
  }

  private requireTask(taskId: string): TeamTask {
    const task = this.taskMap.get(taskId);
    if (!task) throw new Error(`unknown team task: ${taskId}`);
    return task;
  }

  private withCoordinationContext(task: TeamTask, userPrompt: string): string {
    return [
      "Agent-team coordination context:",
      "- You are an independent teammate with your own context window.",
      "- Complete only your assigned task. Do not claim another teammate's task.",
      "- Use the shared task list and mailbox below to coordinate with the lead and other teammates.",
      "- If another teammate's message contradicts your evidence, challenge it in your final JSON summary rather than silently adopting it.",
      "",
      "Assigned task:",
      renderTask(task),
      "",
      "Shared task list:",
      this.tasks.map(renderTask).join("\n"),
      "",
      "Mailbox messages visible to you:",
      this.visibleMessages(task.role),
      "",
      "Task-specific instructions:",
      userPrompt,
    ].join("\n");
  }

  private visibleMessages(role: RoleName): string {
    const visible = this.mailbox.filter(
      (message) => message.to === role || message.to === "all" || message.to === "lead" || message.from === role,
    );
    if (!visible.length) return "(none)";
    return visible
      .slice(-12)
      .map((message) => {
        const task = message.taskId ? ` task=${message.taskId}` : "";
        return `[${message.from}->${message.to}${task}] ${message.text}`;
      })
      .join("\n");
  }
}

export function compact(value: unknown, limit = 500): string {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  const oneLine = text.replace(/\s+/g, " ").trim();
  if (oneLine.length <= limit) return oneLine;
  return `${oneLine.slice(0, limit - 3)}...`;
}

function renderTask(task: TeamTask): string {
  const deps = task.dependsOn.length ? ` deps=[${task.dependsOn.join(",")}]` : "";
  const round = task.round == null ? "" : ` round=${task.round}`;
  const summary = task.outputSummary ? ` summary="${compact(task.outputSummary, 160)}"` : "";
  return `- ${task.id}: ${task.title} role=${task.role}${round} status=${task.status}${deps}${summary}`;
}
