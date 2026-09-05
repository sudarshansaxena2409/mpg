import { WebSocket } from "undici";
import { setGlobalLogLevel } from "spacetimedb";
import { DbConnection } from "./module_bindings/index.js";
import type { SessionEvent, SessionPresence, ToolInvocation } from "./types.js";

setGlobalLogLevel("warn");

if (!globalThis.WebSocket) {
  Object.assign(globalThis, { WebSocket });
}

export type StdbConnection = any;

export const DEFAULT_HOST = "wss://maincloud.spacetimedb.com";
export const DEFAULT_DATABASE = "mpa";


export function connect(): Promise<StdbConnection> {
  const host = process.env.MPA_SPACETIME_HOST ?? DEFAULT_HOST;
  const database = process.env.MPA_SPACETIME_DB ?? DEFAULT_DATABASE;

  return new Promise((resolve, reject) => {
    DbConnection.builder()
      .withUri(host)
      .withDatabaseName(database)
      .onConnect((conn: StdbConnection) => {
        resolve(conn);
      })
      .onConnectError((_ctx: unknown, error: Error) => {
        reject(error);
      })
      .onDisconnect((_ctx: unknown, error: Error | null | undefined) => {
        if (error) {
          console.error(`SpacetimeDB disconnected: ${error.message}`);
        }
      })
      .build();
  });
}

export async function createSession(conn: StdbConnection, title: string) {
  return new Promise<string>((resolve, reject) => {
    let settled = false;
    const seen = new Set<string>();

    try {
      for (const row of conn.db.session.iter()) {
        seen.add(row.id);
      }
    } catch {
      // The session cache may not exist until the subscription is applied.
    }

    const finish = (id: string) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      resolve(id);
    };

    const fail = (error: Error) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      reject(error);
    };

    const onInsert = (_ctx: unknown, row: { id: string; title: string }) => {
      if (!seen.has(row.id) && row.title === title) {
        finish(row.id);
      }
    };

    const cleanup = () => {
      clearTimeout(timeout);
      conn.db.session.removeOnInsert?.(onInsert);
      subscription?.unsubscribe?.();
    };

    const timeout = setTimeout(() => {
      fail(new Error("Timed out waiting for created session row"));
    }, 10000);

    conn.db.session.onInsert(onInsert);
    const subscription = conn
      .subscriptionBuilder()
      .onApplied(async () => {
        try {
          await conn.reducers.createSession({ title });
        } catch (error) {
          fail(error instanceof Error ? error : new Error(String(error)));
        }
      })
      .onError((_ctx: unknown, error: Error) => fail(error))
      .subscribe("SELECT * FROM Session");
  });
}

export function sendMessage(
  conn: StdbConnection,
  sessionId: string,
  authorName: string,
  body: string
) {
  return conn.reducers.sendMessage({ sessionId, authorName, body });
}

export function appendAgentEvent(
  conn: StdbConnection,
  sessionId: string,
  seq: number,
  authorName: string,
  eventType: string,
  payloadJson: string
) {
  return conn.reducers.appendAgentEvent({
    sessionId,
    seq: BigInt(seq),
    authorName,
    eventType,
    payloadJson,
  });
}

export function proposeToolCall(
  conn: StdbConnection,
  sessionId: string,
  toolName: string,
  argsJson: string,
  requiresApproval: boolean
) {
  return conn.reducers.proposeToolCall({
    sessionId,
    toolName,
    argsJson,
    requiresApproval,
  });
}

export function approveToolCall(conn: StdbConnection, invocationId: string) {
  return conn.reducers.approveToolCall({ invocationId });
}

export function rejectToolCall(conn: StdbConnection, invocationId: string) {
  return conn.reducers.rejectToolCall({ invocationId });
}

export function recordArtifact(
  conn: StdbConnection,
  params: {
    artifactType: string;
    title: string;
    description: string;
    status: string;
    stakeholdersJson: string;
    sourceChatRoomId: string;
    sourceSeq: number | bigint;
    createdBy: string;
  }
) {
  return conn.reducers.recordArtifact({
    artifactType: params.artifactType,
    title: params.title,
    description: params.description,
    status: params.status,
    stakeholdersJson: params.stakeholdersJson,
    sourceChatRoomId: params.sourceChatRoomId,
    sourceSeq: BigInt(params.sourceSeq),
    createdBy: params.createdBy,
  });
}

export function resolveArtifact(conn: StdbConnection, artifactId: string, status: string) {
  return conn.reducers.resolveArtifact({ artifactId, status });
}

export function updateSessionStatus(
  conn: StdbConnection,
  sessionId: string,
  status: "running" | "paused" | "completed"
) {
  return conn.reducers.updateSessionStatus({ sessionId, status });
}

export function joinPresence(
  conn: StdbConnection,
  sessionId: string,
  clientId: string,
  authorName: string,
  role: string,
  color: string
) {
  return conn.reducers.joinPresence({ sessionId, clientId, authorName, role, color });
}

export function heartbeatPresence(conn: StdbConnection, clientId: string) {
  return conn.reducers.heartbeatPresence({ clientId });
}

export function leavePresence(conn: StdbConnection, clientId: string) {
  return conn.reducers.leavePresence({ clientId });
}

function sqlString(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

export type SubscriptionCallbacks = {
  onEvent(row: SessionEvent, initial: boolean): void;
  onTool(row: ToolInvocation, initial: boolean): void;
  onPresence?(row: SessionPresence, initial: boolean): void;
  onPresenceDelete?(row: SessionPresence): void;
  onReady?(snapshot: {
    events: SessionEvent[];
    tools: ToolInvocation[];
    presences: SessionPresence[];
  }): void;
};

export function subscribeSession(
  conn: StdbConnection,
  sessionId: string,
  callbacks: SubscriptionCallbacks
) {
  let ready = false;

  conn.db.event.onInsert((_ctx: unknown, row: SessionEvent) => {
    callbacks.onEvent(row, !ready);
  });
  conn.db.toolInvocation.onInsert((_ctx: unknown, row: ToolInvocation) => {
    callbacks.onTool(row, !ready);
  });
  conn.db.toolInvocation.onUpdate(
    (_ctx: unknown, _oldRow: ToolInvocation, row: ToolInvocation) => {
      callbacks.onTool(row, !ready);
    }
  );
  conn.db.sessionPresence.onInsert?.((_ctx: unknown, row: SessionPresence) => {
    callbacks.onPresence?.(row, !ready);
  });
  conn.db.sessionPresence.onUpdate?.(
    (_ctx: unknown, _oldRow: SessionPresence, row: SessionPresence) => {
      callbacks.onPresence?.(row, !ready);
    }
  );
  conn.db.sessionPresence.onDelete?.((_ctx: unknown, row: SessionPresence) => {
    callbacks.onPresenceDelete?.(row);
  });

  return conn
    .subscriptionBuilder()
    .onApplied((ctx: StdbConnection) => {
      ready = true;
      callbacks.onReady?.({
        events: [...ctx.db.event.iter()],
        tools: [...ctx.db.toolInvocation.iter()],
        presences: [...ctx.db.sessionPresence.iter()],
      });
    })
    .subscribe([
      `SELECT * FROM Event WHERE session_id = ${sqlString(sessionId)}`,
      `SELECT * FROM ToolInvocation WHERE session_id = ${sqlString(sessionId)}`,
      `SELECT * FROM SessionPresence WHERE session_id = ${sqlString(sessionId)}`,
    ]);
}
