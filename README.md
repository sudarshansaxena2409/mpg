# mpa

Multiplayer Codex sessions over SpacetimeDB.

## Client Development

The client is the Node/TypeScript CLI in `cli/src`. Most day-to-day UI and session-flow work happens here:

- `cli/src/index.ts` defines the `mpa new`, `mpa join`, and `mpa run` commands.
- `cli/src/sessionApp.tsx` owns subscriptions, presence heartbeats, local input routing, and host-side Codex dispatch.
- `cli/src/ui/Transcript.tsx` is the Ink terminal UI.
- `cli/src/stdb.ts` contains SpacetimeDB connection defaults, reducer wrappers, and subscriptions.

Run the client from TypeScript while iterating:

```bash
npm run dev -- new "client dev" --as shub
npm run dev -- join <session-id> --as alice
```

Use two terminals for multiplayer UI work. The `new` terminal owns the local Codex process; `join` terminals only send prompts and render the shared transcript.

After client changes, run:

```bash
npm run check
npm run build
```

## Requirements

- Node.js 22 or newer.
- SpacetimeDB CLI for module development and publishing.
- For the host running `mpa new`: Codex CLI installed and logged in with `codex login`.
- Collaborators running `mpa join` do not need Codex installed.
- SpacetimeDB clients do not need an app token for this module.

## Install From Tarball

On the other machine:

```bash
npm install -g ./mpa-0.1.0.tgz
```

## Defaults

The CLI defaults to the published maincloud database:

```text
MPA_SPACETIME_HOST=wss://maincloud.spacetimedb.com
MPA_SPACETIME_DB=mpa
```

You can override either env var when needed.

## Usage

Host a new session and run Codex locally:

```bash
mpa new "My session" --as shub
```

The session id is shown in the header. Other machines join with:

```bash
mpa join <session-id> --as alice
```

The host and all joined clients see the same ordered transcript. Prompts typed by join clients are sent to the Codex process running on the host.

## Development

Install dependencies:

```bash
npm install
cd spacetimedb
npm install
cd ..
```

Type-check and build the CLI:

```bash
npm run check
npm run build
```

Run the CLI directly from TypeScript during development:

```bash
npm run dev -- new "dev session" --as shub
npm run dev -- join <session-id> --as alice
```

Run the built CLI:

```bash
node dist/cli/src/index.js new "dev session" --as shub
node dist/cli/src/index.js join <session-id> --as alice
```

### SpacetimeDB Module

The module source is in `spacetimedb/src/index.ts`. After changing tables or reducers, regenerate client bindings:

```bash
npm run generate:bindings
npm run check
```

Publish to a local SpacetimeDB server:

```bash
npm run publish:local
MPA_SPACETIME_HOST=ws://localhost:3000 MPA_SPACETIME_DB=mpa npm run dev -- new "local session" --as shub
```

Publish to maincloud when the default shared database should be updated:

```bash
spacetime publish -s maincloud -p spacetimedb --yes=remote,migrate,break-clients mpa
npm run generate:bindings
npm run build
```

The current default database is `mpa` on `wss://maincloud.spacetimedb.com`. Do not add token setup for clients; the module is public and the CLI connects without `withToken`.

### Local Multiplayer Test

Use two terminals.

Terminal 1 runs the host and local Codex process:

```bash
npm run dev -- new "pairing test" --as shub
```

Terminal 2 joins the session id shown by terminal 1:

```bash
npm run dev -- join <session-id> --as alice
```

Messages from either terminal should appear in the same total order. Messages from joined clients should execute on the Codex process owned by the host terminal.

### Packaging

Build an npm tarball for another machine:

```bash
npm run pack:cli
```

The tarball is written to `release/`. Install it elsewhere with:

```bash
npm install -g ./release/mpa-0.1.0.tgz
```

Package contents come from `package.json` `files`, currently `dist` and `README.md`; `node_modules` is intentionally not packed.
