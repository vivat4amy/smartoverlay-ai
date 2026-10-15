import { useEffect, useState, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link, useParams } from "react-router-dom";
import { api } from "@/services/api";
import { History as HistoryIcon, RefreshCw, Search, ExternalLink } from "@/components/Icons";

interface Entity {
  artist?: string; track?: string; album?: string; game_title?: string;
  video_title?: string; channel?: string; platform?: string; url?: string;
  site_name?: string; language?: string; framework?: string; name?: string;
}
interface HistoryEntry {
  id: string; title: string; subtitle?: string; category: string;
  icon: string; confidence: number; timestamp: string; entity?: Entity;
  text_content?: string; url?: string | null;
}

function parseHistoryTimestamp(iso: string): Date {
  const s = iso.trim();
  if (!s) return new Date(NaN);
  if (/[zZ]$|[+-]\d{2}:\d{2}$|[+-]\d{2}$/.test(s)) return new Date(s);
  const noMs = s.replace(/\.\d+$/, "");
  return new Date(noMs.endsWith("Z") ? noMs : `${noMs}Z`);
}
function formatHistoryTime(iso: string): string {
  return parseHistoryTimestamp(iso).toLocaleString("ru-RU", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

const _coverCache: Record<string, string> = {};
async function fetchCover(artist: string, track?: string): Promise<string> {
  const key = `${artist}__${track ?? ""}`;
  if (_coverCache[key] !== undefined) return _coverCache[key];
  try {
    const q = encodeURIComponent(track ? `${artist} ${track}` : artist);
    const res = await fetch(`https://itunes.apple.com/search?term=${q}&media=music&entity=song&limit=1`);
    const data = await res.json();
    const art: string = data.results?.[0]?.artworkUrl100?.replace("100x100bb", "300x300bb") ?? "";
    _coverCache[key] = art;
    return art;
  } catch { _coverCache[key] = ""; return ""; }
}
function MusicCover({ artist, track }: { artist: string; track?: string }) {
  const [src, setSrc] = useState("");
  useEffect(() => { fetchCover(artist, track).then(setSrc); }, [artist, track]);
  if (!src) return (
    <div className="w-11 h-11 rounded-xl bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center text-lg shrink-0">🎵</div>
  );
  return <img src={src} alt={artist} className="w-11 h-11 rounded-xl object-cover shrink-0 shadow-md shadow-black/30" onError={() => setSrc("")} />;
}

const CAT_STYLE: Record<string, { bg: string; text: string; badge: string; tint: string; iconBg: string }> = {
  music:     { bg: "border-emerald-400/20 bg-gradient-to-br from-emerald-500/8 to-transparent", text: "text-emerald-200", badge: "bg-emerald-500/20 text-emerald-200 border-emerald-400/30", tint: "from-emerald-400 to-teal-400",     iconBg: "bg-emerald-500/20" },
  gaming:    { bg: "border-violet-400/20 bg-gradient-to-br from-violet-500/8 to-transparent",   text: "text-violet-200",  badge: "bg-violet-500/20 text-violet-200 border-violet-400/30",    tint: "from-violet-400 to-fuchsia-400",   iconBg: "bg-violet-500/20" },
  video:     { bg: "border-rose-400/20 bg-gradient-to-br from-rose-500/8 to-transparent",       text: "text-rose-200",    badge: "bg-rose-500/20 text-rose-200 border-rose-400/30",          tint: "from-rose-400 to-fuchsia-400",     iconBg: "bg-rose-500/20" },
  coding:    { bg: "border-sky-400/20 bg-gradient-to-br from-sky-500/8 to-transparent",         text: "text-sky-200",     badge: "bg-sky-500/20 text-sky-200 border-sky-400/30",             tint: "from-sky-400 to-indigo-400",       iconBg: "bg-sky-500/20" },
  social:    { bg: "border-amber-400/20 bg-gradient-to-br from-amber-500/8 to-transparent",     text: "text-amber-200",   badge: "bg-amber-500/20 text-amber-200 border-amber-400/30",       tint: "from-amber-400 to-orange-400",     iconBg: "bg-amber-500/20" },
  browsing:  { bg: "border-cyan-400/20 bg-gradient-to-br from-cyan-500/8 to-transparent",       text: "text-cyan-200",    badge: "bg-cyan-500/20 text-cyan-200 border-cyan-400/30",          tint: "from-cyan-400 to-blue-400",        iconBg: "bg-cyan-500/20" },
  documents: { bg: "border-orange-400/20 bg-gradient-to-br from-orange-500/8 to-transparent",   text: "text-orange-200",  badge: "bg-orange-500/20 text-orange-200 border-orange-400/30",    tint: "from-orange-400 to-amber-400",     iconBg: "bg-orange-500/20" },
  general:   { bg: "border-white/10 bg-white/3",                                                text: "text-text-dim",    badge: "bg-white/10 text-text-dim border-white/10",                tint: "from-slate-400 to-zinc-400",       iconBg: "bg-white/5" },
};

const CAT_LABELS: Record<string, string> = {
  music: "Музыка", gaming: "Игры", video: "Видео", coding: "Код",
  social: "Соцсети", browsing: "Браузинг", documents: "Документы",
  general: "Общее", all: "Вся история",
};

const CAT_DESCRIPTIONS: Record<string, string> = {
  music: "Все распознанные треки и исполнители. Клик — открыть в Spotify.",
  gaming: "Игровые сессии — клик переходит в Steam-поиск.",
  video: "YouTube и Twitch — клик ведёт на канал или поиск видео.",
  coding: "Контекст IDE: языки и фреймворки.",
  social: "Соцсети и мессенджеры.",
  browsing: "Сайты — клик открывает исходный URL.",
  documents: "Документы и заметки.",
  general: "Все остальные распознавания.",
};

function HistoryCard({ entry, index }: { entry: HistoryEntry; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const style = CAT_STYLE[entry.category] ?? CAT_STYLE.general;
  const hasMusic = entry.category === "music" && entry.entity?.artist;
  const hasDetails = !!entry.text_content || !!entry.entity;
  const time = formatHistoryTime(entry.timestamp);

  const openExternal = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!entry.url) return;
    try { window.open(entry.url, "_blank", "noopener,noreferrer"); } catch { /* */ }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.012, 0.25) }}
      className={`rounded-2xl border ${style.bg} transition-all group hover:shadow-lg hover:shadow-black/20`}
    >
      <div className="px-4 py-3.5 flex items-center gap-3 cursor-pointer hover:bg-white/5 transition-colors rounded-2xl"
        onClick={() => hasDetails && setExpanded((e) => !e)}>
        {hasMusic ? (
          <MusicCover artist={entry.entity!.artist!} track={entry.entity?.track} />
        ) : (
          <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-lg shrink-0 ${style.iconBg}`}>
            {entry.icon}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-text truncate">{entry.title}</p>
          {entry.subtitle && (
            <p className={`text-xs mt-0.5 truncate ${style.text} opacity-90`}>{entry.subtitle}</p>
          )}
        </div>
        {entry.url && (
          <button onClick={openExternal} title="Открыть"
            className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center bg-white/5 hover:bg-white/15 border border-white/10 ${style.text} transition-colors opacity-0 group-hover:opacity-100`}>
            <ExternalLink size={13} />
          </button>
        )}
        <div className="flex flex-col items-end gap-1 shrink-0 min-w-[120px]">
          <span className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-md font-semibold border ${style.badge}`}>
            {CAT_LABELS[entry.category] ?? entry.category}
          </span>
          <span className="text-[11px] text-text-dim tabular-nums">{time}</span>
        </div>
      </div>
      <AnimatePresence>
        {expanded && hasDetails && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden border-t border-white/5"
          >
            <div className="px-4 py-3 space-y-2">
              {entry.entity && (
                <div className="flex flex-wrap gap-2">
                  {Object.entries(entry.entity).map(([k, v]) => {
                    if (!v || v === "null") return null;
                    const labels: Record<string, string> = {
                      artist: "Исполнитель", track: "Трек", album: "Альбом",
                      game_title: "Игра", video_title: "Видео", channel: "Канал",
                      platform: "Платформа", url: "URL", site_name: "Сайт",
                      language: "Язык", framework: "Фреймворк", name: "Название",
                    };
                    const label = labels[k];
                    if (!label) return null;
                    return (
                      <span key={k} className="flex items-center gap-1 text-xs bg-white/5 rounded-lg px-2.5 py-1 border border-white/5">
                        <span className="text-text-dim">{label}:</span>
                        <span className="text-text font-medium truncate max-w-[220px]">{String(v)}</span>
                      </span>
                    );
                  })}
                </div>
              )}
              {entry.text_content && (
                <p className="text-xs text-text-dim leading-relaxed line-clamp-3 bg-white/3 rounded-lg px-3 py-2 border border-white/5">
                  {entry.text_content}
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export function HistoryPage() {
  const { cat: catParam } = useParams<{ cat?: string }>();
  const activeCat = catParam && CAT_LABELS[catParam] && catParam !== "all" ? catParam : null;

  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    api.getHistory(300)
      .then((d) => setHistory(d as HistoryEntry[]))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    let list = activeCat ? history.filter((h) => h.category === activeCat) : history;
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter((h) =>
        h.title.toLowerCase().includes(q) ||
        (h.subtitle ?? "").toLowerCase().includes(q),
      );
    }
    return list;
  }, [history, activeCat, query]);

  const catCounts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const h of history) map[h.category] = (map[h.category] ?? 0) + 1;
    return map;
  }, [history]);

  return (
    <div className="space-y-7 pb-14">
      {activeCat ? (
        <CategoryHero cat={activeCat} count={catCounts[activeCat] ?? 0} onReload={load} loading={loading} />
      ) : (
        <GlobalHero total={history.length} counts={catCounts} onReload={load} loading={loading} />
      )}

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-dim" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск по названию, исполнителю, сайту..."
            className="w-full pl-10 pr-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm text-text placeholder-text-dim/70 focus:outline-none focus:border-primary/50 transition-colors"
          />
        </div>
      </div>

      {loading ? (
        <div className="glass-card rounded-2xl p-12 text-center">
          <div className="w-8 h-8 border-2 border-primary/40 border-t-primary rounded-full animate-spin mx-auto mb-3" />
          <p className="text-text-dim text-sm">Загружаю историю…</p>
        </div>
      ) : filtered.length > 0 ? (
        <div className="space-y-2.5">
          {filtered.map((entry, i) => <HistoryCard key={entry.id} entry={entry} index={i} />)}
        </div>
      ) : (
        <div className="glass-card rounded-2xl p-12 text-center">
          <div className="inline-flex w-14 h-14 rounded-2xl bg-white/5 items-center justify-center mb-3">
            <HistoryIcon size={26} className="text-text-dim" />
          </div>
          <p className="text-text font-semibold">
            {history.length === 0 ? "История пуста" : query ? "Ничего не найдено" : "Нет записей в категории"}
          </p>
          <p className="text-text-dim text-sm mt-1.5 max-w-md mx-auto">
            Анализ идёт автоматически в фоне. Откройте оверлей (Ctrl+Alt+T) или дождитесь следующего цикла.
          </p>
        </div>
      )}
    </div>
  );
}

function GlobalHero({ total, counts, onReload, loading }: { total: number; counts: Record<string, number>; onReload: () => void; loading: boolean }) {
  const topCats = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);
  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative overflow-hidden rounded-3xl glass-card p-7 lg:p-9"
    >
      <div className="pointer-events-none absolute -top-24 -right-20 w-80 h-80 rounded-full bg-cyan-400/30 blur-3xl opacity-60" />
      <div className="pointer-events-none absolute -bottom-28 left-8 w-96 h-96 rounded-full bg-primary/25 blur-3xl opacity-55" />
      <div className="pointer-events-none absolute top-12 right-1/3 w-44 h-44 rounded-full bg-accent/20 blur-3xl opacity-50 float-soft" />

      <div className="relative flex items-end justify-between gap-6 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 backdrop-blur-md mb-3">
            <span className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-cyan-300">📜 Лента событий</span>
          </div>
          <h2 className="text-4xl lg:text-5xl font-black tracking-tight leading-[1.05]">
            <span className="text-gradient-primary">История</span>
          </h2>
          <p className="text-text-dim text-[13.5px] mt-3 max-w-xl leading-relaxed">
            Полная лента активности. Карточки кликабельны: треки → Spotify, сайты → исходный URL, каналы → YouTube/Twitch.
          </p>
          <div className="flex items-center gap-2 flex-wrap mt-5">
            <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/8 text-[10px] uppercase tracking-[0.18em] text-text-dim font-bold">
              Всего записей
              <span className="text-text font-black text-base tabular-nums">{total}</span>
            </span>
            {topCats.map(([cat, c]) => {
              const s = CAT_STYLE[cat] ?? CAT_STYLE.general;
              return (
                <Link key={cat} to={`/dashboard/history/${cat}`}
                  className={`text-[11px] px-2.5 py-1 rounded-md font-semibold tabular-nums border transition-colors ${s.badge} hover:opacity-90`}>
                  {CAT_LABELS[cat] ?? cat} · {c}
                </Link>
              );
            })}
          </div>
        </div>
        <button onClick={onReload}
          className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/12 text-[12.5px] font-semibold text-text-dim hover:text-text transition-colors shrink-0">
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />Обновить
        </button>
      </div>
    </motion.div>
  );
}

function CategoryHero({ cat, count, onReload, loading }: { cat: string; count: number; onReload: () => void; loading: boolean }) {
  const style = CAT_STYLE[cat] ?? CAT_STYLE.general;
  const label = CAT_LABELS[cat] ?? cat;
  const description = CAT_DESCRIPTIONS[cat] ?? "";

  return (
    <div className="relative overflow-hidden rounded-3xl glass-card p-7 lg:p-9">
      <div className={`pointer-events-none absolute -top-24 -right-20 w-80 h-80 rounded-full bg-gradient-to-br ${style.tint} blur-3xl opacity-40`} />
      <div className={`pointer-events-none absolute -bottom-28 left-8 w-96 h-96 rounded-full bg-gradient-to-br ${style.tint} blur-3xl opacity-30`} />

      <div className="relative flex items-start justify-between gap-6 flex-wrap">
        <div className="flex items-start gap-4 min-w-0 flex-1">
          <div className="relative shrink-0">
            <div className={`absolute inset-0 rounded-2xl bg-gradient-to-br ${style.tint} blur-lg opacity-60`} />
            <div className={`relative w-16 h-16 rounded-2xl bg-gradient-to-br ${style.tint} flex items-center justify-center text-3xl border border-white/20 shadow-lg`}>
              <span aria-hidden>📜</span>
            </div>
          </div>
          <div className="min-w-0">
            <Link to="/dashboard/history"
              className="inline-flex items-center text-[10.5px] uppercase tracking-[0.18em] text-text-dim/85 hover:text-text transition-colors font-semibold">
              ← История
            </Link>
            <h2 className="text-4xl lg:text-5xl font-black tracking-tight mt-1 leading-[1.05]">
              <span className="text-gradient-primary">{label}</span>
            </h2>
            {description && (
              <p className="text-text-dim text-[13.5px] mt-3 max-w-2xl leading-relaxed">{description}</p>
            )}
            <div className="inline-flex items-center gap-2 mt-5 px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/8">
              <span className="text-[10px] uppercase tracking-[0.18em] text-text-dim font-bold">Записей</span>
              <span className="text-text font-black text-base tabular-nums">{count}</span>
            </div>
          </div>
        </div>
        <button onClick={onReload}
          className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/12 text-[12.5px] font-semibold text-text-dim hover:text-text transition-colors shrink-0">
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />Обновить
        </button>
      </div>
    </div>
  );
}
