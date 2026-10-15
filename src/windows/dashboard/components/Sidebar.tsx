import { useEffect, useMemo, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Home, Target, History, Sparkles, Settings,
  ChevronDown, Music, Gamepad2, Code, Globe,
} from "@/components/Icons";
import { useAppStore } from "@/store/appStore";

interface NavLeaf {
  path: string;
  label: string;
  Icon: React.ComponentType<{ size?: number; className?: string }>;
  accent?: string;
  end?: boolean;
}
interface NavGroup {
  basePath: string;
  label: string;
  Icon: React.ComponentType<{ size?: number; className?: string }>;
  children?: NavLeaf[];
}

function PlayBadge({ size = 16, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}
      stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="14" rx="3" />
      <polygon points="10,9 16,12 10,15" fill="currentColor" stroke="none" />
    </svg>
  );
}

const RECOMMEND_CATS: NavLeaf[] = [
  { path: "/dashboard/recommendations/music",        label: "Музыка",      Icon: Music,    accent: "bg-emerald-400" },
  { path: "/dashboard/recommendations/entertainment",label: "Развлечения", Icon: PlayBadge,accent: "bg-rose-400" },
  { path: "/dashboard/recommendations/gaming",       label: "Игры",        Icon: Gamepad2, accent: "bg-violet-400" },
  { path: "/dashboard/recommendations/coding",       label: "Разработка",  Icon: Code,     accent: "bg-sky-400" },
  { path: "/dashboard/recommendations/browsing",     label: "Браузинг",    Icon: Globe,    accent: "bg-cyan-400" },
];

const HISTORY_CATS: NavLeaf[] = [
  { path: "/dashboard/history/music",   label: "Музыка",   Icon: Music,    accent: "bg-emerald-400" },
  { path: "/dashboard/history/video",   label: "Видео",    Icon: PlayBadge,accent: "bg-rose-400" },
  { path: "/dashboard/history/gaming",  label: "Игры",     Icon: Gamepad2, accent: "bg-violet-400" },
  { path: "/dashboard/history/coding",  label: "Код",      Icon: Code,     accent: "bg-sky-400" },
  { path: "/dashboard/history/browsing",label: "Браузинг", Icon: Globe,    accent: "bg-cyan-400" },
];

const NAV: (NavLeaf | NavGroup)[] = [
  { path: "/dashboard",          label: "Главная",       Icon: Home,     end: true },
  { path: "/dashboard/interests",label: "Интересы",      Icon: Target },
  { basePath: "/dashboard/history",       label: "История",       Icon: History,  children: HISTORY_CATS },
  { basePath: "/dashboard/recommendations",label: "Рекомендации", Icon: Sparkles, children: RECOMMEND_CATS },
  { path: "/dashboard/settings", label: "Настройки",     Icon: Settings },
];

const PROVIDER_LABEL: Record<string, string> = {
  gpt4o: "GPT-4o Vision",
  ollama: "Ollama",
  hybrid: "Hybrid",
  clip: "CLIP",
  mock: "Mock",
};

export function Sidebar() {
  const { wsConnected, settings, backendUrl } = useAppStore();
  const [apiReachable, setApiReachable] = useState(false);
  const location = useLocation();
  const recsActive = location.pathname.startsWith("/dashboard/recommendations");
  const historyActive = location.pathname.startsWith("/dashboard/history");
  const [recsOpen, setRecsOpen] = useState(recsActive);
  const [historyOpen, setHistoryOpen] = useState(historyActive);

  useEffect(() => { if (recsActive) setRecsOpen(true); }, [recsActive]);
  useEffect(() => { if (historyActive) setHistoryOpen(true); }, [historyActive]);

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        const r = await fetch(`${backendUrl}/health`);
        if (!cancelled) setApiReachable(r.ok);
      } catch { if (!cancelled) setApiReachable(false); }
    };
    void check();
    const id = window.setInterval(() => void check(), 5000);
    return () => { cancelled = true; clearInterval(id); };
  }, [backendUrl]);

  const online = wsConnected || apiReachable;
  const providerLabel = useMemo(() => PROVIDER_LABEL[settings.visionProvider] ?? settings.visionProvider?.toUpperCase() ?? "—", [settings.visionProvider]);

  return (
    <aside className="relative w-[240px] shrink-0 flex flex-col h-full z-20 overflow-hidden">
      {/* Background: glass + aurora */}
      <div className="absolute inset-0 bg-[rgba(8,8,24,0.78)] backdrop-blur-2xl" />
      <div className="aurora-soft" />
      <div className="absolute inset-y-0 right-0 w-px bg-gradient-to-b from-transparent via-white/12 to-transparent" />

      <div className="relative flex flex-col h-full">
        {/* ── Logo ── */}
        <div className="px-5 h-[68px] flex items-center gap-3 shrink-0 border-b border-white/5">
          <div className="relative w-9 h-9 shrink-0">
            <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-primary via-magenta to-accent blur-md opacity-70" />
            <div className="relative w-9 h-9 rounded-xl bg-gradient-to-br from-primary via-violet to-accent flex items-center justify-center shadow-glow-primary">
              <span className="text-white text-[15px] font-black leading-none drop-shadow">S</span>
            </div>
          </div>
          <div className="min-w-0">
            <p className="text-[14px] font-bold text-gradient-primary leading-tight tracking-tight">
              SmartOverlay
            </p>
            <p className="text-[10px] text-text-dim/70 leading-none mt-0.5 tracking-widest uppercase">
              AI · Vision
            </p>
          </div>
        </div>

        {/* ── Nav ── */}
        <nav className="flex-1 py-4 px-3 flex flex-col gap-0.5 overflow-y-auto">
          <p className="px-3 pb-2 text-[9.5px] uppercase tracking-[0.18em] text-text-dim/50 font-semibold">
            Меню
          </p>
          {NAV.map((item) => {
            if ("children" in item && item.children) {
              const isHistory = item.basePath === "/dashboard/history";
              const open = isHistory ? historyOpen : recsOpen;
              const setOpen = isHistory ? setHistoryOpen : setRecsOpen;
              const active = isHistory ? historyActive : recsActive;
              return (
                <NavGroupRow key={item.basePath} group={item} open={open}
                  onToggle={() => setOpen((v) => !v)} active={active} />
              );
            }
            const leaf = item as NavLeaf;
            return (
              <NavLink
                key={leaf.path}
                to={leaf.path}
                end={leaf.end}
                className={({ isActive }) =>
                  `group relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] transition-all duration-200 ${
                    isActive
                      ? "text-text font-semibold"
                      : "text-text-dim hover:text-text"
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    {/* Active glow background */}
                    {isActive && (
                      <motion.span
                        layoutId="sidebar-active-pill"
                        className="absolute inset-0 rounded-xl"
                        transition={{ type: "spring", stiffness: 320, damping: 30 }}
                        style={{
                          background:
                            "linear-gradient(135deg, rgba(124,92,255,0.22) 0%, rgba(0,229,212,0.16) 100%)",
                          boxShadow:
                            "inset 0 0 0 1px rgba(124,92,255,0.4), 0 8px 24px -10px rgba(124,92,255,0.55)",
                        }}
                      />
                    )}
                    {/* Hover background */}
                    <span className="absolute inset-0 rounded-xl bg-white/0 group-hover:bg-white/[0.04] transition-colors" />

                    {/* Active indicator bar */}
                    {isActive && (
                      <span className="absolute -left-3 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-full bg-gradient-to-b from-primary-light via-accent to-magenta shadow-glow-primary" />
                    )}

                    <span className="relative flex items-center gap-3 w-full">
                      <leaf.Icon
                        size={16}
                        className={`shrink-0 transition-colors ${
                          isActive ? "text-primary-light" : "text-text-dim/70 group-hover:text-text/85"
                        }`}
                      />
                      <span className="relative">{leaf.label}</span>
                    </span>
                  </>
                )}
              </NavLink>
            );
          })}
        </nav>

        {/* ── Footer ── */}
        <div className="relative px-3 py-3 shrink-0">
          <div className="glass-card rounded-2xl p-3 space-y-2">
            <div className="flex items-center gap-2">
              <span className="relative flex items-center justify-center">
                <span
                  className={`absolute w-3.5 h-3.5 rounded-full opacity-50 blur-[3px] ${
                    online ? "bg-emerald-400" : "bg-rose-400"
                  }`}
                />
                <span
                  className={`relative w-2 h-2 rounded-full pulse-dot ${
                    online ? "bg-emerald-400" : "bg-rose-400"
                  }`}
                />
              </span>
              <span className="text-[11px] text-text/85 font-medium truncate">
                {online ? "Online" : "Offline"}
              </span>
              <span className="ml-auto text-[9px] uppercase tracking-widest text-text-dim/50 font-semibold">
                Live
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10.5px] text-text-dim/70 uppercase tracking-wider">Engine</span>
              <span className="text-[10px] px-2 py-0.5 rounded-md bg-gradient-to-r from-primary/15 to-accent/15 border border-primary/25 text-primary-light font-semibold truncate max-w-[120px]">
                {providerLabel}
              </span>
            </div>
            <div className="h-px bg-white/5" />
            <p className="text-[9.5px] text-text-dim/50 tracking-widest uppercase">
              v0.1.0 · build α
            </p>
          </div>
        </div>
      </div>
    </aside>
  );
}

function NavGroupRow({ group, open, onToggle, active }: {
  group: NavGroup; open: boolean; onToggle: () => void; active: boolean;
}) {
  return (
    <div className="relative">
      <div
        className={`group relative flex items-center gap-2 px-3 py-2.5 rounded-xl text-[13px] transition-all duration-200 ${
          active ? "text-text font-semibold" : "text-text-dim hover:text-text"
        }`}
      >
        {active && (
          <motion.span
            layoutId="sidebar-active-pill"
            className="absolute inset-0 rounded-xl"
            transition={{ type: "spring", stiffness: 320, damping: 30 }}
            style={{
              background:
                "linear-gradient(135deg, rgba(124,92,255,0.22) 0%, rgba(0,229,212,0.16) 100%)",
              boxShadow:
                "inset 0 0 0 1px rgba(124,92,255,0.4), 0 8px 24px -10px rgba(124,92,255,0.55)",
            }}
          />
        )}
        <span className="absolute inset-0 rounded-xl bg-white/0 group-hover:bg-white/[0.04] transition-colors" />
        {active && (
          <span className="absolute -left-3 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-full bg-gradient-to-b from-primary-light via-accent to-magenta shadow-glow-primary" />
        )}

        <NavLink to={group.basePath} end className="relative flex items-center gap-3 flex-1 min-w-0">
          <group.Icon
            size={16}
            className={`shrink-0 ${active ? "text-primary-light" : "text-text-dim/70"}`}
          />
          <span className="truncate">{group.label}</span>
        </NavLink>
        <button
          type="button"
          onClick={onToggle}
          className="relative w-5 h-5 flex items-center justify-center rounded-md text-text-dim/60 hover:text-text hover:bg-white/8 transition-colors shrink-0"
        >
          <ChevronDown
            size={12}
            className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          />
        </button>
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <div className="ml-6 pl-3 mt-1 mb-1 border-l border-white/8 space-y-px relative">
              <span className="absolute left-0 top-0 h-full w-px bg-gradient-to-b from-primary/40 via-accent/30 to-transparent" />
              {(group.children ?? []).map((child) => (
                <NavLink
                  key={child.path}
                  to={child.path}
                  className={({ isActive }) =>
                    `group flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-[12px] transition-all ${
                      isActive
                        ? "bg-white/8 text-text font-medium"
                        : "text-text-dim/75 hover:bg-white/4 hover:text-text"
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <span
                        className={`relative shrink-0 ${
                          isActive ? "scale-100" : "scale-90 group-hover:scale-100"
                        } transition-transform`}
                      >
                        {isActive && (
                          <span
                            className={`absolute inset-0 w-1.5 h-1.5 rounded-full ${child.accent} blur-[3px] opacity-80`}
                          />
                        )}
                        <span
                          className={`relative block w-1.5 h-1.5 rounded-full ${child.accent} ${
                            isActive ? "opacity-100" : "opacity-50"
                          }`}
                        />
                      </span>
                      <span className="truncate">{child.label}</span>
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
