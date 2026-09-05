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

  const [hasNameSet, setHasNameSet] = useState<boolean>(() => Boolean(localStorage.getItem("mpg_username")));
  const [userName, setUserName] = useState<string>(() => localStorage.getItem("mpg_username") || "");
  const [inputName, setInputName] = useState<string>("");

  const [events, setEvents] = useState<SessionEvent[]>([]);
  const [presences, setPresences] = useState<SessionPresence[]>([]);
  const [tools, setTools] = useState<ToolInvocation[]>([]);

  const clientIdRef = useRef(`web-${Math.random().toString(36).slice(2, 8)}`);

  const handleSetUserName = (name: string) => {
    setUserName(name);
    if (name.trim()) {
      localStorage.setItem("mpg_username", name.trim());
      setHasNameSet(true);
    }
  };

  const handleConfirmName = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputName.trim()) return;
    handleSetUserName(inputName.trim());
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
    if (!conn || !activeRoomId || activeArtifactType || !userName) return;

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
    const author = userName.trim() || "Collaborator";
    let targetRoomId = activeRoomId;
    if (!targetRoomId) {
      targetRoomId = await createSessionWeb(conn, "General Workspace", "chat");
      setActiveRoomId(targetRoomId);
    }
    await sendMessageWeb(conn, targetRoomId, author, text);
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
    : currentRoom?.title ?? "General Workspace";
  const roomTypeLabel = activeArtifactType ? "ARTIFACT ROOM" : "CHAT ROOM";

  return (
    <>
      {!hasNameSet && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15, 23, 42, 0.9)", backdropFilter: "blur(8px)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <form onSubmit={handleConfirmName} style={{ background: "#1e293b", border: "1px solid #334155", padding: "28px", borderRadius: "12px", width: "340px", display: "flex", flexDirection: "column", gap: "16px", boxShadow: "0 20px 40px rgba(0,0,0,0.6)" }}>
            <div>
              <div className="brand-badge" style={{ display: "inline-block", marginBottom: "8px" }}>MPG Workspace</div>
              <h3 style={{ fontSize: "18px", color: "#f8fafc", margin: "4px 0" }}>Join Live Collaboration</h3>
              <p style={{ fontSize: "13px", color: "#94a3b8", margin: 0 }}>Please enter your display name to start chatting:</p>
            </div>
            <input
              type="text"
              placeholder="e.g. Falak, Alice, Shub..."
              value={inputName}
              onChange={(e) => setInputName(e.target.value)}
              style={{ background: "#0f172a", border: "1px solid #3b82f6", color: "#fff", padding: "12px", borderRadius: "6px", fontSize: "14px", outline: "none" }}
              autoFocus
            />
            <button type="submit" className="btn-primary" style={{ height: "42px", fontSize: "14px" }}>
              Join Workspace →
            </button>
          </form>
        </div>
      )}

      <AppShell
        activeRoomTitle={roomTitle}
        activeRoomType={roomTypeLabel}
        isConnected={isConnected}
        presences={presences}
        artifacts={artifacts}
        userName={userName || "Collaborator"}
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
              asName={userName || "Collaborator"}
              events={events}
              presences={presences}
              highlightSeq={highlightSeq}
              onSendMessage={handleSendMessage}
            />
          )}
        </div>

        <DemoSeeder conn={conn} activeChatRoomId={activeRoomId} />
      </AppShell>
    </>
  );
};
