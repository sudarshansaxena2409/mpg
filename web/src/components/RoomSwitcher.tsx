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
  const [creating, setCreating] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const openCreate = () => {
    setCreating(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    onCreateRoom(newTitle.trim());
    setNewTitle("");
    setCreating(false);
  };

  const getArtifactCount = (type: RoomType) => {
    return artifacts.filter((a) => a.artifactType === type).length;
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-header sidebar-header-row">
        <span>Workspace Rooms</span>
        <button
          type="button"
          className="new-project-icon-btn"
          onClick={openCreate}
          title="Start a new project (creates a live chat room)"
        >
          + New Project
        </button>
      </div>

      <div className="sidebar-menu">
        {creating && (
          <form onSubmit={handleCreate} className="new-project-inline">
            <input
              ref={inputRef}
              type="text"
              placeholder="Project name, e.g. Reviews and Ratings"
              className="composer-input new-project-input"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setCreating(false);
                  setNewTitle("");
                }
              }}
            />
            <div className="new-project-actions">
              <button type="submit" className="btn-primary" disabled={!newTitle.trim()}>
                Create
              </button>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => {
                  setCreating(false);
                  setNewTitle("");
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        )}

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
    </aside>
  );
};
