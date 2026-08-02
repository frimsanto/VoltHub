// VoltHub — AI Assistant: Chat Drawer (premium UI).
//
// A self-contained glassmorphism drawer: it resolves the session context,
// persists turns through the Conversation Store, and routes each message
// through the Service Layer (Groq via the authenticated BE proxy, or honest
// preview mode when unauthenticated). The last 10 turns are forwarded as
// conversation memory so follow-up questions keep their context.
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Send, X, Trash2, Sparkles, ArrowUpRight } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { v2Get, v2Delete } from "@/lib/api/v2/client";
import { useAssistantContext } from "./context";
import { reply, isAssistantConnected, type HistoryTurn } from "./service";
import { conversationStore } from "./storage";
import type { ChatMessage, Conversation } from "./types";

const SUGGESTIONS = [
  "Apa itu Gardu Hubung?",
  "Cara mengisi Laporan HAR?",
  "Perbedaan Inspeksi dan HAR?",
  "Bantu saya buat laporan",
];

export function ChatDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ctx = useAssistantContext();
  const navigate = useNavigate();
  const [conv, setConv] = useState<Conversation | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  // Personalisation indicator — true when the backend holds a cross-session
  // context snapshot for this account (GET /ai/preferences). Fail-soft: any
  // error just keeps the badge hidden.
  const [hasContext, setHasContext] = useState(false);
  const [clearingMemory, setClearingMemory] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Lazily create/load the active conversation when the drawer first opens.
  useEffect(() => {
    if (!open) return;
    const latest = conversationStore.list()[0];
    setConv(latest ?? conversationStore.create());
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    v2Get<{ hasContext: boolean }>("/ai/preferences")
      .then((r) => {
        if (!cancelled) setHasContext(!!r.hasContext);
      })
      .catch(() => {
        /* badge stays hidden */
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  // "Hapus Riwayat AI" — wipes the server-side snapshot + learned prefs so the
  // user keeps full control over what the AI remembers about them.
  const clearAiMemory = useCallback(async () => {
    if (clearingMemory) return;
    setClearingMemory(true);
    try {
      await v2Delete("/ai/preferences/context");
      setHasContext(false);
    } catch {
      /* fail-soft: leave the badge as-is, the user can retry */
    } finally {
      setClearingMemory(false);
    }
  }, [clearingMemory]);

  // Keep the view pinned to the newest message.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [conv?.messages.length, busy]);

  const send = useCallback(
    async (text: string) => {
      const body = text.trim();
      if (!body || busy || !conv) return;
      setInput("");
      setBusy(true);
      // Conversation memory: prior successful turns, before this message.
      const history: HistoryTurn[] = conv.messages
        .filter((m) => (m.role === "user" || m.role === "assistant") && !m.error)
        .slice(-10)
        .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
      conversationStore.appendMessage(conv.id, { role: "user", content: body });
      setConv(conversationStore.get(conv.id) ?? conv);
      try {
        const r = await reply(body, ctx, history);
        conversationStore.appendMessage(conv.id, {
          role: "assistant",
          content: r.content,
          sources: r.sources,
        });
        // NAVIGATE intent: the Brain resolved a page — redirect, then close the
        // drawer shortly after so the user sees the confirmation land first.
        if (r.navigateTo) {
          navigate({ to: r.navigateTo as never });
          setTimeout(() => onClose(), 300);
        }
      } catch {
        conversationStore.appendMessage(conv.id, {
          role: "assistant",
          content: "Maaf, terjadi kesalahan saat memproses pertanyaan Anda.",
          error: true,
        });
      } finally {
        setConv(conversationStore.get(conv.id) ?? conv);
        setBusy(false);
      }
    },
    [busy, conv, ctx, navigate, onClose],
  );

  const reset = () => {
    const fresh = conversationStore.create();
    setConv(fresh);
  };

  if (!open) return null;
  const messages: ChatMessage[] = conv?.messages ?? [];

  return (
    <div
      className="fixed inset-x-3 bottom-[calc(8rem+var(--safe-bottom))] z-40 flex h-[min(72vh,580px)] flex-col overflow-hidden rounded-2xl border border-white/10 bg-background/95 shadow-2xl shadow-black/40 backdrop-blur-xl sm:inset-x-auto sm:right-6 sm:w-105"
      role="dialog"
      aria-label="VoltHub AI"
    >
      {/* Header */}
      <header className="relative flex items-center gap-3 border-b border-white/[0.07] px-4 py-3.5">
        {/* Gradient line top */}
        <div
          className="absolute inset-x-0 top-0 h-px bg-linear-to-r from-pln-yellow/50 via-pln-blue/40 to-transparent"
          aria-hidden
        />

        <div className="relative flex size-9 items-center justify-center rounded-xl border border-primary/20 bg-primary/15">
          <Sparkles className="size-4 text-primary" />
          {/* Pulse indicator */}
          {isAssistantConnected() && (
            <span className="absolute -right-0.5 -top-0.5 flex size-2.5">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-success/60" />
              <span className="relative inline-flex size-2.5 rounded-full bg-success" />
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold tracking-tight">VoltHub AI</div>
          <div className="text-[10px] text-muted-foreground">
            {isAssistantConnected() ? "Siap membantu" : "Mode preview"}
          </div>
        </div>

        <button
          onClick={reset}
          className="flex size-8 cursor-pointer items-center justify-center rounded-lg text-muted-foreground/60 transition-colors hover:bg-white/5 hover:text-foreground"
          aria-label="Percakapan baru"
          title="Percakapan baru"
        >
          <Trash2 className="size-3.5" />
        </button>
        <button
          onClick={onClose}
          className="flex size-8 cursor-pointer items-center justify-center rounded-lg text-muted-foreground/60 transition-colors hover:bg-white/5 hover:text-foreground"
          aria-label="Tutup"
        >
          <X className="size-3.5" />
        </button>
      </header>

      {/* Messages */}
      <ScrollArea data-lenis-prevent className="min-h-0 flex-1">
        <div ref={scrollRef} className="flex flex-col gap-4 p-4">
          {messages.length === 0 ? (
            /* Empty state */
            <div className="flex flex-col items-center gap-5 py-6 text-center">
              <div className="flex size-14 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10">
                <Sparkles className="size-6 text-primary" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-semibold">Halo! Saya VoltHub AI</p>
                <p className="max-w-65 text-xs text-muted-foreground">
                  Tanyakan apa saja — tentang PLN, sistem VoltHub, atau topik lainnya.
                </p>
              </div>
              {/* Suggestions */}
              <div className="grid w-full grid-cols-2 gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => void send(s)}
                    className="flex cursor-pointer items-start gap-1.5 rounded-xl border border-border/50 bg-card/50 p-2.5 text-left text-xs text-muted-foreground transition-colors hover:border-border hover:bg-card hover:text-foreground"
                  >
                    <ArrowUpRight className="mt-0.5 size-3 shrink-0 text-primary/60" />
                    <span>{s}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((m) => (
              <div
                key={m.id}
                className={cn(
                  "flex max-w-[88%] gap-2.5",
                  m.role === "user" ? "ml-auto flex-row-reverse" : "mr-auto",
                )}
              >
                {m.role === "assistant" && (
                  <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg border border-primary/20 bg-primary/15">
                    <Sparkles className="size-3.5 text-primary" />
                  </div>
                )}
                <div
                  className={cn(
                    "rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
                    m.role === "user"
                      ? "whitespace-pre-wrap rounded-br-sm bg-primary text-primary-foreground"
                      : cn(
                          "rounded-bl-sm border border-border/50 bg-card text-foreground",
                          m.error && "border-destructive/30 bg-destructive/10 text-destructive",
                        ),
                  )}
                >
                  {m.role === "assistant" ? (
                    <div className="ai-markdown">
                      <ReactMarkdown>{m.content}</ReactMarkdown>
                    </div>
                  ) : (
                    m.content
                  )}
                </div>
              </div>
            ))
          )}

          {/* Typing indicator */}
          {busy && (
            <div className="mr-auto flex max-w-[88%] items-center gap-2.5">
              <div className="flex size-7 shrink-0 items-center justify-center rounded-lg border border-primary/20 bg-primary/15">
                <Sparkles className="size-3.5 text-primary" />
              </div>
              <div className="rounded-2xl rounded-bl-sm border border-border/50 bg-card px-4 py-3">
                <div className="flex items-center gap-1">
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className="size-1.5 animate-bounce rounded-full bg-muted-foreground/60"
                      style={{ animationDelay: `${i * 0.15}s` }}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Input */}
      <div className="border-t border-white/[0.07] p-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send(input);
          }}
          className="flex items-end gap-2"
        >
          <div className="relative flex-1">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send(input);
                }
              }}
              placeholder="Tanyakan sesuatu..."
              aria-label="Pesan"
              disabled={busy}
              className="rounded-xl border-white/10 bg-white/5 pr-2 text-sm placeholder:text-muted-foreground/40 focus-visible:border-primary/40 focus-visible:ring-0"
            />
          </div>
          <button
            type="submit"
            disabled={!input.trim() || busy}
            className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-xl bg-primary text-primary-foreground transition-all hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-30"
            aria-label="Kirim"
          >
            <Send className="size-3.5" />
          </button>
        </form>
        {hasContext ? (
          <div className="mt-2 flex items-center justify-center gap-2 text-[10px]">
            <span className="text-muted-foreground/50">
              AI sudah mengenal Anda — konteks disimpan
            </span>
            <span className="text-muted-foreground/30" aria-hidden>
              ·
            </span>
            <button
              type="button"
              onClick={() => void clearAiMemory()}
              disabled={clearingMemory}
              className="cursor-pointer text-muted-foreground/50 underline-offset-2 transition-colors hover:text-destructive hover:underline disabled:cursor-not-allowed disabled:opacity-50"
            >
              {clearingMemory ? "Menghapus…" : "🗑️ Hapus Riwayat AI"}
            </button>
          </div>
        ) : (
          <p className="mt-2 text-center text-[10px] text-muted-foreground/30">
            VoltHub AI · Powered by AI
          </p>
        )}
      </div>
    </div>
  );
}
