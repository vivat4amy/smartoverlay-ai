import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { invoke } from "@tauri-apps/api/core";
import {
  Pause,
  Play,
  LayoutDashboard,
  ScanSearch,
  MousePointer2,
  MousePointerClick,
} from "@/components/Icons";
import { TipCard } from "./TipCard";
import { RecognitionBadge } from "./RecognitionBadge";
import { AssistantPanel } from "./AssistantPanel";
import { OllamaVoiceAssistant } from "./OllamaVoiceAssistant";
import { useAppStore } from "@/store/appStore";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useVision } from "@/hooks/useVision";
import { api } from "@/services/api";
import { listenPauseSync, togglePauseGlobally } from "@/lib/pauseSync";
import { useSyncSettingsFromServer } from "@/hooks/useSyncSettingsFromServer";

export function OverlayWindow() {
  const { tips, recognition, isPaused, settings, wsConnected } = useAppStore();
  const ollamaMode = settings.visionProvider === "ollama";
  const { analyzeScreen } = useVision();
  const [interactive, setInteractive] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [pauseHydrated, setPauseHydrated] = useState(false);
  useWebSocket();
  useSyncSettingsFromServer(12000);

  useEffect(() => { document.body.style.background = "transparent"; }, []);

  useEffect(() => {
    let cancelled = false;
    api.getState()
      .then((s) => {
        if (!cancelled) {
          useAppStore.getState().hydratePaused(s.paused);
          setPauseHydrated(true);
        }
      })
      .catch(() => { if (!cancelled) setPauseHydrated(true); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    invoke("set_overlay_clickthrough", { ignore: !interactive }).catch(() => {});
  }, [interactive]);

  useEffect(() => {
    const p = listenPauseSync();
    return () => { void p.then((un) => un()); };
  }, []);

  useEffect(() => {
    if (!pauseHydrated || isPaused) return;
    const sec = Math.max(1, settings.captureIntervalSec);
    let cancelled = false;
    let sleepId: ReturnType<typeof setTimeout> | undefined;
    const loop = async () => {
      while (!cancelled && !useAppStore.getState().isPaused) {
        await analyzeScreen();
        if (cancelled) break;
        await new Promise<void>((resolve) => {
          sleepId = setTimeout(() => { sleepId = undefined; resolve(); }, sec * 1000);
        });
      }
    };
    void loop();
    return () => { cancelled = true; if (sleepId !== undefined) clearTimeout(sleepId); };
  }, [pauseHydrated, isPaused, settings.captureIntervalSec, analyzeScreen]);

  const openDashboard = () => invoke("toggle_dashboard").catch(() => {});
  const togglePause = () => void togglePauseGlobally();

  return (
    <div
      className="relative w-full h-full flex flex-col"
      style={{ opacity: settings.overlayOpacity }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <FloatingParticles active={!isPaused && wsConnected} />

      <motion.header
        onMouseEnter={() => setInteractive(true)}
        onMouseLeave={() => setInteractive(false)}
        animate={{ opacity: isHovered || isPaused ? 1 : 0.72 }}
        transition={{ duration: 0.22, ease: "easeOut" }}
        className="relative mx-3 mt-3 mb-2 select-none z-10"
      >
        <motion.div
          animate={{ opacity: isHovered ? 0.9 : 0.55 }}
          className="absolute -inset-[2px] rounded-2xl pointer-events-none"
          style={{
            background:
              "linear-gradient(135deg, rgba(124,92,255,0.65), rgba(0,229,212,0.55), rgba(255,77,203,0.6), rgba(124,92,255,0.65))",
            backgroundSize: "300% 300%",
            animation: "gradientShift 6s ease-in-out infinite",
            filter: "blur(6px)",
          }}
        />
        <div className="relative rounded-2xl overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-[rgba(15,12,40,0.94)] via-[rgba(12,10,35,0.94)] to-[rgba(15,12,40,0.94)] backdrop-blur-2xl" />
          <div className="absolute inset-0 border border-white/14 rounded-2xl pointer-events-none" />
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/35 to-transparent" />

          <div className="relative px-3.5 py-2.5 flex items-center gap-2.5">
            <div className="flex items-center gap-2.5 flex-1 min-w-0">
              <div className="relative w-7 h-7 shrink-0">
                <motion.div
                  animate={{ rotate: isPaused ? 0 : 360 }}
                  transition={{ duration: 12, repeat: isPaused ? 0 : Infinity, ease: "linear" }}
                  className="absolute inset-0 rounded-lg"
                  style={{
                    background: wsConnected
                      ? "conic-gradient(from 0deg, #7c5cff, #00e5d4, #ff4dcb, #7c5cff)"
                      : "conic-gradient(from 0deg, #ff5e6c, #b91c1c, #ff5e6c)",
                    filter: "blur(8px)",
                    opacity: 0.7,
                  }}
                />
                <div
                  className={`relative w-7 h-7 rounded-lg ${
                    wsConnected
                      ? "bg-gradient-to-br from-primary via-violet to-accent"
                      : "bg-gradient-to-br from-rose-500 to-rose-700"
                  } flex items-center justify-center border border-white/20`}
                >
                  <span className="text-white text-[11px] font-black leading-none drop-shadow">S</span>
                </div>
              </div>

              <div className="flex flex-col leading-none min-w-0">
                <span className="text-[11.5px] font-bold tracking-tight text-text/95 truncate">
                  SmartOverlay
                </span>
                <span className="text-[8.5px] uppercase tracking-[0.18em] text-text-dim/75 mt-0.5 font-semibold">
                  {isPaused ? "пауза" : wsConnected ? "live · scanning" : "offline"}
                </span>
              </div>

              {isPaused && (
                <motion.span
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-amber-400/15 text-amber-300 border border-amber-400/30 font-black"
                >
                  pause
                </motion.span>
              )}
            </div>

            <div className="flex items-center gap-1">
              <IconBtn
                label={isPaused ? "Возобновить (Ctrl+Alt+P)" : "Пауза (Ctrl+Alt+P)"}
                onClick={togglePause}
                accent={isPaused ? "amber" : "default"}
              >
                {isPaused ? <Play size={13} /> : <Pause size={13} />}
              </IconBtn>
              <IconBtn label="Открыть панель (Ctrl+Alt+D)" onClick={openDashboard}>
                <LayoutDashboard size={13} />
              </IconBtn>
              <IconBtn
                label={interactive ? "Click-through выключен" : "Click-through включён"}
                onClick={() => {}}
                disabled
                accent={interactive ? "primary" : "default"}
              >
                {interactive ? <MousePointerClick size={13} /> : <MousePointer2 size={13} />}
              </IconBtn>
            </div>
          </div>

          {!isPaused && wsConnected && (
            <div className="relative h-px overflow-hidden">
              <div
                className="absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-accent/90 to-transparent"
                style={{ animation: "shimmer 2.6s linear infinite" }}
              />
            </div>
          )}
        </div>
      </motion.header>

      <div className="flex-1 px-3 pb-3 flex flex-col gap-2 overflow-y-auto relative z-10">
        <AnimatePresence>
          {recognition && (
            <motion.div
              key={recognition.title + recognition.category}
              initial={{ opacity: 0, y: -16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -16, scale: 0.96 }}
              transition={{ duration: 0.3 }}
              className={isPaused ? "opacity-85" : ""}
            >
              <RecognitionBadge data={recognition} />
            </motion.div>
          )}
        </AnimatePresence>

        {ollamaMode ? (
          <OllamaVoiceAssistant />
        ) : (
          <>
            <AnimatePresence>
              {tips.map((tip, i) => (
                <motion.div
                  key={tip.id}
                  layout
                  initial={{ opacity: 0, x: -28, scale: 0.95 }}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  exit={{ opacity: 0, x: 28, scale: 0.95 }}
                  transition={{ duration: 0.25, delay: i * 0.04 }}
                  className={isPaused ? "opacity-80" : ""}
                >
                  <TipCard tip={tip} />
                </motion.div>
              ))}
            </AnimatePresence>
            {!isPaused && tips.length === 0 && !recognition && <EmptyHero />}
            <AssistantPanel />
          </>
        )}
      </div>
    </div>
  );
}

function IconBtn({
  children, onClick, label, accent = "default", disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  label: string;
  accent?: "default" | "primary" | "amber";
  disabled?: boolean;
}) {
  const styles: Record<string, string> = {
    default: "text-text-dim hover:text-text hover:bg-white/8 border-white/0 hover:border-white/10",
    primary: "text-primary-light bg-primary/15 hover:bg-primary/25 border-primary/30 shadow-[0_0_12px_-2px_rgba(124,92,255,0.5)]",
    amber: "text-amber-300 bg-amber-400/15 hover:bg-amber-400/25 border-amber-400/30",
  };
  return (
    <button
      onClick={onClick}
      title={label}
      disabled={disabled}
      className={`relative h-7 w-7 flex items-center justify-center rounded-lg border transition-all duration-200 outline-none ${styles[accent]} ${disabled ? "opacity-70 cursor-default" : "cursor-pointer"}`}
    >
      {children}
    </button>
  );
}

function FloatingParticles({ active }: { active: boolean }) {
  if (!active) return null;
  const orbs = [
    { x: "15%", y: "12%", s: 120, c: "rgba(124,92,255,0.18)", d: 14 },
    { x: "70%", y: "18%", s: 90, c: "rgba(0,229,212,0.16)", d: 18 },
    { x: "30%", y: "60%", s: 140, c: "rgba(255,77,203,0.14)", d: 22 },
    { x: "80%", y: "70%", s: 100, c: "rgba(56,225,255,0.16)", d: 16 },
    { x: "50%", y: "85%", s: 110, c: "rgba(124,92,255,0.12)", d: 20 },
  ];
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden z-0">
      {orbs.map((o, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full"
          style={{ left: o.x, top: o.y, width: o.s, height: o.s, background: o.c, filter: "blur(40px)" }}
          animate={{ x: [0, 30, -20, 0], y: [0, -25, 15, 0] }}
          transition={{ duration: o.d, repeat: Infinity, ease: "easeInOut" }}
        />
      ))}
    </div>
  );
}

function EmptyHero() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex-1 flex flex-col items-center justify-center text-center px-6 py-10 relative"
    >
      <div className="relative w-28 h-28 mb-6 flex items-center justify-center">
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className="absolute inset-0 rounded-full border border-primary/30"
            animate={{ scale: [1, 1.6, 1.6], opacity: [0.6, 0, 0] }}
            transition={{ duration: 2.8, repeat: Infinity, delay: i * 0.9, ease: "easeOut" }}
          />
        ))}
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 12, repeat: Infinity, ease: "linear" }}
          className="absolute inset-0 rounded-full"
          style={{
            background: "conic-gradient(from 0deg, rgba(124,92,255,0.85), rgba(0,229,212,0.75), rgba(255,77,203,0.7), rgba(124,92,255,0.85))",
            mask: "radial-gradient(circle, transparent 58%, #000 60%)",
            WebkitMask: "radial-gradient(circle, transparent 58%, #000 60%)",
          }}
        />
        <div className="absolute inset-3 rounded-full bg-gradient-to-br from-primary/50 via-accent/35 to-magenta/40 blur-2xl opacity-70" />
        <motion.div
          animate={{ scale: [1, 1.08, 1] }}
          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
          className="relative w-14 h-14 rounded-full bg-gradient-to-br from-primary via-violet to-accent flex items-center justify-center border border-white/25"
          style={{ boxShadow: "0 0 40px rgba(124,92,255,0.6)" }}
        >
          <ScanSearch size={22} className="text-white drop-shadow" />
        </motion.div>
      </div>
      <p className="text-[14px] text-text font-bold tracking-tight">
        <span className="text-gradient-cool">SmartOverlay</span> следит за экраном
      </p>
      <p className="text-[11px] text-text-dim mt-2.5">
        Анализ идёт в фоне · подсказки появятся автоматически
      </p>
      <div className="mt-5 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/8">
        <kbd className="kbd">Ctrl</kbd>
        <span className="text-text-dim/50 text-[10px]">+</span>
        <kbd className="kbd">Alt</kbd>
        <span className="text-text-dim/50 text-[10px]">+</span>
        <kbd className="kbd">D</kbd>
        <span className="text-text-dim/70 text-[10.5px] ml-1">Dashboard</span>
      </div>
    </motion.div>
  );
}
