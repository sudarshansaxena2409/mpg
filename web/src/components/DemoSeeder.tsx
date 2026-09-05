import React from "react";
import { sendMessageWeb, recordArtifactWeb, resolveArtifactWeb } from "../stdbWeb.js";

type Props = {
  conn: any;
  activeChatRoomId: string;
};

export const DemoSeeder: React.FC<Props> = ({ conn, activeChatRoomId }) => {
  const [isSeeding, setIsSeeding] = React.useState(false);

  const runGoldenDemo = async () => {
    if (!conn || !activeChatRoomId) return;
    setIsSeeding(true);

    try {
      // 1. PM requirement message
      await sendMessageWeb(conn, activeChatRoomId, "Neha (PM)", "Requirement: Customers must be able to cancel orders directly in the app during the PREPARING state.");

      // 2. SDM proposal
      await sendMessageWeb(conn, activeChatRoomId, "Shub (SDM)", "Proposal: PREPARING is an explicit order state. We add a 2-minute cancellation window.");

      // 3. AI Observation & Conflict recording
      await sendMessageWeb(conn, activeChatRoomId, "AI Assistant", "🤖 Observation: Identified potential race condition if kitchen accepts order at the exact same millisecond user hits cancel.");

      await recordArtifactWeb(conn, {
        artifactType: "conflicts",
        title: "Race Condition: Order Cancel vs Kitchen Prepare",
        description: "Simultaneous order cancellation and kitchen acceptance can result in split-brain order state.",
        status: "OPEN",
        stakeholdersJson: JSON.stringify([{ name: "Neha", role: "PM" }, { name: "Shub", role: "SDM" }, { name: "Alice", role: "Dev" }]),
        sourceChatRoomId: activeChatRoomId,
        sourceSeq: 3,
        createdBy: "AI Assistant",
      });

      // 4. Decision recording
      await sendMessageWeb(conn, activeChatRoomId, "Alice (Dev)", "✓ Decision: We will use an optimistic database lock on Order state with a push notification to kitchen POS.");

      await recordArtifactWeb(conn, {
        artifactType: "decisions",
        title: "Optimistic Lock & Kitchen Notification for Cancellation",
        description: "Enforce state machine lock on order cancellation with real-time kitchen push socket.",
        status: "ACCEPTED",
        stakeholdersJson: JSON.stringify([{ name: "Alice", role: "Dev" }, { name: "Shub", role: "SDM" }]),
        sourceChatRoomId: activeChatRoomId,
        sourceSeq: 4,
        createdBy: "Alice",
      });

    } catch (err) {
      console.error("Demo seeding error:", err);
    } finally {
      setIsSeeding(false);
    }
  };

  return (
    <div className="demo-seeder-bar">
      <span style={{ fontSize: "12px", color: "var(--text-secondary)", fontWeight: 500 }}>
        ✨ Golden Demo Tools:
      </span>
      <button
        className="btn-seed"
        disabled={isSeeding}
        onClick={runGoldenDemo}
      >
        {isSeeding ? "Seeding..." : "⚡ Seed Demo Conversation & Artifacts"}
      </button>
    </div>
  );
};
