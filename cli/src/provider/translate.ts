import type { StdbConnection } from "../stdb.js";
import { appendAgentEvent, proposeToolCall } from "../stdb.js";
import type { SessionEvent } from "../types.js";
import type { NormalizedProviderEvent } from "./ProviderAdapter.js";

export class ProviderEventTranslator {
  private nextSeq: number;
  private lastFinalText?: string;

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

    // Suppress intermediate agent noise so the transcript shows only the
    // final result of a turn:
    //  - streaming message fragments (text deltas) are not persisted; the
    //    final assistant message arrives as a non-streaming message event.
    //  - tool_result events are execution detail, not conversation.
    if (event.kind === "tool_result") {
      return;
    }
    if (event.kind === "message" && event.streaming) {
      return;
    }

    // Skip empty final messages.
    if (event.kind === "message" && event.text.trim().length === 0) {
      return;
    }

    // De-duplicate: some providers emit the final text twice (e.g. as an
    // assistant content block and again as a result). Skip an identical
    // consecutive final message.
    if (event.text === this.lastFinalText) {
      return;
    }
    this.lastFinalText = event.text;

    const payload = { body: event.text };

    await appendAgentEvent(
      this.conn,
      this.sessionId,
      this.nextSeq++,
      this.authorName,
      "message",
      JSON.stringify(payload)
    );
  }
}
