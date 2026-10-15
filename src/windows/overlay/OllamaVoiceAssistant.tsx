import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Mic, Send, Volume2, VolumeX } from "@/components/Icons";
import { useAppStore } from "@/store/appStore";
import { api } from "@/services/api";
import { withVisionLock } from "@/lib/visionMutex";

type ChatMsg = { role: "user" | "assistant"; content: string };

function canCaptureMic(): boolean {
  return typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
}

function pickMediaRecorderMime(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  for (const t of ["audio/webm;codecs=opus", "audio/webm"]) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return undefined;
}

function TypingDots() {
  return (
    <div className="flex items-center gap-1 py-1 px-0.5">
      <span className="w-1.5 h-1.5 rounded-full bg-accent animate-bounce" style={{ animationDelay: "0s", animationDuration: "0.9s" }} />
      <span className="w-1.5 h-1.5 rounded-full bg-primary-light animate-bounce" style={{ animationDelay: "0.15s", animationDuration: "0.9s" }} />
      <span className="w-1.5 h-1.5 rounded-full bg-magenta animate-bounce" style={{ animationDelay: "0.3s", animationDuration: "0.9s" }} />
    </div>
  );
}

function VoiceOrb({ phase, level }: { phase: "off" | "recording" | "transcribing"; level: number }) {
  const scale = 1 + level * 0.5;
  return (
    <div className="relative w-24 h-24 flex items-center justify-center mb-2">
      {phase === "recording" && [0, 1, 2].map((i) => (
        <span key={i} className="absolute inset-0 rounded-full border border-primary/40"
          style={{ animation: `pulseDot 2.4s ease-out ${i * 0.8}s infinite`, transform: `scale(${1 + level * 0.3})` }} />
      ))}
      <div className="absolute inset-0 rounded-full"
        style={{
          background: phase === "recording"
            ? "conic-gradient(from 0deg, #ff5e6c, #ff4dcb, #7c5cff, #ff5e6c)"
            : phase === "transcribing"
              ? "conic-gradient(from 0deg, #ffb422, #f59e0b, #ffb422)"
              : "conic-gradient(from 0deg, #7c5cff, #00e5d4, #ff4dcb, #7c5cff)",
          mask: "radial-gradient(circle, transparent 56%, #000 60%)",
          WebkitMask: "radial-gradient(circle, transparent 56%, #000 60%)",
          opacity: phase === "recording" ? 0.85 : phase === "transcribing" ? 0.55 : 0.35,
          animation: "borderRotate 10s linear infinite",
        }} />
      <div className="absolute inset-2 rounded-full blur-2xl"
        style={{
          background: phase === "recording"
            ? "radial-gradient(circle, rgba(255,77,203,0.7), transparent 70%)"
            : phase === "transcribing"
              ? "radial-gradient(circle, rgba(255,180,34,0.55), transparent 70%)"
              : "radial-gradient(circle, rgba(124,92,255,0.55), transparent 70%)",
          opacity: 0.85,
        }} />
      <div className="relative w-14 h-14 rounded-full flex items-center justify-center border border-white/25 transition-all duration-150"
        style={{
          transform: `scale(${scale})`,
          background: phase === "recording"
            ? "linear-gradient(135deg, #ff5e6c, #ff4dcb)"
            : phase === "transcribing"
              ? "linear-gradient(135deg, #ffb422, #f59e0b)"
              : "linear-gradient(135deg, #7c5cff, #00e5d4)",
          boxShadow: phase === "recording"
            ? "0 0 30px rgba(255,77,203,0.8)"
            : phase === "transcribing"
              ? "0 0 26px rgba(255,180,34,0.7)"
              : "0 0 26px rgba(124,92,255,0.7)",
        }}>
        <Mic size={20} className="text-white drop-shadow" />
      </div>
    </div>
  );
}

const VOICE_LABELS: Record<string, string> = {
  kseniya: "Ксения (ж)", xenia: "Ксения 2 (ж)", baya: "Бая (ж)",
  aidar: "Айдар (м)", eugene: "Евгений (м)",
  en_0: "En Female 1", en_1: "En Male 1", en_2: "En Female 2", en_3: "En Male 2",
};

function useSileroVoices(lang: string) {
  const [voices, setVoices] = useState<string[]>([]);
  const [defaultVoice, setDefaultVoice] = useState("kseniya");
  useEffect(() => {
    api.getTtsVoices(lang === "en" ? "en" : "ru")
      .then(({ voices: v, default: d }) => { setVoices(v); setDefaultVoice(d); })
      .catch(() => {});
  }, [lang]);
  return { voices, defaultVoice };
}

type AudioDevice = { deviceId: string; label: string };

function useMicDevices() {
  const [devices, setDevices] = useState<AudioDevice[]>([]);
  const refresh = useCallback(() => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    navigator.mediaDevices.enumerateDevices()
      .then((all) => {
        const mics = all.filter((d) => d.kind === "audioinput").map((d) => ({
          deviceId: d.deviceId,
          label: d.label || (d.deviceId === "default" ? "По умолчанию" : `Микрофон ${d.deviceId.slice(0, 6)}`),
        }));
        setDevices(mics);
      })
      .catch(() => {});
  }, []);
  useEffect(() => { refresh(); }, [refresh]);
  return { devices, refresh };
}

export function OllamaVoiceAssistant({ className }: { className?: string }) {
  const { recognition, settings } = useAppStore();
  const [msgs, setMsgs] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [ttsOn, setTtsOn] = useState(true);
  const [ttsError, setTtsError] = useState<string | null>(null);
  const [ttsPlaying, setTtsPlaying] = useState(false);
  const [selectedVoice, setSelectedVoice] = useState<string>("");
  const [voicePickerOpen, setVoicePickerOpen] = useState(false);
  const [selectedMicId, setSelectedMicId] = useState<string>("default");
  const [micPickerOpen, setMicPickerOpen] = useState(false);
  const [micPhase, setMicPhase] = useState<"off" | "recording" | "transcribing">("off");
  const [micLevel, setMicLevel] = useState(0);
  const [voiceHint, setVoiceHint] = useState<string | null>(null);

  const { voices, defaultVoice } = useSileroVoices(settings.language);
  const activeVoice = selectedVoice || defaultVoice;
  const { devices: micDevices, refresh: refreshMics } = useMicDevices();

  const ttsAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!voicePickerOpen && !micPickerOpen) return;
    const close = (e: MouseEvent) => {
      const target = e.target as Element;
      if (!target.closest("[data-voice-picker]")) setVoicePickerOpen(false);
      if (!target.closest("[data-mic-picker]")) setMicPickerOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [voicePickerOpen, micPickerOpen]);

  const msgsRef = useRef<ChatMsg[]>(msgs);
  const bottomRef = useRef<HTMLDivElement>(null);
  const lastSpokenRef = useRef(0);
  const ttsHydratedRef = useRef(false);

  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const rafRef = useRef(0);
  const maxDurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const peakMicRmsRef = useRef(0);

  useEffect(() => { msgsRef.current = msgs; }, [msgs]);

  useEffect(() => {
    let alive = true;
    void api.getAssistantMessages()
      .then((rows) => {
        if (!alive) return;
        const mapped: ChatMsg[] = rows
          .filter((r) => r.role === "user" || r.role === "assistant")
          .map((r) => ({ role: r.role as "user" | "assistant", content: r.content }));
        if (mapped.length) { msgsRef.current = mapped; setMsgs(mapped); }
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs, loading]);

  const stopRmsLoop = useCallback(() => {
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = 0; }
    setMicLevel(0);
  }, []);

  const disposeMediaGraph = useCallback(() => {
    stopRmsLoop();
    if (maxDurTimerRef.current) { clearTimeout(maxDurTimerRef.current); maxDurTimerRef.current = null; }
    try { analyserRef.current?.disconnect(); } catch { /* */ }
    analyserRef.current = null;
    try { void audioCtxRef.current?.close(); } catch { /* */ }
    audioCtxRef.current = null;
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    mediaStreamRef.current = null;
  }, [stopRmsLoop]);

  useEffect(() => {
    return () => {
      disposeMediaGraph();
      try {
        const r = recorderRef.current;
        recorderRef.current = null;
        if (r && r.state !== "inactive") r.stop();
      } catch { /* */ }
    };
  }, [disposeMediaGraph]);

  const speak = useCallback((text: string) => {
    if (!ttsOn || !text.trim()) return;
    if (text.startsWith("Ошибка:")) return;
    if (ttsAudioRef.current) {
      ttsAudioRef.current.pause();
      ttsAudioRef.current.src = "";
      ttsAudioRef.current = null;
    }
    setTtsError(null);
    setTtsPlaying(true);
    const lang = settings.language === "en" ? "en" : "ru";
    const url = api.synthesizeSpeech(text.slice(0, 800), activeVoice, lang);
    fetch(url)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.text().catch(() => `HTTP ${res.status}`);
          throw new Error(body || `HTTP ${res.status}`);
        }
        return res.blob();
      })
      .then((blob) => {
        const objUrl = URL.createObjectURL(blob);
        const audio = new Audio(objUrl);
        ttsAudioRef.current = audio;
        audio.onended = () => { URL.revokeObjectURL(objUrl); setTtsPlaying(false); };
        audio.onerror = () => { URL.revokeObjectURL(objUrl); setTtsPlaying(false); setTtsError("Ошибка воспроизведения"); };
        return audio.play();
      })
      .catch((e: unknown) => {
        setTtsPlaying(false);
        setTtsError(String((e as Error)?.message || e));
      });
  }, [ttsOn, settings.language, activeVoice]);

  useEffect(() => {
    if (!ttsHydratedRef.current) { ttsHydratedRef.current = true; lastSpokenRef.current = msgs.length; return; }
    const last = msgs[msgs.length - 1];
    if (!last || last.role !== "assistant") return;
    if (msgs.length <= lastSpokenRef.current) return;
    lastSpokenRef.current = msgs.length;
    speak(last.content);
  }, [msgs, speak]);

  const sendWithText = useCallback(async (text: string, opts?: { attachScreen?: boolean }) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;
    const attachScreen = opts?.attachScreen !== false;
    setLoading(true);
    const next: ChatMsg[] = [...msgsRef.current, { role: "user", content: trimmed }];
    msgsRef.current = next;
    setMsgs(next);
    try {
      let image_base64: string | undefined;
      if (attachScreen) {
        await withVisionLock(async () => {
          const shot = await invoke<{ image: string; is_duplicate: boolean }>("capture_screen");
          if (!shot.is_duplicate && shot.image) image_base64 = shot.image;
        });
      }
      const r = await api.assistantChat({
        content: trimmed,
        context_title: recognition?.title,
        context_category: recognition?.category,
        context_screen_text: recognition?.textContent?.trim() || undefined,
        image_base64: image_base64 ?? undefined,
        persist: true,
      });
      setMsgs((prev) => {
        const u: ChatMsg[] = [...prev, { role: "assistant" as const, content: r.reply }];
        msgsRef.current = u;
        return u;
      });
    } catch (e) {
      const err = `Ошибка: ${String((e as Error)?.message || e)}`;
      setMsgs((prev) => {
        const u: ChatMsg[] = [...prev, { role: "assistant" as const, content: err }];
        msgsRef.current = u;
        return u;
      });
    } finally {
      setLoading(false);
    }
  }, [loading, recognition]);

  const send = useCallback(() => {
    const t = input.trim();
    if (!t) return;
    setInput("");
    void sendWithText(t);
  }, [input, sendWithText]);

  const toggleMic = useCallback(async () => {
    if (loading || micPhase === "transcribing") return;
    if (micPhase === "recording") {
      setMicPhase("transcribing");
      try { recorderRef.current?.stop(); } catch { disposeMediaGraph(); setMicPhase("off"); }
      return;
    }
    setVoiceHint(null);
    if (!canCaptureMic()) { setVoiceHint("Браузер не поддерживает запись с микрофона."); return; }
    try {
      const audioConstraints: MediaTrackConstraints = { echoCancellation: true, noiseSuppression: false, autoGainControl: true };
      if (selectedMicId && selectedMicId !== "default") {
        audioConstraints.deviceId = { exact: selectedMicId };
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
      refreshMics();
      mediaStreamRef.current = stream;
      try {
        const mime = pickMediaRecorderMime();
        const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
        chunksRef.current = [];
        rec.ondataavailable = (ev) => { if (ev.data.size > 0) chunksRef.current.push(ev.data); };
        rec.onstop = () => {
          const peakRms = peakMicRmsRef.current;
          peakMicRmsRef.current = 0;
          disposeMediaGraph();
          const blob = new Blob(chunksRef.current, { type: rec.mimeType || mime || "audio/webm" });
          chunksRef.current = [];
          recorderRef.current = null;
          void (async () => {
            if (blob.size < 400) { setVoiceHint("Запись слишком короткая — говорите сразу после нажатия."); setMicPhase("off"); return; }
            if (peakRms < 0.005) { setVoiceHint("Сигнал с микрофона почти не виден. Параметры Windows → Звук → выберите рабочий микрофон по умолчанию."); setMicPhase("off"); return; }
            try {
              const { text } = await api.transcribeAssistantAudio(blob);
              const t = text.trim();
              if (t) { await sendWithText(t, { attachScreen: false }); }
              else { setVoiceHint("Текст не распознан — повторите фразу."); }
            } catch (e) { setVoiceHint(String((e as Error)?.message || e)); }
            finally { setMicPhase("off"); }
          })();
        };
        const ctx = new AudioContext();
        audioCtxRef.current = ctx;
        const src = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        analyserRef.current = analyser;
        src.connect(analyser);
        const buf = new Uint8Array(analyser.fftSize);
        peakMicRmsRef.current = 0;
        const tick = () => {
          if (!analyserRef.current) return;
          analyser.getByteTimeDomainData(buf);
          let s = 0;
          for (let i = 0; i < buf.length; i++) {
            const x = (buf[i]! - 128) / 128;
            s += x * x;
          }
          const rms = Math.sqrt(s / buf.length);
          if (rms > peakMicRmsRef.current) peakMicRmsRef.current = rms;
          setMicLevel(Math.min(1, rms * 5));
          rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
        maxDurTimerRef.current = setTimeout(() => {
          try { if (recorderRef.current && recorderRef.current.state === "recording") { setMicPhase("transcribing"); recorderRef.current.stop(); } } catch { /* */ }
        }, 90_000);
        recorderRef.current = rec;
        rec.start(250);
        setMicPhase("recording");
      } catch (inner) {
        disposeMediaGraph();
        setMicPhase("off");
        setVoiceHint(`Не удалось начать запись: ${String((inner as Error)?.message || inner)}`);
      }
    } catch (e) {
      disposeMediaGraph();
      setMicPhase("off");
      const name = (e as { name?: string }).name;
      if (name === "NotAllowedError" || name === "PermissionDeniedError") setVoiceHint("Доступ к микрофону запрещён: Параметры Windows → Конфиденциальность → Микрофон.");
      else if (name === "NotFoundError") setVoiceHint("Микрофон не найден — выберите устройство по умолчанию в параметрах звука.");
      else setVoiceHint(`Микрофон: ${String((e as Error)?.message || e)}`);
    }
  }, [loading, micPhase, disposeMediaGraph, sendWithText, refreshMics, selectedMicId]);

  const clearHistory = useCallback(() => {
    if (ttsAudioRef.current) { ttsAudioRef.current.pause(); ttsAudioRef.current.src = ""; }
    lastSpokenRef.current = 0;
    msgsRef.current = [];
    setMsgs([]);
    void api.clearAssistantMessages().catch(() => {});
  }, []);

  const listening = micPhase === "recording";
  const transcribing = micPhase === "transcribing";

  return (
    <div className={className ?? "flex-1 flex flex-col min-h-0 mx-3 mb-3 gap-2"}>
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2 px-2 py-1.5 shrink-0 rounded-lg bg-[rgba(15,12,40,0.55)] backdrop-blur border border-white/8">
        <span className="flex items-center gap-1.5 text-[9px] text-text-dim/80 tracking-[0.18em] uppercase font-bold select-none">
          <span className="w-1 h-1 rounded-full bg-accent pulse-dot" />
          AI · RAG · Whisper
        </span>
        <div className="flex items-center gap-1">
          <div className="relative flex items-center" data-voice-picker>
            <button type="button"
              title={ttsOn ? "Выключить озвучку" : "Включить озвучку"}
              onClick={() => {
                if (ttsOn && ttsAudioRef.current) { ttsAudioRef.current.pause(); ttsAudioRef.current.src = ""; }
                setTtsOn((v) => !v); setTtsError(null); setVoicePickerOpen(false);
              }}
              className={`relative h-7 w-7 flex items-center justify-center rounded-l-lg hover:bg-white/8 transition-colors ${ttsError ? "text-rose-400" : ttsPlaying ? "text-primary-light" : "text-text-dim hover:text-text"}`}>
              {ttsOn ? <Volume2 size={13} /> : <VolumeX size={13} />}
              {ttsPlaying && <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-primary-light animate-pulse" />}
            </button>
            {voices.length > 0 && (
              <button type="button" title="Выбрать голос" onClick={() => setVoicePickerOpen((v) => !v)}
                className="h-7 px-1 flex items-center justify-center rounded-r-lg text-text-dim/60 hover:text-text hover:bg-white/8 transition-colors text-[9px] leading-none">▾</button>
            )}
            {voicePickerOpen && voices.length > 0 && (
              <div className="absolute top-full right-0 mt-1 z-50 w-56 rounded-xl border border-white/10 bg-surface-light/95 backdrop-blur-md shadow-xl overflow-hidden">
                <p className="px-3 py-1.5 text-[9px] uppercase tracking-widest text-text-dim/60 border-b border-white/5 select-none">Голос озвучки</p>
                <div className="max-h-48 overflow-y-auto [&::-webkit-scrollbar]:w-[3px] [&::-webkit-scrollbar-thumb]:bg-white/10">
                  {voices.map((v) => (
                    <button key={v} type="button" onClick={() => { setSelectedVoice(v); setVoicePickerOpen(false); }}
                      className={`w-full text-left px-3 py-2 text-[11px] leading-snug transition-colors hover:bg-white/8 ${activeVoice === v ? "text-primary-light" : "text-text/80"}`}>
                      <span className="block font-medium">{VOICE_LABELS[v] ?? v}</span>
                      {activeVoice === v && <span className="block text-[9px] text-primary-light/60">✓ активный</span>}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          {canCaptureMic() && (
            <div className="relative" data-mic-picker>
              <button type="button" title="Выбрать микрофон" onClick={() => { refreshMics(); setMicPickerOpen((v) => !v); }}
                className={`h-7 flex items-center gap-0.5 px-1.5 rounded-lg transition-colors text-[10px] ${selectedMicId !== "default" ? "text-primary-light hover:bg-white/8" : "text-text-dim hover:text-text hover:bg-white/8"}`}>
                <Mic size={11} /><span className="text-[9px]">▾</span>
              </button>
              {micPickerOpen && (
                <div className="absolute top-full right-0 mt-1 z-50 w-64 rounded-xl border border-white/10 bg-surface-light/95 backdrop-blur-md shadow-xl overflow-hidden">
                  <p className="px-3 py-1.5 text-[9px] uppercase tracking-widest text-text-dim/60 border-b border-white/5 select-none">Микрофон</p>
                  <div className="max-h-48 overflow-y-auto [&::-webkit-scrollbar]:w-[3px] [&::-webkit-scrollbar-thumb]:bg-white/10">
                    {micDevices.length === 0 ? (
                      <p className="px-3 py-3 text-[10px] text-text-dim/60">Нет доступных микрофонов</p>
                    ) : micDevices.map((d) => (
                      <button key={d.deviceId} type="button" onClick={() => { setSelectedMicId(d.deviceId); setMicPickerOpen(false); }}
                        className={`w-full text-left px-3 py-2 text-[11px] leading-snug transition-colors hover:bg-white/8 ${selectedMicId === d.deviceId ? "text-primary-light" : "text-text/80"}`}>
                        <span className="block font-medium truncate">{d.label}</span>
                        {selectedMicId === d.deviceId && <span className="block text-[9px] text-primary-light/60">✓ активный</span>}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          <button type="button" title="Очистить историю" onClick={clearHistory}
            className="text-[10px] px-2 py-0.5 rounded-lg text-text-dim hover:text-text hover:bg-white/8 transition-colors">Сброс</button>
        </div>
      </div>

      {ttsError && (
        <p className="text-[10px] text-rose-400/90 leading-snug px-0.5 -mt-1 shrink-0">🔇 {ttsError}</p>
      )}

      {/* Chat area */}
      <div className="flex-1 min-h-[120px] max-h-[min(55vh,420px)] overflow-y-auto flex flex-col gap-2 pr-0.5 [&::-webkit-scrollbar]:w-[3px] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/10">
        {msgs.length === 0 && !loading && (
          <div className="flex-1 flex flex-col items-center justify-center py-6 gap-1 text-center select-none">
            <VoiceOrb phase={micPhase} level={micLevel} />
            <p className="text-[12.5px] font-bold text-gradient-cool tracking-tight">
              {micPhase === "recording" ? "Слушаю…" : micPhase === "transcribing" ? "Распознаю…" : "Спросите что угодно"}
            </p>
            <p className="text-[10px] text-text-dim/70 mt-1 max-w-[200px] leading-relaxed">
              {micPhase === "off" ? "Голос · текст · контекст экрана" : ""}
            </p>
          </div>
        )}

        {msgs.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="flex justify-end">
              <div className="relative max-w-[78%]">
                <div className="absolute -inset-px rounded-2xl rounded-br-sm opacity-70 blur-md"
                  style={{ background: "linear-gradient(135deg, rgba(124,92,255,0.6), rgba(0,229,212,0.45))" }} />
                <div className="relative px-3 py-2 rounded-2xl rounded-br-sm text-[11.5px] leading-relaxed text-white bg-gradient-to-br from-primary via-violet to-accent border border-white/10">
                  {m.content}
                </div>
              </div>
            </div>
          ) : (
            <div key={i} className="flex justify-start">
              <div className="max-w-[86%] px-3 py-2 rounded-2xl rounded-bl-sm text-[11.5px] leading-relaxed text-text/95 bg-[rgba(255,255,255,0.04)] border border-white/10 backdrop-blur-sm">
                {m.content}
              </div>
            </div>
          )
        )}

        {loading && (
          <div className="flex justify-start">
            <div className="px-3 py-2 rounded-2xl rounded-bl-sm bg-[rgba(255,255,255,0.04)] border border-white/10">
              <TypingDots />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input row */}
      <div className="shrink-0 flex flex-col gap-1.5">
        <div className="relative flex gap-1.5 items-center p-1.5 rounded-2xl bg-[rgba(15,12,40,0.7)] border border-white/12 backdrop-blur-xl">
          <input value={input} onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && void send()}
            placeholder={listening ? "Идёт запись…" : transcribing ? "Распознавание…" : "Спроси что-нибудь…"}
            className="flex-1 min-w-0 px-3 py-1.5 bg-transparent text-[12px] text-text placeholder:text-text-dim/50 focus:outline-none disabled:opacity-50"
            disabled={loading || listening || transcribing} />
          {canCaptureMic() && (
            <div className="relative shrink-0">
              {listening && <span className="absolute inset-0 rounded-lg bg-rose-500/25 animate-ping pointer-events-none" />}
              <button type="button"
                title={transcribing ? "Распознавание…" : listening ? "Остановить запись" : "Голос (Whisper)"}
                onClick={() => void toggleMic()} disabled={loading || transcribing}
                className={`relative h-8 w-8 flex items-center justify-center rounded-lg border transition-all ${
                  listening ? "border-rose-400/60 bg-rose-500/25 text-rose-100 shadow-[0_0_18px_-2px_rgba(244,63,94,0.7)]"
                  : transcribing ? "border-amber-400/40 bg-amber-500/15 text-amber-300 cursor-wait"
                  : "border-white/10 bg-white/5 text-text-dim hover:text-text hover:border-white/20"
                }`}>
                <Mic size={13} />
              </button>
            </div>
          )}
          <button type="button" onClick={() => void send()}
            disabled={loading || !input.trim() || listening || transcribing}
            className="relative h-8 w-8 flex items-center justify-center rounded-lg overflow-hidden disabled:opacity-30 disabled:cursor-not-allowed group/send shrink-0"
            title="Отправить">
            <span className="absolute inset-0 bg-gradient-to-br from-primary via-violet to-accent" />
            <span className="absolute inset-0 bg-gradient-to-br from-primary via-violet to-accent opacity-0 group-hover/send:opacity-100 blur-md transition-opacity" />
            <Send size={13} className="relative text-white drop-shadow" />
          </button>
        </div>

        {listening && (
          <div className="flex items-center gap-2 px-0.5">
            <div className="flex-1 h-[3px] rounded-full bg-white/8 overflow-hidden">
              <div className="h-full rounded-full bg-rose-400/80 transition-[width] duration-75" style={{ width: `${Math.round(micLevel * 100)}%` }} />
            </div>
            <span className="text-[9px] text-text-dim/50 shrink-0">REC</span>
          </div>
        )}
        {transcribing && (
          <div className="flex items-center gap-1.5 px-0.5">
            <div className="w-1.5 h-1.5 rounded-full bg-amber-400/80 animate-pulse" />
            <span className="text-[10px] text-text-dim/70">Распознавание…</span>
          </div>
        )}
        {voiceHint && !listening && !transcribing && (
          <p className="text-[10px] text-amber-300/80 leading-snug px-0.5">{voiceHint}</p>
        )}
      </div>
    </div>
  );
}
