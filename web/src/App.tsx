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

const DEFAULT_USER = "Sudarshan";
const DEFAULT_ROLE = "Dev";

export const App: React.FC = () => {
  const [conn, setConn] = useState<any>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [rooms, setRooms] = useState<SessionRoom[]>([]);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  
  const [activeRoomId, setActiveRoomId] = useState<string>("");
  const [activeArtifactType, setActiveArtifactType] = useState<RoomType | undefined>(undefined);
  const [highlightSeq, setHighlightSeq] = useState<bigint | null>(null);

  const [userName, setUserName] = useState<string>(() => localStorage.getItem("mpg_username") || DEFAULT_USER);

  const [events, setEvents] = useState<SessionEvent[]>([]);
  const [presences, setPresences] = useState<SessionPresence[]>([]);
  const [tools, setTools] = useState<ToolInvocation[]>([]);

  const clientIdRef = useRef(`web-${Math.random().toString(36).slice(2, 8)}`);

  const handleSetUserName = (name: string) => {
    setUserName(name);
    localStorage.setItem("mpg_username", name);
  };

  // 1. Initial Connection
  useEffect(() => {
    connectWeb()
      .then((connection) => {
        setConn(connection);
        setIsConnected(true);

        subscribeAllRooms(connection, async (allRooms) => {
          setRooms(allRooms);
          if (allRooms.length > 0) {
            setActiveRoomId((prev) => prev || allRooms[0].id);
          } else {
            try {
              const defaultId = await createSessionWeb(connection, "General Workspace", "chat");
              setActiveRoomId(defaultId);
            } catch {}
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
      userName,
      DEFAULT_ROLE,
      "#3b82f6"
    ).catch(() => {});

    const heartbeat = setInterval(() => {
      heartbeatPresenceWeb(conn, clientIdRef.current).catch(() => {});
    }, 4000);

    const sub = subscribeChatRoom(conn, activeRoomId, {
      onEvent: (evt) => {
        setEvents((prev) => {
          if (prev.some((r) => r.sessionId === evt.sessionId && r.seq === evt.seq)) {
            return prev;
          }
          return [...prev, evt];
        });
      },
      onEvents: (evts) => setEvents(evts),
      onPresences: (p) => setPresences(p),
      onTools: (t) => setTools(t),
    });

    return () => {
      clearInterval(heartbeat);
      sub?.unsubscribe?.();
    };
  }, [conn, activeRoomId, activeArtifactType, userName]);

  // Handlers
  const handleSelectChatRoom = (id: string) => {
    setActiveArtifactType(undefined);
    setActiveRoomId(id);
    setHighlightSeq(null);
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

  const handleSendMessage = async (text: string) => {
    if (!conn) return;
    let targetRoomId = activeRoomId;
    if (!targetRoomId) {
      targetRoomId = await createSessionWeb(conn, "General Workspace", "chat");
      setActiveRoomId(targetRoomId);
    }
    await sendMessageWeb(conn, targetRoomId, userName, text);
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
      userName={userName}
      onSetUserName={handleSetUserName}
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
            onSendMessage={handleSendMessage}
          />
        )}
      </div>

      <DemoSeeder conn={conn} activeChatRoomId={activeRoomId} />
    </AppShell>
  );
};
