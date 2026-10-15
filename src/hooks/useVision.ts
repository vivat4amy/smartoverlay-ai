import { useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { mapRecognition, normalizeTips } from "@/lib/overlayPayload";
import { useAppStore } from "@/store/appStore";
import { api } from "@/services/api";
import { withVisionLock } from "@/lib/visionMutex";

interface ScreenshotResult {
  image: string;
  width: number;
  height: number;
  is_duplicate: boolean;
}

/** Один анализ за раз на всё приложение (оверлей + индикатор не дублируют захват/API). */
let visionPipelineBusy = false;

export function useVision() {
  const analyzeScreen = useCallback(async () => {
    if (useAppStore.getState().isPaused) return;
    if (visionPipelineBusy) return;
    visionPipelineBusy = true;
    try {
      await withVisionLock(async () => {
        const screenshot: ScreenshotResult = await invoke("capture_screen");

        if (screenshot.is_duplicate) {
          return;
        }

        const result = await api.analyzeScreenshot(screenshot.image);

        const recError = result?.recognition?.metadata?.error;
        if (recError) {
          console.debug("[Vision] провайдер вернул ошибку:", recError);
          return;
        }

        if (result.recognition) {
          useAppStore.getState().applyOverlaySnapshot(
            mapRecognition(result.recognition as Record<string, unknown>),
            normalizeTips(result.tips),
          );
        }
      });
    } catch (err) {
      const msg = String(err);
      if (msg.includes("409")) return;
      console.error("[Vision] Ошибка анализа:", err);
    } finally {
      visionPipelineBusy = false;
    }
  }, []);

  const analyzeRegion = useCallback(
    async (x: number, y: number, w: number, h: number) => {
      if (visionPipelineBusy) return;
      visionPipelineBusy = true;
      try {
        await withVisionLock(async () => {
          const screenshot: ScreenshotResult = await invoke(
            "capture_screen_region",
            { x, y, w, h },
          );

          const result = await api.analyzeScreenshot(screenshot.image);

          if (result.recognition) {
            useAppStore.getState().applyOverlaySnapshot(
              mapRecognition(result.recognition as Record<string, unknown>),
              normalizeTips(result.tips),
            );
          }
        });
      } catch (err) {
        console.error("[Vision] Ошибка анализа области:", err);
      } finally {
        visionPipelineBusy = false;
      }
    },
    [],
  );

  return { analyzeScreen, analyzeRegion };
}
