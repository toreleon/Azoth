// Shared client state for user-managed watchlists and manual portfolios.
// A single provider fetches both collections once and exposes two hooks —
// useWatchlists() / usePortfolios() — that read the cached metadata and run
// mutations against the api, updating in-memory state after each call resolves.

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { api } from "./api";
import type { PortfolioMeta, WatchlistMeta } from "./types";

interface UserDataContextValue {
  watchlists: WatchlistMeta[];
  watchlistsLoading: boolean;
  portfolios: PortfolioMeta[];
  portfoliosLoading: boolean;

  refreshWatchlists: () => Promise<void>;
  createWatchlist: (name: string) => Promise<WatchlistMeta | null>;
  renameWatchlist: (id: number, name: string) => Promise<void>;
  removeWatchlist: (id: number) => Promise<void>;
  addWatchlistItem: (id: number, ticker: string) => Promise<void>;
  removeWatchlistItem: (id: number, ticker: string) => Promise<void>;

  refreshPortfolios: () => Promise<void>;
  createPortfolio: (name: string) => Promise<PortfolioMeta | null>;
  renamePortfolio: (id: number, name: string) => Promise<void>;
  removePortfolio: (id: number) => Promise<void>;
}

const UserDataContext = createContext<UserDataContextValue | null>(null);

export function UserDataProvider({ children }: { children: ReactNode }) {
  const [watchlists, setWatchlists] = useState<WatchlistMeta[]>([]);
  const [watchlistsLoading, setWatchlistsLoading] = useState(true);
  const [portfolios, setPortfolios] = useState<PortfolioMeta[]>([]);
  const [portfoliosLoading, setPortfoliosLoading] = useState(true);

  // Initial load of both collections.
  useEffect(() => {
    const ac = new AbortController();
    setWatchlistsLoading(true);
    setPortfoliosLoading(true);
    api
      .watchlists
      .list(ac.signal)
      .then((r) => setWatchlists(r.watchlists))
      .catch((e) => {
        if (e?.name !== "AbortError") setWatchlists([]);
      })
      .finally(() => setWatchlistsLoading(false));
    api
      .portfolios
      .list(ac.signal)
      .then((r) => setPortfolios(r.portfolios))
      .catch((e) => {
        if (e?.name !== "AbortError") setPortfolios([]);
      })
      .finally(() => setPortfoliosLoading(false));
    return () => ac.abort();
  }, []);

  // --- Watchlist actions -----------------------------------------------------

  const refreshWatchlists = useCallback(async () => {
    setWatchlistsLoading(true);
    try {
      const r = await api.watchlists.list();
      setWatchlists(r.watchlists);
    } finally {
      setWatchlistsLoading(false);
    }
  }, []);

  const createWatchlist = useCallback(async (name: string) => {
    try {
      const meta = await api.watchlists.create(name);
      setWatchlists((prev) => [...prev, meta]);
      return meta;
    } catch {
      return null;
    }
  }, []);

  const renameWatchlist = useCallback(async (id: number, name: string) => {
    const meta = await api.watchlists.rename(id, name);
    setWatchlists((prev) => prev.map((w) => (w.id === id ? meta : w)));
  }, []);

  const removeWatchlist = useCallback(async (id: number) => {
    await api.watchlists.remove(id);
    setWatchlists((prev) => prev.filter((w) => w.id !== id));
  }, []);

  const addWatchlistItem = useCallback(async (id: number, ticker: string) => {
    const meta = await api.watchlists.addItem(id, ticker);
    setWatchlists((prev) => prev.map((w) => (w.id === id ? meta : w)));
  }, []);

  const removeWatchlistItem = useCallback(async (id: number, ticker: string) => {
    const meta = await api.watchlists.removeItem(id, ticker);
    setWatchlists((prev) => prev.map((w) => (w.id === id ? meta : w)));
  }, []);

  // --- Portfolio actions -----------------------------------------------------

  const refreshPortfolios = useCallback(async () => {
    setPortfoliosLoading(true);
    try {
      const r = await api.portfolios.list();
      setPortfolios(r.portfolios);
    } finally {
      setPortfoliosLoading(false);
    }
  }, []);

  const createPortfolio = useCallback(async (name: string) => {
    try {
      const meta = await api.portfolios.create(name);
      setPortfolios((prev) => [...prev, meta]);
      return meta;
    } catch {
      return null;
    }
  }, []);

  const renamePortfolio = useCallback(async (id: number, name: string) => {
    const meta = await api.portfolios.rename(id, name);
    setPortfolios((prev) => prev.map((p) => (p.id === id ? meta : p)));
  }, []);

  const removePortfolio = useCallback(async (id: number) => {
    await api.portfolios.remove(id);
    setPortfolios((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const value = useMemo<UserDataContextValue>(
    () => ({
      watchlists,
      watchlistsLoading,
      portfolios,
      portfoliosLoading,
      refreshWatchlists,
      createWatchlist,
      renameWatchlist,
      removeWatchlist,
      addWatchlistItem,
      removeWatchlistItem,
      refreshPortfolios,
      createPortfolio,
      renamePortfolio,
      removePortfolio,
    }),
    [
      watchlists,
      watchlistsLoading,
      portfolios,
      portfoliosLoading,
      refreshWatchlists,
      createWatchlist,
      renameWatchlist,
      removeWatchlist,
      addWatchlistItem,
      removeWatchlistItem,
      refreshPortfolios,
      createPortfolio,
      renamePortfolio,
      removePortfolio,
    ],
  );

  return <UserDataContext.Provider value={value}>{children}</UserDataContext.Provider>;
}

function useUserData(): UserDataContextValue {
  const ctx = useContext(UserDataContext);
  if (!ctx) {
    throw new Error("useWatchlists/usePortfolios must be used within a <UserDataProvider>");
  }
  return ctx;
}

export function useWatchlists() {
  const ctx = useUserData();
  const { watchlists } = ctx;

  const isSaved = useCallback(
    (ticker: string) => {
      const t = ticker.toUpperCase();
      return watchlists.some((w) => w.tickers.includes(t));
    },
    [watchlists],
  );

  return {
    watchlists,
    loading: ctx.watchlistsLoading,
    create: ctx.createWatchlist,
    rename: ctx.renameWatchlist,
    remove: ctx.removeWatchlist,
    addItem: ctx.addWatchlistItem,
    removeItem: ctx.removeWatchlistItem,
    isSaved,
    refresh: ctx.refreshWatchlists,
  };
}

export function usePortfolios() {
  const ctx = useUserData();
  return {
    portfolios: ctx.portfolios,
    loading: ctx.portfoliosLoading,
    create: ctx.createPortfolio,
    rename: ctx.renamePortfolio,
    remove: ctx.removePortfolio,
    refresh: ctx.refreshPortfolios,
  };
}
