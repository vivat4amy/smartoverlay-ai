import { useEffect, useRef } from "react";
import { mapRecognition, normalizeTips } from "@/lib/overlayPayload";
import { useAppStore } from "@/store/appStore";

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const backendUrl = useAppStore((s) => s.backendUrl);
  const setWsConnected = useAppStore((s) => s.setWsConnected);

  useEffect(() => {
    function connect() {
      const wsUrl = backendUrl.replace("http", "ws") + "/ws/overlay";
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setWsConnected(true);
        console.log("[WS] Connected to backend");
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data as string) as {
            type: string;
            data: unknown;
          };
          if (useAppStore.getState().isPaused) return;

          if (msg.type === "overlay_update") {
            const d = msg.data as {
              recognition?: Record<string, unknown>;
              tips?: unknown[];
            };
            if (!d?.recognition || !Array.isArray(d.tips)) return;
            useAppStore.getState().applyOverlaySnapshot(
              mapRecognition(d.recognition),
              normalizeTips(d.tips),
            );
            return;
          }

          // Совместимость со старым бэкендом (два отдельных сообщения).
          if (msg.type === "tips") {
            useAppStore.setState({ tips: normalizeTips(msg.data) });
          } else if (msg.type === "recognition") {
            useAppStore.setState({
              recognition: mapRecognition(
                msg.data as Record<string, unknown>,
              ),
            });
          }
        } catch {
          console.warn("[WS] Failed to parse message");
        }
      };

      ws.onclose = () => {
        setWsConnected(false);
        console.log("[WS] Disconnected, reconnecting in 3s...");
        reconnectTimer.current = setTimeout(connect, 3000);
      };

      ws.onerror = () => {
        ws.close();
      };
    }

    connect();

    return () => {
      clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [backendUrl, setWsConnected]);
}
