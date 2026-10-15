import { useEffect, useRef } from "react";
import { useAppStore } from "@/store/appStore";
import { api } from "@/services/api";

/**
 * Разные окна Tauri = разные экземпляры Zustand. Подтягиваем паузу с backend,
 * чтобы индикатор, панель и дашборд не расходились (даже если emit не сработал).
 */
export function usePauseFromBackend(intervalMs = 1500) {
  const intervalRef = useRef(intervalMs);
  intervalRef.current = intervalMs;

  useEffect(() => {
    let cancelled = false;
    const sync = () => {
      api
        .getState()
        .then((s) => {
          if (!cancelled) useAppStore.getState().hydratePaused(s.paused);
        })
        .catch(() => {});
    };
    sync();
    const id = setInterval(sync, intervalRef.current);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);
}
