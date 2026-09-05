import React, { useEffect, useState, useRef } from "react";
import {
  connectWeb,
  subscribeAllRooms,
  subscribeAllArtifacts,
  subscribeChatRoom,
  sendMessageWeb,
  recordArtifactWeb,
  resolveArtifactWeb,
  createSessionWeb,
  joinPresenceWeb,
  heartbeatPresenceWeb,
} from "./stdbWeb.js";
import type { SessionRoom, SessionEvent, SessionPresence, ToolInvocation, Artifact, RoomType } from "./types.js";
import { AppShell } from "./components/AppShell.js";
import { RoomSwitcher } from "./components/RoomSwitcher.js";
import { ChatRoomView } from "./components/ChatRoomView.js";
import { ArtifactRoomView } from "./components/ArtifactRoomView.js";
import { DemoSeeder } from "./components/DemoSeeder.js";

// Identity is per-browser: set via URL query params, e.g.
//   ?as=Jyoti&role=PM
// Falls back to a generic guest so the app never shows someone else's name.
function readIdentity(): { user: string; role: string } {
  try {
    const p = new URLSearchParams(window.location.search);
    const user = p.get("as")?.trim();
    const role = p.get("role")?.trim();
    return {
      user: user && user.length > 0 ? user : "Guest",
      role: role && role.length > 0 ? role : "Dev",
    };
  } catch {
    return { user: "Guest", role: "Dev" };
  }
}

const IDENTITY = readIdentity();
const DEFAULT_USER = IDENTITY.user;
const DEFAULT_ROLE = IDENTITY.role;

export const App: React.FC = () => {
  const [conn, setConn] = useState<any>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [rooms, setRooms] = useState<SessionRoom[]>([]);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  
  const [activeRoomId, setActiveRoomId] = useState<string>("");
  const [activeArtifactType, setActiveArtifactType] = useState<RoomType | undefined>(undefined);
  const [highlightSeq, setHighlightSeq] = useState<bigint | null>(null);

  const [events, setEvents] = useState<SessionEvent[]>([]);
  const [presences, setPresences] = useState<SessionPresence[]>([]);
  const [tools, setTools] = useState<ToolInvocation[]>([]);
  const [agentThinking, setAgentThinking] = useState(false);
  const thinkingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Agent-message count captured when the local user sends; thinking clears
  // only once the agent count rises above this baseline (a genuinely new reply).
  const agentBaselineRef = useRef<number | null>(null);

  const clientIdRef = useRef(`web-${Math.random().toString(36).slice(2, 8)}`);

  // 1. Initial Connection
  useEffect(() => {
    connectWeb()
      .then((connection) => {
        setConn(connection);
        setIsConnected(true);

        subscribeAllRooms(connection, (allRooms) => {
          setRooms(allRooms);
          if (allRooms.length > 0 && !activeRoomId) {
            setActiveRoomId(allRooms[0].id);
          }
        });

        subscribeAllArtifacts(connection, (allArtifacts) => {
          setArtifacts(allArtifacts);
        });
      })
      .catch((err) => {
        console.error("Failed to connect SpacetimeDB web:", err);
      });
  }, []);

  // 2. Chat Room Subscription & Presence
  useEffect(() => {
    if (!conn || !activeRoomId || activeArtifactType) return;

    joinPresenceWeb(
      conn,
      activeRoomId,
      clientIdRef.current,
      DEFAULT_USER,
      DEFAULT_ROLE,
      "#3b82f6"
    ).catch(() => {});

    const heartbeat = setInterval(() => {
      heartbeatPresenceWeb(conn, clientIdRef.current).catch(() => {});
    }, 4000);

    const sub = subscribeChatRoom(conn, activeRoomId, {
      onEvents: (evts) => {
        setEvents(evts);
        // Clear the thinking indicator only when a genuinely new agent reply
        // arrives — i.e. the agent-message count exceeds the baseline captured
        // when the user sent their message. Guards against the subscription's
        // initial full-snapshot (which already contains prior agent messages)
        // clearing the indicator too early.
        if (agentBaselineRef.current !== null) {
          const agentCount = evts.filter((e) => e.authorType === "agent").length;
          if (agentCount > agentBaselineRef.current) {
            setAgentThinking(false);
            agentBaselineRef.current = null;
            if (thinkingTimeoutRef.current) clearTimeout(thinkingTimeoutRef.current);
          }
        }
      },
      onPresences: (p) => setPresences(p),
      onTools: (t) => setTools(t),
    });

    return () => {
      clearInterval(heartbeat);
      sub?.unsubscribe?.();
    };
  }, [conn, activeRoomId, activeArtifactType]);

  // Handlers
  const handleSelectChatRoom = (id: string) => {
    setActiveArtifactType(undefined);
    setActiveRoomId(id);
    setHighlightSeq(null);
    setAgentThinking(false);
    agentBaselineRef.current = null;
    if (thinkingTimeoutRef.current) clearTimeout(thinkingTimeoutRef.current);
  };

  const handleSelectArtifactType = (type: RoomType) => {
    setActiveArtifactType(type);
    setHighlightSeq(null);
  };

  const handleCreateRoom = async (title: string) => {
    if (!conn) return;
    try {
      const newId = await createSessionWeb(conn, title, "chat");
      setActiveArtifactType(undefined);
      setActiveRoomId(newId);
    } catch (err) {
      console.error("Failed to create room:", err);
    }
  };

  const handleSendMessage = (text: string) => {
    if (!conn || !activeRoomId) return;
    sendMessageWeb(conn, activeRoomId, DEFAULT_USER, text);
    // Baseline the current agent-message count; thinking clears when a new
    // agent reply pushes the count above this.
    agentBaselineRef.current = events.filter((e) => e.authorType === "agent").length;
    setAgentThinking(true);
    if (thinkingTimeoutRef.current) clearTimeout(thinkingTimeoutRef.current);
    // Safety net: never spin forever if no agent is attached to this room.
    thinkingTimeoutRef.current = setTimeout(() => {
      setAgentThinking(false);
      agentBaselineRef.current = null;
    }, 180000);
  };

  const handleViewInChat = (sourceChatRoomId: string, sourceSeq: bigint) => {
    setActiveArtifactType(undefined);
    setActiveRoomId(sourceChatRoomId);
    setHighlightSeq(sourceSeq);
  };

  const handleResolveArtifact = (artifactId: string, newStatus: string) => {
    if (!conn) return;
    resolveArtifactWeb(conn, artifactId, newStatus);
  };

  const currentRoom = rooms.find((r) => r.id === activeRoomId);
  const roomTitle = activeArtifactType
    ? `${activeArtifactType.toUpperCase()} LEDGER`
    : currentRoom?.title ?? "Order Cancellation Workspace";
  const roomTypeLabel = activeArtifactType ? "ARTIFACT ROOM" : "CHAT ROOM";

  return (
    <AppShell
      activeRoomTitle={roomTitle}
      activeRoomType={roomTypeLabel}
      isConnected={isConnected}
      presences={presences}
      artifacts={artifacts}
    >
      <RoomSwitcher
        chatRooms={rooms.filter((r) => !r.roomType || r.roomType === "chat")}
        artifacts={artifacts}
        activeRoomId={activeRoomId}
        activeArtifactType={activeArtifactType}
        onSelectChatRoom={handleSelectChatRoom}
        onSelectArtifactType={handleSelectArtifactType}
        onCreateRoom={handleCreateRoom}
      />

      <div className="content-pane">
        {activeArtifactType ? (
          <ArtifactRoomView
            artifactType={activeArtifactType}
            artifacts={artifacts}
            rooms={rooms}
            onViewInChat={handleViewInChat}
            onResolveArtifact={handleResolveArtifact}
          />
        ) : (
          <ChatRoomView
            sessionId={activeRoomId}
            asName={DEFAULT_USER}
            events={events}
            presences={presences}
            highlightSeq={highlightSeq}
            agentThinking={agentThinking}
            onSendMessage={handleSendMessage}
          />
        )}
      </div>

      <DemoSeeder conn={conn} activeChatRoomId={activeRoomId} />
    </AppShell>
  );
};
