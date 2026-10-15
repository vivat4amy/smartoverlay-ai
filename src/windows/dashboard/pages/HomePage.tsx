import { useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { useAppStore } from "@/store/appStore";
import { api } from "@/services/api";
import {
  Eye, Target, Lightbulb, Activity, Sparkles, ChevronRight,
  LayoutDashboard, RefreshCw, Settings as SettingsIcon, Cpu,
} from "@/components/Icons";
import { togglePauseGlobally } from "@/lib/pauseSync";

const CATEGORY_EMOJI: Record<string, string> = {
  gaming: "🎮", video: "🎬", music: "🎵", coding: "💻",
  social: "💬", browsing: "🌐", documents: "📄", general: "💡",
};

const CATEGORY_LABEL: Record<string, string> = {
  gaming: "Игры", video: "Видео", music: "Музыка", coding: "Код",
  social: "Соцсети", browsing: "Браузинг", documents: "Документы", general: "Общее",
};

const CATEGORY_ACCENT: Record<string, { text: string; bar: string; bg: string; border: string }> = {
  music:     { text: "text-emerald-300", bar: "from-emerald-400 to-teal-400",  bg: "bg-emerald-500/15", border: "border-emerald-400/30" },
  gaming:    { text: "text-violet-300",  bar: "from-violet-400 to-fuchsia-400", bg: "bg-violet-500/15",  border: "border-violet-400/30" },
  video:     { text: "text-rose-300",    bar: "from-rose-400 to-orange-400",    bg: "bg-rose-500/15",    border: "border-rose-400/30" },
  coding:    { text: "text-sky-300",     bar: "from-sky-400 to-indigo-400",     bg: "bg-sky-500/15",     border: "border-sky-400/30" },
  social:    { text: "text-amber-300",   bar: "from-amber-400 to-orange-400",   bg: "bg-amber-500/15",   border: "border-amber-400/30" },
  browsing:  { text: "text-cyan-300",    bar: "from-cyan-400 to-blue-400",      bg: "bg-cyan-500/15",    border: "border-cyan-400/30" },
  documents: { text: "text-orange-300",  bar: "from-orange-400 to-amber-400",   bg: "bg-orange-500/15",  border: "border-orange-400/30" },
  general:   { text: "text-text-dim",    bar: "from-slate-400 to-zinc-400",     bg: "bg-white/8",        border: "border-white/15" },
};

type StatColor = "primary" | "accent" | "amber" | "magenta";
interface StatDef {
  label: string; hint: string; value: number;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  color: StatColor;
}

const STAT_STYLES: Record<StatColor, { text: string; glow: string; iconBg: string; iconBorder: string; chip: string; bar: string }> = {
  primary: { text: "text-primary-light", glow: "shadow-[0_10px_40px_-16px_rgba(124,92,255,0.7)]",  iconBg: "bg-gradient-to-br from-primary/40 to-violet/15",     iconBorder: "border-primary/45",       chip: "bg-primary/15 text-primary-light border-primary/30", bar: "from-primary via-violet to-accent" },
  accent:  { text: "text-accent-light",  glow: "shadow-[0_10px_40px_-16px_rgba(0,229,212,0.65)]",  iconBg: "bg-gradient-to-br from-accent/40 to-cyan/15",        iconBorder: "border-accent/45",        chip: "bg-accent/15 text-accent-light border-accent/30",    bar: "from-accent via-cyan to-primary-light" },
  amber:   { text: "text-amber-300",     glow: "shadow-[0_10px_40px_-16px_rgba(248,180,0,0.6)]",   iconBg: "bg-gradient-to-br from-amber-400/40 to-orange-400/15", iconBorder: "border-amber-400/45",   chip: "bg-amber-400/15 text-amber-300 border-amber-400/30", bar: "from-amber-400 via-orange-400 to-rose-400" },
  magenta: { text: "text-magenta-light", glow: "shadow-[0_10px_40px_-16px_rgba(255,77,203,0.65)]", iconBg: "bg-gradient-to-br from-magenta/40 to-fuchsia-400/15", iconBorder: "border-magenta/45",     chip: "bg-magenta/15 text-magenta-light border-magenta/30", bar: "from-magenta via-fuchsia-400 to-primary-light" },
};

export function HomePage() {
  const { tips, interests, history, setInterests, setHistory, isPaused, wsConnected, settings } = useAppStore();

  useEffect(() => {
    api.getInterests().then(setInterests).catch(() => {});
    api.getHistory(50).then(setHistory).catch(() => {});
  }, [setInterests, setHistory]);

  const categoryStats = useMemo(() => {
    const map: Record<string, number> = {};
    for (const h of history) map[h.category] = (map[h.category] ?? 0) + 1;
    const total = Object.values(map).reduce((a, b) => a + b, 0) || 1;
    return Object.entries(map)
      .map(([cat, count]) => ({ cat, count, pct: Math.round((count / total) * 100) }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);
  }, [history]);

  const hourlyActivity = useMemo(() => {
    const buckets = new Array(24).fill(0);
    history.forEach((h) => {
      const t = h.timestamp ? new Date(h.timestamp.endsWith("Z") ? h.timestamp : `${h.timestamp}Z`) : null;
      if (!t || isNaN(+t)) return;
      buckets[t.getHours()] = (buckets[t.getHours()] ?? 0) + 1;
    });
    return buckets;
  }, [history]);

  const peakHour = hourlyActivity.indexOf(Math.max(...hourlyActivity));
  const maxBucket = Math.max(1, ...hourlyActivity);
  const avgConfidence = useMemo(() => {
    if (!history.length) return 0;
    return Math.round((history.reduce((s, h) => s + h.confidence, 0) / history.length) * 100);
  }, [history]);

  const stats: StatDef[] = [
    { label: "Распознаваний", hint: "всего",     value: history.length,   icon: Eye,      color: "primary" },
    { label: "Интересов",     hint: "выявлено",  value: interests.length, icon: Target,   color: "accent" },
    { label: "Подсказок",     hint: "сейчас",    value: tips.length,      icon: Lightbulb,color: "amber" },
    { label: "Уверенность",   hint: "среднее %", value: avgConfidence,    icon: Activity, color: "magenta" },
  ];

  return (
    <div className="space-y-6 pb-14">
      {/* HERO */}
      <motion.section
        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
        className="relative overflow-hidden rounded-3xl glass-card p-7 sm:p-9"
      >
        <div className="pointer-events-none absolute -top-24 -right-24 w-96 h-96 rounded-full bg-primary/30 blur-3xl opacity-60" />
        <div className="pointer-events-none absolute -bottom-32 -left-20 w-[28rem] h-[28rem] rounded-full bg-accent/25 blur-3xl opacity-55" />
        <div className="pointer-events-none absolute top-10 right-1/3 w-56 h-56 rounded-full bg-magenta/20 blur-3xl opacity-50 float-soft" />

        <div className="relative flex flex-col lg:flex-row lg:items-end justify-between gap-8">
          <div className="space-y-3 max-w-2xl flex-1 min-w-0">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 backdrop-blur-md">
              <span className="relative flex items-center justify-center">
                <span className={`absolute w-3 h-3 rounded-full ${wsConnected ? "bg-emerald-400" : "bg-rose-400"} blur-[3px] opacity-70`} />
                <span className={`relative w-1.5 h-1.5 rounded-full pulse-dot ${wsConnected ? "bg-emerald-400" : "bg-rose-400"}`} />
              </span>
              <span className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-text-dim">
                {isPaused ? "Пауза" : wsConnected ? "В реальном времени" : "Подключение…"}
              </span>
              <span className="mx-1 w-px h-3 bg-white/10" />
              <Sparkles size={11} className="text-primary-light" />
              <span className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-primary-light/90">Dashboard</span>
            </div>

            <h1 className="text-4xl sm:text-5xl font-black tracking-tight leading-[1.05]">
              <span className="text-gradient-primary">Добро пожаловать</span><br />
              <span className="text-text/90 text-3xl sm:text-4xl font-bold">в твой второй мозг</span>
            </h1>

            <p className="text-[14px] text-text-dim leading-relaxed max-w-xl">
              SmartOverlay непрерывно анализирует экран, собирает интересы и подсказывает в реальном времени. Всё локально — приватно и быстро.
            </p>

            <div className="flex flex-wrap items-center gap-2 pt-2">
              <QuickAction label={isPaused ? "Возобновить" : "Пауза"} accent="primary" onClick={() => void togglePauseGlobally()} />
              <QuickAction label="Открыть оверлей" accent="accent" icon={<LayoutDashboard size={12} />} onClick={() => invoke("toggle_dashboard").catch(() => {})} />
              <QuickAction label="Обновить" accent="ghost" icon={<RefreshCw size={12} />} onClick={() => {
                api.getInterests().then(setInterests).catch(() => {});
                api.getHistory(50).then(setHistory).catch(() => {});
              }} />
              <Link to="/dashboard/settings" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 text-[11px] text-text-dim hover:text-text hover:bg-white/[0.04] transition-colors font-medium">
                <SettingsIcon size={12} />Настройки
              </Link>
            </div>
          </div>

          <HeroRing current={history.length} interests={interests.length} tips={tips.length} />
        </div>
      </motion.section>

      {/* STATS */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {stats.map((s, i) => {
          const st = STAT_STYLES[s.color];
          return (
            <motion.div
              key={s.label}
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 * i, duration: 0.4 }}
              className={`group relative rounded-2xl glass-card glass-card-hover transition-all duration-300 ${st.glow}`}
            >
              <div className="pointer-events-none absolute -top-8 -right-8 w-24 h-24 rounded-full bg-white/[0.03] blur-2xl" />
              <div className="relative p-4">
                <div className="flex items-center gap-2.5 mb-3">
                  <div className={`relative w-10 h-10 rounded-xl ${st.iconBg} border ${st.iconBorder} flex items-center justify-center shrink-0`}>
                    <s.icon size={16} className={`relative ${st.text}`} />
                  </div>
                  <p className="text-[10.5px] uppercase tracking-[0.14em] text-text-dim font-bold truncate flex-1 min-w-0">{s.label}</p>
                </div>
                <div className="flex items-baseline gap-2 flex-wrap">
                  <p className="text-[34px] font-black text-text leading-none tabular-nums">
                    {s.value}{s.label === "Уверенность" && <span className="text-base font-bold text-text-dim ml-0.5">%</span>}
                  </p>
                  <span className={`text-[9px] uppercase tracking-widest font-bold px-1.5 py-0.5 rounded border ${st.chip}`}>{s.hint}</span>
                </div>
                <div className="mt-4 h-1 rounded-full overflow-hidden bg-white/5">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(100, s.label === "Уверенность" ? s.value : s.value * 8 + 12)}%` }}
                    transition={{ duration: 1.1, delay: 0.15 * i, ease: "easeOut" }}
                    className={`h-full rounded-full bg-gradient-to-r ${st.bar}`}
                  />
                </div>
              </div>
            </motion.div>
          );
        })}
      </section>

      {/* ACTIVITY + TOP CATEGORIES */}
      <section className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        <motion.div
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.4 }}
          className="lg:col-span-3 rounded-2xl glass-card overflow-hidden"
        >
          <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-primary/25 to-accent/15 border border-primary/30 flex items-center justify-center shrink-0">
                <Activity size={14} className="text-primary-light" />
              </div>
              <div className="min-w-0">
                <p className="text-[13px] font-bold text-text leading-none">Активность за сутки</p>
                <p className="text-[10.5px] text-text-dim mt-1 uppercase tracking-wider truncate">
                  {history.length > 0 ? `Пик в ${String(peakHour).padStart(2, "0")}:00 · ${maxBucket} сигн.` : "нет данных"}
                </p>
              </div>
            </div>
            <span className="text-[10px] uppercase tracking-widest font-bold px-2 py-1 rounded-md bg-primary/15 text-primary-light border border-primary/30 shrink-0">24h</span>
          </div>
          <div className="p-5">
            <HourlyChart values={hourlyActivity} peak={peakHour} />
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.4 }}
          className="lg:col-span-2 rounded-2xl glass-card overflow-hidden"
        >
          <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-magenta/25 to-fuchsia-400/15 border border-magenta/30 flex items-center justify-center">
                <Target size={14} className="text-magenta-light" />
              </div>
              <div>
                <p className="text-[13px] font-bold text-text leading-none">Топ категорий</p>
                <p className="text-[10.5px] text-text-dim mt-1 uppercase tracking-wider">по истории</p>
              </div>
            </div>
          </div>
          <div className="p-5 space-y-3.5">
            {categoryStats.length === 0 && (
              <p className="text-[12px] text-text-dim text-center py-3 leading-relaxed">Данные появятся после первых распознаваний.</p>
            )}
            {categoryStats.map((c, i) => {
              const accent = CATEGORY_ACCENT[c.cat] ?? CATEGORY_ACCENT.general;
              const label = CATEGORY_LABEL[c.cat] ?? c.cat;
              return (
                <div key={c.cat}>
                  <div className="flex items-center justify-between mb-1.5 text-[11.5px]">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="leading-none">{CATEGORY_EMOJI[c.cat] ?? "💡"}</span>
                      <span className="text-text/90 font-semibold truncate">{label}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`tabular-nums font-bold ${accent.text}`}>{c.count}</span>
                      <span className="text-[10px] tabular-nums text-text-dim">{c.pct}%</span>
                    </div>
                  </div>
                  <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }} animate={{ width: `${c.pct}%` }}
                      transition={{ duration: 0.9, delay: i * 0.05, ease: "easeOut" }}
                      className={`h-full rounded-full bg-gradient-to-r ${accent.bar}`}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </motion.div>
      </section>

      {/* TIPS + LIVE FEED */}
      <section className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        <motion.div
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.4 }}
          className="lg:col-span-3 rounded-2xl glass-card overflow-hidden"
        >
          <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-amber-400/25 to-orange-400/15 border border-amber-400/30 flex items-center justify-center">
                <Lightbulb size={14} className="text-amber-300" />
              </div>
              <div>
                <p className="text-[13px] font-bold text-text leading-none">Подсказки</p>
                <p className="text-[10.5px] text-text-dim mt-1 uppercase tracking-wider">с оверлея</p>
              </div>
            </div>
            {tips.length > 0 && (
              <span className="text-[10.5px] px-2 py-1 rounded-md bg-amber-400/15 border border-amber-400/30 text-amber-300 font-bold tabular-nums">{tips.length}</span>
            )}
          </div>
          {tips.length > 0 ? (
            <div className="divide-y divide-white/5 max-h-[320px] overflow-y-auto">
              {tips.slice(0, 8).map((tip, i) => (
                <motion.div
                  key={tip.id}
                  initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.04 * i }}
                  className="group flex items-start gap-3 px-5 py-3.5 hover:bg-white/[0.025] transition-colors relative"
                >
                  <span className="relative mt-1.5 shrink-0">
                    <span className="absolute inset-0 w-2 h-2 rounded-full bg-amber-400 blur-[3px] opacity-50" />
                    <span className="relative block w-1.5 h-1.5 rounded-full bg-amber-400" />
                  </span>
                  <p className="text-[13px] text-text/90 leading-relaxed">{tip.text}</p>
                </motion.div>
              ))}
            </div>
          ) : (
            <div className="px-5 py-12 text-center">
              <div className="inline-flex w-14 h-14 rounded-2xl bg-amber-400/10 border border-amber-400/20 items-center justify-center mb-4 float-soft">
                <Lightbulb size={22} className="text-amber-300" />
              </div>
              <p className="text-[13px] text-text/80 font-semibold">Подсказки появятся в реальном времени</p>
              <p className="text-[11.5px] text-text-dim mt-2 leading-relaxed">как только оверлей увидит контекст экрана</p>
            </div>
          )}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25, duration: 0.4 }}
          className="lg:col-span-2 rounded-2xl glass-card overflow-hidden"
        >
          <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-accent/25 to-cyan/15 border border-accent/30 flex items-center justify-center">
                <Activity size={14} className="text-accent-light" />
              </div>
              <div>
                <p className="text-[13px] font-bold text-text leading-none">Live-лента</p>
                <p className="text-[10.5px] text-text-dim mt-1 uppercase tracking-wider">последние события</p>
              </div>
            </div>
            <Link to="/dashboard/history" className="group flex items-center gap-1 text-[11px] text-text-dim hover:text-primary-light transition-colors">
              Все<ChevronRight size={12} className="transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
          {history.length > 0 ? (
            <div className="divide-y divide-white/5 max-h-[320px] overflow-y-auto">
              {history.slice(0, 9).map((entry, i) => {
                const accent = CATEGORY_ACCENT[entry.category] ?? CATEGORY_ACCENT.general;
                return (
                  <motion.div
                    key={entry.id}
                    initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.03 * i }}
                    className="flex items-center gap-2.5 px-4 py-2.5 hover:bg-white/[0.025] transition-colors"
                  >
                    <span className="text-base shrink-0 w-6 text-center leading-none">{CATEGORY_EMOJI[entry.category] ?? "💡"}</span>
                    <span className="text-[12.5px] text-text/90 font-medium flex-1 min-w-0 truncate">{entry.title}</span>
                    <span className={`text-[9.5px] font-bold px-1.5 py-0.5 rounded border tabular-nums shrink-0 ${accent.bg} ${accent.border} ${accent.text}`}>
                      {Math.round(entry.confidence * 100)}%
                    </span>
                  </motion.div>
                );
              })}
            </div>
          ) : (
            <div className="px-5 py-12 text-center">
              <p className="text-[12.5px] text-text-dim leading-relaxed">История пуста.<br />Запусти что-то — увидишь здесь.</p>
            </div>
          )}
        </motion.div>
      </section>

      {/* SYSTEM STATUS */}
      <motion.section
        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.4 }}
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3"
      >
        <SysCard label="WebSocket" value={wsConnected ? "Online" : "Offline"} accent={wsConnected ? "ok" : "bad"} subtitle={wsConnected ? "канал событий активен" : "переподключение…"} />
        <SysCard label="Engine" value={settings.visionProvider?.toUpperCase() ?? "—"} accent="primary" subtitle="движок распознавания" icon={<Cpu size={14} />} />
        <SysCard label="Цикл" value={`${settings.captureIntervalSec}s`} accent="accent" subtitle="интервал захвата экрана" />
        <SysCard label="Состояние" value={isPaused ? "Пауза" : "Сканирую"} accent={isPaused ? "warn" : "ok"} subtitle={isPaused ? "Ctrl + Alt + P — возобновить" : "анализ в реальном времени"} />
      </motion.section>
    </div>
  );
}

function QuickAction({ label, onClick, accent, icon }: { label: string; onClick: () => void; accent: "primary" | "accent" | "ghost"; icon?: React.ReactNode }) {
  const styles: Record<string, string> = {
    primary: "bg-gradient-to-r from-primary to-violet text-white border-primary/0 shadow-[0_4px_18px_-4px_rgba(124,92,255,0.7)] hover:shadow-[0_4px_24px_-4px_rgba(124,92,255,0.9)]",
    accent:  "bg-gradient-to-r from-accent to-cyan text-[#04121a] border-accent/0 shadow-[0_4px_18px_-4px_rgba(0,229,212,0.55)] hover:shadow-[0_4px_24px_-4px_rgba(0,229,212,0.75)]",
    ghost:   "bg-white/[0.04] border-white/10 text-text-dim hover:text-text hover:bg-white/[0.07]",
  };
  return (
    <button onClick={onClick} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[11px] font-semibold transition-all ${styles[accent]}`}>
      {icon}{label}
    </button>
  );
}

function SysCard({ label, value, subtitle, accent, icon }: { label: string; value: string; subtitle?: string; accent: "ok" | "bad" | "warn" | "primary" | "accent"; icon?: React.ReactNode }) {
  const map: Record<string, { dot: string; text: string; glow: string }> = {
    ok:      { dot: "bg-emerald-400", text: "text-emerald-300",    glow: "shadow-[0_8px_30px_-12px_rgba(52,211,153,0.5)]" },
    bad:     { dot: "bg-rose-400",    text: "text-rose-300",       glow: "shadow-[0_8px_30px_-12px_rgba(244,63,94,0.5)]" },
    warn:    { dot: "bg-amber-400",   text: "text-amber-300",      glow: "shadow-[0_8px_30px_-12px_rgba(251,191,36,0.5)]" },
    primary: { dot: "bg-primary",     text: "text-primary-light",  glow: "shadow-[0_8px_30px_-12px_rgba(124,92,255,0.55)]" },
    accent:  { dot: "bg-accent",      text: "text-accent-light",   glow: "shadow-[0_8px_30px_-12px_rgba(0,229,212,0.55)]" },
  };
  const s = map[accent];
  return (
    <div className={`relative rounded-2xl glass-card p-4 ${s.glow}`}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] uppercase tracking-[0.16em] font-bold text-text-dim">{label}</span>
        <span className="relative flex items-center justify-center">
          <span className={`absolute w-3 h-3 rounded-full ${s.dot} blur-[3px] opacity-60`} />
          <span className={`relative w-1.5 h-1.5 rounded-full pulse-dot ${s.dot}`} />
        </span>
      </div>
      <div className="flex items-baseline gap-2 flex-wrap">
        {icon && <span className={s.text}>{icon}</span>}
        <p className={`text-xl font-black tabular-nums leading-none ${s.text}`}>{value}</p>
      </div>
      {subtitle && <p className="text-[10.5px] text-text-dim mt-2 leading-relaxed">{subtitle}</p>}
    </div>
  );
}

function HourlyChart({ values, peak }: { values: number[]; peak: number }) {
  const max = Math.max(1, ...values);
  const w = 100; const h = 100;
  const step = w / (values.length - 1);
  const pts = values.map((v, i) => {
    const x = i * step; const y = h - (v / max) * (h - 8) - 4;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });
  const areaPath = `M0,${h} L${pts.join(" L")} L${w},${h} Z`;
  const linePath = `M${pts.join(" L")}`;
  return (
    <div className="relative">
      <div className="flex items-end gap-[3px] h-32 w-full">
        {values.map((v, i) => {
          const pct = Math.max(4, (v / max) * 100);
          const isPeak = i === peak && v > 0;
          return (
            <div key={i} className="flex-1 flex flex-col items-stretch group/bar" title={`${String(i).padStart(2, "0")}:00 — ${v}`}>
              <div className="flex-1 flex items-end">
                <motion.div
                  initial={{ height: 0 }} animate={{ height: `${pct}%` }}
                  transition={{ duration: 0.7, delay: i * 0.015, ease: "easeOut" }}
                  className={`w-full rounded-t-sm transition-all duration-200 ${
                    isPeak ? "bg-gradient-to-t from-magenta via-primary to-accent"
                           : v > 0 ? "bg-gradient-to-t from-primary/40 to-accent/40 group-hover/bar:from-primary group-hover/bar:to-accent"
                                   : "bg-white/[0.04]"
                  }`}
                />
              </div>
            </div>
          );
        })}
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="absolute inset-x-0 top-0 h-32 w-full pointer-events-none opacity-60">
        <defs>
          <linearGradient id="actLine" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#7c5cff" />
            <stop offset="50%" stopColor="#00e5d4" />
            <stop offset="100%" stopColor="#ff4dcb" />
          </linearGradient>
          <linearGradient id="actFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#7c5cff" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#7c5cff" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill="url(#actFill)" />
        <path d={linePath} fill="none" stroke="url(#actLine)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <div className="flex justify-between mt-2 text-[9px] text-text-dim/60 font-mono tabular-nums">
        <span>00</span><span>06</span><span>12</span><span>18</span><span>23</span>
      </div>
    </div>
  );
}

function HeroRing({ current, interests, tips }: { current: number; interests: number; tips: number }) {
  const total = Math.max(1, current + interests + tips);
  const a = (current / total) * 360;
  const b = ((current + interests) / total) * 360;
  return (
    <div className="relative w-[200px] h-[200px] shrink-0 self-center lg:self-end mx-auto lg:mx-0">
      <div className="absolute inset-2 rounded-full bg-gradient-to-br from-primary/40 via-accent/30 to-magenta/30 blur-2xl opacity-70" />
      <div className="absolute inset-0 rounded-full" style={{ background: `conic-gradient(#7c5cff 0deg ${a}deg, #00e5d4 ${a}deg ${b}deg, #ff4dcb ${b}deg 360deg)` }} />
      <div className="absolute inset-[8px] rounded-full bg-[#07071a]/95 backdrop-blur-md border border-white/8" />
      <div className="absolute inset-[8px] rounded-full flex flex-col items-center justify-center text-center px-4">
        <p className="text-[10px] uppercase tracking-[0.2em] text-text-dim/70 font-bold">Сигналов</p>
        <p className="text-[44px] font-black text-gradient-primary leading-none mt-1 tabular-nums">{current + interests + tips}</p>
        <div className="flex items-center gap-2 mt-3 text-[10px] text-text-dim font-bold uppercase tracking-wider">
          <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-primary" />{current}</span>
          <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-accent" />{interests}</span>
          <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-magenta" />{tips}</span>
        </div>
      </div>
    </div>
  );
}
