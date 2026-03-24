import { Routes, Route, Navigate } from "react-router-dom";
import Layout from "./components/Layout.jsx";
import Dashboard from "./components/Dashboard.jsx";
import ScanPage from "./components/ScanPage.jsx";
import ResultsPage from "./components/ResultsPage.jsx";

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/scan"      element={<ScanPage />} />
        <Route path="/results/:id" element={<ResultsPage />} />
      </Route>
    </Routes>
  );
}
