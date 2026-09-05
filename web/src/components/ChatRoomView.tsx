import React, { useEffect, useRef, useState } from "react";
import type { SessionEvent, SessionPresence } from "../types.js";

type Props = {
  sessionId: string;
  asName: string;
  events: SessionEvent[];
  presences: SessionPresence[];
  highlightSeq?: bigint | null;
  onSendMessage: (text: string) => void;
};

function parseBody(payload: string) {
  try {
    const parsed = JSON.parse(payload);
    return parsed.body ?? payload;
  } catch {
    return payload;
  }
}

function getSemanticBadge(event: SessionEvent) {
  if (event.authorType === "agent") {
    return <span className="badge-semantic badge-agent">🤖 AI Observation</span>;
  }
  const body = parseBody(event.payload).toLowerCase();
  if (body.includes("decision") || body.includes("agree")) {
    return <span className="badge-semantic badge-decision">✓ Decision</span>;
  }
  if (body.includes("conflict") || body.includes("issue") || body.includes("blocker")) {
    return <span className="badge-semantic badge-conflict">⚠ Conflict</span>;
  }
  if (body.includes("?") || body.includes("how") || body.includes("what")) {
    return <span className="badge-semantic badge-question">? Question</span>;
  }
  return <span className="badge-semantic badge-discussion">💬 Discussion</span>;
}

export const ChatRoomView: React.FC<Props> = ({
  events,
  presences,
  highlightSeq,
  onSendMessage,
}) => {
  const [text, setText] = useState("");
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const eventRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const sortedEvents = [...events].sort((a, b) => (a.seq < b.seq ? -1 : 1));

  useEffect(() => {
    if (highlightSeq !== null && highlightSeq !== undefined) {
      const el = eventRefs.current.get(String(highlightSeq));
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      }
    }
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [sortedEvents.length, highlightSeq]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    onSendMessage(text.trim());
    setText("");
  };

  return (
    <div className="chat-container">
      <div className="presence-bar">
        <span className="presence-title">Active Presence:</span>
        <div className="participant-list">
          {presences.length === 0 && <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>Connecting presence...</span>}
          {presences.map((p) => (
            <span key={p.clientId} style={{ fontSize: "12px", color: p.color || "var(--accent-blue)" }}>
              ● {p.authorName} ({p.role})
            </span>
          ))}
        </div>
      </div>

      <div className="transcript-area">
        {sortedEvents.length === 0 && (
          <div style={{ padding: "20px", color: "var(--text-muted)", fontSize: "14px" }}>
            No messages in this chat room yet. Type a message below to start collaborating!
          </div>
        )}

        {sortedEvents.map((evt) => {
          const isHighlighted = highlightSeq === evt.seq;
          const body = parseBody(evt.payload);
          return (
            <div
              key={`${evt.sessionId}:${String(evt.seq)}`}
              ref={(el) => {
                if (el) eventRefs.current.set(String(evt.seq), el);
              }}
              className={`message-card ${isHighlighted ? "highlighted" : ""}`}
              id={`seq-${String(evt.seq)}`}
            >
              <div className="message-header">
                <div className="author-info">
                  <span style={{ color: evt.authorType === "agent" ? "var(--accent-green)" : "var(--text-primary)" }}>
                    {evt.authorName}
                  </span>
                  {getSemanticBadge(evt)}
                </div>
                <span className="seq-tag">seq #{String(evt.seq)}</span>
              </div>
              <div className="message-body">{body}</div>
            </div>
          );
        })}
        <div ref={transcriptEndRef} />
      </div>

      <form onSubmit={handleSubmit} className="composer-area">
        <input
          type="text"
          placeholder="Type a message, question, decision, or proposal..."
          className="composer-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <button type="submit" className="btn-primary">
          Send
        </button>
      </form>
    </div>
  );
};
