import { resolveGlobalMap } from "openclaw/plugin-sdk/global-singleton";
import type { DiscordComponentEntry, DiscordModalEntry } from "./components.js";

const DEFAULT_COMPONENT_TTL_MS = 30 * 60 * 1000;
const DISCORD_COMPONENT_ENTRIES_KEY = Symbol.for("openclaw.discord.componentEntries");
const DISCORD_MODAL_ENTRIES_KEY = Symbol.for("openclaw.discord.modalEntries");

let componentEntries: Map<string, DiscordComponentEntry> | undefined;
let modalEntries: Map<string, DiscordModalEntry> | undefined;

function getComponentEntries(): Map<string, DiscordComponentEntry> {
  componentEntries ??= resolveGlobalMap<string, DiscordComponentEntry>(
    DISCORD_COMPONENT_ENTRIES_KEY,
  );
  return componentEntries;
}

function getModalEntries(): Map<string, DiscordModalEntry> {
  modalEntries ??= resolveGlobalMap<string, DiscordModalEntry>(DISCORD_MODAL_ENTRIES_KEY);
  return modalEntries;
}

function isExpired(entry: { expiresAt?: number }, now: number) {
  return typeof entry.expiresAt === "number" && entry.expiresAt <= now;
}

function normalizeEntryTimestamps<T extends { createdAt?: number; expiresAt?: number }>(
  entry: T,
  now: number,
  ttlMs: number,
): T {
  const createdAt = entry.createdAt ?? now;
  const expiresAt = entry.expiresAt ?? createdAt + ttlMs;
  return { ...entry, createdAt, expiresAt };
}

function registerEntries<
  T extends { id: string; messageId?: string; createdAt?: number; expiresAt?: number },
>(
  entries: T[],
  store: Map<string, T>,
  params: { now: number; ttlMs: number; messageId?: string; expiresAtMs?: number },
): void {
  for (const entry of entries) {
    const expiresAt = entry.expiresAt ?? params.expiresAtMs;
    const normalized = normalizeEntryTimestamps(
      { ...entry, messageId: params.messageId ?? entry.messageId, expiresAt },
      params.now,
      params.ttlMs,
    );
    store.set(entry.id, normalized);
  }
}

function resolveEntry<T extends { expiresAt?: number }>(
  store: Map<string, T>,
  params: { id: string; consume?: boolean },
): T | null {
  const entry = store.get(params.id);
  if (!entry) {
    return null;
  }
  const now = Date.now();
  if (isExpired(entry, now)) {
    store.delete(params.id);
    return null;
  }
  if (params.consume !== false) {
    store.delete(params.id);
  }
  return entry;
}

export function registerDiscordComponentEntries(params: {
  entries: DiscordComponentEntry[];
  modals: DiscordModalEntry[];
  ttlMs?: number;
  messageId?: string;
  expiresAtMs?: number;
}): void {
  const now = Date.now();
  const ttlMs = params.ttlMs ?? DEFAULT_COMPONENT_TTL_MS;
  // Pass expiresAtMs so registerEntries can use it when the entry doesn't already have expiresAt.
  // Modal entries already have expiresAt set by buildDiscordComponentMessage from spec.expiresAtMs.
  // Button entries use the default TTL unless they also have expiresAt pre-set.
  registerEntries(params.entries, getComponentEntries(), {
    now,
    ttlMs,
    messageId: params.messageId,
    expiresAtMs: params.expiresAtMs,
  });
  registerEntries(params.modals, getModalEntries(), {
    now,
    ttlMs,
    messageId: params.messageId,
    expiresAtMs: params.expiresAtMs,
  });
}

export function resolveDiscordComponentEntry(params: {
  id: string;
  consume?: boolean;
}): DiscordComponentEntry | null {
  return resolveEntry(getComponentEntries(), params);
}

export function resolveDiscordModalEntry(params: {
  id: string;
  consume?: boolean;
}): DiscordModalEntry | null {
  return resolveEntry(getModalEntries(), params);
}

export function clearDiscordComponentEntries(): void {
  getComponentEntries().clear();
  getModalEntries().clear();
}
