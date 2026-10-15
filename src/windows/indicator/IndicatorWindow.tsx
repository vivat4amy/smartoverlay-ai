import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { motion, AnimatePresence } from "framer-motion";
import { useAppStore } from "@/store/appStore";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useVision } from "@/hooks/useVision";
import { api } from "@/services/api";
import { listenPauseSync, togglePauseGlobally } from "@/lib/pauseSync";
import { usePauseFromBackend } from "@/hooks/usePauseFromBackend";
import { useSyncSettingsFromServer } from "@/hooks/useSyncSettingsFromServer";

/**
 * Крошечный неинтерактивный индикатор статуса 28×28.
 *  Зелёный — backend онлайн, провайдер отвечает.
 *  Жёлтый — пауза. Фиолетовый — провайдер Vision не ответил (не путать с паузой).
 *  Красный — нет связи с backend.
 *
 *  Всё окно прозрачно для кликов (set_ignore_cursor_events=true в Rust),
 *  поэтому на иконку нажать нельзя и она не мешает работе с тем,
 *  что под ней. Управление — только через:
 *   - Ctrl+Alt+T — показать/скрыть большую панель оверлея
 *   - Ctrl+Alt+P — пауза / возобновить
 *   - Ctrl+Alt+D — открыть Dashboard
 *   - Системный трей — те же действия из меню.
 */
export function IndicatorWindow() {
  const { isPaused, wsConnected, recognition, settings } = useAppStore();
  const { analyzeScreen } = useVision();
  const [providerOk, setProviderOk] = useState<null | boolean>(null);
  const [pulse, setPulse] = useState(false);
  const [pauseHydrated, setPauseHydrated] = useState(false);
  useWebSocket();
  usePauseFromBackend(1500);
  useSyncSettingsFromServer(12000);

  useEffect(() => {
    document.body.style.background = "transparent";
    document.documentElement.style.background = "transparent";
  }, []);

  useEffect(() => {
    let cancelled = false;
    api
      .getState()
      .then((s) => {
        if (!cancelled) {
          useAppStore.getState().hydratePaused(s.paused);
          setPauseHydrated(true);
        }
      })
      .catch(() => {
        if (!cancelled) setPauseHydrated(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    const ping = () =>
      api
        .testProvider()
        .then((r) => alive && setProviderOk(r.ok))
        .catch(() => alive && setProviderOk(false));
    ping();
    const id = setInterval(ping, 30_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [wsConnected]);

  useEffect(() => {
    const p = listenPauseSync();
    return () => {
      void p.then((un) => un());
    };
  }, []);

  useEffect(() => {
    const us: Array<Promise<() => void>> = [];
    us.push(listen("toggle-pause", () => void togglePauseGlobally()));
    return () => {
      us.forEach((p) => p.then((fn) => fn()).catch(() => {}));
    };
  }, []);

  useEffect(() => {
    if (!pauseHydrated) return;
    if (isPaused) return;

    const sec = Math.max(1, settings.captureIntervalSec);
    let cancelled = false;
    let sleepId: ReturnType<typeof setTimeout> | undefined;

    const pulseAround = async (fn: () => Promise<void>) => {
      setPulse(true);
      try {
        await fn();
      } finally {
        setTimeout(() => setPulse(false), 600);
      }
    };

    const loop = async () => {
      while (!cancelled && !useAppStore.getState().isPaused) {
        await pulseAround(analyzeScreen);
        if (cancelled) break;
        await new Promise<void>((resolve) => {
          sleepId = setTimeout(() => {
            sleepId = undefined;
            resolve();
          }, sec * 1000);
        });
      }
    };

    void loop();

    return () => {
      cancelled = true;
      if (sleepId !== undefined) clearTimeout(sleepId);
    };
  }, [pauseHydrated, isPaused, settings.captureIntervalSec, analyzeScreen]);

  useEffect(() => {
    if (recognition) {
      setPulse(true);
      const t = setTimeout(() => setPulse(false), 500);
      return () => clearTimeout(t);
    }
  }, [recognition]);

  const status = computeStatus({ wsConnected, isPaused, providerOk });

  return (
    <div
      className="w-[28px] h-[28px] flex items-center justify-center select-none pointer-events-none"
      style={{ background: "transparent" }}
      title={status.label}
    >
      <div className="relative w-[14px] h-[14px]">
        <motion.div
          animate={
            pulse
              ? { scale: [1, 1.25, 1], opacity: [0.9, 1, 0.9] }
              : { scale: [1, 1.06, 1] }
          }
          transition={{
            duration: pulse ? 0.6 : 2.6,
            repeat: pulse ? 0 : Infinity,
            ease: "easeInOut",
          }}
          className="w-full h-full rounded-full"
          style={{
            background: status.color,
            boxShadow: `0 0 10px ${status.glow}, 0 0 3px ${status.glow}, inset 0 1px 1px rgba(255,255,255,0.5)`,
          }}
        />
        <AnimatePresence>
          {pulse && (
            <motion.div
              initial={{ scale: 1, opacity: 0.6 }}
              animate={{ scale: 1.9, opacity: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.6, ease: "easeOut" }}
              className="absolute inset-0 rounded-full border-[1.5px]"
              style={{ borderColor: status.glow }}
            />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

interface Status {
  label: string;
  color: string;
  glow: string;
}

function computeStatus({
  wsConnected,
  isPaused,
  providerOk,
}: {
  wsConnected: boolean;
  isPaused: boolean;
  providerOk: boolean | null;
}): Status {
  if (isPaused) {
    return { label: "пауза", color: "#f59e0b", glow: "rgba(245,158,11,0.65)" };
  }
  if (!wsConnected) {
    return {
      label: "нет связи с backend",
      color: "#ef4444",
      glow: "rgba(239,68,68,0.7)",
    };
  }
  if (providerOk === false) {
    return {
      label: "провайдер Vision не отвечает (ключ / сеть)",
      color: "#c084fc",
      glow: "rgba(192,132,252,0.7)",
    };
  }
  return {
    label: "всё работает",
    color: "#10b981",
    glow: "rgba(16,185,129,0.7)",
  };
}
