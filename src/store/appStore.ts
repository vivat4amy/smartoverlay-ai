import { create } from "zustand";

async function syncPauseToBackend(paused: boolean) {
  try {
    const backendUrl = useAppStore.getState().backendUrl;
    await fetch(`${backendUrl}/api/state/pause`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paused }),
    });
  } catch {
    /* offline — backend подберёт состояние при следующей синхронизации */
  }
}

export interface Tip {
  id: string;
  text: string;
  category: string;
  url?: string;
}

export interface Entity {
  artist?: string;
  track?: string;
  album?: string;
  game_title?: string;
  video_title?: string;
  channel?: string;
  platform?: string;
  url?: string;
  site_name?: string;
  language?: string;
  framework?: string;
  name?: string;
  type?: string;
  cover_url?: string;
  song_link?: string;
}

export interface Recognition {
  category: string;
  title: string;
  confidence: number;
  detectedObjects: string[];
  textContent?: string;
  entity?: Entity | null;
}

export interface Interest {
  id: string;
  name: string;
  icon: string;
  category: string;
  count: number;
  tags: string[];
}

export interface HistoryEntry {
  id: string;
  title: string;
  subtitle?: string;
  category: string;
  icon: string;
  confidence: number;
  timestamp: string;
  entity?: Entity;
  text_content?: string;
}

export interface Recommendation {
  id: string;
  title: string;
  description: string;
  category: string;
  icon: string;
}

export interface Settings {
  captureIntervalSec: number;
  overlayOpacity: number;
  visionProvider: "mock" | "clip" | "gpt4o" | "hybrid" | "ollama";
  language: "ru" | "en";
  openaiApiKey: string;
  openaiApiKeyPreview: string;
  openaiApiKeySet: boolean;
  openaiModel: string;
  panelWidth: number;
  panelHeight: number;
}

interface AppState {
  isPaused: boolean;
  tips: Tip[];
  recognition: Recognition | null;
  interests: Interest[];
  history: HistoryEntry[];
  recommendations: Recommendation[];
  settings: Settings;
  backendUrl: string;
  wsConnected: boolean;

  setPaused: (paused: boolean) => void;
  /** Только локально + без POST (после GET /api/state). */
  hydratePaused: (paused: boolean) => void;
  setTips: (tips: Tip[]) => void;
  setRecognition: (rec: Recognition | null) => void;
  applyOverlaySnapshot: (recognition: Recognition, tips: Tip[]) => void;
  setInterests: (interests: Interest[]) => void;
  setHistory: (history: HistoryEntry[]) => void;
  setRecommendations: (recs: Recommendation[]) => void;
  updateSettings: (partial: Partial<Settings>) => void;
  setBackendUrl: (url: string) => void;
  setWsConnected: (connected: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  isPaused: false,
  tips: [],
  recognition: null,
  interests: [],
  history: [],
  recommendations: [],
  settings: {
    captureIntervalSec: 4,
    overlayOpacity: 0.95,
    visionProvider: "gpt4o",
    language: "ru",
    openaiApiKey: "",
    openaiApiKeyPreview: "",
    openaiApiKeySet: false,
    openaiModel: "gpt-4o",
    panelWidth: 380,
    panelHeight: 560,
  },
  backendUrl: "http://127.0.0.1:18321",
  wsConnected: false,

  setPaused: (paused) => {
    set({ isPaused: paused });
    void syncPauseToBackend(paused);
  },
  hydratePaused: (paused) => set({ isPaused: paused }),
  setTips: (tips) => set({ tips }),
  setRecognition: (recognition) => set({ recognition }),
  applyOverlaySnapshot: (recognition, tips) => set({ recognition, tips }),
  setInterests: (interests) => set({ interests }),
  setHistory: (history) => set({ history }),
  setRecommendations: (recommendations) => set({ recommendations }),
  updateSettings: (partial) =>
    set((state) => ({ settings: { ...state.settings, ...partial } })),
  setBackendUrl: (backendUrl) => set({ backendUrl }),
  setWsConnected: (wsConnected) => set({ wsConnected }),
}));
