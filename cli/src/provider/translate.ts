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
  private lastRawText?: string;
  private lastBodyText?: string;
  private recordedArtifactKeys = new Set<string>();

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

    // De-duplicate FIRST: some providers emit the same final text twice (e.g.
    // as an assistant content block and again as a result). Dropping the
    // duplicate here — before artifact extraction — prevents recording the
    // same artifact into its room twice. Keyed on the raw text so identical
    // turns (including their mpg-artifact blocks) are skipped wholesale.
    if (event.text === this.lastRawText) {
      return;
    }
    this.lastRawText = event.text;

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

    // Guard chat against near-duplicate final bodies (e.g. whitespace diffs).
    if (bodyText === this.lastBodyText) {
      return;
    }
    this.lastBodyText = bodyText;

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
            // Fold an optional longer "detail" into the description using a
            // delimiter the UI splits on for "view more". Keeps the short
            // summary first so the ledger stays scannable.
            description:
              typeof parsed.detail === "string" && parsed.detail.trim()
                ? `${String(parsed.description ?? "")}\u241f${parsed.detail.trim()}`
                : String(parsed.description ?? ""),
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
    // Guard against recording the same artifact twice (e.g. if a provider
    // re-emits a turn). Keyed on type + title.
    const key = `${artifact.artifactType}::${artifact.title.trim().toLowerCase()}`;
    if (this.recordedArtifactKeys.has(key)) {
      return;
    }

    // Robust guard: also skip if an artifact with the same type+title already
    // exists in the subscribed cache. This survives host restarts and catches
    // the case where more than one agent process is attached to the session.
    try {
      for (const row of this.conn.db.artifact.iter()) {
        const existingKey = `${row.artifactType}::${String(row.title).trim().toLowerCase()}`;
        if (existingKey === key) {
          this.recordedArtifactKeys.add(key);
          return;
        }
      }
    } catch {
      // Cache may not be ready; fall back to in-memory guard only.
    }

    this.recordedArtifactKeys.add(key);

    const stakeholders = this.resolveStakeholders(artifact.stakeholders);

    await recordArtifact(this.conn, {
      artifactType: artifact.artifactType,
      title: artifact.title,
      description: artifact.description,
      status: artifact.status,
      stakeholdersJson: JSON.stringify(stakeholders),
      // The host supplies traceability: the current chat room + transcript
      // position, so the artifact links back to "this chat".
      sourceChatRoomId: this.sessionId,
      sourceSeq: this.nextSeq,
      createdBy: this.authorName,
    });
  }

  // The agent often knows only the role of a participant, so it emits
  // { name: "PM", role: "PM" }. Repair these using the live presence roster so
  // stakeholders show real names, e.g. "Falak (PM)".
  private resolveStakeholders(
    stakeholders: Array<{ name: string; role: string }>
  ): Array<{ name: string; role: string }> {
    // Build role -> real name from current presence in this room.
    const roleToName = new Map<string, string>();
    try {
      for (const p of this.conn.db.sessionPresence.iter()) {
        if (p.sessionId !== this.sessionId) continue;
        const role = String(p.role ?? "").trim();
        const name = String(p.authorName ?? "").trim();
        // Skip agent runners; prefer human display names.
        if (!role || !name || role.startsWith("runner")) continue;
        if (!roleToName.has(role.toLowerCase())) {
          roleToName.set(role.toLowerCase(), name);
        }
      }
    } catch {
      // presence cache unavailable — return as-is.
      return stakeholders;
    }

    return stakeholders.map((s) => {
      const role = String(s.role ?? "").trim();
      const name = String(s.name ?? "").trim();
      // If the name is missing or is just the role (e.g. "PM" == role "PM"),
      // substitute the real participant name for that role when we know it.
      const looksLikeRole =
        !name || name.toLowerCase() === role.toLowerCase();
      if (looksLikeRole) {
        const real = roleToName.get(role.toLowerCase());
        if (real) return { name: real, role };
      }
      return { name: name || role, role };
    });
  }
}
