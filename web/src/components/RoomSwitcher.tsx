import React from "react";
import type { SessionRoom, Artifact, RoomType } from "../types.js";

type Props = {
  chatRooms: SessionRoom[];
  artifacts: Artifact[];
  activeRoomId: string;
  activeArtifactType?: RoomType;
  onSelectChatRoom: (roomId: string) => void;
  onSelectArtifactType: (type: RoomType) => void;
  onCreateRoom: (title: string) => void;
};

const ARTIFACT_ROOMS: { type: RoomType; label: string; icon: string }[] = [
  { type: "requirements", label: "Requirements", icon: "📋" },
  { type: "design", label: "Design", icon: "📐" },
  { type: "decisions", label: "Decisions", icon: "✓" },
  { type: "conflicts", label: "Conflicts", icon: "⚠️" },
  { type: "test_scenarios", label: "Test Scenarios", icon: "🧪" },
];

export const RoomSwitcher: React.FC<Props> = ({
  chatRooms,
  artifacts,
  activeRoomId,
  activeArtifactType,
  onSelectChatRoom,
  onSelectArtifactType,
  onCreateRoom,
}) => {
  const [newTitle, setNewTitle] = React.useState("");

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    onCreateRoom(newTitle.trim());
    setNewTitle("");
  };

  const getArtifactCount = (type: RoomType) => {
    return artifacts.filter((a) => a.artifactType === type).length;
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <span>Workspace Rooms</span>
      </div>

      <div className="sidebar-menu">
        <div className="menu-category">Chat Rooms (Live)</div>
        {chatRooms.map((room) => {
          const isActive = activeRoomId === room.id && !activeArtifactType;
          return (
            <div
              key={room.id}
              className={`room-item ${isActive ? "active" : ""}`}
              onClick={() => onSelectChatRoom(room.id)}
            >
              <div className="room-item-label">
                <span>💬</span>
                <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "140px" }}>
                  {room.title}
                </span>
              </div>
              <span className="room-count-badge">LIVE</span>
            </div>
          );
        })}

        <div className="menu-category" style={{ marginTop: "16px" }}>
          Artifact Rooms (Ledgers)
        </div>
        {ARTIFACT_ROOMS.map((room) => {
          const isActive = activeArtifactType === room.type;
          const count = getArtifactCount(room.type);
          return (
            <div
              key={room.type}
              className={`room-item ${isActive ? "active" : ""}`}
              onClick={() => onSelectArtifactType(room.type)}
            >
              <div className="room-item-label">
                <span>{room.icon}</span>
                <span>{room.label}</span>
              </div>
              <span className="room-count-badge">{count}</span>
            </div>
          );
        })}
      </div>

      <form onSubmit={handleCreate} style={{ padding: "12px", borderTop: "1px solid var(--border-color)" }}>
        <input
          type="text"
          placeholder="+ New Chat Room"
          className="composer-input"
          style={{ width: "100%", fontSize: "12px", padding: "8px 10px" }}
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
        />
      </form>
    </aside>
  );
};
