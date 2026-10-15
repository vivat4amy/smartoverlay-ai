import { Routes, Route } from "react-router-dom";
import { IndicatorWindow } from "./windows/indicator/IndicatorWindow";
import { PanelWindow } from "./windows/panel/PanelWindow";
import { DashboardWindow } from "./windows/dashboard/DashboardWindow";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<IndicatorWindow />} />
      <Route path="/panel" element={<PanelWindow />} />
      <Route path="/dashboard/*" element={<DashboardWindow />} />
    </Routes>
  );
}
