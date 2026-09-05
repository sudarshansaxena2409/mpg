export type RoomType =
  | "chat"
  | "requirements"
  | "design"
  | "decisions"
  | "conflicts"
  | "test_scenarios";

export type SessionRoom = {
  id: string;
  title: string;
  roomType: RoomType;
  status: string;
  createdAt: any;
};

export type SessionEvent = {
  sessionId: string;
  seq: bigint;
  authorType: "human" | "agent";
  authorName: string;
  eventType: "message" | "tool_call" | "tool_result" | "approval";
  payload: string;
  createdAt: any;
};

export type SessionPresence = {
  clientId: string;
  sessionId: string;
  authorName: string;
  role: string;
  color: string;
  connectedAt: any;
  lastSeen: any;
  seenAtMs?: number;
};

export type Stakeholder = {
  name: string;
  role: string;
};

export type Artifact = {
  id: string;
  artifactType: "requirements" | "design" | "decisions" | "conflicts" | "test_scenarios";
  title: string;
  description: string;
  status: string; // e.g. DRAFT, OPEN, DISCUSSING, ACCEPTED, RESOLVED, DISMISSED
  stakeholdersJson: string;
  sourceChatRoomId: string;
  sourceSeq: bigint;
  createdBy: string;
  createdAt: any;
};

export type ToolInvocation = {
  id: string;
  sessionId: string;
  toolName: string;
  argsJson: string;
  resultJson?: string;
  status: string;
  requiresApproval: boolean;
};
