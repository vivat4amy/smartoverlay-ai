import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  Pause,
  Play,
  LayoutDashboard,
  ScanSearch,
  RefreshCw,
} from "@/components/Icons";
// ScanSearch остаётся — только для пустого/Paused hero, кнопки больше нет.
import { TipCard } from "@/windows/overlay/TipCard";
import { RecognitionBadge } from "@/windows/overlay/RecognitionBadge";
import { OllamaVoiceAssistant } from "@/windows/overlay/OllamaVoiceAssistant";
import { useAppStore, type Recognition } from "@/store/appStore";
import { useWebSocket } from "@/hooks/useWebSocket";
import { api } from "@/services/api";
import { listenPauseSync, togglePauseGlobally } from "@/lib/pauseSync";
import { usePauseFromBackend } from "@/hooks/usePauseFromBackend";
import { useSyncSettingsFromServer } from "@/hooks/useSyncSettingsFromServer";

// ── iTunes album art ──────────────────────────────────────────────────────────

const _coverCache: Record<string, string> = {};

async function fetchCover(artist: string, track?: string): Promise<string> {
  const key = `${artist}__${track ?? ""}`;
  if (_coverCache[key] !== undefined) return _coverCache[key];
  try {
    const q = encodeURIComponent(track ? `${artist} ${track}` : artist);
    const res = await fetch(
      `https://itunes.apple.com/search?term=${q}&media=music&entity=song&limit=1`,
    );
    const data = await res.json() as { results?: Array<{ artworkUrl100?: string }> };
    const art = data.results?.[0]?.artworkUrl100?.replace("100x100bb", "300x300bb") ?? "";
    _coverCache[key] = art;
    return art;
  } catch {
    _coverCache[key] = "";
    return "";
  }
}

// ── Now Playing Card ──────────────────────────────────────────────────────────

function NowPlayingCard({ rec }: { rec: Recognition }) {
  const artist = rec.entity?.artist ?? "";
  const track  = rec.entity?.track ?? "";
  const platform = rec.entity?.platform ?? "";
  const embeddedCover = rec.entity?.cover_url ?? "";
  const [cover, setCover] = useState(embeddedCover);

  useEffect(() => {
    if (embeddedCover) {
      setCover(embeddedCover);
      return;
    }
    if (artist) fetchCover(artist, track || undefined).then(setCover);
  }, [artist, track, embeddedCover]);

  const platformLabel: Record<string, string> = {
    spotify: "Spotify", youtube: "YouTube Music", yandex_music: "Яндекс.Музыка",
    vk_music: "VK Музыка", apple_music: "Apple Music", soundcloud: "SoundCloud",
    audd: "Распознано по звуку",
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="relative rounded-2xl overflow-hidden border border-emerald-500/30 bg-gradient-to-br from-emerald-500/20 to-emerald-500/5"
    >
      {/* Blurred cover background */}
      {cover && (
        <div
          className="absolute inset-0 opacity-10 bg-cover bg-center"
          style={{ backgroundImage: `url(${cover})`, filter: "blur(8px)", transform: "scale(1.1)" }}
        />
      )}
      <div className="relative flex items-center gap-3 p-3">
        {/* Album art */}
        <div className="shrink-0">
          {cover ? (
            <img src={cover} alt={artist} className="w-12 h-12 rounded-xl object-cover shadow-lg" />
          ) : (
            <div className="w-12 h-12 rounded-xl bg-emerald-500/20 flex items-center justify-center text-2xl">
              🎵
            </div>
          )}
        </div>
        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className="text-[9px] uppercase tracking-widest text-emerald-400 font-semibold">
              ♫ Сейчас играет
            </span>
            {platform && (
              <span className="text-[9px] text-emerald-400/60">
                · {platformLabel[platform] ?? platform}
              </span>
            )}
          </div>
          {track ? (
            <>
              <p className="text-sm font-semibold text-white leading-tight truncate">{track}</p>
              <p className="text-xs text-emerald-300/80 truncate mt-0.5">{artist}</p>
            </>
          ) : (
            <p className="text-sm font-semibold text-white leading-tight truncate">{artist}</p>
          )}
        </div>
        {/* Animated equalizer */}
        <div className="shrink-0 flex items-end gap-[3px] h-5">
          {[0.6, 1, 0.4, 0.8, 0.5].map((h, i) => (
            <motion.div
              key={i}
              className="w-[3px] rounded-full bg-emerald-400"
              animate={{ scaleY: [h, 1, h * 0.7, 1, h] }}
              transition={{ repeat: Infinity, duration: 0.8 + i * 0.15, ease: "easeInOut" }}
              style={{ originY: 1, height: "100%" }}
            />
          ))}
        </div>
      </div>
    </motion.div>
  );
}

// ── Mini Recommendations ──────────────────────────────────────────────────────

interface Rec {
  id: string;
  title: string;
  description: string;
  category: string;
  icon: string;
  url?: string | null;
  accent?: string | null;
}

const REC_COLORS: Record<string, string> = {
  music:         "from-purple-500/15 to-purple-500/5 border-purple-500/20",
  gaming:        "from-green-500/15  to-green-500/5  border-green-500/20",
  entertainment: "from-rose-500/15   to-rose-500/5   border-rose-500/20",
  video:         "from-rose-500/15   to-rose-500/5   border-rose-500/20",
  coding:        "from-blue-500/15   to-blue-500/5   border-blue-500/20",
  browsing:      "from-cyan-500/15   to-cyan-500/5   border-cyan-500/20",
  social:        "from-amber-500/15  to-amber-500/5  border-amber-500/20",
  general:       "from-white/8       to-white/3      border-white/10",
};

function MiniRecommendations() {
  const [recs, setRecs] = useState<Rec[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    api.getRecommendations()
      .then((d) => setRecs((d as Rec[]).slice(0, 4)))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (!recs.length && !loading) return null;

  return (
    <div className="rounded-xl border border-white/8 overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-white/5 transition-colors"
      >
        <span className="text-[10px] uppercase tracking-widest text-text-dim font-semibold">
          ✨ Рекомендации
        </span>
        <div className="flex items-center gap-1.5">
          <button
            onClick={(e) => { e.stopPropagation(); load(); }}
            className="text-text-dim hover:text-text transition-colors"
            title="Обновить"
          >
            <RefreshCw size={10} className={loading ? "animate-spin" : ""} />
          </button>
          <span className="text-text-dim/60 text-[10px]">{open ? "▲" : "▼"}</span>
        </div>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 pt-1 space-y-2 border-t border-white/5">
              {loading ? (
                <div className="flex items-center justify-center py-3">
                  <div className="w-4 h-4 border border-primary/40 border-t-primary rounded-full animate-spin" />
                </div>
              ) : (
                recs.map((rec) => {
                  const handleOpen = () => {
                    if (!rec.url) return;
                    void openUrl(rec.url).catch(() => {});
                  };
                  return (
                    <div
                      key={rec.id}
                      onClick={rec.url ? handleOpen : undefined}
                      className={`rounded-2xl px-3.5 py-3 border bg-gradient-to-br ${REC_COLORS[rec.category] ?? REC_COLORS.general} ${rec.url ? "cursor-pointer hover:border-white/25 transition-colors" : ""}`}
                    >
                      <div className="flex items-start gap-2.5">
                        <span className="text-base shrink-0 mt-0.5 leading-none">{rec.icon}</span>
                        <div className="min-w-0 pt-px">
                          <p className="text-xs font-semibold text-text leading-snug">{rec.title}</p>
                          <p className="text-[10px] text-text-dim mt-1 leading-relaxed line-clamp-3">
                            {rec.description}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Context Info ──────────────────────────────────────────────────────────────

function ContextInfo({ rec }: { rec: Recognition }) {
  const e = rec.entity;
  if (!e) return null;

  const items: Array<{ label: string; value: string }> = [];
  if (rec.category === "browsing") {
    if (e.site_name) items.push({ label: "Сайт", value: e.site_name });
    if (e.url)       items.push({ label: "URL",  value: e.url.replace(/^https?:\/\//, "").split("/")[0] });
  } else if (rec.category === "gaming") {
    if (e.game_title) items.push({ label: "Игра", value: e.game_title });
    if (e.platform)   items.push({ label: "Платф.", value: e.platform });
  } else if (rec.category === "video") {
    if (e.channel)     items.push({ label: "Канал", value: e.channel });
    if (e.video_title) items.push({ label: "Видео", value: e.video_title.slice(0, 40) });
  } else if (rec.category === "coding") {
    if (e.language)  items.push({ label: "Язык",     value: e.language });
    if (e.framework) items.push({ label: "Фреймворк", value: e.framework });
  }

  if (!items.length) return null;

  return (
    <div className="flex flex-wrap gap-1 px-0.5">
      {items.map(({ label, value }) => (
        <span key={label} className="text-[10px] flex items-center gap-1 bg-white/5 rounded-md px-2 py-0.5 border border-white/8">
          <span className="text-text-dim">{label}:</span>
          <span className="text-text/80 font-medium truncate max-w-[120px]">{value}</span>
        </span>
      ))}
    </div>
  );
}

// ── Main Panel ────────────────────────────────────────────────────────────────

export function PanelWindow() {
  const { tips, recognition, isPaused, wsConnected, settings } = useAppStore();
  const ollamaMode = settings.visionProvider === "ollama";
  useWebSocket();
  usePauseFromBackend(1500);
  useSyncSettingsFromServer(12000);

  useEffect(() => {
    document.body.style.background = "transparent";
  }, []);

  useEffect(() => {
    api
      .getState()
      .then((s) => useAppStore.getState().hydratePaused(s.paused))
      .catch(() => {});
  }, []);

  useEffect(() => {
    invoke("resize_panel", {
      width: settings.panelWidth,
      height: settings.panelHeight,
    }).catch(() => {});
  }, [settings.panelWidth, settings.panelHeight]);

  useEffect(() => {
    const p = listenPauseSync();
    return () => {
      void p.then((un) => un());
    };
  }, []);

  const openDashboard = () => invoke("toggle_dashboard").catch(() => {});
  const closePanel    = () => invoke("toggle_panel").catch(() => {});
  const togglePause   = () => void togglePauseGlobally();

  const hasTrackInfo = !!(recognition?.entity?.artist || recognition?.entity?.track);
  const isMusic =
    recognition?.category === "music" && hasTrackInfo;

  return (
    <div
      className="w-screen h-screen flex flex-col rounded-2xl overflow-hidden"
      style={{
        opacity: settings.overlayOpacity,
        background:
          "linear-gradient(180deg, rgba(22,22,48,0.92) 0%, rgba(11,11,26,0.92) 100%)",
        border: "1px solid rgba(255,255,255,0.10)",
        backdropFilter: "blur(18px)",
        boxShadow: "0 12px 48px rgba(0,0,0,0.45)",
      }}
    >
      {/* Header */}
      <header
        data-tauri-drag-region
        className="px-3 h-10 flex items-center gap-2 border-b border-white/5 select-none cursor-grab active:cursor-grabbing shrink-0"
      >
        <div
          className={`w-2 h-2 rounded-full shrink-0 ${
            wsConnected ? "bg-emerald-400 shadow-glow-green" : "bg-rose-400"
          }`}
        />
        <span
          data-tauri-drag-region
          className="text-xs font-semibold text-text/90 truncate"
        >
          SmartOverlay
        </span>
        {recognition?.category && (
          <CategoryBadge category={recognition.category} />
        )}
        <span className="flex-1" data-tauri-drag-region />
        {isPaused && (
          <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-amber-400/15 text-amber-300 border border-amber-400/30">
            пауза
          </span>
        )}
        <HeaderBtn label={isPaused ? "Запустить" : "Пауза"} onClick={togglePause}>
          {isPaused ? <Play size={13} /> : <Pause size={13} />}
        </HeaderBtn>
        <HeaderBtn label="Dashboard (Ctrl+Alt+D)" onClick={openDashboard}>
          <LayoutDashboard size={13} />
        </HeaderBtn>
        <HeaderBtn label="Скрыть (Ctrl+Alt+T)" onClick={closePanel}>
          ✕
        </HeaderBtn>
      </header>

      {/* Content */}
      <div className="flex-1 px-3 py-3 flex flex-col gap-2 overflow-y-auto min-h-0">
        <AnimatePresence mode="wait">
          {/* Now Playing (music) */}
          {isMusic && recognition ? (
            <motion.div
              key="now-playing"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className={isPaused ? "opacity-85" : ""}
            >
              <NowPlayingCard rec={recognition} />
            </motion.div>
          ) : recognition ? (
            <motion.div
              key={recognition.title + recognition.category}
              initial={{ opacity: 0, y: -12, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -12, scale: 0.97 }}
              transition={{ duration: 0.25 }}
              className={isPaused ? "opacity-85" : ""}
            >
              <RecognitionBadge data={recognition} />
            </motion.div>
          ) : null}
        </AnimatePresence>

        {/* Context details (URL, game name, etc.) */}
        {recognition && recognition.category !== "music" && (
          <ContextInfo rec={recognition} />
        )}

        {ollamaMode ? (
          <OllamaVoiceAssistant className="flex-1 flex flex-col min-h-0 gap-2" />
        ) : (
          <>
            {/* Tips */}
            <AnimatePresence>
              {tips.map((tip, i) => (
                <motion.div
                  key={tip.id}
                  layout
                  initial={{ opacity: 0, x: -22, scale: 0.96 }}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  exit={{ opacity: 0, x: 22, scale: 0.96 }}
                  transition={{ duration: 0.22, delay: i * 0.03 }}
                  className={isPaused ? "opacity-80" : ""}
                >
                  <TipCard tip={tip} />
                </motion.div>
              ))}
            </AnimatePresence>

            {!isPaused && tips.length === 0 && !recognition && <EmptyHero />}

            {/* Mini recommendations */}
            <div className="mt-auto pt-2">
              <MiniRecommendations />
            </div>
          </>
        )}
      </div>

      {/* Resize indicator */}
      <div className="absolute bottom-1 right-1.5 text-text-dim/40 text-[10px] pointer-events-none">
        ◢
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function HeaderBtn({
  children, onClick, label, active,
}: {
  children: React.ReactNode;
  onClick: () => void;
  label: string;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={`h-6 w-6 flex items-center justify-center rounded-md text-[11px] transition-all duration-150 ${
        active
          ? "bg-primary text-white shadow-glow-primary"
          : "text-text-dim hover:text-text hover:bg-white/10"
      }`}
    >
      {children}
    </button>
  );
}

const CATEGORY_BADGE: Record<string, { label: string; className: string }> = {
  gaming:        { label: "Игры",    className: "bg-green-500/15 text-green-300 border-green-500/25" },
  coding:        { label: "Код",     className: "bg-blue-500/15 text-blue-300 border-blue-500/25" },
  video:         { label: "Видео",   className: "bg-rose-500/15 text-rose-300 border-rose-500/25" },
  music:         { label: "Музыка",  className: "bg-purple-500/15 text-purple-300 border-purple-500/25" },
  browsing:      { label: "Браузер", className: "bg-cyan-500/15 text-cyan-300 border-cyan-500/25" },
  social:        { label: "Соцсети", className: "bg-amber-500/15 text-amber-300 border-amber-500/25" },
  entertainment: { label: "Кино",    className: "bg-rose-500/15 text-rose-300 border-rose-500/25" },
};

function CategoryBadge({ category }: { category: string }) {
  const meta = CATEGORY_BADGE[category];
  if (!meta) return null;
  return (
    <span
      className={`shrink-0 text-[9px] px-1.5 py-0.5 rounded-md border font-medium tracking-wide ${meta.className}`}
    >
      {meta.label}
    </span>
  );
}

function EmptyHero() {
  return (
    <div className="flex flex-col items-center justify-center text-center px-4 py-6">
      <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary/30 to-accent/30 border border-white/10 flex items-center justify-center mb-3 shadow-glow-primary">
        <ScanSearch size={22} className="text-primary-light" />
      </div>
      <p className="text-sm text-text/85 font-medium">SmartOverlay следит за экраном</p>
      <p className="text-xs text-text-dim mt-1.5">
        <kbd className="kbd">Ctrl</kbd>+<kbd className="kbd">Alt</kbd>+<kbd className="kbd">D</kbd>
        {" "}— Dashboard ·{" "}
        <kbd className="kbd">Ctrl</kbd>+<kbd className="kbd">Alt</kbd>+<kbd className="kbd">P</kbd>
        {" "}— пауза
      </p>
    </div>
  );
}
