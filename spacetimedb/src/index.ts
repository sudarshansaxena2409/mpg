// @ts-nocheck
import { schema, table, t } from "spacetimedb/server";

const session = table(
  { name: "Session", public: true },
  {
    id: t.string().primaryKey(),
    title: t.string(),
    roomType: t.string(),
    status: t.string(),
    createdAt: t.timestamp(),
  }
);

const event = table(
  {
    name: "Event",
    public: true,
    indexes: [
      {
        accessor: "by_session_seq",
        algorithm: "btree",
        columns: ["sessionId", "seq"],
      },
    ],
  },
  {
    sessionId: t.string(),
    seq: t.u64(),
    authorType: t.string(),
    authorName: t.string(),
    eventType: t.string(),
    payload: t.string(),
    createdAt: t.timestamp(),
  }
);

const toolInvocation = table(
  { name: "ToolInvocation", public: true },
  {
    id: t.string().primaryKey(),
    sessionId: t.string().index("btree"),
    toolName: t.string(),
    argsJson: t.string(),
    resultJson: t.option(t.string()),
    status: t.string(),
    requiresApproval: t.bool(),
  }
);

const sessionPresence = table(
  { name: "SessionPresence", public: true },
  {
    clientId: t.string().primaryKey(),
    sessionId: t.string().index("btree"),
    authorName: t.string(),
    role: t.string(),
    color: t.string(),
    connectedAt: t.timestamp(),
    lastSeen: t.timestamp(),
  }
);

const artifact = table(
  { name: "Artifact", public: true },
  {
    id: t.string().primaryKey(),
    artifactType: t.string().index("btree"),
    title: t.string(),
    description: t.string(),
    status: t.string(),
    stakeholdersJson: t.string(),
    sourceChatRoomId: t.string(),
    sourceSeq: t.u64(),
    createdBy: t.string(),
    createdAt: t.timestamp(),
  }
);

const spacetimedb = schema({ session, event, toolInvocation, sessionPresence, artifact });
export default spacetimedb;

function makeId(prefix: string, _ctx: { timestamp: unknown }, count: number | bigint) {
  return prefix + "_" + String(count);
}

function nextSeq(ctx: any, sessionId: string): bigint {
  let max = 0n;
  for (const row of ctx.db.event.iter()) {
    if (row.sessionId === sessionId && row.seq > max) {
      max = row.seq;
    }
  }
  return max + 1n;
}

function assertSession(ctx: any, sessionId: string) {
  if (!ctx.db.session.id.find(sessionId)) {
    throw new Error(`Unknown session: ${sessionId}`);
  }
}

function assertStatus(status: string) {
  if (status !== "running" && status !== "paused" && status !== "completed") {
    throw new Error(`Invalid session status: ${status}`);
  }
}

function assertEventType(eventType: string) {
  if (
    eventType !== "message" &&
    eventType !== "tool_call" &&
    eventType !== "tool_result" &&
    eventType !== "approval"
  ) {
    throw new Error(`Invalid event type: ${eventType}`);
  }
}

export const createSession = spacetimedb.reducer(
  { title: t.string(), roomType: t.option(t.string()) },
  (ctx, { title, roomType }) => {
    const id = makeId("session", ctx, ctx.db.session.count());
    ctx.db.session.insert({
      id,
      title,
      roomType: roomType ?? "chat",
      status: "running",
      createdAt: ctx.timestamp,
    });
  }
);

export const recordArtifact = spacetimedb.reducer(
  {
    artifactType: t.string(),
    title: t.string(),
    description: t.string(),
    status: t.string(),
    stakeholdersJson: t.string(),
    sourceChatRoomId: t.string(),
    sourceSeq: t.u64(),
    createdBy: t.string(),
  },
  (
    ctx,
    {
      artifactType,
      title,
      description,
      status,
      stakeholdersJson,
      sourceChatRoomId,
      sourceSeq,
      createdBy,
    }
  ) => {
    const id = makeId("artifact", ctx, ctx.db.artifact.count());
    ctx.db.artifact.insert({
      id,
      artifactType,
      title,
      description,
      status,
      stakeholdersJson,
      sourceChatRoomId,
      sourceSeq,
      createdBy,
      createdAt: ctx.timestamp,
    });
  }
);

export const resolveArtifact = spacetimedb.reducer(
  { artifactId: t.string(), status: t.string() },
  (ctx, { artifactId, status }) => {
    const row = ctx.db.artifact.id.find(artifactId);
    if (!row) {
      throw new Error(`Unknown artifact: ${artifactId}`);
    }
    ctx.db.artifact.id.update({ ...row, status });
  }
);

export const sendMessage = spacetimedb.reducer(
  { sessionId: t.string(), authorName: t.string(), body: t.string() },
  (ctx, { sessionId, authorName, body }) => {
    assertSession(ctx, sessionId);
    ctx.db.event.insert({
      sessionId,
      seq: nextSeq(ctx, sessionId),
      authorType: "human",
      authorName,
      eventType: "message",
      payload: JSON.stringify({ body }),
      createdAt: ctx.timestamp,
    });
  }
);

export const appendAgentEvent = spacetimedb.reducer(
  {
    sessionId: t.string(),
    seq: t.u64(),
    authorName: t.string(),
    eventType: t.string(),
    payloadJson: t.string(),
  },
  (ctx, { sessionId, seq, authorName, eventType, payloadJson }) => {
    assertSession(ctx, sessionId);
    assertEventType(eventType);

    for (const row of ctx.db.event.iter()) {
      if (row.sessionId === sessionId && row.seq === seq) {
        return;
      }
    }

    ctx.db.event.insert({
      sessionId,
      seq,
      authorType: "agent",
      authorName,
      eventType,
      payload: payloadJson,
      createdAt: ctx.timestamp,
    });
  }
);

export const proposeToolCall = spacetimedb.reducer(
  {
    sessionId: t.string(),
    toolName: t.string(),
    argsJson: t.string(),
    requiresApproval: t.bool(),
  },
  (ctx, { sessionId, toolName, argsJson, requiresApproval }) => {
    assertSession(ctx, sessionId);
    const id = makeId("tool", ctx, ctx.db.toolInvocation.count());
    ctx.db.toolInvocation.insert({
      id,
      sessionId,
      toolName,
      argsJson,
      resultJson: undefined,
      status: "proposed",
      requiresApproval,
    });
  }
);

export const approveToolCall = spacetimedb.reducer(
  { invocationId: t.string() },
  (ctx, { invocationId }) => {
    const tool = ctx.db.toolInvocation.id.find(invocationId);
    if (!tool) {
      throw new Error(`Unknown tool invocation: ${invocationId}`);
    }
    ctx.db.toolInvocation.id.update({ ...tool, status: "approved" });
    ctx.db.event.insert({
      sessionId: tool.sessionId,
      seq: nextSeq(ctx, tool.sessionId),
      authorType: "human",
      authorName: "system",
      eventType: "approval",
      payload: JSON.stringify({ invocationId, decision: "approved" }),
      createdAt: ctx.timestamp,
    });
  }
);

export const rejectToolCall = spacetimedb.reducer(
  { invocationId: t.string() },
  (ctx, { invocationId }) => {
    const tool = ctx.db.toolInvocation.id.find(invocationId);
    if (!tool) {
      throw new Error(`Unknown tool invocation: ${invocationId}`);
    }
    ctx.db.toolInvocation.id.update({ ...tool, status: "rejected" });
    ctx.db.event.insert({
      sessionId: tool.sessionId,
      seq: nextSeq(ctx, tool.sessionId),
      authorType: "human",
      authorName: "system",
      eventType: "approval",
      payload: JSON.stringify({ invocationId, decision: "rejected" }),
      createdAt: ctx.timestamp,
    });
  }
);

export const updateSessionStatus = spacetimedb.reducer(
  { sessionId: t.string(), status: t.string() },
  (ctx, { sessionId, status }) => {
    assertStatus(status);
    const row = ctx.db.session.id.find(sessionId);
    if (!row) {
      throw new Error(`Unknown session: ${sessionId}`);
    }
    ctx.db.session.id.update({ ...row, status });
  }
);

export const joinPresence = spacetimedb.reducer(
  {
    sessionId: t.string(),
    clientId: t.string(),
    authorName: t.string(),
    role: t.string(),
    color: t.string(),
  },
  (ctx, { sessionId, clientId, authorName, role, color }) => {
    // Do not panic on a stale/unknown session id (e.g. after a DB wipe): a
    // presence join for a room that no longer exists is a harmless no-op.
    if (!ctx.db.session.id.find(sessionId)) {
      return;
    }
    const existing = ctx.db.sessionPresence.clientId.find(clientId);
    const row = {
      clientId,
      sessionId,
      authorName,
      role,
      color,
      connectedAt: existing?.connectedAt ?? ctx.timestamp,
      lastSeen: ctx.timestamp,
    };
    if (existing) {
      ctx.db.sessionPresence.clientId.update(row);
    } else {
      ctx.db.sessionPresence.insert(row);
    }
  }
);

export const heartbeatPresence = spacetimedb.reducer(
  { clientId: t.string() },
  (ctx, { clientId }) => {
    const row = ctx.db.sessionPresence.clientId.find(clientId);
    if (row) {
      ctx.db.sessionPresence.clientId.update({ ...row, lastSeen: ctx.timestamp });
    }
  }
);

export const leavePresence = spacetimedb.reducer(
  { clientId: t.string() },
  (ctx, { clientId }) => {
    ctx.db.sessionPresence.clientId.delete(clientId);
  }
);
