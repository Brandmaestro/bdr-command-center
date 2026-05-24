import { useState } from "react";
import { DataProvider, useData } from "./data/DataContext.jsx";
import Overview from "./pages/Overview.jsx";
import Performance from "./pages/Performance.jsx";
import Activity from "./pages/Activity.jsx";
import Trends from "./pages/Trends.jsx";
import Outcomes from "./pages/Outcomes.jsx";
import TimeIntelligence from "./pages/TimeIntelligence.jsx";
import Scorecard from "./pages/Scorecard.jsx";
import AICoaching from "./pages/AICoaching.jsx";
import BookedMeetings from "./pages/BookedMeetings.jsx";

const PAGES = {
  overview:    { title: "OVERVIEW",               sub: "Real-time overview of your outbound performance",              component: Overview },
  performance: { title: "PERFORMANCE OVERVIEW",   sub: "Detailed breakdown of your outbound performance metrics",     component: Performance },
  activity:    { title: "ACTIVITY",               sub: "Detailed breakdown of your outbound activities",              component: Activity },
  trends:      { title: "TRENDS",                 sub: "Track your outbound performance trends over time",            component: Trends },
  outcomes:    { title: "OUTCOMES",               sub: "Understand the results of your outbound efforts",             component: Outcomes },
  time:        { title: "TIME INTELLIGENCE",      sub: "Discover the best times to call, connect, and book meetings", component: TimeIntelligence },
  scorecard:   { title: "SCORECARD OVERVIEW",     sub: "Your daily performance scorecard and targets",               component: Scorecard },
  coaching:    { title: "AI COACHING & TRAINING", sub: "AI-powered insights to improve your conversations",          component: AICoaching },
  meetings:    { title: "BOOKED MEETINGS",         sub: "Track, analyze, and optimize every meeting you book",        component: BookedMeetings },
};

const NAV = [
  { id: "overview",    label: "Overview" },
  { id: "performance", label: "Performance Overview" },
  { id: "activity",    label: "Activity" },
  { id: "trends",      label: "Trends" },
  { id: "outcomes",    label: "Outcomes" },
  { id: "time",        label: "Time Intelligence" },
  { id: "scorecard",   label: "Scorecard" },
  { id: "coaching",    label: "AI Coaching", badge: "BETA" },
  { id: "meetings",    label: "Booked Meetings" },
];

const REFRESH_INTERVAL = 60;

function StatusBar() {
  const { status, lastUpdated, countdown, manualRefresh } = useData();

  const isLive    = status === 'live';
  const isError   = status === 'error';
  const isLoading = status === 'loading';

  const dotColor  = isLive ? "#22c55e" : isError ? "#ef4444" : "#fbbf24";
  const textColor = isLive ? "#22c55e" : isError ? "#ef4444" : "#fbbf24";
  const label     = isLive
    ? "Live data connected"
    : isError
    ? "Connection error — retrying"
    : "Connecting to database...";

  const timeStr = lastUpdated
    ? lastUpdated.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit" })
    : "—";

  const pct = ((REFRESH_INTERVAL - countdown) / REFRESH_INTERVAL) * 100;

  return (
    <div style={{ padding: "5px 24px", borderBottom: "1px solid #1e3a5f", background: "#060d1a", display: "flex", alignItems: "center", gap: 16, flexShrink: 0 }}>
      {/* Status */}
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <div style={{ width: 7, height: 7, borderRadius: "50%", background: dotColor, animation: isLive ? "pulse 2s infinite" : "none" }} />
        <span style={{ fontSize: 10, color: textColor, fontWeight: 600 }}>{label}</span>
      </div>

      {/* Last updated */}
      <span style={{ fontSize: 10, color: "#334155" }}>
        Last updated: <span style={{ color: "#475569" }}>{timeStr}</span>
      </span>

      {/* Countdown */}
      <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, fontSize: 10, color: "#334155" }}>
        Next refresh in
        <span style={{ color: "#475569", fontWeight: 600, margin: "0 4px" }}>{countdown}s</span>
        <div style={{ flex: 1, height: 3, background: "#112240", borderRadius: 2, overflow: "hidden" }}>
          <div style={{ width: `${pct}%`, height: "100%", background: "#1d4ed8", borderRadius: 2, transition: "width 1s linear" }} />
        </div>
      </div>

      {/* Refresh button */}
      <button
        onClick={manualRefresh}
        style={{ display: "flex", alignItems: "center", gap: 5, background: "#1e3a5f", border: "1px solid #2563eb", borderRadius: 6, padding: "4px 10px", fontSize: 11, color: "#60a5fa", cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}
      >
        ↻ Refresh Now
      </button>

      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }
      `}</style>
    </div>
  );
}

function AppInner() {
  const [current, setCurrent]   = useState("overview");
  const [dateRange, setDateRange] = useState("Today");
  const { data, status }        = useData();

  const page          = PAGES[current];
  const PageComponent = page.component;

  return (
    <div style={{ display: "flex", height: "100vh", background: "#060d1a", color: "#e2e8f0", fontFamily: "'DM Sans',ui-sans-serif,sans-serif", fontSize: 13 }}>

      {/* ── SIDEBAR ── */}
      <div style={{ width: 210, minWidth: 210, background: "#0a1628", borderRight: "1px solid #1e3a5f", display: "flex", flexDirection: "column" }}>

        {/* Logo */}
        <div style={{ padding: "18px 16px", borderBottom: "1px solid #1e3a5f", display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 32, height: 32, background: "linear-gradient(135deg,#3b82f6,#1d4ed8)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
            </svg>
          </div>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#e2e8f0", lineHeight: 1.3, textTransform: "uppercase", letterSpacing: ".6px" }}>
            Outbound<br />Command Center
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: "14px 10px", display: "flex", flexDirection: "column", gap: 2, overflowY: "auto" }}>
          {NAV.map(item => {
            const active = current === item.id;
            return (
              <div
                key={item.id}
                onClick={() => setCurrent(item.id)}
                style={{ display: "flex", alignItems: "center", gap: 9, padding: "8px 12px", borderRadius: 7, cursor: "pointer", userSelect: "none", color: active ? "#60a5fa" : "#64748b", background: active ? "#1e3a5f" : "transparent", fontSize: 12.5, fontWeight: 500 }}
              >
                {item.label}
                {item.badge && (
                  <span style={{ marginLeft: "auto", background: "#1d4ed8", color: "#93c5fd", fontSize: 9, padding: "2px 6px", borderRadius: 4, fontWeight: 700 }}>
                    {item.badge}
                  </span>
                )}
              </div>
            );
          })}
        </nav>

        {/* System status */}
        <div style={{ padding: "14px 16px", borderTop: "1px solid #1e3a5f" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 4 }}>
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#22c55e", animation: "pulse 2s infinite" }} />
            <span style={{ fontSize: 11.5, color: "#22c55e", fontWeight: 600 }}>All systems operational</span>
          </div>
          <div style={{ fontSize: 10, color: "#334155" }}>Evident IT · Client ID: 1</div>
        </div>
      </div>

      {/* ── MAIN ── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

        {/* Topbar */}
        <div style={{ padding: "14px 24px", borderBottom: "1px solid #1e3a5f", display: "flex", alignItems: "center", justifyContent: "space-between", background: "#0a1628", flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, color: "#e2e8f0", letterSpacing: "-.2px" }}>{page.title}</div>
            <div style={{ fontSize: 11, color: "#475569", marginTop: 2 }}>{page.sub}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button
              onClick={() => setDateRange(d => d === "Today" ? "This Week" : d === "This Week" ? "This Month" : "Today")}
              style={{ display: "flex", alignItems: "center", gap: 6, background: "#112240", border: "1px solid #1e3a5f", borderRadius: 7, padding: "7px 12px", fontSize: 11.5, color: "#94a3b8", cursor: "pointer", fontFamily: "inherit" }}
            >
              📅 {dateRange} ▾
            </button>
            <button style={{ background: "#1d4ed8", border: "none", borderRadius: 7, padding: "7px 14px", fontSize: 11.5, color: "#fff", fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
              ⬇ Export Report
            </button>
          </div>
        </div>

        {/* Status Bar */}
        <StatusBar />

        {/* Filters */}
        <div style={{ padding: "8px 24px", borderBottom: "1px solid #1e3a5f", display: "flex", alignItems: "center", gap: 12, background: "#0a1628", flexShrink: 0 }}>
          {[
            { label: "Date Range",    opts: ["Today", "This Week", "This Month", "Last 7 Days", "Last 30 Days"] },
            { label: "SDR",           opts: ["All", "Didier"] },
            { label: "Outcome",       opts: ["All Outcomes", "Meeting Booked", "Human Conversation", "Not Interested", "No Answer", "Voicemail"] },
            { label: "Meeting Booked",opts: ["All", "Yes", "No"] },
          ].map((f, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 11, color: "#334155", fontWeight: 500 }}>{f.label}</span>
              <select style={{ background: "#112240", border: "1px solid #1e3a5f", borderRadius: 6, color: "#94a3b8", fontSize: 11, padding: "4px 8px", cursor: "pointer", fontFamily: "inherit" }}>
                {f.opts.map(o => <option key={o}>{o}</option>)}
              </select>
            </div>
          ))}
        </div>

        {/* Page Content */}
        <div style={{ flex: 1, overflowY: "auto", padding: "18px 24px" }}>
          {status === "loading" ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", flexDirection: "column", gap: 12 }}>
              <div style={{ fontSize: 32, animation: "spin 1s linear infinite", display: "inline-block" }}>↻</div>
              <div style={{ fontSize: 14, color: "#60a5fa" }}>Connecting to database...</div>
            </div>
          ) : (
            <PageComponent data={data} dateRange={dateRange} />
          )}
        </div>
      </div>

      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }
        @keyframes spin  { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        ::-webkit-scrollbar { width:4px; height:4px }
        ::-webkit-scrollbar-track { background:transparent }
        ::-webkit-scrollbar-thumb { background:#1e3a5f; border-radius:2px }
      `}</style>
    </div>
  );
}

export default function App() {
  return (
    <DataProvider>
      <AppInner />
    </DataProvider>
  );
}
