import { useEffect, useMemo, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { Link, useParams } from "react-router-dom";
import { api } from "@/services/api";
import { ExternalLink, RefreshCw } from "@/components/Icons";

interface Rec {
  id: string;
  title: string;
  description: string;
  category: string;
  icon: string;
  subcategory?: string | null;
  subcategory_label?: string | null;
  url?: string | null;
  accent?: string | null;
}

const CAT_META: Record<string, { label: string; icon: string; subtitle: string; tint: string }> = {
  music:         { label: "Музыка",      icon: "🎧", subtitle: "Spotify-треки, альбомы и новые исполнители на основе ваших прослушиваний",  tint: "from-fuchsia-400 to-emerald-400" },
  entertainment: { label: "Развлечения", icon: "📺", subtitle: "YouTube, Twitch и стриминги — то, что вы реально смотрите",                  tint: "from-rose-400 to-fuchsia-400" },
  gaming:        { label: "Игры",        icon: "🎮", subtitle: "Похожие тайтлы и сообщества по играм, которые вы запускаете",                 tint: "from-emerald-400 to-cyan-400" },
  coding:        { label: "Разработка",  icon: "💻", subtitle: "Документация, курсы и YouTube по языкам, с которыми вы работаете",            tint: "from-sky-400 to-indigo-400" },
  browsing:      { label: "Браузинг",    icon: "🌐", subtitle: "Альтернативные сайты и инструменты под ваш стиль чтения",                     tint: "from-cyan-400 to-blue-400" },
  social:        { label: "Соцсети",     icon: "💬", subtitle: "Меньше шума — больше фокуса",                                                  tint: "from-amber-400 to-rose-400" },
  general:       { label: "Общее",       icon: "✨", subtitle: "",                                                                             tint: "from-slate-400 to-zinc-400" },
};

const CAT_ORDER = ["music", "entertainment", "gaming", "coding", "browsing", "social", "general"];

const ACCENT: Record<string, { cardBg: string; border: string; hoverBorder: string; iconBg: string; iconText: string; badge: string; chip: string }> = {
  spotify: { cardBg: "from-emerald-500/12 via-emerald-500/4 to-transparent", border: "border-emerald-400/25", hoverBorder: "hover:border-emerald-300/60", iconBg: "bg-emerald-500/20", iconText: "text-emerald-200", badge: "bg-emerald-400/15 text-emerald-200 border-emerald-300/30", chip: "Spotify" },
  youtube: { cardBg: "from-rose-500/12 via-rose-500/4 to-transparent",       border: "border-rose-400/25",    hoverBorder: "hover:border-rose-300/60",    iconBg: "bg-rose-500/20",    iconText: "text-rose-200",    badge: "bg-rose-400/15 text-rose-200 border-rose-300/30",          chip: "YouTube" },
  twitch:  { cardBg: "from-fuchsia-500/12 via-purple-500/4 to-transparent",  border: "border-fuchsia-400/25", hoverBorder: "hover:border-fuchsia-300/60", iconBg: "bg-fuchsia-500/20", iconText: "text-fuchsia-200", badge: "bg-fuchsia-400/15 text-fuchsia-200 border-fuchsia-300/30",  chip: "Twitch" },
  netflix: { cardBg: "from-red-500/12 via-red-500/4 to-transparent",         border: "border-red-400/25",     hoverBorder: "hover:border-red-300/60",     iconBg: "bg-red-500/20",     iconText: "text-red-200",     badge: "bg-red-400/15 text-red-200 border-red-300/30",              chip: "Стриминг" },
  steam:   { cardBg: "from-sky-500/12 via-sky-500/4 to-transparent",         border: "border-sky-400/25",     hoverBorder: "hover:border-sky-300/60",     iconBg: "bg-sky-500/20",     iconText: "text-sky-200",     badge: "bg-sky-400/15 text-sky-200 border-sky-300/30",              chip: "Steam" },
  reddit:  { cardBg: "from-orange-500/12 via-orange-500/4 to-transparent",   border: "border-orange-400/25",  hoverBorder: "hover:border-orange-300/60",  iconBg: "bg-orange-500/20",  iconText: "text-orange-200",  badge: "bg-orange-400/15 text-orange-200 border-orange-300/30",     chip: "Reddit" },
  web:     { cardBg: "from-cyan-500/12 via-cyan-500/4 to-transparent",       border: "border-cyan-400/25",    hoverBorder: "hover:border-cyan-300/60",    iconBg: "bg-cyan-500/20",    iconText: "text-cyan-200",    badge: "bg-cyan-400/15 text-cyan-200 border-cyan-300/30",           chip: "Web" },
  code:    { cardBg: "from-indigo-500/12 via-indigo-500/4 to-transparent",   border: "border-indigo-400/25",  hoverBorder: "hover:border-indigo-300/60",  iconBg: "bg-indigo-500/20",  iconText: "text-indigo-200",  badge: "bg-indigo-400/15 text-indigo-200 border-indigo-300/30",     chip: "Docs" },
  warn:    { cardBg: "from-amber-500/12 via-amber-500/4 to-transparent",     border: "border-amber-400/25",   hoverBorder: "hover:border-amber-300/60",   iconBg: "bg-amber-500/20",   iconText: "text-amber-200",   badge: "bg-amber-400/15 text-amber-200 border-amber-300/30",        chip: "Фокус" },
  default: { cardBg: "from-white/8 via-white/3 to-transparent",              border: "border-white/10",       hoverBorder: "hover:border-white/25",       iconBg: "bg-white/8",        iconText: "text-text",         badge: "bg-white/8 text-text/80 border-white/10",                   chip: "" },
};

function accentOf(rec: Rec) {
  return ACCENT[rec.accent ?? ""] ?? ACCENT.default;
}

export function RecommendationsPage() {
  const { cat: catParam } = useParams<{ cat?: string }>();
  const activeCat = catParam && CAT_META[catParam] ? catParam : null;

  const [recs, setRecs] = useState<Rec[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    api.getRecommendations()
      .then((d) => setRecs(d as Rec[]))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const grouped = useMemo(() => {
    const cats: Record<string, { order: string[]; subs: Record<string, { label: string; items: Rec[] }> }> = {};
    for (const r of recs) {
      const cat = r.category || "general";
      if (!cats[cat]) cats[cat] = { order: [], subs: {} };
      const subKey = r.subcategory ?? "_default";
      const subLabel = r.subcategory_label ?? "Подборка";
      if (!cats[cat].subs[subKey]) {
        cats[cat].subs[subKey] = { label: subLabel, items: [] };
        cats[cat].order.push(subKey);
      }
      cats[cat].subs[subKey].items.push(r);
    }
    return cats;
  }, [recs]);

  const orderedCats = useMemo(() => {
    const known = CAT_ORDER.filter((c) => grouped[c]);
    const extras = Object.keys(grouped).filter((c) => !CAT_ORDER.includes(c));
    if (activeCat) return known.filter((c) => c === activeCat);
    return [...known, ...extras];
  }, [grouped, activeCat]);

  const totalsByCat = useMemo(() => {
    const map: Record<string, number> = {};
    for (const c of Object.keys(grouped)) {
      map[c] = grouped[c].order.reduce((acc, k) => acc + grouped[c].subs[k].items.length, 0);
    }
    return map;
  }, [grouped]);

  return (
    <div className="space-y-7 pb-14">
      {activeCat ? (
        <CategoryHero cat={activeCat} count={totalsByCat[activeCat] ?? 0} onReload={load} loading={loading} />
      ) : (
        <GlobalHero onReload={load} loading={loading} totals={totalsByCat} />
      )}

      {loading ? (
        <div className="glass-card rounded-2xl p-12 text-center">
          <div className="w-8 h-8 border-2 border-primary/40 border-t-primary rounded-full animate-spin mx-auto mb-3" />
          <p className="text-text-dim text-sm">Генерирую рекомендации…</p>
        </div>
      ) : orderedCats.length > 0 ? (
        <div className="space-y-10">
          {orderedCats.map((cat) => {
            const meta = CAT_META[cat] ?? CAT_META.general;
            const group = grouped[cat];
            const total = totalsByCat[cat] ?? 0;
            return (
              <section key={cat} className="space-y-5">
                {!activeCat && (
                  <CategoryHeader label={meta.label} subtitle={meta.subtitle} icon={meta.icon} tint={meta.tint} count={total} catPath={cat} />
                )}
                <div className="space-y-7">
                  {group.order.map((subKey) => {
                    const sub = group.subs[subKey];
                    return (
                      <div key={subKey}>
                        <div className="flex items-center gap-2 mb-3">
                          <span className="h-px flex-1 bg-gradient-to-r from-white/15 to-transparent" />
                          <span className="text-[11px] uppercase tracking-widest text-text-dim font-bold whitespace-nowrap">{sub.label}</span>
                          <span className="text-[10px] text-text-dim/60 tabular-nums">{sub.items.length}</span>
                          <span className="h-px flex-[3] bg-gradient-to-l from-white/15 to-transparent" />
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                          {sub.items.map((rec, i) => (
                            <RecCard key={rec.id} rec={rec} index={i} />
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <div className="glass-card rounded-2xl p-12 text-center">
          <div className="text-5xl mb-3">✨</div>
          <p className="text-text font-semibold">
            {activeCat ? "Здесь пока пусто" : "Рекомендаций пока нет"}
          </p>
          <p className="text-text-dim text-sm mt-1.5 max-w-md mx-auto">
            {activeCat
              ? "Распознаваний по этой категории ещё не накопилось. Пользуйтесь приложениями этой темы — карточки появятся здесь."
              : "Используйте оверлей для накопления профиля активности — рекомендации появятся автоматически."}
          </p>
        </div>
      )}
    </div>
  );
}

function GlobalHero({ onReload, loading, totals }: { onReload: () => void; loading: boolean; totals: Record<string, number> }) {
  const sumAll = Object.values(totals).reduce((a, b) => a + b, 0);
  return (
    <div className="relative overflow-hidden rounded-3xl glass-card p-7 lg:p-9">
      <div className="pointer-events-none absolute -top-24 -right-20 w-80 h-80 rounded-full bg-primary/30 blur-3xl opacity-60" />
      <div className="pointer-events-none absolute -bottom-28 left-8 w-96 h-96 rounded-full bg-accent/25 blur-3xl opacity-55" />
      <div className="pointer-events-none absolute top-12 right-1/3 w-44 h-44 rounded-full bg-magenta/20 blur-3xl opacity-50 float-soft" />
      <div className="relative flex items-start justify-between gap-6 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 backdrop-blur-md mb-3">
            <span className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-primary-light">
              ✨ Рекомендации
            </span>
          </div>
          <h2 className="text-4xl lg:text-5xl font-black tracking-tight leading-[1.05]">
            <span className="text-gradient-primary">Подборки</span>
            <span className="block text-text/90 text-2xl lg:text-3xl font-bold mt-1">на основе твоей активности</span>
          </h2>
          <p className="text-text-dim text-[13.5px] mt-3 max-w-2xl leading-relaxed">
            Треки в Spotify, каналы YouTube и Twitch, похожие игры и ресурсы по языкам — карточки кликабельны и открываются в браузере.
          </p>
          <div className="inline-flex items-center gap-2 mt-5 px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/8">
            <span className="text-[10px] uppercase tracking-[0.18em] text-text-dim font-bold">Всего подборок</span>
            <span className="text-text font-black text-base tabular-nums">{sumAll}</span>
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

function CategoryHero({ cat, count, onReload, loading }: { cat: string; count: number; onReload: () => void; loading: boolean }) {
  const meta = CAT_META[cat] ?? CAT_META.general;
  return (
    <div className="relative overflow-hidden rounded-3xl glass-card p-7 lg:p-9">
      <div className={`pointer-events-none absolute -top-24 -right-20 w-80 h-80 rounded-full bg-gradient-to-br ${meta.tint} blur-3xl opacity-40`} />
      <div className={`pointer-events-none absolute -bottom-28 left-8 w-96 h-96 rounded-full bg-gradient-to-br ${meta.tint} blur-3xl opacity-30`} />
      <div className="relative flex items-start justify-between gap-6 flex-wrap">
        <div className="flex items-start gap-4 min-w-0 flex-1">
          <div className="relative shrink-0">
            <div className={`absolute inset-0 rounded-2xl bg-gradient-to-br ${meta.tint} blur-lg opacity-60`} />
            <div className={`relative w-16 h-16 rounded-2xl bg-gradient-to-br ${meta.tint} flex items-center justify-center text-3xl border border-white/20 shadow-lg`}>
              <span aria-hidden>{meta.icon}</span>
            </div>
          </div>
          <div className="min-w-0">
            <Link to="/dashboard/recommendations"
              className="inline-flex items-center text-[10.5px] uppercase tracking-[0.18em] text-text-dim/85 hover:text-text transition-colors font-semibold">
              ← Рекомендации
            </Link>
            <h2 className="text-4xl lg:text-5xl font-black tracking-tight mt-1 leading-[1.05]">
              <span className="text-gradient-primary">{meta.label}</span>
            </h2>
            <p className="text-text-dim text-[13.5px] mt-3 max-w-2xl leading-relaxed">{meta.subtitle}</p>
            <div className="inline-flex items-center gap-2 mt-5 px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/8">
              <span className="text-[10px] uppercase tracking-[0.18em] text-text-dim font-bold">Подборок</span>
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

function CategoryHeader({ label, subtitle, icon, tint, count, catPath }: { label: string; subtitle: string; icon: string; tint: string; count: number; catPath?: string }) {
  return (
    <div className="flex items-end justify-between gap-3 flex-wrap">
      <div className="flex items-center gap-3 min-w-0">
        <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${tint} flex items-center justify-center text-2xl shadow-lg shadow-black/20 shrink-0 border border-white/15`}>
          <span aria-hidden>{icon}</span>
        </div>
        <div className="min-w-0">
          <h3 className="text-xl font-bold text-text leading-tight">{label}</h3>
          {subtitle && <p className="text-xs text-text-dim mt-0.5 leading-snug">{subtitle}</p>}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {catPath && (
          <Link to={`/dashboard/recommendations/${catPath}`}
            className="text-[10px] uppercase tracking-widest text-text-dim hover:text-text font-bold px-2.5 py-1 rounded-md bg-white/5 hover:bg-white/10 border border-white/10 transition-colors">
            Открыть раздел →
          </Link>
        )}
        <span className="text-[10px] uppercase tracking-widest text-text-dim font-bold px-2 py-1 rounded-md bg-white/5 border border-white/10 tabular-nums">
          {count} {count === 1 ? "подборка" : "подборок"}
        </span>
      </div>
    </div>
  );
}

function RecCard({ rec, index }: { rec: Rec; index: number }) {
  const a = accentOf(rec);
  const clickable = Boolean(rec.url);
  const onClick = () => {
    if (rec.url) {
      try { window.open(rec.url, "_blank", "noopener,noreferrer"); } catch { /* */ }
    }
  };
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03, duration: 0.2 }}
      onClick={clickable ? onClick : undefined}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : -1}
      onKeyDown={(e) => { if (clickable && (e.key === "Enter" || e.key === " ")) onClick(); }}
      className={`group relative rounded-2xl p-4 border ${a.border} ${a.hoverBorder} bg-gradient-to-br ${a.cardBg} backdrop-blur-md transition-all ${clickable ? "cursor-pointer hover:shadow-lg hover:shadow-black/30" : ""}`}
    >
      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 rounded-xl ${a.iconBg} flex items-center justify-center text-lg shrink-0 border border-white/10`}>
          {rec.icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-text leading-tight truncate">{rec.title}</p>
          <p className="text-[12px] text-text-dim mt-1 leading-snug line-clamp-2">{rec.description}</p>
          <div className="flex items-center gap-1.5 mt-2.5">
            {a.chip && (
              <span className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-md font-bold border ${a.badge}`}>
                {a.chip}
              </span>
            )}
            {rec.url && (
              <span className={`flex items-center gap-1 text-[10px] ${a.iconText} opacity-70 group-hover:opacity-100 transition-opacity`}>
                <ExternalLink size={10} />Открыть
              </span>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
