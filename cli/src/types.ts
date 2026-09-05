export type SessionStatus = "running" | "paused" | "completed";
export type AuthorType = "human" | "agent";
export type EventType = "message" | "tool_call" | "tool_result" | "approval";
export type ToolStatus = "proposed" | "approved" | "rejected" | "executed";

export type SessionEvent = {
  sessionId: string;
  seq: bigint;
  authorType: AuthorType;
  authorName: string;
  eventType: EventType;
  payload: string;
  createdAt?: unknown;
};

export type ToolInvocation = {
  id: string;
  sessionId: string;
  toolName: string;
  argsJson: string;
  resultJson?: string | null;
  status: ToolStatus;
  requiresApproval: boolean;
};

export type SessionPresence = {
  clientId: string;
  sessionId: string;
  authorName: string;
  role: string;
  color: string;
  connectedAt?: unknown;
  lastSeen?: unknown;
  seenAtMs?: number;
};
