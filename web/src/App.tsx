import { Navigate, Route, Routes } from "react-router-dom";
import TopNav from "./components/TopNav";
import Sidebar from "./components/Sidebar";
import ResearchPanel from "./components/ResearchPanel";
import { UserDataProvider } from "./lib/userData";
import Home from "./pages/Home";
import Quote from "./pages/Quote";
import WatchlistPage from "./pages/WatchlistPage";
import Portfolio from "./pages/Portfolio";
import MarketTrends from "./pages/MarketTrends";
import IndexPage from "./pages/IndexPage";
import SectorPage from "./pages/SectorPage";
import "./App.css";

export default function App() {
  return (
    <UserDataProvider>
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
                <Route path="/index/:symbol" element={<IndexPage />} />
                <Route path="/sector/:key" element={<SectorPage />} />
                <Route path="/watchlist/:id" element={<WatchlistPage />} />
                <Route path="/portfolio" element={<Portfolio />} />
                <Route path="/portfolio/:id" element={<Portfolio />} />
                <Route path="/markets" element={<MarketTrends />} />
                <Route path="/markets/:kind" element={<MarketTrends />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </main>
            <aside className="gf-research">
              <ResearchPanel />
            </aside>
          </div>
        </div>
      </div>
    </UserDataProvider>
  );
}
