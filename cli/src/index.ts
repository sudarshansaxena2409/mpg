#!/usr/bin/env node
import { Command } from "commander";
import { connect, createSession, updateSessionStatus } from "./stdb.js";
import { createProviderAdapter } from "./provider/index.js";
import type { ProviderName } from "./provider/ProviderAdapter.js";
import { assertProviderReady } from "./provider/preflight.js";
import { runInkSession } from "./sessionApp.js";

const program = new Command();

const SUPPORTED_PROVIDERS: ProviderName[] = ["codex", "claude"];

function resolveProvider(tool: string): ProviderName {
  if (!SUPPORTED_PROVIDERS.includes(tool as ProviderName)) {
    throw new Error(
      `Unsupported --tool "${tool}". Supported: ${SUPPORTED_PROVIDERS.join(", ")}`
    );
  }
  return tool as ProviderName;
}

program
  .name("mpa")
  .description("Multiplayer agent sessions over SpacetimeDB")
  .version("0.1.0");

program
  .command("new")
  .argument("<title>")
  .option("--as <name>", "Human name for the local host", "host")
  .option("--tool <provider>", "agent provider to run: codex or claude", "codex")
  .description("Create a session, run an agent locally, and stay attached")
  .action(async (title: string, options: { as: string; tool: string }) => {
    const provider = resolveProvider(options.tool);
    await assertProviderReady(provider);
    const conn = await connect();
    const sessionId = await createSession(conn, title);
    const adapter = createProviderAdapter(provider);
    await adapter.start(sessionId, process.cwd());
    await runInkSession({
      conn,
      sessionId,
      asName: options.as,
      adapter,
      providerName: provider,
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
  .option("--tool <provider>", "agent provider to run: codex or claude", "codex")
  .description("Join a live session and run an agent provider")
  .action(
    async (
      sessionId: string,
      options: { as: string; tool: ProviderName | string }
    ) => {
      const provider = resolveProvider(String(options.tool));

      await assertProviderReady(provider);
      const conn = await connect();
      const adapter = createProviderAdapter(provider);
      await updateSessionStatus(conn, sessionId, "running");
      await adapter.start(sessionId, process.cwd());
      await runInkSession({
        conn,
        sessionId,
        asName: options.as,
        adapter,
        providerName: provider,
      });
    }
  );

program.parseAsync().catch((error: Error) => {
  console.error(error.message);
  process.exitCode = 1;
});
