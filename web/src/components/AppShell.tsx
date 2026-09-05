import React from "react";
import type { SessionPresence, Artifact } from "../types.js";
import { DesignHealthWidget } from "./DesignHealthWidget.js";

type Props = {
  activeRoomTitle: string;
  activeRoomType: string;
  isConnected: boolean;
  presences: SessionPresence[];
  artifacts: Artifact[];
  children: React.ReactNode;
};

export const AppShell: React.FC<Props> = ({
  activeRoomTitle,
  activeRoomType,
  isConnected,
  presences,
  artifacts,
  children,
}) => {
  return (
    <div className="app-container">
      <header className="app-header">
        <div className="app-brand">
          <div className="brand-badge">MPG</div>
          <div className="room-title-info">
            <h2 style={{ fontSize: "16px", fontWeight: 600 }}>{activeRoomTitle}</h2>
            <span className="room-type-tag">{activeRoomType}</span>
          </div>
        </div>

        <div className="header-right">
          <div className="status-live">
            <span className="status-live-dot" />
            <span>{isConnected ? "LIVE (STDB)" : "CONNECTING..."}</span>
          </div>

          <DesignHealthWidget artifacts={artifacts} />

          <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
            {presences.map((p) => (
              <div
                key={p.clientId}
                className="avatar-badge"
                title={`${p.authorName} (${p.role})`}
              >
                <div
                  className="avatar-circle"
                  style={{ backgroundColor: p.color || "#3b82f6" }}
                >
                  {p.authorName.slice(0, 2).toUpperCase()}
                </div>
                <span>{p.authorName}</span>
              </div>
            ))}
          </div>
        </div>
      </header>

      <main className="main-layout">{children}</main>
    </div>
  );
};
