import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MessageSquare, Mic, Send, ChevronDown } from "@/components/Icons";
import { useAppStore } from "@/store/appStore";
import { api } from "@/services/api";

type ChatMsg = { role: "user" | "assistant"; content: string };

type SpeechRecCtor = new () => {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult:
    | ((ev: { results: ArrayLike<{ 0?: { transcript?: string } }> }) => void)
    | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

function getSpeechRecognitionCtor(): SpeechRecCtor | null {
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecCtor;
    webkitSpeechRecognition?: SpeechRecCtor;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export function AssistantPanel() {
  const { recognition, settings } = useAppStore();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [msgs, setMsgs] = useState<ChatMsg[]>([]);
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const recogRef = useRef<InstanceType<SpeechRecCtor> | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, open]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    const next: ChatMsg[] = [...msgs, { role: "user", content: text }];
    setMsgs(next);
    setLoading(true);
    try {
      const r = await api.assistantChat({
        messages: next.map((m) => ({ role: m.role, content: m.content })),
        context_title: recognition?.title,
        context_category: recognition?.category,
        context_screen_text: recognition?.textContent?.trim() || undefined,
      });
      setMsgs((prev) => [...prev, { role: "assistant", content: r.reply }]);
    } catch (e) {
      setMsgs((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `Ошибка: ${String((e as Error)?.message || e)}. Запущен ли Ollama и задан OLLAMA_CHAT_MODEL?`,
        },
      ]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, msgs, recognition]);

  const toggleListen = useCallback(() => {
    const SR = getSpeechRecognitionCtor();
    if (!SR) return;
    if (listening) {
      try {
        recogRef.current?.stop();
      } catch {
        /* */
      }
      setListening(false);
      return;
    }
    const inst = new SR();
    inst.lang = settings.language === "en" ? "en-US" : "ru-RU";
    inst.interimResults = false;
    inst.maxAlternatives = 1;
    inst.onresult = (ev: {
      results: ArrayLike<{ 0?: { transcript?: string } }>;
    }) => {
      const first = ev.results[0] as { 0?: { transcript?: string } } | undefined;
      const t = first?.[0]?.transcript?.trim();
      if (t) setInput((prev) => (prev ? `${prev} ${t}` : t));
    };
    inst.onerror = () => setListening(false);
    inst.onend = () => setListening(false);
    recogRef.current = inst;
    inst.start();
    setListening(true);
  }, [listening, settings.language]);

  return (
    <div className="mx-3 mb-3 shrink-0">
      {/* Toggle */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="group relative w-full overflow-hidden rounded-xl"
      >
        <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-primary/20 via-accent/15 to-magenta/20 opacity-60 group-hover:opacity-100 transition-opacity blur-sm" />
        <div className="relative flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl border border-white/12 bg-[rgba(15,12,40,0.78)] backdrop-blur-xl text-xs text-text/95 hover:border-primary/40 transition-colors">
          <span className="flex items-center gap-2.5 font-semibold">
            <span className="relative w-5 h-5 rounded-md bg-gradient-to-br from-primary via-violet to-accent flex items-center justify-center">
              <MessageSquare size={11} className="text-white" />
            </span>
            <span>Ассистент</span>
            <span className="text-[9px] uppercase tracking-widest text-text-dim/70 font-bold">
              Ollama
            </span>
          </span>
          <ChevronDown
            size={13}
            className={`transition-transform duration-200 ${
              open ? "rotate-180 text-primary-light" : "text-text-dim"
            }`}
          />
        </div>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="overflow-hidden"
          >
            <div className="mt-2 relative rounded-xl border border-white/12 bg-[rgba(11,10,28,0.9)] backdrop-blur-2xl p-3 flex flex-col gap-2 max-h-64 overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
              <div className="flex-1 overflow-y-auto space-y-2 text-[11.5px] leading-relaxed min-h-[4.5rem] pr-1">
                {msgs.length === 0 && (
                  <p className="text-text-dim/85">
                    <span className="text-accent-light font-semibold">Локальный чат</span>{" "}
                    через Ollama. Контекст — из последнего распознавания экрана.
                  </p>
                )}
                {msgs.map((m, i) => (
                  <div
                    key={i}
                    className={`flex ${
                      m.role === "user" ? "justify-end" : "justify-start"
                    }`}
                  >
                    <div
                      className={`max-w-[85%] px-2.5 py-1.5 rounded-xl border ${
                        m.role === "user"
                          ? "bg-gradient-to-br from-primary/30 to-accent/15 border-primary/30 text-text rounded-br-sm"
                          : "bg-white/[0.04] border-white/8 text-text/90 rounded-bl-sm"
                      }`}
                    >
                      <span className="opacity-60 text-[9px] uppercase tracking-wider font-bold mr-1.5">
                        {m.role === "user" ? "you" : "ai"}
                      </span>
                      <span>{m.content}</span>
                    </div>
                  </div>
                ))}
                {loading && (
                  <div className="flex gap-1 ml-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-accent animate-bounce [animation-delay:-0.3s]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-primary-light animate-bounce [animation-delay:-0.15s]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-magenta animate-bounce" />
                  </div>
                )}
                <div ref={bottomRef} />
              </div>

              <div className="flex gap-1.5 items-center pt-1 border-t border-white/5">
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) =>
                    e.key === "Enter" && !e.shiftKey && void send()
                  }
                  placeholder="Спроси что-нибудь…"
                  className="flex-1 min-w-0 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-[11.5px] text-text placeholder:text-text-dim/55 focus:outline-none focus:border-primary/50 focus:bg-white/8 transition-colors"
                  disabled={loading}
                />
                {getSpeechRecognitionCtor() && (
                  <button
                    type="button"
                    title="Голос (браузер)"
                    onClick={toggleListen}
                    className={`h-8 w-8 flex items-center justify-center rounded-lg border transition-all ${
                      listening
                        ? "border-rose-400/60 bg-rose-500/20 text-rose-200 shadow-[0_0_16px_-2px_rgba(244,63,94,0.6)] animate-pulse"
                        : "border-white/10 bg-white/5 text-text-dim hover:text-text hover:border-white/20"
                    }`}
                  >
                    <Mic size={13} />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void send()}
                  disabled={loading || !input.trim()}
                  className="relative h-8 w-8 flex items-center justify-center rounded-lg overflow-hidden disabled:opacity-40 disabled:cursor-not-allowed group/send"
                  title="Отправить"
                >
                  <span className="absolute inset-0 bg-gradient-to-br from-primary via-violet to-accent" />
                  <span className="absolute inset-0 bg-gradient-to-br from-primary via-violet to-accent opacity-0 group-hover/send:opacity-100 blur-md transition-opacity" />
                  <Send size={13} className="relative text-white" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
