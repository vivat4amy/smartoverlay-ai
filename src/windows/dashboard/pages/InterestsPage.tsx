import { useEffect, useMemo, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "@/services/api";
import { RefreshCw, ChevronDown } from "@/components/Icons";

interface TrackInfo { title: string; count: number }
interface ArtistInfo { name: string; track_count: number; play_count: number; tracks: TrackInfo[] }
interface GameInfo { title: string; play_count: number; platform?: string }
interface VideoInfo { title: string; channel?: string; platform?: string; view_count: number }
interface CategoryDetail {
  category: string; name: string; icon: string; total_count: number;
  artists?: ArtistInfo[]; games?: GameInfo[]; videos?: VideoInfo[];
  languages?: TrackInfo[]; frameworks?: TrackInfo[];
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
  } catch {
    _coverCache[key] = "";
    return "";
  }
}

function ArtistCover({ artist, track, size = 48 }: { artist: string; track?: string; size?: number }) {
  const [src, setSrc] = useState("");
  useEffect(() => { fetchCover(artist, track).then(setSrc); }, [artist, track]);
  const s = { width: size, height: size, minWidth: size };
  if (!src) return (
    <div style={s} className="rounded-xl bg-gradient-to-br from-primary/20 to-accent/15 border border-white/10 flex items-center justify-center text-xl shrink-0 select-none">🎵</div>
  );
  return <img src={src} alt={artist} style={s} className="rounded-xl object-cover shrink-0" onError={() => setSrc("")} />;
}

function track_word(n: number) {
  const m = n % 10, h = n % 100;
  if (m === 1 && h !== 11) return "трек";
  if (m >= 2 && m <= 4 && (h < 12 || h > 14)) return "трека";
  return "треков";
}

function MusicSection({ artists }: { artists: ArtistInfo[] }) {
  const [open, setOpen] = useState<string | null>(null);
  if (!artists.length) return (
    <p className="text-text-dim text-sm py-3">Музыкальная активность не обнаружена.</p>
  );
  return (
    <div className="space-y-2">
      {artists.map((a) => (
        <div key={a.name} className="rounded-xl bg-white/[0.03] border border-white/8 overflow-hidden">
          <button className="w-full flex items-center gap-3 p-3 hover:bg-white/5 transition-colors"
            onClick={() => setOpen(open === a.name ? null : a.name)}>
            <ArtistCover artist={a.name} size={44} />
            <div className="flex-1 text-left min-w-0">
              <p className="font-semibold text-text truncate">{a.name}</p>
              <p className="text-xs text-text-dim mt-0.5">{a.track_count} {track_word(a.track_count)} · {a.play_count} прослушиваний</p>
            </div>
            <ChevronDown size={16} className={`text-text-dim transition-transform shrink-0 ${open === a.name ? "rotate-180" : ""}`} />
          </button>
          <AnimatePresence>
            {open === a.name && a.tracks.length > 0 && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.18 }}
                className="overflow-hidden border-t border-white/5">
                <div className="p-2 space-y-0.5">
                  {a.tracks.map((t) => (
                    <div key={t.title} className="flex items-center gap-3 px-2 py-1.5 rounded-lg hover:bg-white/5">
                      <ArtistCover artist={a.name} track={t.title} size={30} />
                      <span className="flex-1 text-sm text-text truncate">{t.title}</span>
                      <span className="text-xs text-text-dim shrink-0">{t.count}×</span>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      ))}
    </div>
  );
}

function GamingSection({ games }: { games: GameInfo[] }) {
  if (!games.length) return <p className="text-text-dim text-sm py-3">Игровая активность не обнаружена.</p>;
  return (
    <div className="space-y-2">
      {games.map((g) => (
        <div key={g.title} className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/8">
          <div className="w-10 h-10 rounded-xl bg-violet-500/15 border border-violet-400/25 flex items-center justify-center text-xl shrink-0">🎮</div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-text truncate">{g.title}</p>
            <p className="text-xs text-text-dim">{[g.platform, `${g.play_count} сессий`].filter(Boolean).join(" · ")}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function VideoSection({ videos }: { videos: VideoInfo[] }) {
  if (!videos.length) return <p className="text-text-dim text-sm py-3">Видео-активность не обнаружена.</p>;
  return (
    <div className="space-y-2">
      {videos.map((v) => (
        <div key={v.title} className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/8">
          <div className="w-10 h-10 rounded-xl bg-rose-500/15 border border-rose-400/25 flex items-center justify-center text-xl shrink-0">🎬</div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-text truncate">{v.title}</p>
            <p className="text-xs text-text-dim">{[v.channel, v.platform, `${v.view_count} просм.`].filter(Boolean).join(" · ")}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function CodingSection({ languages, frameworks }: { languages?: TrackInfo[]; frameworks?: TrackInfo[] }) {
  if (!languages?.length && !frameworks?.length) return <p className="text-text-dim text-sm py-3">Кодинг-активность не обнаружена.</p>;
  return (
    <div className="space-y-4">
      {!!languages?.length && (
        <div>
          <p className="text-[10.5px] text-text-dim uppercase tracking-widest mb-2 font-bold">Языки</p>
          <div className="flex flex-wrap gap-2">
            {languages.map((l) => (
              <span key={l.title} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/15 border border-primary/30 text-primary-light text-sm font-semibold">
                {l.title} <span className="text-text-dim text-xs">{l.count}×</span>
              </span>
            ))}
          </div>
        </div>
      )}
      {!!frameworks?.length && (
        <div>
          <p className="text-[10.5px] text-text-dim uppercase tracking-widest mb-2 font-bold">Фреймворки</p>
          <div className="flex flex-wrap gap-2">
            {frameworks.map((f) => (
              <span key={f.title} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent/15 border border-accent/30 text-accent-light text-sm font-semibold">
                {f.title} <span className="text-text-dim text-xs">{f.count}×</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function CategoryCard({ detail, index }: { detail: CategoryDetail; index: number }) {
  const [open, setOpen] = useState(false);
  const hasDetail =
    (detail.artists?.length ?? 0) > 0 ||
    (detail.games?.length ?? 0) > 0 ||
    (detail.videos?.length ?? 0) > 0 ||
    (detail.languages?.length ?? 0) + (detail.frameworks?.length ?? 0) > 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
      className="glass-card glass-card-hover rounded-2xl overflow-hidden transition-all"
    >
      <button
        className="w-full flex items-center gap-3.5 p-5 hover:bg-white/[0.025] transition-colors"
        onClick={() => setOpen((o) => !o)}
      >
        <div className="relative w-12 h-12 shrink-0">
          <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-primary/30 via-accent/20 to-magenta/30 blur-md opacity-50" />
          <div className="relative w-12 h-12 rounded-xl bg-white/[0.04] border border-white/10 flex items-center justify-center text-2xl">
            {detail.icon}
          </div>
        </div>
        <div className="flex-1 text-left min-w-0">
          <h3 className="font-bold text-text text-[15px] truncate">{detail.name}</h3>
          <p className="text-[11px] text-text-dim mt-1 uppercase tracking-wider font-semibold">
            <span className="text-accent-light">{detail.total_count}</span> обнаружений
          </p>
        </div>
        <ChevronDown size={16} className={`text-text-dim transition-transform shrink-0 ${open ? "rotate-180" : ""}`} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="overflow-hidden border-t border-white/5"
          >
            <div className="p-4">
              {detail.category === "music" && <MusicSection artists={detail.artists ?? []} />}
              {detail.category === "gaming" && <GamingSection games={detail.games ?? []} />}
              {detail.category === "video" && <VideoSection videos={detail.videos ?? []} />}
              {detail.category === "coding" && <CodingSection languages={detail.languages} frameworks={detail.frameworks} />}
              {!hasDetail && (
                <p className="text-text-dim text-sm">Детальные данные накапливаются по мере использования оверлея.</p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export function InterestsPage() {
  const [details, setDetails] = useState<CategoryDetail[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    api.getInterestDetails()
      .then((d) => setDetails(d as CategoryDetail[]))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const totalCount = useMemo(() => details.reduce((s, d) => s + d.total_count, 0), [details]);

  return (
    <div className="space-y-7 pb-14">
      <motion.div
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-3xl glass-card p-7 lg:p-9"
      >
        <div className="pointer-events-none absolute -top-24 -right-20 w-80 h-80 rounded-full bg-accent/30 blur-3xl opacity-60" />
        <div className="pointer-events-none absolute -bottom-28 left-8 w-96 h-96 rounded-full bg-primary/25 blur-3xl opacity-55" />
        <div className="pointer-events-none absolute top-10 left-1/2 w-44 h-44 rounded-full bg-magenta/20 blur-3xl opacity-50 float-soft" />

        <div className="relative flex items-end justify-between gap-6 flex-wrap">
          <div className="min-w-0 flex-1">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 backdrop-blur-md mb-3">
              <span className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-accent-light">
                🎯 Профиль активности
              </span>
            </div>
            <h2 className="text-4xl lg:text-5xl font-black tracking-tight leading-[1.05]">
              <span className="text-gradient-primary">Интересы</span>
            </h2>
            <p className="text-text-dim text-[13.5px] mt-3 max-w-xl leading-relaxed">
              Активность сгруппирована по категориям. Нажми на раздел, чтобы увидеть исполнителей, игры, языки и каналы.
            </p>
            <div className="inline-flex items-center gap-2 mt-5 px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/8">
              <span className="text-[10px] uppercase tracking-[0.18em] text-text-dim font-bold">Всего сигналов</span>
              <span className="text-text font-black text-base tabular-nums">{totalCount}</span>
            </div>
          </div>
          <button
            onClick={load}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/12 text-[12.5px] font-semibold text-text-dim hover:text-text transition-colors shrink-0"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            Обновить
          </button>
        </div>
      </motion.div>

      {loading ? (
        <div className="glass-card rounded-2xl p-12 text-center">
          <div className="w-8 h-8 border-2 border-primary/40 border-t-primary rounded-full animate-spin mx-auto mb-3" />
          <p className="text-text-dim text-sm">Загружаю данные…</p>
        </div>
      ) : details.length > 0 ? (
        <div className="space-y-3">
          {details.map((d, i) => <CategoryCard key={d.category} detail={d} index={i} />)}
        </div>
      ) : (
        <div className="glass-card rounded-2xl p-12 text-center">
          <div className="text-5xl mb-3">🎯</div>
          <p className="text-text font-semibold">Интересы ещё не обнаружены</p>
          <p className="text-text-dim text-sm mt-1.5 max-w-xs mx-auto">
            Пользуйтесь ПК как обычно: оверлей (Ctrl+Alt+T) анализирует экран по расписанию, категории появятся сами.
          </p>
        </div>
      )}
    </div>
  );
}
