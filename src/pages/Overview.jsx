import React, { useContext, useEffect, useRef, useState } from 'react';
import { DataContext } from '../data/DataContext.jsx';
import {
  formatDuration, getInitials, outcomeClass, colorForCompany,
  calculateConversationRate, OUTCOME_COLORS, OUTCOME_LABELS
} from '../utils/dataHelpers.js';

// ── Mini sparkline ──────────────────────────────────────────────
function MiniChart({ values, color }) {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !values || values.length < 2) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    const max = Math.max(...values, 1), min = Math.min(...values, 0);
    const range = max - min || 1;
    const pts = values.map((v, i) => ({
      x: (i / (values.length - 1)) * w,
      y: h - ((v - min) / range) * h * 0.75 - h * 0.1,
    }));
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    pts.slice(1).forEach(p => ctx.lineTo(p.x, p.y));
    ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.stroke();
    pts.forEach(p => {
      ctx.beginPath(); ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
      ctx.fillStyle = color; ctx.fill();
    });
  }, [values, color]);
  return <canvas ref={ref} width={120} height={32} style={{ width: '100%', height: 32 }} />;
}

// ── Donut chart ─────────────────────────────────────────────────
function DonutChart({ values, colors, size, centerText, centerSub }) {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, size, size);
    const total = values.reduce((a, b) => a + b, 0) || 1;
    const cx = size / 2, cy = size / 2, r = size / 2 - 2, inner = r * 0.68;
    let angle = -Math.PI / 2;
    values.forEach((v, i) => {
      const slice = (v / total) * Math.PI * 2;
      ctx.beginPath(); ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, angle, angle + slice);
      ctx.closePath(); ctx.fillStyle = colors[i % colors.length]; ctx.fill();
      angle += slice;
    });
    ctx.beginPath(); ctx.arc(cx, cy, inner, 0, Math.PI * 2);
    ctx.fillStyle = '#0d1f38'; ctx.fill();
  }, [values, colors, size]);
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <canvas ref={ref} width={size} height={size} style={{ width: size, height: size }} />
      {centerText && (
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', textAlign: 'center', pointerEvents: 'none' }}>
          <div style={{ fontSize: size * 0.18, fontWeight: 700, color: '#e2e8f0' }}>{centerText}</div>
          {centerSub && <div style={{ fontSize: size * 0.09, color: '#475569' }}>{centerSub}</div>}
        </div>
      )}
    </div>
  );
}

// ── Badge ───────────────────────────────────────────────────────
function Badge({ text, cls }) {
  const map = {
    meeting:       { background: '#052e16', color: '#4ade80' },
    followup:      { background: '#1e1b4b', color: '#a5b4fc' },
    gatekeeper:    { background: '#1c1917', color: '#a8a29e' },
    notinterested: { background: '#450a0a', color: '#f87171' },
    voicemail:     { background: '#0c1a2e', color: '#60a5fa' },
    other:         { background: '#1e293b', color: '#94a3b8' },
  };
  const s = map[cls] || map.other;
  return <span style={{ ...s, display: 'inline-block', padding: '3px 8px', borderRadius: 5, fontSize: 10, fontWeight: 600, whiteSpace: 'nowrap' }}>{text}</span>;
}

// ── Score badge ─────────────────────────────────────────────────
function ScoreBadge({ score }) {
  const v = score || 0;
  const color = v >= 8 ? '#22c55e' : v >= 6 ? '#fbbf24' : v > 0 ? '#ef4444' : '#334155';
  const bg    = v >= 8 ? '#052e16' : v >= 6 ? '#1c1205' : v > 0 ? '#450a0a' : '#1e293b';
  return (
    <div style={{ width: 24, height: 24, borderRadius: '50%', background: bg, border: `1px solid ${color}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color, flexShrink: 0 }}>
      {v || '—'}
    </div>
  );
}

// ── Pagination controls ─────────────────────────────────────────
function Pagination({ currentPage, totalPages, onChange }) {
  if (totalPages <= 1) return null;
  const pages = Array.from({ length: totalPages }, (_, i) => i + 1);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <button
        onClick={() => onChange(Math.max(1, currentPage - 1))}
        disabled={currentPage === 1}
        style={{ width: 28, height: 28, borderRadius: 5, border: '1px solid #1e3a5f', background: currentPage === 1 ? '#071428' : '#112240', color: currentPage === 1 ? '#334155' : '#60a5fa', cursor: currentPage === 1 ? 'not-allowed' : 'pointer', fontSize: 14, fontWeight: 700 }}
      >‹</button>
      {pages.map(p => (
        <button key={p} onClick={() => onChange(p)}
          style={{ width: 28, height: 28, borderRadius: 5, border: '1px solid #1e3a5f', background: currentPage === p ? '#1d4ed8' : '#112240', color: currentPage === p ? '#fff' : '#60a5fa', cursor: 'pointer', fontSize: 12, fontWeight: currentPage === p ? 700 : 400 }}
        >{p}</button>
      ))}
      <button
        onClick={() => onChange(Math.min(totalPages, currentPage + 1))}
        disabled={currentPage === totalPages}
        style={{ width: 28, height: 28, borderRadius: 5, border: '1px solid #1e3a5f', background: currentPage === totalPages ? '#071428' : '#112240', color: currentPage === totalPages ? '#334155' : '#60a5fa', cursor: currentPage === totalPages ? 'not-allowed' : 'pointer', fontSize: 14, fontWeight: 700 }}
      >›</button>
    </div>
  );
}

// ── Call Table (reused in both main feed and modal) ─────────────
function CallTable({ rows, currentPage, totalPages, onPageChange, totalCount }) {
  const ROWS_PER_PAGE = 7;
  return (
    <>
      {rows.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '20px 0', color: '#334155', fontSize: 12 }}>No calls found</div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['TIME','COMPANY','OUTCOME','CONVERSATION','SCORE','DURATION','NOTES'].map(h => (
                <th key={h} style={{ fontSize: 9.5, fontWeight: 600, color: '#475569', textTransform: 'uppercase', letterSpacing: '.5px', padding: '0 10px 8px 0', textAlign: 'left', borderBottom: '1px solid #1e3a5f' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={row.id || i}>
                <td style={{ padding: '8px 10px 8px 0', fontSize: 11, color: '#e2e8f0', fontFamily: "'DM Mono',monospace", borderBottom: '1px solid #071428' }}>{row.time}</td>
                <td style={{ padding: '8px 10px 8px 0', borderBottom: '1px solid #071428' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 22, height: 22, borderRadius: 5, background: row.bg, color: row.fg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 8, flexShrink: 0 }}>{row.initials}</div>
                    <span style={{ fontSize: 12, color: '#e2e8f0', fontWeight: 500 }}>{row.company}</span>
                  </div>
                </td>
                <td style={{ padding: '8px 10px 8px 0', borderBottom: '1px solid #071428' }}><Badge text={row.outcome} cls={row.outcomeCls} /></td>
                <td style={{ padding: '8px 10px 8px 0', fontSize: 11, color: row.conv ? '#22c55e' : '#334155', borderBottom: '1px solid #071428' }}>{row.conv ? 'Human Conv.' : 'No Conv.'}</td>
                <td style={{ padding: '8px 10px 8px 0', borderBottom: '1px solid #071428' }}><ScoreBadge score={row.score} /></td>
                <td style={{ padding: '8px 10px 8px 0', fontSize: 11, color: '#94a3b8', fontFamily: "'DM Mono',monospace", borderBottom: '1px solid #071428' }}>{row.dur}</td>
                <td style={{ padding: '8px 10px 8px 0', fontSize: 11, color: '#475569', maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', borderBottom: '1px solid #071428' }}>{row.notes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}>
        <span style={{ fontSize: 11, color: '#334155' }}>
          Showing {Math.min((currentPage - 1) * ROWS_PER_PAGE + 1, totalCount)} to {Math.min(currentPage * ROWS_PER_PAGE, totalCount)} of {totalCount} calls
        </span>
        <Pagination currentPage={currentPage} totalPages={totalPages} onChange={onPageChange} />
      </div>
    </>
  );
}

// ── All Calls Modal ─────────────────────────────────────────────
function AllCallsModal({ allRows, onClose }) {
  const ROWS_PER_PAGE = 10;
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState('All');

  const outcomes = ['All', 'Meeting Booked', 'Human Conversation', 'Not Interested', 'Voicemail', 'Gatekeeper Only', 'No Conversation'];

  const filtered = filter === 'All' ? allRows : allRows.filter(r => r.outcome === filter);
  const totalPages = Math.ceil(filtered.length / ROWS_PER_PAGE);
  const pageRows = filtered.slice((page - 1) * ROWS_PER_PAGE, page * ROWS_PER_PAGE);

  // Reset to page 1 when filter changes
  const handleFilter = (f) => { setFilter(f); setPage(1); };

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.75)', zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 20px', overflowY: 'auto' }}>
      <div style={{ background: '#0d1f38', border: '1px solid #1e3a5f', borderRadius: 12, width: '100%', maxWidth: 1100, padding: 24 }}>

        {/* Modal header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#e2e8f0' }}>ALL CALLS</div>
            <div style={{ fontSize: 11, color: '#475569', marginTop: 2 }}>Complete call history — last 7 days</div>
          </div>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 7, border: '1px solid #1e3a5f', background: '#112240', color: '#94a3b8', cursor: 'pointer', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, color: '#475569', fontWeight: 500 }}>Filter by outcome:</span>
          {outcomes.map(o => (
            <button key={o} onClick={() => handleFilter(o)}
              style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #1e3a5f', background: filter === o ? '#1d4ed8' : '#112240', color: filter === o ? '#fff' : '#60a5fa', cursor: 'pointer', fontSize: 11, fontWeight: filter === o ? 600 : 400, fontFamily: 'inherit' }}
            >{o}</button>
          ))}
          <span style={{ marginLeft: 'auto', fontSize: 11, color: '#334155' }}>{filtered.length} calls</span>
        </div>

        {/* Table */}
        <CallTable
          rows={pageRows}
          currentPage={page}
          totalPages={totalPages}
          onPageChange={setPage}
          totalCount={filtered.length}
        />
      </div>
    </div>
  );
}

// ── Main Overview ───────────────────────────────────────────────
const Overview = () => {
  const { data, status } = useContext(DataContext);
  const [currentPage, setCurrentPage] = useState(1);
  const [showAllCalls, setShowAllCalls] = useState(false);
  const ROWS_PER_PAGE = 7;

  if (status === 'loading') return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontSize: 32, animation: 'spin 1s linear infinite', display: 'inline-block' }}>↻</div>
      <div style={{ fontSize: 14, color: '#60a5fa' }}>Connecting to database...</div>
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  if (status === 'error') return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontSize: 32 }}>⚠️</div>
      <div style={{ fontSize: 14, color: '#ef4444' }}>Error connecting to database.</div>
    </div>
  );

  const today    = data.today    || {};
  const week     = data.week     || {};
  const callFeed = data.callFeed || [];

  const callsToday     = today.calls_today           ?? 0;
  const meetingsToday  = today.meetings_today        ?? 0;
  const convsToday     = today.conversations_today   ?? 0;
  const noAnswerToday  = today.no_answer_today       ?? 0;
  const notInterested  = today.not_interested_today  ?? 0;
  const voicemail      = today.voicemail_today       ?? 0;
  const gatekeeper     = today.gatekeeper_today      ?? 0;
  const avgDurSec      = today.avg_duration_today    ?? 0;

  const callsThisWeek    = week.calls_this_week    ?? 0;
  const convsThisWeek    = week.conv_this_week     ?? 0;
  const meetingsThisWeek = week.meetings_this_week ?? 0;
  const convsLastWeek    = week.conv_last_week     ?? 0;
  const convRateCalc     = calculateConversationRate(data);

  const momentum = convsLastWeek > 0
    ? Math.round(((convsThisWeek - convsLastWeek) / convsLastWeek) * 100) : 0;

  const outcomeValues = [convsToday, noAnswerToday, notInterested, voicemail, gatekeeper, 0];
  const totalOutcomes = outcomeValues.reduce((a, b) => a + b, 0) || 1;

  const cards = [
    { icon: '📞', bg: '#0c2a5c', label: 'Calls Made Today',    value: String(callsToday),    change: `${callsThisWeek} this week`,    up: true,  spark: [callsThisWeek*.4, callsThisWeek*.6, callsThisWeek*.8, callsThisWeek*.9, callsThisWeek], color: '#3b82f6' },
    { icon: '👥', bg: '#052e16', label: 'Human Conversations', value: String(convsToday),    change: `${convsThisWeek} this week`,    up: true,  spark: [convsThisWeek*.4, convsThisWeek*.6, convsThisWeek*.8, convsThisWeek*.9, convsThisWeek], color: '#22c55e' },
    { icon: '📈', bg: '#1e1b4b', label: 'Conversation Rate',   value: `${convRateCalc}%`,    change: `↑ vs last week`,               up: true,  spark: [16,18,20,19,convRateCalc], color: '#a5b4fc' },
    { icon: '🚫', bg: '#450a0a', label: 'Not Interested',      value: String(notInterested), change: `— vs yesterday`,               up: false, spark: [3,5,4,6,notInterested], color: '#ef4444' },
    { icon: '📅', bg: '#0c1a2e', label: 'Meetings Booked',     value: String(meetingsToday), change: `${meetingsThisWeek} this week`, up: true,  spark: [meetingsThisWeek*.3, meetingsThisWeek*.5, meetingsThisWeek*.7, meetingsThisWeek*.9, meetingsThisWeek], color: '#60a5fa' },
    { icon: '🚀', bg: '#052e16', label: 'Conv. Momentum',      value: `${momentum >= 0 ? '+' : ''}${momentum}%`, change: 'vs last week', up: momentum >= 0, spark: [5,10,15,20,momentum], color: '#22c55e' },
  ];

  // Transform all call feed rows
  const allRows = callFeed.map(c => {
    const col = colorForCompany(c.company_name);
    let timeStr = '—';
    if (c.call_time) {
      try { timeStr = new Date(`2000-01-01T${c.call_time}`).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }); }
      catch { timeStr = c.call_time; }
    }
    return {
      id: c.id,
      time: timeStr,
      company: c.company_name || 'Unknown',
      initials: getInitials(c.company_name),
      bg: col.bg, fg: col.fg,
      outcome: c.contact_outcome || 'Unknown',
      outcomeCls: outcomeClass(c.contact_outcome),
      conv: Boolean(c.is_human_conversation),
      score: c.overall_call_score || 0,
      dur: formatDuration(c.call_duration_seconds),
      notes: c.ai_summary || c.conversation_detail || '—',
    };
  });

  const totalPages = Math.ceil(allRows.length / ROWS_PER_PAGE);
  const pageRows = allRows.slice((currentPage - 1) * ROWS_PER_PAGE, currentPage * ROWS_PER_PAGE);
  const card = { background: '#0d1f38', border: '1px solid #1e3a5f', borderRadius: 10, padding: '14px 16px' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* All Calls Modal */}
      {showAllCalls && <AllCallsModal allRows={allRows} onClose={() => setShowAllCalls(false)} />}

      {/* Stat Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 10 }}>
        {cards.map((c, i) => (
          <div key={i} style={card}>
            <div style={{ width: 36, height: 36, borderRadius: 9, background: c.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 10, fontSize: 17 }}>{c.icon}</div>
            <div style={{ fontSize: 9.5, fontWeight: 600, color: '#475569', textTransform: 'uppercase', letterSpacing: '.6px', marginBottom: 5 }}>{c.label}</div>
            <div style={{ fontSize: 26, fontWeight: 700, color: '#e2e8f0', letterSpacing: '-.8px', lineHeight: 1, marginBottom: 4 }}>{c.value}</div>
            <div style={{ fontSize: 11, fontWeight: 500, color: c.up ? '#22c55e' : '#ef4444', marginBottom: 8 }}>{c.change}</div>
            <MiniChart values={c.spark} color={c.color} />
          </div>
        ))}
      </div>

      {/* Two-column layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 14 }}>

        {/* Left */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Live Call Feed */}
          <div style={card}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11, fontWeight: 700, color: '#e2e8f0', textTransform: 'uppercase', letterSpacing: '.5px' }}>
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#22c55e', animation: 'pulse 2s infinite' }} />
                LIVE CALL FEED
              </div>
              <span
                onClick={() => setShowAllCalls(true)}
                style={{ fontSize: 10, color: '#60a5fa', cursor: 'pointer', fontWeight: 600, padding: '3px 8px', borderRadius: 5, border: '1px solid #1e3a5f', background: '#112240' }}
              >View All Calls →</span>
            </div>
            <div style={{ fontSize: 10, color: '#475569', marginBottom: 12 }}>Real-time feed of your most recent calls — last 7 days</div>

            <CallTable
              rows={pageRows}
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={setCurrentPage}
              totalCount={allRows.length}
            />
          </div>

          {/* Bottom 4 cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 }}>
            {[
              { label: 'Best Conv. Hour',   value: '10 AM',                   color: '#22c55e' },
              { label: 'Best Meeting Hour', value: '11 AM',                   color: '#60a5fa' },
              { label: 'Highest No Answer', value: '1 PM',                    color: '#ef4444' },
              { label: 'Avg Call Time',     value: formatDuration(avgDurSec), color: '#a5b4fc' },
            ].map((item, i) => (
              <div key={i} style={{ ...card, textAlign: 'center' }}>
                <div style={{ fontSize: 10, color: '#475569', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 6 }}>{item.label}</div>
                <div style={{ fontSize: 26, fontWeight: 700, color: item.color, letterSpacing: '-1px' }}>{item.value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Right column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Outcome Breakdown */}
          <div style={card}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#e2e8f0', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 10 }}>
              OUTCOME BREAKDOWN <span style={{ fontSize: 10, color: '#475569', fontWeight: 400 }}>Today</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <DonutChart
                values={totalOutcomes > 0 ? outcomeValues : [1]}
                colors={totalOutcomes > 0 ? OUTCOME_COLORS : ['#1e3a5f']}
                size={110} centerText={String(callsToday)} centerSub="Total"
              />
              <div style={{ flex: 1 }}>
                {OUTCOME_LABELS.map((label, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11, color: '#94a3b8', marginBottom: 5 }}>
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      <div style={{ width: 9, height: 9, borderRadius: '50%', background: OUTCOME_COLORS[i], marginRight: 7 }} />
                      {label}
                    </div>
                    <span style={{ color: i === 0 ? '#22c55e' : '#94a3b8' }}>
                      {outcomeValues[i]} ({((outcomeValues[i] / totalOutcomes) * 100).toFixed(1)}%)
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* This Week */}
          <div style={card}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#e2e8f0', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 12 }}>THIS WEEK</div>
            {[
              { label: 'Calls Made',      value: callsThisWeek,    color: '#60a5fa' },
              { label: 'Conversations',   value: convsThisWeek,    color: '#22c55e' },
              { label: 'Meetings Booked', value: meetingsThisWeek, color: '#a5b4fc' },
              { label: 'Conv. Rate',      value: `${convRateCalc}%`, color: '#a5b4fc' },
            ].map((item, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: i < 3 ? '1px solid #071428' : 'none', fontSize: 12 }}>
                <span style={{ color: '#94a3b8' }}>{item.label}</span>
                <span style={{ color: item.color, fontWeight: 700 }}>{String(item.value)}</span>
              </div>
            ))}
          </div>

          {/* System Status */}
          <div style={{ background: '#071428', border: '1px solid #0f2a47', borderRadius: 10, padding: '14px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e' }} />
              <span style={{ fontSize: 12, fontWeight: 700, color: '#22c55e' }}>SYSTEM STATUS</span>
            </div>
            <div style={{ fontSize: 11, color: '#22c55e', marginBottom: 4 }}>All systems running</div>
            <div style={{ fontSize: 10, color: '#334155' }}>OpenPhone · Deepgram · Gemini · HubSpot · Make.com · Neon DB</div>
          </div>
        </div>
      </div>

      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}`}</style>
    </div>
  );
};

export default Overview;
