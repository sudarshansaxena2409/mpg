import type {
  NormalizedProviderEvent,
  ProviderAdapter,
} from "./ProviderAdapter.js";

export class CursorAdapter implements ProviderAdapter {
  onEvent(_cb: (e: NormalizedProviderEvent) => void) {}

  async start() {
    throw new Error(
      "Cursor ACP adapter is not implemented in this hackathon pass. Codex is the priority adapter, Claude is implemented through stream-json, and Cursor needs ACP message-shape verification with an installed cursor-agent."
    );
  }

  async sendUserTurn() {}

  async stop() {}
}
