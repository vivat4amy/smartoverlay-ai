import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { invoke } from "@tauri-apps/api/core";
import { useAppStore, type Settings } from "@/store/appStore";
import { api } from "@/services/api";
import {
  Settings as SettingsIcon, Wand, Cloud, Cpu, Eye,
  RefreshCw, LayoutDashboard,
} from "@/components/Icons";

function formatInterval(sec: number): string {
  if (sec < 60) return `${sec} сек`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s === 0 ? `${m} мин` : `${m} мин ${s} сек`;
}

export function SettingsPage() {
  const { settings, updateSettings } = useAppStore();
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [keyDraft, setKeyDraft] = useState("");
  const [keyVisible, setKeyVisible] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<null | { ok: boolean; title?: string; error?: string; provider: string }>(null);

  useEffect(() => {
    api.getSettings().then((s) => updateSettings(s)).catch(() => {});
  }, [updateSettings]);

  const persist = async (next: Settings) => {
    try {
      const saved = await api.updateSettings(next);
      updateSettings({
        openaiApiKeyPreview: saved.openaiApiKeyPreview,
        openaiApiKeySet: saved.openaiApiKeySet,
        openaiApiKey: "",
      });
      setSavedAt(Date.now());
    } catch {}
  };

  const update = (partial: Partial<Settings>) => {
    const next = { ...settings, ...partial };
    updateSettings(partial);
    persist(next);
  };

  const applyPanelSize = (w: number, h: number) => {
    invoke("resize_panel", { width: w, height: h }).catch(() => {});
  };

  const saveApiKey = () => {
    if (!keyDraft.trim()) return;
    persist({ ...settings, openaiApiKey: keyDraft.trim() });
    setKeyDraft("");
  };

  const clearApiKey = () => persist({ ...settings, openaiApiKey: "__clear__" });

  const test = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const r = await api.testProvider();
      setTestResult(r);
    } catch (e: any) {
      setTestResult({ ok: false, provider: settings.visionProvider, error: String(e?.message || e) });
    } finally {
      setTesting(false);
    }
  };

  const needsOpenAI = settings.visionProvider === "gpt4o" && !settings.openaiApiKeySet;

  return (
    <div className="space-y-7 pb-14">
      <motion.div
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-3xl glass-card p-7 lg:p-9"
      >
        <div className="pointer-events-none absolute -top-24 -right-20 w-80 h-80 rounded-full bg-primary/30 blur-3xl opacity-60" />
        <div className="pointer-events-none absolute -bottom-28 left-8 w-96 h-96 rounded-full bg-accent/25 blur-3xl opacity-55" />
        <div className="pointer-events-none absolute top-10 right-1/3 w-48 h-48 rounded-full bg-magenta/20 blur-3xl opacity-50 float-soft" />
        <div className="relative flex items-start gap-4 flex-wrap">
          <div className="relative shrink-0">
            <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-primary via-violet to-accent blur-lg opacity-60" />
            <div className="relative w-16 h-16 rounded-2xl bg-gradient-to-br from-primary via-violet to-accent flex items-center justify-center border border-white/20 shadow-lg">
              <SettingsIcon size={26} className="text-white drop-shadow" />
            </div>
          </div>
          <div className="min-w-0 flex-1">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 backdrop-blur-md mb-3">
              <span className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-primary-light">⚙ Конфигурация</span>
            </div>
            <h1 className="text-4xl lg:text-5xl font-black tracking-tight leading-[1.05]">
              <span className="text-gradient-primary">Настройки</span>
            </h1>
            <p className="text-text-dim text-[13.5px] mt-3 max-w-2xl leading-relaxed">
              Два режима: <strong className="text-primary-light font-semibold">GPT-4o Vision</strong> — облачный анализ экрана,{" "}
              <strong className="text-accent-light font-semibold">Ollama</strong> — локальный чат без интернета.
            </p>
          </div>
        </div>
      </motion.div>

      <div className="space-y-5 max-w-3xl">
        <Section title="Режим работы" description="Выберите как SmartOverlay анализирует экран и общается с вами" icon={Wand}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <ProviderCard label="GPT-4o Vision"
              caption="Облачный анализ экрана — подсказки, советы, распознавание контента. Нужен API-ключ OpenAI."
              icon={Cloud}
              active={settings.visionProvider === "gpt4o"}
              onClick={() => update({ visionProvider: "gpt4o" })} />
            <ProviderCard label="Ollama (локальный чат)"
              caption="Чат-ассистент на вашем ПК без интернета. Голос через микрофон, память разговоров."
              icon={Cpu}
              active={settings.visionProvider === "ollama"}
              onClick={() => update({ visionProvider: "ollama" })} />
          </div>
          <button onClick={test} disabled={testing}
            className="mt-4 w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-sm text-text-dim hover:text-text transition-colors disabled:opacity-60">
            <RefreshCw size={14} className={testing ? "animate-spin" : ""} />
            {testing ? "Проверка…" : "Проверить провайдер"}
          </button>
          <AnimatePresence>
            {testResult && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className={`mt-3 px-3 py-2.5 rounded-lg text-xs border ${testResult.ok ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300" : "bg-rose-500/10 border-rose-500/30 text-rose-300"}`}>
                {testResult.ok ? (
                  <span>✓ {testResult.provider} работает{testResult.title ? ` — ${testResult.title}` : ""}</span>
                ) : (
                  <span>✗ {testResult.provider}: {testResult.error || "ошибка"}</span>
                )}
              </motion.div>
            )}
          </AnimatePresence>
          <p className="text-xs text-text-dim leading-relaxed border border-white/5 rounded-xl p-3 bg-white/[0.02] mt-3">
            <span className="text-text/90 font-medium">Ollama:</span> скачайте{" "}
            <a href="https://ollama.com/download" target="_blank" rel="noopener noreferrer" className="text-primary-light underline">ollama.com/download</a>,
            затем в терминале:{" "}
            <code className="text-[10px] font-mono bg-black/30 px-1 rounded">ollama pull qwen2.5vl:3b</code> и{" "}
            <code className="text-[10px] font-mono bg-black/30 px-1 rounded">ollama pull qwen2.5:7b-instruct</code>.
            В{" "}
            <code className="text-[10px] font-mono bg-black/30 px-1 rounded">backend/.env</code>{" "}
            задайте OLLAMA_BASE_URL, OLLAMA_VISION_MODEL, OLLAMA_CHAT_MODEL.
          </p>
        </Section>

        <Section title="API ключ OpenAI" description="Нужен для GPT-4o Vision и hybrid" icon={Cloud}>
          {settings.openaiApiKeySet ? (
            <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
              <span className="text-emerald-400">✓</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-emerald-200">Ключ сохранён</p>
                <p className="text-xs text-emerald-300/70 font-mono truncate">{settings.openaiApiKeyPreview}</p>
              </div>
              <button onClick={clearApiKey}
                className="text-xs px-2 py-1 rounded-md bg-white/5 hover:bg-rose-500/20 text-text-dim hover:text-rose-300 transition-colors">
                заменить
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-sm text-amber-200">
              <span>⚠</span>Ключ не настроен — GPT-4o / hybrid работать не будут.
            </div>
          )}
          <div className="flex gap-3 mt-4">
            <div className="relative flex-1">
              <input type={keyVisible ? "text" : "password"}
                value={keyDraft}
                onChange={(e) => setKeyDraft(e.target.value)}
                placeholder="sk-..."
                spellCheck={false}
                autoComplete="off"
                className="w-full px-3 py-2 pr-9 rounded-xl bg-white/5 border border-white/10 text-sm font-mono text-text placeholder-text-dim/70 focus:outline-none focus:border-primary/50 transition-colors" />
              <button type="button" onClick={() => setKeyVisible((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-text-dim hover:text-text"
                title={keyVisible ? "Скрыть" : "Показать"}>
                <Eye size={14} />
              </button>
            </div>
            <button onClick={saveApiKey} disabled={!keyDraft.trim()}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-primary to-violet hover:from-primary-light hover:to-primary text-white text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed shadow-glow-primary transition-all">
              Сохранить
            </button>
          </div>
          <p className="text-xs text-text-dim mt-3 leading-relaxed">
            Получить ключ:{" "}
            <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="text-primary-light hover:text-accent-light underline">platform.openai.com/api-keys</a>.
            На фронт ключ не отдаётся.
          </p>
        </Section>

        {needsOpenAI && (
          <div className="px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-sm text-amber-200">
            ⚠ Для GPT-4o или hybrid добавьте ключ OpenAI выше.
          </div>
        )}

        <Section title="Размер панели оверлея" description="Окно, которое открывается по Ctrl+Alt+T или клику на индикатор" icon={LayoutDashboard}>
          <Row label="Ширина" hint={`${settings.panelWidth} px`}>
            <Slider min={280} max={900} step={10} value={settings.panelWidth}
              onChange={(v) => { updateSettings({ panelWidth: v }); applyPanelSize(v, settings.panelHeight); }}
              onCommit={(v) => persist({ ...settings, panelWidth: v })} />
          </Row>
          <Row label="Высота" hint={`${settings.panelHeight} px`}>
            <Slider min={320} max={1200} step={10} value={settings.panelHeight}
              onChange={(v) => { updateSettings({ panelHeight: v }); applyPanelSize(settings.panelWidth, v); }}
              onCommit={(v) => persist({ ...settings, panelHeight: v })} />
          </Row>
          <p className="text-xs text-text-dim leading-relaxed">
            Панель также можно тащить курсором за заголовок и менять размер за угол. Текущий размер сохранится в БД и применится при следующем запуске.
          </p>
        </Section>

        <Section title="Захват экрана"
          description="Интервал ниже — только для анализа экрана (GPT Vision). Музыка по звуку идёт отдельным фоновым циклом в backend/.env."
          icon={SettingsIcon}>
          <Row label="Интервал анализа экрана" hint={formatInterval(settings.captureIntervalSec)}>
            <Slider min={1} max={300} step={1} value={settings.captureIntervalSec}
              onChange={(v) => updateSettings({ captureIntervalSec: v })}
              onCommit={(v) => persist({ ...settings, captureIntervalSec: v })} />
          </Row>
          <Row label="Прозрачность панели" hint={`${Math.round(settings.overlayOpacity * 100)}%`}>
            <Slider min={0.3} max={1} step={0.05} value={settings.overlayOpacity}
              onChange={(v) => updateSettings({ overlayOpacity: v })}
              onCommit={(v) => persist({ ...settings, overlayOpacity: v })} />
          </Row>
        </Section>

        <AnimatePresence>{savedAt && <SavedToast key={savedAt} />}</AnimatePresence>
      </div>
    </div>
  );
}

function Section({ title, description, icon: Icon, children }: {
  title: string;
  description?: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl glass-card overflow-hidden">
      <div className="flex items-start gap-3.5 px-5 py-4 border-b border-white/5">
        <div className="relative shrink-0">
          <div className="absolute inset-0 rounded-lg bg-gradient-to-br from-primary/40 to-accent/20 blur-md opacity-60" />
          <div className="relative w-9 h-9 rounded-lg bg-gradient-to-br from-primary/30 to-accent/15 border border-primary/35 flex items-center justify-center text-primary-light">
            <Icon size={15} />
          </div>
        </div>
        <div className="min-w-0 pt-0.5 flex-1">
          <h3 className="text-[13.5px] font-bold text-text">{title}</h3>
          {description && <p className="text-[11.5px] text-text-dim mt-1 leading-relaxed">{description}</p>}
        </div>
      </div>
      <div className="p-5 space-y-4">{children}</div>
    </div>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-4">
        <label className="text-sm text-text font-medium">{label}</label>
        {hint && <span className="text-xs text-text-dim tabular-nums">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function Slider({ min, max, step, value, onChange, onCommit }: {
  min: number; max: number; step: number; value: number;
  onChange: (v: number) => void; onCommit?: (v: number) => void;
}) {
  return (
    <input type="range" min={min} max={max} step={step} value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      onPointerUp={(e) => onCommit?.(Number((e.target as HTMLInputElement).value))}
      onKeyUp={(e) => onCommit?.(Number((e.target as HTMLInputElement).value))}
      className="w-full accent-primary" />
  );
}

function ProviderCard({ label, caption, icon: Icon, active, onClick }: {
  label: string;
  caption: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button onClick={onClick}
      className={`text-left rounded-xl p-4 border transition-all duration-200 ${
        active ? "bg-primary/15 border-primary/40 shadow-glow-primary" : "bg-white/[0.03] border-white/10 hover:border-white/20 hover:bg-white/5"
      }`}>
      <div className="flex items-center gap-2.5 mb-1.5">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${active ? "bg-primary/30 text-primary-light" : "bg-white/5 text-text-dim"}`}>
          <Icon size={14} />
        </div>
        <span className={`text-sm font-semibold ${active ? "text-text" : "text-text/90"}`}>{label}</span>
      </div>
      <p className="text-xs text-text-dim leading-relaxed">{caption}</p>
    </button>
  );
}

function SavedToast() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 10 }}
      className="fixed bottom-6 right-6 px-4 py-2.5 rounded-xl bg-emerald-500/15 border border-emerald-400/40 text-emerald-200 text-sm font-semibold shadow-lg backdrop-blur-md z-50">
      ✓ Сохранено
    </motion.div>
  );
}
