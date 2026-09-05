import React, { useEffect, useMemo, useState } from "react";
import { Box, Text, useInput } from "ink";
import type { SessionEvent, SessionPresence, ToolInvocation } from "../types.js";

export type TranscriptProps = {
  sessionId: string;
  asName: string;
  mode: "new" | "join" | "run";
  events: SessionEvent[];
  tools: ToolInvocation[];
  presences: SessionPresence[];
  isReady: boolean;
  isRunner: boolean;
  providerName?: string;
  onSubmit(text: string): void | Promise<void>;
  onApprove(id: string): void | Promise<void>;
  onReject(id: string): void | Promise<void>;
  onExit(): void | Promise<void>;
};

type ParsedPayload = Record<string, unknown>;

type Participant = {
  name: string;
  role: string;
  color: string;
  active: boolean;
};

const spinnerFrames = ["-", "\\", "|", "/"];
const fallbackColors = ["yellow", "cyan", "magenta", "blue", "green", "red"];
const presenceTtlMs = 12000;

function parsePayload(payload: string): ParsedPayload {
  try {
    const parsed = JSON.parse(payload) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as ParsedPayload) : { body: parsed };
  } catch {
    return { body: payload };
  }
}

function hashString(value: string) {
  let hash = 0;
  for (const char of value) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return hash;
}

function fallbackColorForName(name: string) {
  return fallbackColors[hashString(name) % fallbackColors.length];
}

function stringifyCompact(value: unknown, max = 140) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  if (!text) {
    return "";
  }
  return text.length > max ? `${text.slice(0, max - 1)}...` : text;
}

function eventText(event: SessionEvent) {
  const payload = parsePayload(event.payload);
  if (event.eventType === "message") {
    return stringifyCompact(payload.body ?? event.payload, 220);
  }
  if (event.eventType === "tool_result") {
    return `${String(payload.toolName ?? "tool")} => ${stringifyCompact(payload.result, 180)}`;
  }
  if (event.eventType === "approval") {
    return `${String(payload.decision ?? "approval")} ${String(payload.invocationId ?? "")}`.trim();
  }
  return stringifyCompact(event.payload, 220);
}

function hasAgentAfter(events: SessionEvent[], seq: bigint) {
  return events.some(
    (event) =>
      event.seq > seq &&
      event.authorType === "agent" &&
      (event.eventType === "message" || event.eventType === "tool_result")
  );
}

export function Transcript(props: TranscriptProps) {
  const [input, setInput] = useState("");
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setTick((value) => value + 1), 160);
    return () => clearInterval(timer);
  }, []);

  const orderedEvents = useMemo(
    () => [...props.events].sort((a, b) => (a.seq < b.seq ? -1 : a.seq > b.seq ? 1 : 0)),
    [props.events]
  );

  const now = Date.now();
  const participants = useMemo(() => {
    const users = new Map<string, Participant>();

    for (const event of orderedEvents) {
      if (event.authorType === "human") {
        users.set(event.authorName, {
          name: event.authorName,
          role: "participant",
          color: fallbackColorForName(event.authorName),
          active: false,
        });
      }
    }

    users.set(props.asName, {
      name: props.asName,
      role: props.isRunner ? `runner:${props.providerName ?? "codex"}` : "participant",
      color: fallbackColorForName(props.asName),
      active: true,
    });

    for (const presence of props.presences) {
      const active = Boolean(presence.seenAtMs && now - presence.seenAtMs <= presenceTtlMs);
      const existing = users.get(presence.authorName);
      users.set(presence.authorName, {
        name: presence.authorName,
        role: presence.role.startsWith("runner") || !existing ? presence.role : existing.role,
        color: presence.color || existing?.color || fallbackColorForName(presence.authorName),
        active: active || Boolean(existing?.active),
      });
    }

    return [...users.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [now, orderedEvents, props.asName, props.isRunner, props.presences, props.providerName]);

  const authorColors = useMemo(() => {
    const colors = new Map<string, string>();
    for (const participant of participants) {
      colors.set(participant.name, participant.color);
    }
    return colors;
  }, [participants]);

  const latestHuman = [...orderedEvents]
    .reverse()
    .find((event) => event.authorType === "human" && event.eventType === "message");
  const awaitingAgent = Boolean(latestHuman && !hasAgentAfter(orderedEvents, latestHuman.seq));
  const pulse = tick % 8 < 4;
  const spinner = spinnerFrames[tick % spinnerFrames.length];
  const modeLabel = props.mode === "new" ? "run" : props.mode;
  const roleLabel = props.isRunner ? props.providerName ?? "codex" : "joined";

  const runnerNames = useMemo(
    () => new Set(participants.filter((participant) => participant.role.startsWith("runner")).map((participant) => participant.name)),
    [participants]
  );

  const colorForAuthor = (event: SessionEvent) => {
    if (event.authorType === "agent") {
      return "green";
    }
    if (event.authorName === "system") {
      return "gray";
    }
    return authorColors.get(event.authorName) ?? fallbackColorForName(event.authorName);
  };

  const displayNameForEvent = (event: SessionEvent) => {
    if (event.authorType === "agent") {
      return props.providerName ?? event.authorName ?? "codex";
    }
    return event.authorName;
  };

  useInput((value, key) => {
    if (key.return) {
      const text = input.trim();
      setInput("");
      if (!text) {
        return;
      }
      const [command, id] = text.split(/\s+/, 2);
      if (command === "/approve" && id) {
        void props.onApprove(id);
      } else if (command === "/reject" && id) {
        void props.onReject(id);
      } else {
        void props.onSubmit(text);
      }
      return;
    }
    if (key.backspace || key.delete) {
      setInput((prev) => prev.slice(0, -1));
      return;
    }
    if (key.ctrl && value === "c") {
      void props.onExit();
      return;
    }
    if (value) {
      setInput((prev) => prev + value);
    }
  });

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box borderStyle="round" borderColor={props.isRunner ? "green" : "cyan"} paddingX={1} flexDirection="column">
        <Box justifyContent="space-between">
          <Text>
            <Text color="cyan" bold>mpa</Text>
            <Text color="white"> / </Text>
            <Text color={props.isRunner ? "green" : "cyan"} bold>{modeLabel}</Text>
            <Text dimColor> as </Text>
            <Text color={(authorColors.get(props.asName) ?? fallbackColorForName(props.asName)) as any} bold>{props.asName}</Text>
          </Text>
          <Text color={props.isReady ? "green" : "yellow"}>
            {props.isReady ? "live" : `${spinner} syncing`}
          </Text>
        </Box>
        <Box marginTop={1}>
          <Text dimColor>session </Text>
          <Text color="white">{props.sessionId}</Text>
          <Text dimColor>  role </Text>
          <Text color={props.isRunner ? "green" : "cyan"}>{roleLabel}</Text>
        </Box>
      </Box>

      <Box marginTop={1} flexDirection="column" borderStyle="single" borderColor="gray" paddingX={1}>
        <Box>
          <Text color="magenta" bold>Participants:</Text>
          <Text dimColor> </Text>
          {participants.map((participant, index) => (
            <Text key={participant.name}>
              {index > 0 && <Text dimColor>, </Text>}
              <Text color={participant.color as any} bold strikethrough={!participant.active}>{participant.name}</Text>

            </Text>
          ))}
        </Box>
        <Box>
          <Text color={awaitingAgent ? (pulse ? "yellow" : "magenta") : "green"}>
            {awaitingAgent ? `${spinner} thinking` : "ready"}
          </Text>
          {awaitingAgent && <Text dimColor> after {latestHuman?.authorName}'s prompt</Text>}
        </Box>
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Box borderStyle="single" borderColor="blue" paddingX={1}>
          <Text color="blue" bold>Transcript</Text>
        </Box>
        <Box flexDirection="column" paddingX={1} minHeight={8}>
          {orderedEvents.length === 0 && (
            <Text color="yellow">{props.isReady ? "No messages yet. Type a prompt below." : `${spinner} Loading session history...`}</Text>
          )}
          {orderedEvents.slice(-24).map((event) => {
            const isAgent = event.authorType === "agent";
            const isHost = !isAgent && runnerNames.has(event.authorName);
            const authorColor = colorForAuthor(event);
            return (
              <Box key={`${event.sessionId}:${String(event.seq)}`} marginTop={1}>
                <Box marginRight={1}>
                  <Text color={authorColor as any}>{isAgent ? "||" : isHost ? ">>" : "| "}</Text>
                </Box>
                <Box flexDirection="column">
                  <Text>
                    <Text color={authorColor as any} bold>{displayNameForEvent(event)}:</Text>
                  </Text>
                  <Text>{eventText(event)}</Text>
                </Box>
              </Box>
            );
          })}
          {awaitingAgent && (
            <Box marginTop={1}>
              <Text color={pulse ? "yellow" : "magenta"}>{spinner} Codex is thinking</Text>
              <Text dimColor> after {latestHuman?.authorName}'s prompt</Text>
            </Box>
          )}
        </Box>
      </Box>

      <Box marginTop={1} borderStyle="round" borderColor={input.startsWith("/") ? "magenta" : "cyan"} paddingX={1}>
        <Text color={(authorColors.get(props.asName) ?? fallbackColorForName(props.asName)) as any} bold>{props.asName}</Text>
        <Text color="cyan"> &gt; </Text>
        <Text>{input}</Text>
        {!input && <Text dimColor> type a prompt</Text>}
      </Box>
    </Box>
  );
}
