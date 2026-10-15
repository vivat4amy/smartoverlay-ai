import type { Recognition } from "@/store/appStore";
import { ScanSearch } from "@/components/Icons";

interface Props {
  data: Recognition;
}

const categoryColors: Record<
  string,
  { bg: string; border: string; text: string; ring: string; glow: string }
> = {
  gaming: {
    bg: "from-violet-500/30 via-fuchsia-500/15 to-violet-500/5",
    border: "border-violet-400/50",
    text: "text-violet-200",
    ring: "from-violet-400 via-fuchsia-400 to-violet-400",
    glow: "rgba(168,85,247,0.5)",
  },
  video: {
    bg: "from-rose-500/30 via-orange-500/15 to-rose-500/5",
    border: "border-rose-400/50",
    text: "text-rose-200",
    ring: "from-rose-400 via-orange-400 to-rose-400",
    glow: "rgba(244,63,94,0.5)",
  },
  music: {
    bg: "from-emerald-500/30 via-teal-500/15 to-emerald-500/5",
    border: "border-emerald-400/50",
    text: "text-emerald-200",
    ring: "from-emerald-400 via-teal-400 to-emerald-400",
    glow: "rgba(52,211,153,0.5)",
  },
  coding: {
    bg: "from-sky-500/30 via-indigo-500/15 to-sky-500/5",
    border: "border-sky-400/50",
    text: "text-sky-200",
    ring: "from-sky-400 via-indigo-400 to-sky-400",
    glow: "rgba(56,189,248,0.5)",
  },
  social: {
    bg: "from-amber-500/30 via-yellow-500/15 to-amber-500/5",
    border: "border-amber-400/50",
    text: "text-amber-200",
    ring: "from-amber-400 via-yellow-400 to-amber-400",
    glow: "rgba(251,191,36,0.5)",
  },
  browsing: {
    bg: "from-cyan-500/30 via-blue-500/15 to-cyan-500/5",
    border: "border-cyan-400/50",
    text: "text-cyan-200",
    ring: "from-cyan-400 via-blue-400 to-cyan-400",
    glow: "rgba(34,211,238,0.5)",
  },
  documents: {
    bg: "from-orange-500/30 via-amber-500/15 to-orange-500/5",
    border: "border-orange-400/50",
    text: "text-orange-200",
    ring: "from-orange-400 via-amber-400 to-orange-400",
    glow: "rgba(251,146,60,0.5)",
  },
  general: {
    bg: "from-slate-500/30 via-zinc-500/15 to-slate-500/5",
    border: "border-slate-400/50",
    text: "text-slate-200",
    ring: "from-slate-400 via-zinc-400 to-slate-400",
    glow: "rgba(148,163,184,0.5)",
  },
};

export function RecognitionBadge({ data }: Props) {
  const c = categoryColors[data.category] || categoryColors.general;
  const pct = Math.round(data.confidence * 100);

  return (
    <div className="group relative">
      {/* Outer glow */}
      <div
        className="pointer-events-none absolute -inset-px rounded-2xl blur-md opacity-50"
        style={{
          background: `linear-gradient(135deg, ${c.glow}, transparent 50%, ${c.glow})`,
        }}
      />

      <div
        className={`relative rounded-2xl border ${c.border} backdrop-blur-xl bg-gradient-to-br ${c.bg} overflow-hidden`}
      >
        {/* Inner dark wash */}
        <div className="absolute inset-0 bg-[rgba(8,8,24,0.55)] -z-10" />

        {/* Top sheen */}
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent" />

        {/* Scan line */}
        <div className="absolute inset-x-0 top-0 h-full overflow-hidden opacity-50 pointer-events-none">
          <div className="scan-line" />
        </div>

        <div className="relative p-3.5">
          <div className="flex items-start gap-3 mb-2.5">
            {/* Mini scanner icon */}
            <div className="relative shrink-0">
              <div
                className="absolute inset-0 rounded-lg blur-md opacity-60"
                style={{ background: c.glow }}
              />
              <div
                className={`relative w-8 h-8 rounded-lg bg-gradient-to-br ${c.bg} border ${c.border} flex items-center justify-center`}
              >
                <ScanSearch size={14} className={c.text} />
              </div>
            </div>

            <div className="flex-1 min-w-0">
              <p
                className={`text-[9.5px] uppercase tracking-[0.18em] font-bold opacity-90 ${c.text}`}
              >
                {data.category}
              </p>
              <p className="text-[13px] font-semibold text-text leading-tight mt-0.5 truncate">
                {data.title}
              </p>
            </div>

            <div className="text-right shrink-0 leading-none">
              <p
                className={`text-base font-black ${c.text} tabular-nums leading-none`}
              >
                {pct}
                <span className="text-[10px] font-bold opacity-70">%</span>
              </p>
              <p className="text-[8.5px] uppercase tracking-wider text-text-dim/70 mt-0.5">
                conf
              </p>
            </div>
          </div>

          {/* Confidence track */}
          <div className="relative h-1.5 rounded-full bg-black/40 overflow-hidden border border-white/5">
            <div
              className={`absolute inset-y-0 left-0 rounded-full bg-gradient-to-r ${c.ring} transition-all duration-700 ease-out`}
              style={{ width: `${pct}%` }}
            />
            {/* Moving shine */}
            <div
              className="absolute inset-y-0 w-1/3 opacity-60"
              style={{
                background:
                  "linear-gradient(90deg, transparent, rgba(255,255,255,0.45), transparent)",
                animation: "shimmer 2.6s linear infinite",
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
