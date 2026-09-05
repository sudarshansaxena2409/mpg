import { spawn } from "node:child_process";
import type { ProviderName } from "./ProviderAdapter.js";

const PROVIDERS: Record<
  ProviderName,
  { binary: string; loginCommand: string; authCheck: string[] }
> = {
  codex: {
    binary: "codex",
    loginCommand: "codex login",
    authCheck: ["codex", "login", "status"],
  },
  claude: {
    binary: "claude",
    loginCommand: "claude auth login",
    authCheck: ["claude", "auth", "status"],
  },
  cursor: {
    binary: "cursor-agent",
    loginCommand: "agent login",
    authCheck: ["agent", "status"],
  },
};

function run(command: string, args: string[]) {
  return new Promise<{ code: number | null; stderr: string }>((resolve) => {
    const child = spawn(command, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr?.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", () => resolve({ code: 127, stderr }));
    child.on("close", (code) => resolve({ code, stderr }));
  });
}

export async function assertProviderReady(provider: ProviderName) {
  const spec = PROVIDERS[provider];
  const binary = await run(spec.binary, ["--version"]);
  if (binary.code !== 0) {
    throw new Error(
      `${spec.binary} is not installed or not on PATH. Install it, then run: ${spec.loginCommand}`
    );
  }

  const [command, ...args] = spec.authCheck;
  const auth = await run(command, args);
  if (auth.code !== 0) {
    throw new Error(
      `${provider} is not authenticated. Run: ${spec.loginCommand}`
    );
  }
}
