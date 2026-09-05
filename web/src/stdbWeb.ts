import { DbConnection } from "../../cli/src/module_bindings/index.js";
import type { SessionEvent, SessionPresence, ToolInvocation, Artifact, SessionRoom } from "./types.js";

export type StdbConnection = any;

export const DEFAULT_HOST = "wss://maincloud.spacetimedb.com";
export const DEFAULT_DATABASE = "mpa";

export function connectWeb(): Promise<StdbConnection> {
  const host = (import.meta as any).env?.VITE_MPA_SPACETIME_HOST ?? DEFAULT_HOST;
  const database = (import.meta as any).env?.VITE_MPA_SPACETIME_DB ?? DEFAULT_DATABASE;

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
          console.error(`SpacetimeDB web disconnected: ${error.message}`);
        }
      })
      .build();
  });
}

export function createSessionWeb(conn: StdbConnection, title: string, roomType = "chat") {
  return new Promise<string>((resolve, reject) => {
    let settled = false;
    const seen = new Set<string>();

    try {
      for (const row of conn.db.session.iter()) {
        seen.add(row.id);
      }
    } catch {
      // session table subscription pending
    }

    const finish = (id: string) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(id);
    };

    const fail = (error: Error) => {
      if (settled) return;
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
      fail(new Error("Timed out creating session"));
    }, 10000);

    conn.db.session.onInsert(onInsert);
    const subscription = conn
      .subscriptionBuilder()
      .onApplied(async () => {
        try {
          await conn.reducers.createSession({ title, roomType });
        } catch (error) {
          fail(error instanceof Error ? error : new Error(String(error)));
        }
      })
      .onError((_ctx: unknown, error: Error) => fail(error))
      .subscribe("SELECT * FROM Session");
  });
}

export function sendMessageWeb(
  conn: StdbConnection,
  sessionId: string,
  authorName: string,
  body: string
) {
  return conn.reducers.sendMessage({ sessionId, authorName, body });
}

export function recordArtifactWeb(
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

export function resolveArtifactWeb(
  conn: StdbConnection,
  artifactId: string,
  status: string
) {
  return conn.reducers.resolveArtifact({ artifactId, status });
}

export function joinPresenceWeb(
  conn: StdbConnection,
  sessionId: string,
  clientId: string,
  authorName: string,
  role: string,
  color: string
) {
  return conn.reducers.joinPresence({ sessionId, clientId, authorName, role, color });
}

export function heartbeatPresenceWeb(conn: StdbConnection, clientId: string) {
  return conn.reducers.heartbeatPresence({ clientId });
}

export function leavePresenceWeb(conn: StdbConnection, clientId: string) {
  return conn.reducers.leavePresence({ clientId });
}

export function subscribeAllRooms(
  conn: StdbConnection,
  onRooms: (rooms: SessionRoom[]) => void
) {
  const update = () => {
    try {
      const rows = [...conn.db.session.iter()];
      onRooms(rows as SessionRoom[]);
    } catch {
      onRooms([]);
    }
  };

  conn.db.session.onInsert?.(update);
  conn.db.session.onUpdate?.(update);
  conn.db.session.onDelete?.(update);

  return conn
    .subscriptionBuilder()
    .onApplied(() => update())
    .subscribe("SELECT * FROM Session");
}

export function subscribeAllArtifacts(
  conn: StdbConnection,
  onArtifacts: (artifacts: Artifact[]) => void
) {
  const update = () => {
    try {
      const rows = [...conn.db.artifact.iter()];
      onArtifacts(rows as Artifact[]);
    } catch {
      onArtifacts([]);
    }
  };

  conn.db.artifact.onInsert?.(update);
  conn.db.artifact.onUpdate?.(update);
  conn.db.artifact.onDelete?.(update);

  return conn
    .subscriptionBuilder()
    .onApplied(() => update())
    .subscribe("SELECT * FROM Artifact");
}

export function subscribeChatRoom(
  conn: StdbConnection,
  sessionId: string,
  callbacks: {
    onEvent?: (event: SessionEvent) => void;
    onEvents: (events: SessionEvent[]) => void;
    onPresences: (presences: SessionPresence[]) => void;
    onTools: (tools: ToolInvocation[]) => void;
  }
) {
  const handleEventInsert = (_ctx: unknown, row: SessionEvent) => {
    if (row.sessionId === sessionId) {
      callbacks.onEvent?.(row);
      updateEvents();
    }
  };

  const updateEvents = () => {
    try {
      const rows = [...conn.db.event.iter()].filter((r) => r.sessionId === sessionId);
      callbacks.onEvents(rows as SessionEvent[]);
    } catch {}
  };

  const updatePresences = () => {
    try {
      const rows = [...conn.db.sessionPresence.iter()].filter((r) => r.sessionId === sessionId);
      callbacks.onPresences(rows as SessionPresence[]);
    } catch {}
  };

  const updateTools = () => {
    try {
      const rows = [...conn.db.toolInvocation.iter()].filter((r) => r.sessionId === sessionId);
      callbacks.onTools(rows as ToolInvocation[]);
    } catch {}
  };

  conn.db.event.onInsert?.(handleEventInsert);
  conn.db.sessionPresence.onInsert?.(updatePresences);
  conn.db.sessionPresence.onUpdate?.(updatePresences);
  conn.db.sessionPresence.onDelete?.(updatePresences);
  conn.db.toolInvocation.onInsert?.(updateTools);
  conn.db.toolInvocation.onUpdate?.(updateTools);

  function sqlString(val: string) {
    return `'${val.replaceAll("'", "''")}'`;
  }

  const sub = conn
    .subscriptionBuilder()
    .onApplied(() => {
      updateEvents();
      updatePresences();
      updateTools();
    })
    .subscribe([
      `SELECT * FROM Event WHERE session_id = ${sqlString(sessionId)}`,
      `SELECT * FROM SessionPresence WHERE session_id = ${sqlString(sessionId)}`,
      `SELECT * FROM ToolInvocation WHERE session_id = ${sqlString(sessionId)}`,
    ]);

  return {
    unsubscribe() {
      conn.db.event.removeOnInsert?.(handleEventInsert);
      sub?.unsubscribe?.();
    },
  };
}
