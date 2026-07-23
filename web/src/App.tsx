import { Navigate, Route, Routes } from "react-router-dom";
import TopNav from "./components/TopNav";
import Sidebar from "./components/Sidebar";
import ResearchPanel from "./components/ResearchPanel";
import Home from "./pages/Home";
import Quote from "./pages/Quote";
import "./App.css";

export default function App() {
  return (
    <div className="app-shell">
      <TopNav />
      <div className="app-body">
        <div className="gf-layout">
          <aside className="gf-sidebar">
            <Sidebar />
          </aside>
          <main className="gf-main">
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/quote/:ticker" element={<Quote />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </main>
          <aside className="gf-research">
            <ResearchPanel />
          </aside>
        </div>
      </div>
    </div>
  );
}
