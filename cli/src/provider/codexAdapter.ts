import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";
import type {
  NormalizedProviderEvent,
  ProviderAdapter,
} from "./ProviderAdapter.js";

type JsonRpcResponse = {
  id?: number | string;
  result?: unknown;
  error?: { message?: string } | unknown;
};

export class CodexAdapter implements ProviderAdapter {
  private child?: ChildProcessWithoutNullStreams;
  private nextId = 1;
  private threadId?: string;
  private callbacks = new Set<(e: NormalizedProviderEvent) => void>();
  private pending = new Map<
    number,
    { resolve(value: unknown): void; reject(error: Error): void }
  >();

  onEvent(cb: (e: NormalizedProviderEvent) => void) {
    this.callbacks.add(cb);
  }

  async start(_sessionId: string, cwd: string) {
    this.child = spawn("codex", ["app-server", "--stdio"], {
      cwd,
      stdio: ["pipe", "pipe", "pipe"],
    });

    this.child.stderr.on("data", (chunk) => {
      const text = String(chunk).trim();
      if (text) {
        this.emit({ kind: "tool_result", toolName: "codex.stderr", result: text });
      }
    });

    const rl = createInterface({ input: this.child.stdout });
    rl.on("line", (line) => this.handleLine(line));
    this.child.on("exit", (code) => {
      if (code && code !== 0) {
        this.rejectAll(new Error(`codex app-server exited with code ${code}`));
      }
    });

    await this.request("initialize", {
      clientInfo: { name: "mpa", title: "MPA", version: "0.1.0" },
      capabilities: {
        experimentalApi: true,
        requestAttestation: false,
        optOutNotificationMethods: null,
        extensions: null,
      },
    });

    const started = (await this.request("thread/start", {
      cwd,
      approvalPolicy: "on-request",
      sandbox: "workspace-write",
      threadSource: "mpa",
      sessionStartSource: "startup",
    })) as { thread?: { id?: string } };

    if (!started.thread?.id) {
      throw new Error("Codex thread/start did not return a thread id");
    }
    this.threadId = started.thread.id;
  }

  async sendUserTurn(text: string) {
    if (!this.threadId) {
      throw new Error("Codex adapter has not started");
    }
    await this.request("turn/start", {
      threadId: this.threadId,
      input: [{ type: "text", text, text_elements: [] }],
      cwd: process.cwd(),
    });
  }

  async stop() {
    this.rejectAll(new Error("Codex adapter stopped"));
    this.child?.kill("SIGTERM");
  }

  private request(method: string, params: unknown) {
    const id = this.nextId++;
    const body = JSON.stringify({ jsonrpc: "2.0", id, method, params });
    this.child?.stdin.write(`${body}\n`);
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
  }

  private handleLine(line: string) {
    if (!line.trim()) {
      return;
    }
    let msg: JsonRpcResponse & { method?: string; params?: any };
    try {
      msg = JSON.parse(line);
    } catch {
      return;
    }

    if (msg.id !== undefined) {
      const pending = this.pending.get(Number(msg.id));
      if (!pending) {
        return;
      }
      this.pending.delete(Number(msg.id));
      if (msg.error) {
        const detail =
          typeof msg.error === "object" && msg.error && "message" in msg.error
            ? String((msg.error as { message?: string }).message)
            : JSON.stringify(msg.error);
        pending.reject(new Error(detail));
      } else {
        pending.resolve(msg.result);
      }
      return;
    }

    this.handleNotification(msg);
  }

  private handleNotification(msg: { method?: string; params?: any }) {
    if (msg.method === "item/completed") {
      const item = msg.params?.item;
      if (item?.type === "agentMessage" && item.text) {
        this.emit({ kind: "message", text: item.text });
      }
      if (item?.type === "commandExecution") {
        this.emit({
          kind: "tool_result",
          toolName: "commandExecution",
          result: {
            command: item.command,
            status: item.status,
            exitCode: item.exitCode,
            output: item.aggregatedOutput,
            durationMs: item.durationMs,
          },
        });
      }
      if (item?.type === "mcpToolCall" || item?.type === "dynamicToolCall") {
        this.emit({
          kind: "tool_result",
          toolName: item.tool ?? item.type,
          result: item.result ?? item.contentItems ?? item.error ?? item,
        });
      }
    }

    if (msg.method === "item/started") {
      const item = msg.params?.item;
      if (item?.type === "commandExecution") {
        this.emit({
          kind: "tool_call",
          toolName: "commandExecution",
          args: { command: item.command, cwd: item.cwd },
          requiresApproval: true,
        });
      }
      if (item?.type === "mcpToolCall" || item?.type === "dynamicToolCall") {
        this.emit({
          kind: "tool_call",
          toolName: item.tool ?? item.type,
          args: item.arguments ?? item,
          requiresApproval: true,
        });
      }
    }
  }

  private emit(event: NormalizedProviderEvent) {
    for (const cb of this.callbacks) {
      cb(event);
    }
  }

  private rejectAll(error: Error) {
    for (const pending of this.pending.values()) {
      pending.reject(error);
    }
    this.pending.clear();
  }
}
