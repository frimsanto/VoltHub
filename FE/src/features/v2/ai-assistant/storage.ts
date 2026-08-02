// VoltHub — AI Assistant: conversation storage model (architecture only).
//
// A small, versioned localStorage repository for chat conversations. It is the
// persistence seam: today it is browser-local; it can later be swapped for a
// backend conversation store without touching the UI, because callers depend on
// this interface, not on localStorage. No network, no external SDK.
import type { ChatMessage, Conversation } from "./types";

const STORAGE_KEY = "volthub-ai-conversations";
const SCHEMA_VERSION = 1;

interface PersistShape {
  version: number;
  conversations: Conversation[];
}

/** Crypto-strong id when available, with a deterministic fallback for old envs. */
function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function read(): PersistShape {
  if (typeof localStorage === "undefined") return { version: SCHEMA_VERSION, conversations: [] };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { version: SCHEMA_VERSION, conversations: [] };
    const parsed = JSON.parse(raw) as PersistShape;
    if (!parsed || parsed.version !== SCHEMA_VERSION || !Array.isArray(parsed.conversations)) {
      return { version: SCHEMA_VERSION, conversations: [] };
    }
    return parsed;
  } catch {
    return { version: SCHEMA_VERSION, conversations: [] };
  }
}

function write(shape: PersistShape): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(shape));
  } catch {
    // Quota / private-mode — persistence is best-effort; the UI keeps working.
  }
}

/** Derive a readable title from the first user message. */
function deriveTitle(text: string): string {
  const t = text.trim().replace(/\s+/g, " ");
  return t.length > 48 ? `${t.slice(0, 48)}…` : t || "Percakapan baru";
}

export const conversationStore = {
  list(): Conversation[] {
    return read().conversations.sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt));
  },

  get(id: string): Conversation | undefined {
    return read().conversations.find((c) => c.id === id);
  },

  create(initial?: Partial<Pick<Conversation, "title">>): Conversation {
    const now = new Date().toISOString();
    const conv: Conversation = {
      id: newId(),
      title: initial?.title ?? "Percakapan baru",
      createdAt: now,
      updatedAt: now,
      messages: [],
    };
    const shape = read();
    shape.conversations.push(conv);
    write(shape);
    return conv;
  },

  /** Append a message; auto-titles the conversation from the first user turn. */
  appendMessage(
    conversationId: string,
    message: Omit<ChatMessage, "id" | "createdAt"> & Partial<Pick<ChatMessage, "id" | "createdAt">>,
  ): ChatMessage {
    const shape = read();
    const conv = shape.conversations.find((c) => c.id === conversationId);
    const full: ChatMessage = {
      id: message.id ?? newId(),
      createdAt: message.createdAt ?? new Date().toISOString(),
      role: message.role,
      content: message.content,
      sources: message.sources,
      pending: message.pending,
      error: message.error,
    };
    if (conv) {
      const firstUser = conv.messages.every((m) => m.role !== "user");
      conv.messages.push(full);
      if (firstUser && full.role === "user") conv.title = deriveTitle(full.content);
      conv.updatedAt = full.createdAt;
      write(shape);
    }
    return full;
  },

  /** Replace a message in place (used to resolve an optimistic pending turn). */
  updateMessage(conversationId: string, messageId: string, patch: Partial<ChatMessage>): void {
    const shape = read();
    const conv = shape.conversations.find((c) => c.id === conversationId);
    const msg = conv?.messages.find((m) => m.id === messageId);
    if (conv && msg) {
      Object.assign(msg, patch);
      conv.updatedAt = new Date().toISOString();
      write(shape);
    }
  },

  remove(id: string): void {
    const shape = read();
    shape.conversations = shape.conversations.filter((c) => c.id !== id);
    write(shape);
  },

  clear(): void {
    write({ version: SCHEMA_VERSION, conversations: [] });
  },
};

export type ConversationStore = typeof conversationStore;
