import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import "./styles/globals.css";

const root = document.getElementById("root");
if (!root) throw new Error("#root not found");

const tickerMatch = window.location.hash.match(/^#\/ticker\/([^/?#]+)/);
const initialSymbol = tickerMatch ? decodeURIComponent(tickerMatch[1]!) : null;

createRoot(root).render(
  <React.StrictMode>
    <App initialTickerSymbol={initialSymbol} />
  </React.StrictMode>,
);
