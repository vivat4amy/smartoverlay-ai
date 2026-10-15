import { useAppStore, type Settings } from "@/store/appStore";

function getBaseUrl(): string {
  return useAppStore.getState().backendUrl;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${getBaseUrl()}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

interface ApiSettings {
  language: "ru" | "en";
  overlay_opacity: number;
  capture_interval_sec: number;
  vision_provider: string;
  openai_api_key?: string;
  openai_api_key_preview?: string;
  openai_api_key_set?: boolean;
  openai_model?: string;
  panel_width?: number;
  panel_height?: number;
}

function normalizeVisionProvider(p: string | undefined): Settings["visionProvider"] {
  const v = (p || "gpt4o").trim().toLowerCase();
  if (v === "nvidia" || v === "gpt4o_nvidia") return "gpt4o";
  if (v === "mock" || v === "clip" || v === "hybrid" || v === "gpt4o" || v === "ollama")
    return v;
  return "gpt4o";
}

function fromApiSettings(s: ApiSettings): Settings {
  return {
    language: s.language,
    overlayOpacity: s.overlay_opacity,
    captureIntervalSec: s.capture_interval_sec,
    visionProvider: normalizeVisionProvider(s.vision_provider),
    openaiApiKey: "",
    openaiApiKeyPreview: s.openai_api_key_preview ?? "",
    openaiApiKeySet: !!s.openai_api_key_set,
    openaiModel: s.openai_model ?? "gpt-4o",
    panelWidth: s.panel_width ?? 380,
    panelHeight: s.panel_height ?? 560,
  };
}

function toApiSettings(s: Settings): ApiSettings {
  return {
    language: s.language,
    overlay_opacity: s.overlayOpacity,
    capture_interval_sec: s.captureIntervalSec,
    vision_provider: s.visionProvider,
    openai_api_key: s.openaiApiKey || "",
    openai_model: s.openaiModel,
    panel_width: s.panelWidth,
    panel_height: s.panelHeight,
  };
}

export const api = {
  healthCheck: () => request<{ status: string }>("/health"),

  analyzeScreenshot: async (imageBase64: string) => {
    const ctl = new AbortController();
    const tid = setTimeout(() => ctl.abort(), 180_000);
    try {
      const res = await fetch(`${getBaseUrl()}/api/vision/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: imageBase64 }),
        signal: ctl.signal,
      });
      if (!res.ok) {
        throw new Error(`API error: ${res.status} ${res.statusText}`);
      }
      return res.json();
    } finally {
      clearTimeout(tid);
    }
  },

  testProvider: () =>
    request<{ ok: boolean; provider: string; title?: string; error?: string }>(
      "/api/vision/test",
      { method: "POST" },
    ),

  search: (type: string, query: string) =>
    request<any>(`/api/search/${type}?query=${encodeURIComponent(query)}`),

  getInterests: () => request<any[]>("/api/interests"),
  getInterestDetails: () => request<any[]>("/api/interests/details"),

  getHistory: (limit = 50) =>
    request<any[]>(`/api/history?limit=${limit}`),

  getRecommendations: () => request<any[]>("/api/recommendations"),

  identifyMusic: (duration = 8) =>
    request<any>(`/api/music/identify?duration=${duration}`, { method: "POST" }),

  listAudioDevices: () => request<any[]>("/api/music/devices"),

  setPaused: (paused: boolean) =>
    request<{ paused: boolean }>("/api/state/pause", {
      method: "POST",
      body: JSON.stringify({ paused }),
    }),

  getState: () => request<{ paused: boolean }>("/api/state"),

  getSettings: async (): Promise<Settings> => {
    const raw = await request<ApiSettings>("/api/user/settings");
    return fromApiSettings(raw);
  },

  updateSettings: async (settings: Settings): Promise<Settings> => {
    const raw = await request<ApiSettings>("/api/user/settings", {
      method: "PUT",
      body: JSON.stringify(toApiSettings(settings)),
    });
    return fromApiSettings(raw);
  },

  getAssistantMessages: () =>
    request<{ role: string; content: string }[]>("/api/assistant/messages"),

  clearAssistantMessages: () =>
    request<{ ok: boolean }>("/api/assistant/messages", { method: "DELETE" }),

  assistantChat: async (body: {
    content?: string;
    messages?: { role: string; content: string }[];
    context_title?: string;
    context_category?: string;
    context_screen_text?: string;
    image_base64?: string | null;
    persist?: boolean;
  }) => {
    const ctl = new AbortController();
    const tid = setTimeout(() => ctl.abort(), 180_000);
    try {
      const res = await fetch(`${getBaseUrl()}/api/assistant/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: ctl.signal,
      });
      if (!res.ok) {
        throw new Error(`API error: ${res.status} ${res.statusText}`);
      }
      return res.json() as Promise<{ reply: string; model: string }>;
    } finally {
      clearTimeout(tid);
    }
  },

  transcribeAssistantAudio: async (blob: Blob) => {
    const fd = new FormData();
    fd.append("audio", blob, blob.type.includes("wav") ? "speech.wav" : "speech.webm");
    const ctl = new AbortController();
    const tid = setTimeout(() => ctl.abort(), 120_000);
    try {
      const res = await fetch(`${getBaseUrl()}/api/assistant/transcribe`, {
        method: "POST",
        body: fd,
        signal: ctl.signal,
      });
      if (!res.ok) {
        let msg = `API ${res.status}`;
        try {
          const j = (await res.json()) as { detail?: unknown };
          const d = j.detail;
          if (typeof d === "string") msg = d;
          else if (Array.isArray(d))
            msg = d.map((x: { msg?: string }) => x.msg ?? JSON.stringify(x)).join("; ");
        } catch {
          /* */
        }
        throw new Error(msg);
      }
      return res.json() as Promise<{ text: string }>;
    } finally {
      clearTimeout(tid);
    }
  },

  getTtsVoices: async (lang = "ru"): Promise<{ voices: string[]; default: string }> => {
    const res = await fetch(`${getBaseUrl()}/api/assistant/tts/voices?lang=${lang}`);
    if (!res.ok) throw new Error(`TTS voices: ${res.status}`);
    return res.json() as Promise<{ voices: string[]; default: string }>;
  },

  synthesizeSpeech: (text: string, speaker: string, lang = "ru"): string => {
    const params = new URLSearchParams({ text, speaker, lang });
    return `${getBaseUrl()}/api/assistant/tts?${params.toString()}`;
  },
};
