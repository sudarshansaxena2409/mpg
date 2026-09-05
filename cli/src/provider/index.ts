import { ClaudeAdapter } from "./claudeAdapter.js";
import { CodexAdapter } from "./codexAdapter.js";
import { CursorAdapter } from "./cursorAdapter.js";
import type { ProviderAdapter, ProviderName } from "./ProviderAdapter.js";

export function createProviderAdapter(name: ProviderName): ProviderAdapter {
  if (name === "codex") {
    return new CodexAdapter();
  }
  if (name === "claude") {
    return new ClaudeAdapter();
  }
  return new CursorAdapter();
}
