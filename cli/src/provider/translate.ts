import type { StdbConnection } from "../stdb.js";
import { appendAgentEvent, proposeToolCall, recordArtifact } from "../stdb.js";
import type { SessionEvent } from "../types.js";
import type { NormalizedProviderEvent } from "./ProviderAdapter.js";

const ARTIFACT_TYPES = new Set([
  "requirements",
  "design",
  "decisions",
  "conflicts",
  "test_scenarios",
]);

// Matches ```mpg-artifact ... ``` blocks the facilitator emits to record
// finalized artifacts into their room.
const ARTIFACT_BLOCK_RE = /```mpg-artifact\s*([\s\S]*?)```/g;

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

    // Extract any mpg-artifact blocks: record each to its room, and remove
    // the block from the chat body so the transcript stays clean.
    const { cleaned, artifacts } = this.extractArtifacts(event.text);
    for (const artifact of artifacts) {
      await this.recordArtifact(artifact);
    }

    const bodyText = cleaned.trim();
    if (bodyText.length === 0) {
      // The message was only an artifact directive; nothing to post to chat.
      return;
    }

    // De-duplicate: some providers emit the final text twice (e.g. as an
    // assistant content block and again as a result). Skip an identical
    // consecutive final message.
    if (bodyText === this.lastFinalText) {
      return;
    }
    this.lastFinalText = bodyText;

    const payload = { body: bodyText };

    await appendAgentEvent(
      this.conn,
      this.sessionId,
      this.nextSeq++,
      this.authorName,
      "message",
      JSON.stringify(payload)
    );
  }

  private extractArtifacts(text: string): {
    cleaned: string;
    artifacts: Array<{
      artifactType: string;
      title: string;
      description: string;
      status: string;
      stakeholders: Array<{ name: string; role: string }>;
    }>;
  } {
    const artifacts: Array<{
      artifactType: string;
      title: string;
      description: string;
      status: string;
      stakeholders: Array<{ name: string; role: string }>;
    }> = [];

    const cleaned = text.replace(ARTIFACT_BLOCK_RE, (_match, json: string) => {
      try {
        const parsed = JSON.parse(json.trim());
        if (
          parsed &&
          typeof parsed.artifactType === "string" &&
          ARTIFACT_TYPES.has(parsed.artifactType) &&
          typeof parsed.title === "string"
        ) {
          artifacts.push({
            artifactType: parsed.artifactType,
            title: String(parsed.title),
            description: String(parsed.description ?? ""),
            status: String(parsed.status ?? "OPEN"),
            stakeholders: Array.isArray(parsed.stakeholders)
              ? parsed.stakeholders
              : [],
          });
        }
      } catch {
        // Malformed block: drop it silently rather than posting raw JSON.
      }
      return "";
    });

    return { cleaned, artifacts };
  }

  private async recordArtifact(artifact: {
    artifactType: string;
    title: string;
    description: string;
    status: string;
    stakeholders: Array<{ name: string; role: string }>;
  }) {
    await recordArtifact(this.conn, {
      artifactType: artifact.artifactType,
      title: artifact.title,
      description: artifact.description,
      status: artifact.status,
      stakeholdersJson: JSON.stringify(artifact.stakeholders),
      // The host supplies traceability: the current chat room + transcript
      // position, so the artifact links back to "this chat".
      sourceChatRoomId: this.sessionId,
      sourceSeq: this.nextSeq,
      createdBy: this.authorName,
    });
  }
}
