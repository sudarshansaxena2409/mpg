# MPG — UI/UX Requirements & Backend Mapping

Status: Phase 2 (Web UI) design — living document
Audience: developers collaborating on the MPG web client and SpacetimeDB module
Related: `README.md`, `spacetimedb/src/index.ts`, `cli/src/stdb.ts`

---

## 1. Product in one line

MPG is a **realtime multiplayer product-design workspace**. PM, SDM, Developer, QA and an AI
participant collaborate live; the collaboration produces durable **artifacts** (requirements,
design, decisions, conflicts, test scenarios). The conversation is *how* state is created;
the artifacts *are* the product state.

Phase 1 (done): Ink terminal CLI (`mpa new|join|run`).
Phase 2 (this doc): Web UI layered on the **same** SpacetimeDB backend, so terminal and browser
clients synchronize live.

---

## 2. Core architecture decisions (locked)

1. **Rooms are fully independent, top-level entities.** There is no "workspace"/"feature"
   parent. A feature like "Order Cancellation" is *content discussed inside rooms*, never a room.
2. **Two kinds of rooms:**
   - **Chat rooms** — live collaboration (messages, presence, back-and-forth).
   - **Artifact rooms** — one **per artifact type**: Requirements, Design, Decisions,
     Conflicts, Test Scenarios. These are **ledgers of entries**, not conversations.
3. **Artifacts are written by the (scripted) AI** in the POC. Manual "promote from chat" is a
   later enhancement.
4. **Every artifact entry links back to its source chat moment** via
   `sourceChatRoomId + sourceSeq`, and records the **stakeholders** involved. This is the
   traceability spine ("view in chat").

```
Chat room (people collaborate)
      │  a decision / conflict / requirement crystallizes
      ▼
Artifact room entry written:
      title, description, status, stakeholders[], sourceChatRoomId, sourceSeq
      │
      └── "view in chat" → opens the source chat room at that seq
```

---

## 3. Screen inventory

| Screen                | Purpose                                                                 |
| --------------------- | ----------------------------------------------------------------------- |
| Room Switcher         | List all rooms (chat + artifact) as peers; enter a room.                |
| Chat Room View        | Live collaboration: presence bar, transcript, composer.                 |
| Artifact Room View    | Ledger of entries for one artifact type; each links back to chat.       |
| (Shell) Design Health | Persistent widget summarizing readiness from artifact counts/status.    |

### 3.1 App shell
A fixed shell persists across screens so the app always "feels like one live place":
- Header: MPG identity, current room name + type, `● LIVE` connection state, participant avatars + count.
- Design Health widget (see §7).
- Content area swaps between Room Switcher / Chat Room / Artifact Room.

---

## 4. Chat Room View — requirements

- **Presence bar**: avatar/initials + colored dot per participant; role label (PM/SDM/Dev/QA/AI);
  online/away state; lightweight activity ("Neha is typing…"). Presence must be visible without
  explanation.
- **Transcript**: ordered messages by `seq`. Each message shows author name, role color, timestamp,
  and a **semantic type**:
  - 💬 Discussion · 🤖 AI Observation · ? Open Question · ⚠ Conflict · ✓ Decision
- **Deep-link target**: each message is addressable by `seq` so artifact entries can scroll/highlight it.
- **Composer**: send a message to the room (`sendMessage` reducer).
- **Realtime**: new messages/presence appear with no refresh (subscription-driven).

## 5. Artifact Room View — requirements

An artifact room is a **ledger**, not a chat. It renders a list of entries for its type
(e.g. Decisions). Each row shows:
- Title (e.g. "PREPARING is an explicit order state")
- Status pill (semantic color — see §8)
- **Stakeholder avatars** (who was involved)
- **"↧ view in chat"** → opens `sourceChatRoomId` at `sourceSeq`
- Timestamp / createdBy

Behavior:
- Entries are created by `recordArtifact` (scripted AI in POC).
- Status changes via `resolveArtifact` (e.g. OPEN → RESOLVED for a conflict).
- Counts per type feed the left-nav and Design Health.

## 6. Room Switcher — requirements

- Lists chat rooms and artifact rooms as independent peers (not nested).
- Shows per-room summary: type icon, name, live participant count (chat), entry count (artifact).
- Selecting a room loads the appropriate view inside the shell.

## 7. Design Health widget

- A single readiness percentage plus per-type breakdown (Requirements ✓, Decisions ✓,
  Open Questions ⚠, Conflicts 🔴, Test Scenarios ✓).
- POC formula (kept intentionally simple), computed client-side from artifact state:
  `health = resolved_and_accepted / total_actionable` across conflicts + open questions.
- Must visibly **climb** as conflicts/questions are resolved (demo payoff: 42% → 87%).

## 8. Visual language

- Mostly neutral surface; semantic color only to communicate state.
- Blue = normal/selected · Green = resolved/validated · Amber = needs attention · Red = conflict/blocker.
- Avoid decorative color. A judge should understand the screen in seconds.

---

## 9. Backend mapping (SpacetimeDB)

The web client renders **authoritative subscribed state** — it does not keep an independent
source of truth. All writes go through reducers; all reads come from subscriptions.

### 9.1 Existing tables (reused)

| Table             | Role in Phase 2                                                        |
| ----------------- | --------------------------------------------------------------------- |
| `Session`         | A **room**. Gains a `roomType` field (see §9.3).                       |
| `Event`           | A message/observation in a **chat** room. Ordered by `seq`.           |
| `SessionPresence` | A **participant** in a room (avatars, presence, role, color).         |
| `ToolInvocation`  | Existing agent tool approvals (unchanged; terminal flow).             |

`Event` fields relevant to UI: `sessionId, seq, authorType(human|agent), authorName,
eventType(message|tool_call|tool_result|approval), payload(JSON string), createdAt`.

### 9.2 New table (Phase 2)

```
Artifact
  id                primary key
  artifactType      requirements | design | decisions | conflicts | test_scenarios
  title             string
  description       string
  status            e.g. DRAFT | OPEN | DISCUSSING | ACCEPTED | RESOLVED | DISMISSED
  stakeholdersJson  JSON array of { name, role }  — who was involved
  sourceChatRoomId  string  → the chat room (Session id) it came from
  sourceSeq         u64     → the Event.seq anchor ("view in chat")
  createdBy         string
  createdAt         timestamp
```

Artifacts are **independent of chat rooms** but reference them via `sourceChatRoomId + sourceSeq`,
which honors the "rooms are independent" decision while preserving traceability.

### 9.3 Session gains `roomType`

```
Session.roomType : chat | requirements | design | decisions | conflicts | test_scenarios
```
- `chat` rooms carry `Event` + `SessionPresence` (conversation).
- Artifact rooms are represented by `Artifact` rows grouped by `artifactType`. (For the POC,
  an artifact "room" is a *view over Artifact rows of that type*; a matching `Session` row of
  that `roomType` may exist purely for the switcher listing.)

### 9.4 Reducers

| Reducer                         | Trigger (UI)                          | Effect                                            |
| ------------------------------- | ------------------------------------- | ------------------------------------------------- |
| `createSession(title,roomType)` | Create a room                         | Insert `Session`.                                 |
| `sendMessage(sessionId,name,body)` | Composer send                      | Insert `Event(message)`.                          |
| `recordArtifact(...)`           | AI (POC) records an outcome           | Insert `Artifact` with stakeholders + source link.|
| `resolveArtifact(id,status)`    | Resolve/dismiss an entry              | Update `Artifact.status`.                         |
| `joinPresence / heartbeatPresence / leavePresence` | Enter/keep/leave a room | Maintain `SessionPresence`.                       |
| `appendAgentEvent(...)`         | Agent output (terminal flow)          | Insert agent `Event`.                             |

### 9.5 UI action → backend mapping

| UI action                          | Backend                                            |
| ---------------------------------- | -------------------------------------------------- |
| Open room switcher                 | Subscribe `Session` (all rooms).                   |
| Enter chat room                    | Subscribe `Event`+`SessionPresence` WHERE session. |
| Send message                       | `sendMessage`.                                     |
| Enter artifact room (type)         | Subscribe `Artifact` WHERE `artifactType = type`.  |
| AI records decision/conflict       | `recordArtifact`.                                  |
| Resolve a conflict/question        | `resolveArtifact`.                                 |
| Click "view in chat" on an entry   | Navigate to `sourceChatRoomId`, scroll to `sourceSeq`. |
| Presence dots / avatars            | `SessionPresence` rows for the room.               |
| Design Health %                    | Derived client-side from `Artifact` counts/status. |

### 9.6 Subscription strategy

- Room switcher subscribes to `Session`.
- The **active** chat room subscribes to its `Event` + `SessionPresence`.
- An artifact room subscribes to `Artifact` filtered by `artifactType`.
- "View in chat" may require subscribing to a *different* chat room's `Event` on navigation.
- Keep all connection/reducer/subscription logic centralized (mirror `cli/src/stdb.ts`); do not
  spread connection logic across React components.

---

## 10. Non-goals (do not build for the POC)

SSO, RBAC, Jira/GitHub/CI-CD integration, full PM tooling, elaborate dashboards, complex AI
orchestration, multiple AI agents, token accounting, artifact versioning, analytics.
AI is a **participant**, not the hero. Multiplayer collaboration is the hero.

## 11. Golden demo (design the UI around this)

Order Cancellation: PM adds requirement → SDM proposes `PREPARING` state → Dev raises constraint
→ AI writes a Conflict (design gap) → QA raises edge case (simultaneous cancel + prepare) →
team records a Decision (stakeholders + link to chat) → Design Health climbs 42% → 87%.
Show two clients (browser + terminal, or two browsers) syncing live with no refresh.

## 12. Open items / to confirm

- Publish target for the demo db: **local SpacetimeDB server** vs **maincloud `mpa_demo`**.
- Whether artifact rooms get a real `Session` row (for the switcher) or are pure views over
  `Artifact` rows.
- Web styling choice (plain CSS vs Tailwind) — default plain CSS to avoid build friction.
