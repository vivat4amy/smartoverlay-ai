import { useEffect } from "react";
import { api } from "@/services/api";
import { useAppStore } from "@/store/appStore";

/**
 * У каждого окна Tauri свой Zustand — без подгрузки с сервера индикатор остаётся
 * на дефолтном captureIntervalSec=4, даже если в настройках 70 с.
 */
export function useSyncSettingsFromServer(periodMs = 12000) {
  const updateSettings = useAppStore((s) => s.updateSettings);

  useEffect(() => {
    const pull = () => {
      void api.getSettings().then(updateSettings).catch(() => {});
    };
    pull();
    const id = setInterval(pull, periodMs);
    return () => clearInterval(id);
  }, [updateSettings, periodMs]);
}
