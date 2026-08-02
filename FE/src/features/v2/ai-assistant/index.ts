// VoltHub — AI Assistant foundation (Phase 3, architecture only).
//
// Provider-agnostic, no external calls. Layers:
//   • types        — domain model (messages, conversations, intent, context)
//   • context      — Context Resolver (session → grounded AssistantContext)
//   • intent       — Prompt Builder (NL → intent; system/user prompt assembly)
//   • service      — Service Layer (single seam to a future model backend)
//   • storage      — Conversation Store (versioned, swappable persistence)
//   • ChatDrawer   — Chat Drawer UI bound to the store + service
export * from "./types";
export * from "./context";
export * from "./intent";
export * from "./service";
export { conversationStore, type ConversationStore } from "./storage";
export { ChatDrawer } from "./ChatDrawer";
