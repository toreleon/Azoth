import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import "./styles/globals.css";
import "./styles/app-shell.css";
import "./styles/agent-panel.css";
import "./styles/market.css";
import "./styles/ticker.css";
import "./styles/market-detail.css";
import "./styles/chat.css";
import "./styles/team-card.css";
import "./styles/markdown-tools.css";
import "./styles/composer.css";
import "./styles/settings.css";
import "./styles/settings-controls.css";
import "./styles/settings-about.css";
import "./styles/settings-toast.css";
import "./styles/portfolio.css";
import "./styles/portfolio-account.css";
import "./styles/portfolio-table.css";
import "./styles/portfolio-form.css";
import "./styles/portfolio-tabs.css";

const root = document.getElementById("root");
if (!root) throw new Error("#root not found");

const tickerMatch = window.location.hash.match(/^#\/ticker\/([^/?#]+)/);
const initialSymbol = tickerMatch ? decodeURIComponent(tickerMatch[1]!) : null;

createRoot(root).render(
  <React.StrictMode>
    <App initialTickerSymbol={initialSymbol} />
  </React.StrictMode>,
);
