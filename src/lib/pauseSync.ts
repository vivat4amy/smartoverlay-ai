import { emit, listen } from "@tauri-apps/api/event";
import { useAppStore } from "@/store/appStore";
import { api } from "@/services/api";

/** Событие для выравнивания isPaused во всех webview (дашборд, панель, индикатор). */
export const PAUSE_SYNC_EVENT = "pause-sync";

/** Один запрос к backend + обновление локального стора + рассылка остальным окнам. */
export async function togglePauseGlobally(): Promise<void> {
  const s = await api.getState();
  const next = !s.paused;
  await api.setPaused(next);
  useAppStore.getState().hydratePaused(next);
  try {
    await emit(PAUSE_SYNC_EVENT, { paused: next });
  } catch {
    /* вне Tauri emit недоступен — локальный стор уже обновлён */
  }
}

export function listenPauseSync(): Promise<() => void> {
  return listen<{ paused: boolean }>(PAUSE_SYNC_EVENT, (event) => {
    useAppStore.getState().hydratePaused(event.payload.paused);
  });
}
