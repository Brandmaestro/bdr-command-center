import React, { createContext, useState, useEffect, useContext } from 'react';

export const DataContext = createContext();

// ── Endpoint map — one per page ──────────────────────────────────
const ENDPOINTS = {
  overview:    '/api/dashboard',
  performance: '/api/performance',
  activity:    '/api/activity',
  trends:      '/api/trends',
  outcomes:    '/api/outcomes',
  time:        '/api/time',
  scorecard:   '/api/scorecard',
  coaching:    '/api/coaching',
  meetings:    '/api/meetings',
  prospects:   '/api/prospects',
  research:    '/api/research',
  reports:     '/api/reports',
  settings:    '/api/settings',
};

// ── Normalize overview data (keeps Overview.jsx working unchanged) ─
const processOverview = (result) => ({
  ...result,
  today: {
    calls_today:              result.today?.calls_today              ?? 0,
    meetings_today:           result.today?.meetings_today           ?? 0,
    conversations_today:      result.today?.conversations_today      ?? 0,
    conversation_rate_today:  result.today?.conversation_rate_today  ?? 0,
    not_interested_today:     result.today?.not_interested_today     ?? 0,
    no_answer_today:          result.today?.no_answer_today          ?? 0,
    voicemail_today:          result.today?.voicemail_today          ?? 0,
    gatekeeper_today:         result.today?.gatekeeper_today         ?? 0,
    avg_score_today:          result.today?.avg_score_today          ?? 0,
    avg_duration_today:       result.today?.avg_duration_today       ?? 0,
  },
});

export const DataProvider = ({ children }) => {
  // ── Active page key — set by App.jsx via setPage ─────────────
  const [page, setPage]           = useState('overview');

  // ── Per-page cache: { [pageKey]: { data, status, lastUpdated } }
  const [cache, setCache]         = useState({});

  // ── Shared refresh UI state ───────────────────────────────────
  const [countdown, setCountdown] = useState(60);

  // ── Fetch for a given page key ────────────────────────────────
  const fetchPage = (pageKey) => {
    const endpoint = ENDPOINTS[pageKey];
    if (!endpoint) return;

    // Mark as loading only if we have no cached data yet
    setCache(prev => ({
      ...prev,
      [pageKey]: {
        data:        prev[pageKey]?.data ?? null,
        status:      prev[pageKey]?.data ? 'live' : 'loading',
        lastUpdated: prev[pageKey]?.lastUpdated ?? null,
      },
    }));

    fetch(endpoint)
      .then(res => {
        if (!res.ok) throw new Error('Network response was not ok');
        return res.json();
      })
      .then(result => {
        const processed = pageKey === 'overview' ? processOverview(result) : result;
        setCache(prev => ({
          ...prev,
          [pageKey]: {
            data:        processed,
            status:      'live',
            lastUpdated: new Date(),
          },
        }));
        setCountdown(60);
      })
      .catch(err => {
        console.error(`Failed to fetch ${pageKey}:`, err);
        setCache(prev => ({
          ...prev,
          [pageKey]: {
            data:        prev[pageKey]?.data ?? null,
            status:      'error',
            lastUpdated: prev[pageKey]?.lastUpdated ?? null,
          },
        }));
      });
  };

  // ── Fetch on page change ──────────────────────────────────────
  useEffect(() => {
    fetchPage(page);
  }, [page]);

  // ── Auto-refresh current page every 60 seconds ────────────────
  useEffect(() => {
    const interval = setInterval(() => fetchPage(page), 60000);
    return () => clearInterval(interval);
  }, [page]);

  // ── Countdown timer ───────────────────────────────────────────
  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown(c => (c <= 1 ? 60 : c - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // ── Current page data ─────────────────────────────────────────
  const current     = cache[page] ?? { data: null, status: 'loading', lastUpdated: null };
  const data        = current.data;
  const status      = current.status;
  const lastUpdated = current.lastUpdated;

  const manualRefresh = () => {
    setCountdown(60);
    fetchPage(page);
  };

  return (
    <DataContext.Provider value={{
      data,
      status,
      countdown,
      lastUpdated,
      manualRefresh,
      setPage,         // consumed by App.jsx on nav click
      currentPage: page,
    }}>
      {children}
    </DataContext.Provider>
  );
};

// ── Hook for easy consumption ─────────────────────────────────────
export function useData() {
  return useContext(DataContext);
}
