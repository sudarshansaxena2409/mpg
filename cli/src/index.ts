#!/usr/bin/env node
import { Command } from "commander";
import { connect, createSession, updateSessionStatus } from "./stdb.js";
import { createProviderAdapter } from "./provider/index.js";
import type { ProviderName } from "./provider/ProviderAdapter.js";
import { assertProviderReady } from "./provider/preflight.js";
import { runInkSession } from "./sessionApp.js";

const program = new Command();

program
  .name("mpa")
  .description("Multiplayer agent sessions over SpacetimeDB")
  .version("0.1.0");

program
  .command("new")
  .argument("<title>")
  .option("--as <name>", "Human name for the local host", "host")
  .description("Create a session, run Codex locally, and stay attached")
  .action(async (title: string, options: { as: string }) => {
    await assertProviderReady("codex");
    const conn = await connect();
    const sessionId = await createSession(conn, title);
    const adapter = createProviderAdapter("codex");
    await adapter.start(sessionId, process.cwd());
    await runInkSession({
      conn,
      sessionId,
      asName: options.as,
      adapter,
      providerName: "codex",
      mode: "new",
    });
  });

program
  .command("join")
  .argument("<session-id>")
  .requiredOption("--as <name>")
  .description("Join a live session")
  .action(async (sessionId: string, options: { as: string }) => {
    const conn = await connect();
    await runInkSession({ conn, sessionId, asName: options.as });
  });

program
  .command("run")
  .argument("<session-id>")
  .requiredOption("--as <name>")
  .option("--tool <provider>", "provider to run; only codex is supported right now", "codex")
  .description("Join a live session and run an agent provider")
  .action(
    async (
      sessionId: string,
      options: { as: string; tool: ProviderName | string }
    ) => {
      if (options.tool !== "codex") {
        throw new Error("Only --tool codex is supported right now");
      }

      await assertProviderReady("codex");
      const conn = await connect();
      const adapter = createProviderAdapter("codex");
      await updateSessionStatus(conn, sessionId, "running");
      await adapter.start(sessionId, process.cwd());
      await runInkSession({
        conn,
        sessionId,
        asName: options.as,
        adapter,
        providerName: "codex",
      });
    }
  );

program.parseAsync().catch((error: Error) => {
  console.error(error.message);
  process.exitCode = 1;
});
