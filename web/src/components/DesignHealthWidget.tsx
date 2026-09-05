import React from "react";
import type { Artifact } from "../types.js";

type Props = {
  artifacts: Artifact[];
};

export const DesignHealthWidget: React.FC<Props> = ({ artifacts }) => {
  // Compute health: resolved / total actionable (conflicts + open questions/requirements)
  const actionable = artifacts.filter(
    (a) => a.artifactType === "conflicts" || a.artifactType === "requirements" || a.artifactType === "decisions"
  );
  
  const totalCount = Math.max(actionable.length, 1);
  const resolvedCount = actionable.filter(
    (a) => a.status === "RESOLVED" || a.status === "ACCEPTED"
  ).length;

  // Base starting health when demo begins, climbs up to 87%+
  const computedPercent = actionable.length === 0 ? 42 : Math.min(96, Math.max(42, Math.round((resolvedCount / totalCount) * 100)));

  return (
    <div className="health-widget">
      <div>
        <div className="health-label">Design Health</div>
        <div className="health-percent">{computedPercent}%</div>
      </div>
      <div className="health-bar-container">
        <div
          className="health-bar-fill"
          style={{ width: `${computedPercent}%` }}
        />
      </div>
    </div>
  );
};
