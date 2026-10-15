import { openUrl } from "@tauri-apps/plugin-opener";
import type { Tip } from "@/store/appStore";
import { ExternalLink } from "@/components/Icons";

interface Props {
  tip: Tip;
}

const categoryIcons: Record<string, string> = {
  gaming: "🎮",
  video: "🎬",
  music: "🎵",
  coding: "💻",
  social: "💬",
  browsing: "🌐",
  documents: "📄",
  general: "💡",
};

const categoryGlow: Record<string, string> = {
  gaming: "from-violet-500/40 via-fuchsia-500/20 to-transparent",
  video: "from-rose-500/40 via-orange-500/20 to-transparent",
  music: "from-emerald-500/40 via-teal-500/20 to-transparent",
  coding: "from-sky-500/40 via-indigo-500/20 to-transparent",
  social: "from-amber-500/40 via-yellow-500/20 to-transparent",
  browsing: "from-cyan-500/40 via-blue-500/20 to-transparent",
  documents: "from-orange-500/40 via-amber-500/20 to-transparent",
  general: "from-primary/40 via-accent/20 to-transparent",
};

export function TipCard({ tip }: Props) {
  const open = tip.url
    ? () => {
        void openUrl(tip.url!).catch(() => {});
      }
    : undefined;
  const glow = categoryGlow[tip.category] ?? categoryGlow.general;

  return (
    <div
      onClick={open}
      className={`group relative rounded-2xl overflow-hidden ${
        open ? "cursor-pointer" : "cursor-default"
      }`}
    >
      {/* Outer hover glow */}
      <div
        className={`pointer-events-none absolute -inset-px rounded-2xl bg-gradient-to-br ${glow} opacity-0 group-hover:opacity-100 blur-md transition-opacity duration-300`}
      />

      <div className="relative rounded-2xl border border-white/10 bg-gradient-to-br from-[rgba(20,18,48,0.78)] to-[rgba(11,10,28,0.78)] backdrop-blur-xl shadow-lg shadow-black/30 transition-all duration-200 group-hover:border-white/20">
        {/* Sheen */}
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />

        {/* Animated gradient border on hover */}
        <div
          className={`pointer-events-none absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300`}
          style={{
            background:
              "linear-gradient(135deg, rgba(124,92,255,0.45), rgba(0,229,212,0.4), rgba(255,77,203,0.45))",
            WebkitMask:
              "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
            WebkitMaskComposite: "xor",
            maskComposite: "exclude",
            padding: "1px",
          }}
        />

        <div className="relative px-4 py-3.5 flex items-start gap-3">
          {/* Emoji orb */}
          <div className="relative shrink-0">
            <div
              className={`absolute inset-0 rounded-xl bg-gradient-to-br ${glow} blur-md opacity-50`}
            />
            <div className="relative w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-lg leading-none">
              <span aria-hidden>{categoryIcons[tip.category] ?? "💡"}</span>
            </div>
          </div>

          <div className="flex-1 min-w-0 pt-0.5">
            <p className="text-[13px] text-text/95 leading-relaxed">{tip.text}</p>
            {tip.url && (
              <div className="flex items-center gap-1.5 mt-2 text-[10.5px] text-primary-light/90 group-hover:text-accent-light transition-colors">
                <ExternalLink size={11} />
                <span className="truncate">{tip.url}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
