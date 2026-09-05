import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";
import type {
  NormalizedProviderEvent,
  ProviderAdapter,
} from "./ProviderAdapter.js";
import { AIDLC_FACILITATOR_SYSTEM_PROMPT } from "./persona.js";

export class ClaudeAdapter implements ProviderAdapter {
  private child?: ChildProcessWithoutNullStreams;
  private sessionId?: string;
  private callbacks = new Set<(e: NormalizedProviderEvent) => void>();

  onEvent(cb: (e: NormalizedProviderEvent) => void) {
    this.callbacks.add(cb);
  }

  async start(sessionId: string, cwd: string) {
    this.sessionId = sessionId;
    this.child = spawn(
      "claude",
      [
        "-p",
        "",
        "--system-prompt",
        AIDLC_FACILITATOR_SYSTEM_PROMPT,
        // The facilitator MAY read design and author artifact documents
        // (BRD/HLD/decisions), but must never run code or shell commands.
        "--disallowed-tools",
        "Bash",
        "--input-format",
        "stream-json",
        "--output-format",
        "stream-json",
        "--include-partial-messages",
        "--verbose",
      ],
      { cwd, stdio: ["pipe", "pipe", "pipe"] }
    );

    const rl = createInterface({ input: this.child.stdout });
    rl.on("line", (line) => this.handleLine(line));
    this.child.stderr.on("data", (chunk) => {
      const text = String(chunk).trim();
      if (text) {
        this.emit({ kind: "tool_result", toolName: "claude.stderr", result: text });
      }
    });
  }

  async sendUserTurn(text: string) {
    if (!this.child || !this.sessionId) {
      throw new Error("Claude adapter has not started");
    }
    this.child.stdin.write(
      `${JSON.stringify({
        type: "user",
        message: { role: "user", content: text },
        parent_tool_use_id: null,
        session_id: this.sessionId,
      })}\n`
    );
  }

  async stop() {
    this.child?.kill("SIGTERM");
  }

  private handleLine(line: string) {
    if (!line.trim()) {
      return;
    }
    let msg: any;
    try {
      msg = JSON.parse(line);
    } catch {
      return;
    }

    if (msg.type === "assistant" && Array.isArray(msg.message?.content)) {
      for (const part of msg.message.content) {
        if (part.type === "text" && part.text) {
          this.emit({ kind: "message", text: part.text });
        }
        if (part.type === "tool_use") {
          this.emit({
            kind: "tool_call",
            toolName: part.name,
            args: part.input,
            requiresApproval: true,
          });
        }
      }
    }

    if (msg.type === "user" && Array.isArray(msg.message?.content)) {
      for (const part of msg.message.content) {
        if (part.type === "tool_result") {
          this.emit({
            kind: "tool_result",
            toolName: "tool_result",
            result: part,
          });
        }
      }
    }

    if (
      msg.type === "stream_event" &&
      msg.event?.delta?.type === "text_delta" &&
      msg.event.delta.text
    ) {
      this.emit({ kind: "message", text: msg.event.delta.text, streaming: true });
    }

    if (msg.type === "result" && msg.result) {
      this.emit({ kind: "message", text: msg.result });
    }
  }

  private emit(event: NormalizedProviderEvent) {
    for (const cb of this.callbacks) {
      cb(event);
    }
  }
}
