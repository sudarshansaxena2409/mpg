import React, { useEffect, useMemo, useRef, useState } from "react";
import { render } from "ink";
import {
  approveToolCall,
  heartbeatPresence,
  joinPresence,
  leavePresence,
  rejectToolCall,
  sendMessage,
  subscribeSession,
  updateSessionStatus,
  type StdbConnection,
} from "./stdb.js";
import { Transcript } from "./ui/Transcript.js";
import type { ProviderAdapter } from "./provider/ProviderAdapter.js";
import { ProviderEventTranslator } from "./provider/translate.js";
import type { SessionEvent, SessionPresence, ToolInvocation } from "./types.js";

type SessionAppProps = {
  conn: StdbConnection;
  sessionId: string;
  asName: string;
  adapter?: ProviderAdapter;
  providerName?: string;
  mode?: "new" | "join" | "run";
  presenceClientId?: string;
  onExit?: () => void | Promise<void>;
};

const userColors = ["yellow", "cyan", "magenta", "blue", "green", "red"];

function hashString(value: string) {
  let hash = 0;
  for (const char of value) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return hash;
}

function colorForName(name: string) {
  return userColors[hashString(name) % userColors.length];
}

function makePresenceClientId(asName: string) {
  const safeName = asName.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-|-$/g, "") || "client";
  const nonce = Math.random().toString(36).slice(2, 10);
  return `${safeName}-${process.pid}-${Date.now().toString(36)}-${nonce}`;
}

function upsertTool(tools: ToolInvocation[], tool: ToolInvocation) {
  const next = tools.filter((row) => row.id !== tool.id);
  next.push(tool);
  return next;
}

function upsertPresence(presences: SessionPresence[], presence: SessionPresence) {
  const next = presences.filter((row) => row.clientId !== presence.clientId);
  next.push(presence);
  return next;
}

function readMessageBody(event: SessionEvent) {
  try {
    return JSON.parse(event.payload).body;
  } catch {
    return undefined;
  }
}

function SessionApp(props: SessionAppProps) {
  const [events, setEvents] = useState<SessionEvent[]>([]);
  const [tools, setTools] = useState<ToolInvocation[]>([]);
  const [presences, setPresences] = useState<SessionPresence[]>([]);
  const [isReady, setIsReady] = useState(false);
  const readyRef = useRef(false);
  const adapterRef = useRef(props.adapter);
  const translatorRef = useRef<ProviderEventTranslator | null>(null);
  const pendingLocalBodies = useRef<string[]>([]);

  const mode = props.mode ?? (props.adapter ? "run" : "join");
  const authorName = props.providerName ?? props.asName;
  const role = props.adapter ? `runner:${props.providerName ?? "codex"}` : "collaborator";
  const presenceClientId = props.presenceClientId ?? makePresenceClientId(props.asName);

  useEffect(() => {
    void joinPresence(
      props.conn,
      props.sessionId,
      presenceClientId,
      props.asName,
      role,
      colorForName(props.asName)
    );

    const heartbeat = setInterval(() => {
      void heartbeatPresence(props.conn, presenceClientId);
    }, 4000);

    return () => clearInterval(heartbeat);
  }, [presenceClientId, props.asName, props.conn, props.sessionId, role]);

  useEffect(() => {
    const sub = subscribeSession(props.conn, props.sessionId, {
      onEvent: (event, initial) => {
        setEvents((prev) => {
          if (prev.some((row) => row.sessionId === event.sessionId && row.seq === event.seq)) {
            return prev;
          }
          return [...prev, event];
        });

        translatorRef.current?.observe(event);

        if (
          adapterRef.current &&
          readyRef.current &&
          !initial &&
          event.authorType === "human" &&
          event.eventType === "message"
        ) {
          const body = readMessageBody(event);
          const pendingIndex = pendingLocalBodies.current.findIndex(
            (value) => value === body && event.authorName === props.asName
          );
          if (pendingIndex >= 0) {
            pendingLocalBodies.current.splice(pendingIndex, 1);
            return;
          }
          if (typeof body === "string") {
            void adapterRef.current.sendUserTurn(body);
          }
        }
      },
      onTool: (tool) => setTools((prev) => upsertTool(prev, tool)),
      onPresence: (presence) => {
        setPresences((prev) => upsertPresence(prev, { ...presence, seenAtMs: Date.now() }));
      },
      onPresenceDelete: (presence) => {
        setPresences((prev) => prev.filter((row) => row.clientId !== presence.clientId));
      },
      onReady: ({ events: snapshotEvents, tools: snapshotTools, presences: snapshotPresences }) => {
        readyRef.current = true;
        setIsReady(true);
        setEvents(snapshotEvents);
        setTools(snapshotTools);
        setPresences(snapshotPresences.map((presence) => ({ ...presence, seenAtMs: Date.now() })));

        if (adapterRef.current) {
          translatorRef.current = new ProviderEventTranslator(
            props.conn,
            props.sessionId,
            authorName,
            snapshotEvents
          );
          adapterRef.current.onEvent((event) => {
            void translatorRef.current?.consume(event);
          });
        }
      },
    });
    return () => sub?.unsubscribe?.();
  }, [authorName, props.asName, props.conn, props.sessionId]);

  const handlers = useMemo(
    () => ({
      async submit(text: string) {
        pendingLocalBodies.current.push(text);
        await sendMessage(props.conn, props.sessionId, props.asName, text);
        await adapterRef.current?.sendUserTurn(text);
      },
      approve(id: string) {
        return approveToolCall(props.conn, id);
      },
      reject(id: string) {
        return rejectToolCall(props.conn, id);
      },
    }),
    [props.asName, props.conn, props.sessionId]
  );

  return (
    <Transcript
      sessionId={props.sessionId}
      asName={props.asName}
      mode={mode}
      events={events}
      tools={tools}
      presences={presences}
      isReady={isReady}
      isRunner={Boolean(props.adapter)}
      providerName={props.providerName}
      onSubmit={handlers.submit}
      onApprove={handlers.approve}
      onReject={handlers.reject}
      onExit={() => void props.onExit?.()}
    />
  );
}

export async function runInkSession(props: SessionAppProps) {
  let shutdown: () => Promise<void>;
  const presenceClientId = makePresenceClientId(props.asName);
  const instance = render(
    <SessionApp {...props} presenceClientId={presenceClientId} onExit={() => void shutdown()} />
  );

  shutdown = async () => {
    await leavePresence(props.conn, presenceClientId).catch(() => undefined);
    instance.unmount();
    if (props.adapter) {
      await updateSessionStatus(props.conn, props.sessionId, "completed");
      await props.adapter.stop();
    }
    process.exit(0);
  };

  process.once("SIGINT", () => void shutdown());
  process.once("SIGTERM", () => void shutdown());
  await instance.waitUntilExit();
}
