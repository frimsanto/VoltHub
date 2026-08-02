// VoltHub — AI Assistant chat surface (shared).
// One reusable conversational UI used by BOTH the floating assistant (FAB) and
// the full-page route. Holds message state, the deterministic answer engine,
// seed prompts, and the input box. Layout adapts via the `compact` prop.

import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Send, Bot, User as UserIcon, Loader2, RadioTower } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  answerQuery,
  SEED_PROMPTS,
  STAT_TONE_CLASS,
  type ChatMessage,
  type AnswerStat,
} from "./engine";
import { chatAssistant, type ChatTurn } from "./api";

function StatGrid({ stats }: { stats: AnswerStat[] }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {stats.map((s, i) => (
        <div key={i} className="rounded-lg border border-border bg-card px-3 py-2">
          <div className={`text-lg font-semibold ${STAT_TONE_CLASS[s.tone ?? "default"]}`}>
            {s.value}
          </div>
          <div className="text-[11px] leading-tight text-muted-foreground">{s.label}</div>
        </div>
      ))}
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  return (
    <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : ""}`}>
      <div
        className={`grid size-8 shrink-0 place-items-center rounded-full ${
          isUser ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary"
        }`}
      >
        {isUser ? <UserIcon className="size-4" /> : <Bot className="size-4" />}
      </div>
      <div className={`max-w-[85%] space-y-2 ${isUser ? "items-end text-right" : ""}`}>
        <div
          className={`inline-block whitespace-pre-line rounded-2xl px-4 py-2.5 text-sm ${
            isUser ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
          }`}
        >
          {message.text}
        </div>
        {message.stats && message.stats.length > 0 && (
          <div className="text-left">
            <StatGrid stats={message.stats} />
          </div>
        )}
        {message.items && message.items.length > 0 && (
          <div className="space-y-2 text-left">
            {message.items.map((it, i) => {
              const inner = (
                <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 transition-colors hover:border-primary/40">
                  <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                    <it.icon className="size-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{it.title}</div>
                    {it.subtitle && (
                      <div className="truncate text-xs text-muted-foreground">{it.subtitle}</div>
                    )}
                  </div>
                  {it.badge}
                </div>
              );
              return it.to ? (
                <Link key={i} to={it.to as never} className="block">
                  {inner}
                </Link>
              ) : (
                <div key={i}>{inner}</div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export function AssistantChat({ compact = false }: { compact?: boolean }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, thinking]);

  const ask = async (text: string) => {
    const value = text.trim();
    if (!value || thinking) return;
    // Prior turns give the LLM conversational context.
    const history: ChatTurn[] = messages.map((m) => ({ role: m.role, content: m.text }));
    setInput("");
    setMessages((m) => [...m, { role: "user", text: value }]);
    setThinking(true);
    try {
      // Try the backend LLM (understands free-form language). If it has no API
      // key it returns mode:"fallback" — then use the local deterministic engine.
      let llmText: string | null = null;
      try {
        const res = await chatAssistant(value, history);
        if (res.mode === "llm") llmText = res.text;
      } catch {
        // network/server error → fall through to the local engine
      }
      if (llmText !== null) {
        setMessages((m) => [...m, { role: "assistant", text: llmText }]);
      } else {
        const answer = await answerQuery(value);
        setMessages((m) => [
          ...m,
          { role: "assistant", text: answer.text, stats: answer.stats, items: answer.items },
        ]);
      }
    } catch {
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          text: "Maaf, terjadi kendala saat mengambil data. Coba lagi sebentar.",
        },
      ]);
    } finally {
      setThinking(false);
    }
  };

  // In compact mode (FAB) keep only the first few seed prompts to save space.
  const seeds = compact ? SEED_PROMPTS.slice(0, 3) : SEED_PROMPTS;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div ref={scrollRef} className="flex-1 space-y-5 overflow-y-auto p-4 sm:p-5">
        {messages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <div className="grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary">
              <RadioTower className="size-7" />
            </div>
            <p className="mt-4 text-sm font-medium">Tanyakan apa saja tentang aset jaringan Anda</p>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              Contoh: ringkasan jaringan, gardu telekontrol bermasalah, atau kondisi baterai.
            </p>
          </div>
        )}

        {messages.map((m, i) => (
          <MessageBubble key={i} message={m} />
        ))}

        {thinking && (
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <div className="grid size-8 place-items-center rounded-full bg-primary/10 text-primary">
              <Bot className="size-4" />
            </div>
            <span className="flex items-center gap-2">
              <Loader2 className="size-4 animate-spin" /> Menganalisa…
            </span>
          </div>
        )}
      </div>

      <div className="border-t border-border p-3 sm:p-4">
        <div className="mb-3 flex flex-wrap gap-2">
          {seeds.map((p) => (
            <button
              key={p}
              onClick={() => void ask(p)}
              disabled={thinking}
              className="rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground disabled:opacity-50"
            >
              {p}
            </button>
          ))}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void ask(input);
          }}
          className="flex gap-2"
        >
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Tanyakan tentang gardu, RC, atau aset…"
            disabled={thinking}
          />
          <Button type="submit" size="icon" disabled={thinking || !input.trim()}>
            <Send className="size-4" />
          </Button>
        </form>
      </div>
    </div>
  );
}
