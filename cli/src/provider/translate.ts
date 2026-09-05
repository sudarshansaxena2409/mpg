import type { StdbConnection } from "../stdb.js";
import { appendAgentEvent, proposeToolCall } from "../stdb.js";
import type { SessionEvent } from "../types.js";
import type { NormalizedProviderEvent } from "./ProviderAdapter.js";

export class ProviderEventTranslator {
  private nextSeq: number;

  constructor(
    private readonly conn: StdbConnection,
    private readonly sessionId: string,
    private readonly authorName: string,
    existingEvents: SessionEvent[]
  ) {
    this.nextSeq =
      existingEvents.reduce((max, row) => Math.max(max, Number(row.seq)), 0) + 1;
  }

  observe(row: SessionEvent) {
    if (row.sessionId !== this.sessionId) {
      return;
    }
    this.nextSeq = Math.max(this.nextSeq, Number(row.seq) + 1);
  }

  async consume(event: NormalizedProviderEvent) {
    if (event.kind === "tool_call") {
      await proposeToolCall(
        this.conn,
        this.sessionId,
        event.toolName,
        JSON.stringify(event.args ?? null),
        event.requiresApproval
      );
      return;
    }

    const payload =
      event.kind === "message"
        ? { body: event.text }
        : { toolName: event.toolName, result: event.result };

    await appendAgentEvent(
      this.conn,
      this.sessionId,
      this.nextSeq++,
      this.authorName,
      event.kind,
      JSON.stringify(payload)
    );
  }
}
