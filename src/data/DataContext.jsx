import React, { createContext, useState, useEffect, useContext, useCallback } from 'react';

export const DataContext = createContext();

const ENDPOINTS = {
  overview:    '/api/index?page=dashboard',
  performance: '/api/index?page=performance',
  activity:    '/api/index?page=activity',
  trends:      '/api/index?page=trends',
  outcomes:    '/api/index?page=outcomes',
  time:        '/api/index?page=time',
  scorecard:   '/api/index?page=scorecard',
  coaching:    '/api/index?page=coaching',
  meetings:    '/api/index?page=meetings',
  prospects:   '/api/index?page=prospects',
  research:    '/api/index?page=research',
  reports:     '/api/index?page=reports',
  settings:    '/api/index?page=settings',
};

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
  const [page, setPage]               = useState('overview');
  const [cache, setCache]             = useState({});
  const [countdown, setCountdown]     = useState(60);

  // ── Filters ───────────────────────────────────────────────────
  const [dateRange, setDateRange]     = useState('Today');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd]     = useState('');
  const [selectedBDR, setSelectedBDR] = useState('All');
  const [selectedCompany, setSelectedCompany] = useState('All');
  const [metricScope, setMetricScope] = useState('Personal');

  // ── Filter options (populated from DB) ───────────────────────
  const [bdrList, setBdrList]         = useState([]);
  const [companyList, setCompanyList] = useState([]);

  // ── Fetch filter options once on mount ────────────────────────
  useEffect(() => {
    fetch('/api/index?page=filters')
      .then(r => r.json())
      .then(d => {
        if (d.bdrs)      setBdrList(d.bdrs);
        if (d.companies) setCompanyList(d.companies);
      })
      .catch(() => {});
  }, []);

  // ── Build URL with all filter params ─────────────────────────
  const buildUrl = useCallback((pageKey, dr, cs, ce, bdr, company) => {
    const base = ENDPOINTS[pageKey];
    if (!base) return null;
    const params = new URLSearchParams();
    params.set('dateRange', dr || 'Today');
    if (dr === 'Custom' && cs && ce) {
      params.set('customStart', cs);
      params.set('customEnd', ce);
    }
    if (bdr && bdr !== 'All')     params.set('bdr', bdr);
    if (company && company !== 'All') params.set('company', company);
    return `${base}&${params.toString()}`;
  }, []);

  // ── Fetch for a given page key ────────────────────────────────
  const fetchPage = useCallback((pageKey, dr, cs, ce, bdr, company) => {
    const url = buildUrl(pageKey, dr, cs, ce, bdr, company);
    if (!url) return;

    setCache(prev => ({
      ...prev,
      [pageKey]: {
        data:        prev[pageKey]?.data ?? null,
        status:      prev[pageKey]?.data ? 'live' : 'loading',
        lastUpdated: prev[pageKey]?.lastUpdated ?? null,
      },
    }));

    fetch(url)
      .then(res => {
        if (!res.ok) throw new Error('Network response was not ok');
        return res.json();
      })
      .then(result => {
        const processed = pageKey === 'overview' ? processOverview(result) : result;
        setCache(prev => ({
          ...prev,
          [pageKey]: { data: processed, status: 'live', lastUpdated: new Date() },
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
  }, [buildUrl]);

  // ── Refetch when any filter changes ──────────────────────────
  useEffect(() => {
    fetchPage(page, dateRange, customStart, customEnd, selectedBDR, selectedCompany);
  }, [page, dateRange, customStart, customEnd, selectedBDR, selectedCompany]);

  // ── Auto-refresh every 60 seconds ────────────────────────────
  useEffect(() => {
    const interval = setInterval(
      () => fetchPage(page, dateRange, customStart, customEnd, selectedBDR, selectedCompany),
      60000
    );
    return () => clearInterval(interval);
  }, [page, dateRange, customStart, customEnd, selectedBDR, selectedCompany]);

  // ── Countdown timer ───────────────────────────────────────────
  useEffect(() => {
    const timer = setInterval(() => setCountdown(c => (c <= 1 ? 60 : c - 1)), 1000);
    return () => clearInterval(timer);
  }, []);

  const current     = cache[page] ?? { data: null, status: 'loading', lastUpdated: null };
  const data        = current.data;
  const status      = current.status;
  const lastUpdated = current.lastUpdated;

  const manualRefresh = () => {
    setCountdown(60);
    fetchPage(page, dateRange, customStart, customEnd, selectedBDR, selectedCompany);
  };

  return (
    <DataContext.Provider value={{
      data, status, countdown, lastUpdated, manualRefresh, setPage,
      currentPage: page,
      dateRange, setDateRange,
      customStart, setCustomStart,
      customEnd, setCustomEnd,
      selectedBDR, setSelectedBDR,
      selectedCompany, setSelectedCompany,
      metricScope, setMetricScope,
      bdrList, companyList,
    }}>
      {children}
    </DataContext.Provider>
  );
};

export function useData() {
  return useContext(DataContext);
}
