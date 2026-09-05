import React, { useState } from "react";
import type { Artifact, RoomType, Stakeholder, SessionRoom } from "../types.js";

type Props = {
  artifactType: RoomType;
  artifacts: Artifact[];
  rooms: SessionRoom[];
  onViewInChat: (sourceChatRoomId: string, sourceSeq: bigint) => void;
  onResolveArtifact: (artifactId: string, newStatus: string) => void;
};

function parseStakeholders(json: string): Stakeholder[] {
  try {
    return JSON.parse(json);
  } catch {
    return [];
  }
}

// Description may carry an optional longer detail after a unit-separator.
function splitDescription(desc: string): { summary: string; detail?: string } {
  const idx = desc.indexOf("\u241f");
  if (idx === -1) return { summary: desc };
  return { summary: desc.slice(0, idx), detail: desc.slice(idx + 1) };
}

const ArtifactDescription: React.FC<{ description: string }> = ({ description }) => {
  const [open, setOpen] = useState(false);
  const { summary, detail } = splitDescription(description);
  return (
    <>
      <p className="artifact-desc" style={{ marginTop: "8px" }}>
        {summary}
        {detail && open ? (
          <span style={{ display: "block", marginTop: "6px", color: "var(--text-secondary)" }}>
            {detail}
          </span>
        ) : null}
      </p>
      {detail && (
        <button className="view-more-btn" onClick={() => setOpen((v) => !v)}>
          {open ? "▲ view less" : "▾ view more"}
        </button>
      )}
    </>
  );
};

export const ArtifactRoomView: React.FC<Props> = ({
  artifactType,
  artifacts,
  rooms,
  onViewInChat,
  onResolveArtifact,
}) => {
  const filtered = artifacts.filter((a) => a.artifactType === artifactType);

  // Map source chat room id -> project (room) title for grouping.
  const roomTitleById = new Map(rooms.map((r) => [r.id, r.title]));
  const projectName = (a: Artifact) =>
    roomTitleById.get(a.sourceChatRoomId) ?? "Unknown project";

  // Group filtered artifacts by their source project, preserving order.
  const groups = new Map<string, Artifact[]>();
  for (const a of filtered) {
    const key = projectName(a);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(a);
  }

  const getStatusClass = (status: string) => {
    switch (status.toUpperCase()) {
      case "RESOLVED":
      case "ACCEPTED":
        return "status-resolved";
      case "OPEN":
      case "DISCUSSING":
        return "status-open";
      case "CONFLICT":
      case "BLOCKER":
        return "status-conflict";
      default:
        return "status-open";
    }
  };

  return (
    <div className="artifact-container">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
        <div>
          <h3 style={{ fontSize: "18px", fontWeight: 600, textTransform: "capitalize" }}>
            {artifactType.replace("_", " ")} Ledger
          </h3>
          <p style={{ fontSize: "13px", color: "var(--text-secondary)", marginTop: "4px" }}>
            Durable product state generated from live collaboration moments. Each entry links back to its source moment in chat.
          </p>
        </div>
      </div>

      {filtered.length === 0 && (
        <div style={{ padding: "40px", textAlign: "center", color: "var(--text-muted)", background: "var(--bg-surface)", borderRadius: "8px", border: "1px solid var(--border-color)" }}>
          No entries recorded for <strong>{artifactType}</strong> yet.
          <br />
          As the team and AI facilitator finalize {artifactType.replace("_", " ")} in chat, entries appear here automatically — each with its stakeholders and a link back to the source discussion.
        </div>
      )}

      <div className="artifact-groups">
        {[...groups.entries()].map(([project, items]) => (
          <ArtifactGroup
            key={project}
            project={project}
            items={items}
            getStatusClass={getStatusClass}
            onViewInChat={onViewInChat}
            onResolveArtifact={onResolveArtifact}
          />
        ))}
      </div>
    </div>
  );
};

const ArtifactGroup: React.FC<{
  project: string;
  items: Artifact[];
  getStatusClass: (s: string) => string;
  onViewInChat: (sourceChatRoomId: string, sourceSeq: bigint) => void;
  onResolveArtifact: (artifactId: string, newStatus: string) => void;
}> = ({ project, items, getStatusClass, onViewInChat, onResolveArtifact }) => {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <section className="artifact-group">
      <button
        type="button"
        className="artifact-group-header"
        onClick={() => setCollapsed((v) => !v)}
        aria-expanded={!collapsed}
      >
        <span className={`artifact-group-caret ${collapsed ? "collapsed" : ""}`}>▾</span>
        <span className="artifact-group-icon">💬</span>
        <span className="artifact-group-title">{project}</span>
        <span className="artifact-group-count">{items.length}</span>
      </button>
      {!collapsed && (
        <div className="artifact-grid">
          {items.map((item) => {
          const stakeholders = parseStakeholders(item.stakeholdersJson);
          const isResolved = item.status === "RESOLVED" || item.status === "ACCEPTED";
          return (
            <div key={item.id} className="artifact-card">
              <div>
                <div className="artifact-card-header">
                  <h4 className="artifact-title">{item.title}</h4>
                  <span className={`status-pill ${getStatusClass(item.status)}`}>
                    {item.status}
                  </span>
                </div>
                <ArtifactDescription description={item.description} />
              </div>

              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "6px", margin: "10px 0" }}>
                  <span style={{ fontSize: "11px", color: "var(--text-muted)", fontWeight: 600 }}>Stakeholders:</span>
                  {stakeholders.map((s) => (
                    <span
                      key={s.name}
                      style={{
                        fontSize: "11px",
                        background: "var(--bg-elevated)",
                        padding: "2px 6px",
                        borderRadius: "4px",
                        color: "var(--text-secondary)",
                      }}
                    >
                      {s.name} ({s.role})
                    </span>
                  ))}
                </div>

                <div className="artifact-meta">
                  <button
                    className="btn-deep-link"
                    onClick={() => onViewInChat(item.sourceChatRoomId, item.sourceSeq)}
                  >
                    ↧ view in chat (seq #{String(item.sourceSeq)})
                  </button>

                  <button
                    style={{
                      background: "transparent",
                      border: "1px solid var(--border-color)",
                      color: isResolved ? "var(--accent-amber)" : "var(--accent-green)",
                      padding: "4px 8px",
                      borderRadius: "4px",
                      fontSize: "11px",
                      cursor: "pointer",
                    }}
                    onClick={() => onResolveArtifact(item.id, isResolved ? "OPEN" : "RESOLVED")}
                  >
                    {isResolved ? "Mark Open" : "Mark Resolved ✓"}
                  </button>
                </div>
              </div>
            </div>
          );
          })}
        </div>
      )}
    </section>
  );
};
