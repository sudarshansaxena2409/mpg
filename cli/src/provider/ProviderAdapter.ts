export interface ProviderAdapter {
  start(sessionId: string, cwd: string): Promise<void>;
  sendUserTurn(text: string): Promise<void>;
  onEvent(cb: (e: NormalizedProviderEvent) => void): void;
  stop(): Promise<void>;
}

export type NormalizedProviderEvent =
  | { kind: "message"; text: string; streaming?: boolean }
  | {
      kind: "tool_call";
      toolName: string;
      args: unknown;
      requiresApproval: boolean;
    }
  | { kind: "tool_result"; toolName: string; result: unknown };

export type ProviderName = "codex" | "claude" | "cursor";
