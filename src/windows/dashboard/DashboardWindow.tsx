import { useEffect } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { Sidebar } from "./components/Sidebar";
import { HomePage } from "./pages/HomePage";
import { InterestsPage } from "./pages/InterestsPage";
import { HistoryPage } from "./pages/HistoryPage";
import { RecommendationsPage } from "./pages/RecommendationsPage";
import { SettingsPage } from "./pages/SettingsPage";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useAppStore } from "@/store/appStore";
import { api } from "@/services/api";
import { listenPauseSync } from "@/lib/pauseSync";
import { usePauseFromBackend } from "@/hooks/usePauseFromBackend";

export function DashboardWindow() {
  useWebSocket();
  usePauseFromBackend(1500);

  useEffect(() => {
    document.body.style.background = "#05051a";
    document.body.style.overflow = "auto";
    document.body.style.userSelect = "auto";
  }, []);

  useEffect(() => {
    api
      .getState()
      .then((s) => useAppStore.getState().hydratePaused(s.paused))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const p = listenPauseSync();
    return () => {
      void p.then((un) => un());
    };
  }, []);

  return (
    <div className="relative flex h-screen w-screen overflow-hidden text-text isolate">
      {/* ── Layered background ── */}
      <div className="absolute inset-0 -z-10 bg-[#05051a]" />
      <div className="absolute inset-0 -z-10 bg-gradient-to-br from-[#0b0a2a] via-[#070720] to-[#0a081f]" />
      <div className="aurora -z-10" />
      <div className="absolute inset-0 -z-10 grid-bg opacity-40" />
      <div className="noise -z-10" />

      <Sidebar />
      <main className="flex-1 min-w-0 overflow-y-auto relative">
        <div className="w-full max-w-[1080px] mx-auto px-8 py-8">
          <Routes>
            <Route index element={<HomePage />} />
            <Route path="interests" element={<InterestsPage />} />
            <Route path="history" element={<HistoryPage />} />
            <Route path="history/:cat" element={<HistoryPage />} />
            <Route path="recommendations" element={<RecommendationsPage />} />
            <Route path="recommendations/:cat" element={<RecommendationsPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="" replace />} />
          </Routes>
        </div>
      </main>
    </div>
  );
}
