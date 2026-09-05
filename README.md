# MPG — Multiplayer AI-DLC Workspace

MPG is a **realtime multiplayer product-design workspace**. A PM, SDM/Architect,
Developer, and QA collaborate live in a room, and an AI **facilitator** helps
turn requirements into an agreed technical direction — eliciting requirements,
driving decisions, and raising conflicts (not solutions). The collaboration
produces durable **artifacts** (requirements, design, decisions, conflicts, test
scenarios). The conversation is *how* state is created; the artifacts *are* the
product state. This is the SDLC → **AI-DLC** flow.

> The hero of the product is the **collaborative room**, not long AI text.
> The AI is a concise participant, not a chatbot.

---

## Repository layout

```
mpg/
├── spacetimedb/        SpacetimeDB module — the shared realtime state (schema + reducers)
│   └── src/index.ts    Tables: Session, Event, Artifact, SessionPresence, ToolInvocation
├── cli/                Terminal client (Ink) + the agent host
│   └── src/
│       ├── index.ts            `mpa new | join | run` commands
│       ├── sessionApp.tsx      subscriptions, presence, host→agent dispatch
│       ├── stdb.ts             connection, reducer wrappers, subscriptions
│       ├── ui/Transcript.tsx   terminal UI
│       ├── module_bindings/    generated from spacetimedb/ (do not hand-edit)
│       └── provider/           agent adapters + facilitator behavior
│           ├── persona.ts          the AI-DLC facilitator system prompt
│           ├── claudeAdapter.ts     Claude Code adapter (streaming, warm-up)
│           ├── codexAdapter.ts      Codex adapter
│           └── translate.ts         provider events → SpacetimeDB (filter, dedupe, artifacts)
├── web/                Web Product Room (React + Vite) — the demo UI
│   └── src/
│       ├── App.tsx                  shell, room switcher, presence, thinking state
│       ├── components/              ChatRoomView, ArtifactRoomView, RoomSwitcher, ...
│       ├── stdbWeb.ts               browser connection + subscriptions
│       └── module_bindings/         generated from spacetimedb/
└── docs/ui-ux-design.md   UI/UX requirements + backend mapping (read this first)
```

Both the terminal and the web client generate bindings from the **same**
`spacetimedb/` schema and connect to the **same database**, so they synchronize
live via subscriptions.

---

## Prerequisites

- **Node.js ≥ 22** (the repo is validated on Node 24). The default system Node may
  be older and will crash Vite/CLI — always select 24 first:
  ```bash
  export NVM_DIR="$HOME/.nvm"; source "$NVM_DIR/nvm.sh"; nvm use 24
  ```
- **SpacetimeDB CLI** (`spacetime`) for module development/publishing.
- **An agent CLI only if you host the live agent**: `claude` (recommended here) or
  `codex`, logged in. Joiners and the web UI need neither.

---

## The shared database

The demo database is **`mpademo`** on maincloud (`wss://maincloud.spacetimedb.com`).
Point every client at it via env vars:

- CLI: `MPA_SPACETIME_HOST`, `MPA_SPACETIME_DB`
- Web: `VITE_MPA_SPACETIME_HOST`, `VITE_MPA_SPACETIME_DB` (in `web/.env.local`)

`web/.env.local` is already set to `mpademo`. Copy `web/.env.example` if missing.

Inspect / debug the DB:
```bash
spacetime sql  -s maincloud mpademo "SELECT id, title, room_type FROM Session"
spacetime logs -s maincloud mpademo           # live reducer activity / panics
```

---

## Run the web UI (no agent needed)

```bash
export NVM_DIR="$HOME/.nvm"; source "$NVM_DIR/nvm.sh"; nvm use 24
cd web
npm install            # first time / after pull
npm run dev            # http://localhost:5173
```

Open with your identity in the URL (each browser is its own participant):
```
http://localhost:5173/?as=Priya&role=PM
http://localhost:5173/?as=Amit&role=Developer
```

You'll see the room switcher (chat rooms + the five artifact rooms), the live
chat with presence, artifact ledgers (with stakeholders and a "view in chat"
deep link), and a Design Health widget.

## Run the terminal client

```bash
export NVM_DIR="$HOME/.nvm"; source "$NVM_DIR/nvm.sh"; nvm use 24
# Host the live facilitator agent (needs claude installed + logged in):
MPA_SPACETIME_DB=mpademo npm run dev -- new "Reviews and Ratings" --as Priya --tool claude
# Attach the agent to an existing chat room instead:
MPA_SPACETIME_DB=mpademo npm run dev -- run <session-id> --as AI --tool claude
# Join a session as a human (no agent required):
MPA_SPACETIME_DB=mpademo npm run dev -- join <session-id> --as Amit
```

`--tool` accepts `codex` or `claude`.

---

## How it works (the design)

### Rooms
Rooms are independent, top-level entities (a `Session` row with a `roomType`):
- **chat** rooms — live collaboration (messages + presence).
- **artifact** rooms, one per type — `requirements`, `design`, `decisions`,
  `conflicts`, `test_scenarios`. These are **ledgers of outcomes**, not chats.

There is no "workspace" parent; a feature like "Reviews and Ratings" is *content
discussed in a chat room*, not a room itself.

### The facilitator agent
The agent runs on the **host** (`mpa new` / `mpa run`). Its behavior comes from
`cli/src/provider/persona.ts`, which reframes a coding agent into an AI-DLC
facilitator that:
- keeps chat replies to **1–2 lines** (detail goes into artifacts, not chat),
- elicits requirements, drives **decisions**, and raises **conflicts with 2–4
  directions** (never picks a solution),
- may author artifact documents but must not write implementation code
  (`Bash` is disallowed).

### Artifacts (agent → SpacetimeDB → UI)
When something is finalized, the agent emits a fenced block:
````
```mpg-artifact
{ "artifactType": "decisions", "title": "...", "description": "one line",
  "detail": "optional longer text (shown behind 'view more')",
  "status": "ACCEPTED", "stakeholders": [ { "name": "Priya", "role": "PM" } ] }
```
````
The host translator (`cli/src/provider/translate.ts`):
1. records it via the `recordArtifact` reducer,
2. auto-attaches traceability — `sourceChatRoomId` + `sourceSeq` (the chat anchor),
3. folds `detail` into the description (`\u241f` delimiter) for the UI's "view more",
4. strips the block from the chat body,
5. **de-duplicates** (in-memory + against the DB cache) so the same artifact is
   never recorded twice — survives host restarts and multiple attached processes.

The web `ArtifactRoomView` renders each entry with stakeholder chips, a status
pill, "view more" for detail, and a "↧ view in chat" link back to the source
message.

### Transcript hygiene
The translator persists only the agent's **final** message per turn — streaming
fragments and tool-result noise are dropped — so the transcript stays clean in
both the terminal and the web UI. Chat renders markdown.

---

## Developing

### Change the SpacetimeDB schema
Edit `spacetimedb/src/index.ts`, then:
```bash
spacetime publish -s maincloud -p spacetimedb -y mpademo   # deploy (add -c to WIPE data)
npm run generate:bindings                                   # regen CLI bindings
cd web && spacetime generate mpa --lang typescript -p ../spacetimedb -o src/module_bindings -y
```

### After CLI changes
```bash
npm run check && npm run build     # then RESTART the host to load new code
```
`npm run dev` uses `tsx` (no build needed for dev), but a **restart is required**
for the host to pick up agent/translator changes.

### After web changes
Vite hot-reloads — just save and reload the browser.

### Reset the demo (clean slate)
```bash
spacetime publish -c -s maincloud -p spacetimedb -y mpademo   # WIPES all data
# then re-seed rooms (5 artifact rooms + a chat room) via the createSession reducer
```

---

## Notes for AI agents working on this repo

- Always `nvm use 24` before any `npm`/`vite`/`spacetime` command.
- The schema is the contract: after editing `spacetimedb/src/index.ts`, republish
  **and** regenerate bindings for **both** `cli/` and `web/`.
- Reducers must not `throw` on recoverable input — a thrown error **panics the
  whole module** and disconnects all clients (see the `joinPresence` no-op guard).
- Keep the AI facilitator concise; long output is an anti-goal. Detail belongs in
  artifact `detail`, surfaced via "view more".
- Don't commit `.env.local`, `node_modules`, or `dist` (already git-ignored).
- Verify with `npm run check` / `npm run build` (CLI) and `tsc --noEmit` / `vite build` (web) before committing.
