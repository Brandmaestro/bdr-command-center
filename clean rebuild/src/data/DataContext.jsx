import React, { createContext, useState, useEffect, useRef } from 'react';

export const DataContext = createContext();

export const DataProvider = ({ children }) => {
  const [data, setData] = useState(null);
  const [status, setStatus] = useState('loading');
  const [countdown, setCountdown] = useState(60);
  const [lastUpdated, setLastUpdated] = useState(null);

  const processResult = (result) => ({
    ...result,
    today: {
      calls_today: result.today?.calls_today ?? 0,
      meetings_today: result.today?.meetings_today ?? 0,
      conversations_today: result.today?.conversations_today ?? 0,
      conversation_rate_today: result.today?.conversation_rate_today ?? 0,
      not_interested_today: result.today?.not_interested_today ?? 0,
      no_answer_today: result.today?.no_answer_today ?? 0,
      voicemail_today: result.today?.voicemail_today ?? 0,
      gatekeeper_today: result.today?.gatekeeper_today ?? 0,
      avg_score_today: result.today?.avg_score_today ?? 0,
      avg_duration_today: result.today?.avg_duration_today ?? 0,
    }
  });

  const fetchData = () => {
    fetch('/api/dashboard')
      .then(res => {
        if (!res.ok) throw new Error('Network response was not ok');
        return res.json();
      })
      .then(result => {
        setData(processResult(result));
        setStatus('live');
        setLastUpdated(new Date());
        setCountdown(60);
      })
      .catch(err => {
        console.error("Failed to fetch data:", err);
        setStatus('error');
      });
  };

  // Initial fetch
  useEffect(() => { fetchData(); }, []);

  // Auto-refresh every 60 seconds
  useEffect(() => {
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, []);

  // Countdown timer
  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown(c => c <= 1 ? 60 : c - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <DataContext.Provider value={{
      data, status, countdown, lastUpdated, manualRefresh: fetchData
    }}>
      {children}
    </DataContext.Provider>
  );
};

// Hook for easy consumption
export function useData() {
  return React.useContext(DataContext);
}
