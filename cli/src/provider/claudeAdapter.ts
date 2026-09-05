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
  private warmingUp = false;
  private warmupResolve?: () => void;
  private warmupTimeout?: ReturnType<typeof setTimeout>;

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

    // Warm up: Claude Code has a multi-second cold start that only begins when
    // the first turn is written. Trigger it now (during session setup) with a
    // silent no-op turn and wait for its result, so the user's first real
    // message gets a fast response instead of paying the boot cost. No onEvent
    // listeners are attached yet, so this warm-up output is not recorded.
    await this.warmup();
  }

  private warmup(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.child) {
        resolve();
        return;
      }
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        this.warmingUp = false;
        resolve();
      };
      // Resolve on the first result event (turn complete) or a safety timeout.
      this.warmupResolve = done;
      this.warmingUp = true;
      const timeout = setTimeout(done, 30000);
      this.warmupTimeout = timeout;

      this.child.stdin.write(
        `${JSON.stringify({
          type: "user",
          message: {
            role: "user",
            content:
              "Reply with exactly: READY. Do not say anything else. This is a system warm-up.",
          },
          parent_tool_use_id: null,
        })}\n`
      );
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

    // While warming up, swallow all output and resolve on turn completion.
    if (this.warmingUp) {
      if (msg.type === "result") {
        if (this.warmupTimeout) clearTimeout(this.warmupTimeout);
        this.warmupResolve?.();
      }
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
