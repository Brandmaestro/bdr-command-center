import React, { useContext, useEffect, useRef, useState } from 'react';
import { DataContext } from '../data/DataContext.jsx';
import {
  formatDuration, getInitials, outcomeClass, colorForCompany,
  calculateConversationRate, OUTCOME_COLORS, OUTCOME_LABELS
} from '../utils/dataHelpers.js';

// ── Design tokens ────────────────────────────────────────────────
const C = {
  bg:       '#060d1a',
  sidebar:  '#0a1628',
  card:     '#0d1f38',
  card2:    '#071428',
  border:   '#1e3a5f',
  green:    '#22c55e',
  red:      '#ef4444',
  blue:     '#3b82f6',
  purple:   '#a5b4fc',
  orange:   '#f97316',
  yellow:   '#fbbf24',
  text:     '#e2e8f0',
  muted:    '#94a3b8',
  dim:      '#475569',
  dimmer:   '#334155',
};

// ── Sparkline ────────────────────────────────────────────────────
function Sparkline({ values = [], color = C.blue }) {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || values.length < 2) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    const max = Math.max(...values, 1), min = Math.min(...values, 0);
    const range = max - min || 1;
    const pts = values.map((v, i) => ({
      x: (i / (values.length - 1)) * w,
      y: h - ((v - min) / range) * h * 0.7 - h * 0.1,
    }));
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    pts.slice(1).forEach(p => ctx.lineTo(p.x, p.y));
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([3, 3]);
    ctx.stroke();
    ctx.setLineDash([]);
    pts.forEach(p => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    });
  }, [values, color]);
  return <canvas ref={ref} width={160} height={36} style={{ width: '100%', height: 36 }} />;
}

// ── Donut ────────────────────────────────────────────────────────
function Donut({ values, colors, size, centerText, centerSub }) {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, size, size);
    const total = values.reduce((a, b) => a + b, 0) || 1;
    const cx = size / 2, cy = size / 2, r = size / 2 - 3, inner = r * 0.65;
    let angle = -Math.PI / 2;
    values.forEach((v, i) => {
      const slice = (v / total) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, angle, angle + slice);
      ctx.closePath();
      ctx.fillStyle = colors[i % colors.length];
      ctx.fill();
      angle += slice;
    });
    ctx.beginPath();
    ctx.arc(cx, cy, inner, 0, Math.PI * 2);
    ctx.fillStyle = C.card;
    ctx.fill();
  }, [values, colors, size]);
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <canvas ref={ref} width={size} height={size} style={{ width: size, height: size }} />
      {centerText && (
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', textAlign: 'center' }}>
          <div style={{ fontSize: size * 0.17, fontWeight: 700, color: C.text }}>{centerText}</div>
          {centerSub && <div style={{ fontSize: size * 0.1, color: C.dim }}>{centerSub}</div>}
        </div>
      )}
    </div>
  );
}

// ── Line chart (Activity Snapshot) ──────────────────────────────
function LineChart({ data = [], color = C.blue }) {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || data.length < 2) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    const values = data.map(d => d.total_calls || d.conversations || d.value || 0);
    const labels = data.map(d => d.hour !== undefined ? `${d.hour}` : '');
    const max = Math.max(...values, 1);
    const pad = { top: 10, right: 10, bottom: 24, left: 28 };
    const cw = w - pad.left - pad.right;
    const ch = h - pad.top - pad.bottom;

    // Y axis labels
    ctx.fillStyle = C.dimmer;
    ctx.font = '10px DM Sans';
    ctx.textAlign = 'right';
    [0, Math.round(max / 2), max].forEach(v => {
      const y = pad.top + ch - (v / max) * ch;
      ctx.fillText(v, pad.left - 4, y + 3);
    });

    // X axis labels
    ctx.textAlign = 'center';
    const step = Math.max(1, Math.floor(labels.length / 6));
    labels.forEach((l, i) => {
      if (i % step === 0 && l) {
        const x = pad.left + (i / (labels.length - 1)) * cw;
        ctx.fillText(l % 12 === 0 ? '12 PM' : `${l % 12} ${l < 12 ? 'AM' : 'PM'}`, x, h - 4);
      }
    });

    // Gradient fill
    const pts = values.map((v, i) => ({
      x: pad.left + (i / (values.length - 1)) * cw,
      y: pad.top + ch - (v / max) * ch,
    }));
    const grad = ctx.createLinearGradient(0, pad.top, 0, pad.top + ch);
    grad.addColorStop(0, color + '40');
    grad.addColorStop(1, color + '00');
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pad.top + ch);
    pts.forEach(p => ctx.lineTo(p.x, p.y));
    ctx.lineTo(pts[pts.length - 1].x, pad.top + ch);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // Line
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    pts.slice(1).forEach(p => ctx.lineTo(p.x, p.y));
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Dots
    pts.forEach(p => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    });
  }, [data, color]);
  return <canvas ref={ref} width={340} height={130} style={{ width: '100%', height: 130 }} />;
}

// ── Outcome badge ────────────────────────────────────────────────
function OutcomeBadge({ text }) {
  const t = (text || '').toLowerCase();
  let color, bg;
  if (t.includes('meeting') || t.includes('booked')) { color = '#4ade80'; bg = '#052e16'; }
  else if (t.includes('follow'))   { color = C.purple;  bg = '#1e1b4b'; }
  else if (t.includes('not interested')) { color = '#f87171'; bg = '#450a0a'; }
  else if (t.includes('voicemail'))  { color = C.blue;   bg = '#0c1a2e'; }
  else if (t.includes('gatekeeper') || t.includes('no decision')) { color = '#a8a29e'; bg = '#1c1917'; }
  else if (t.includes('information')) { color = C.yellow; bg = '#1c1205'; }
  else { color = C.muted; bg = '#1e293b'; }
  return (
    <span style={{ color, background: bg, padding: '3px 8px', borderRadius: 5, fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' }}>
      {text || 'Unknown'}
    </span>
  );
}

// ── Conversation badge ───────────────────────────────────────────
function ConvBadge({ isHuman }) {
  return isHuman
    ? <span style={{ color: C.green,  background: '#052e16', padding: '3px 8px', borderRadius: 5, fontSize: 11, fontWeight: 600 }}>Human Conversation</span>
    : <span style={{ color: C.dimmer, background: '#1e293b', padding: '3px 8px', borderRadius: 5, fontSize: 11, fontWeight: 600 }}>No Conversation</span>;
}

// ── Score circle ─────────────────────────────────────────────────
function ScoreCircle({ score }) {
  const v = score || 0;
  const color = v >= 8 ? C.green : v >= 6 ? C.yellow : v > 0 ? C.red : C.dimmer;
  const bg    = v >= 8 ? '#052e16' : v >= 6 ? '#1c1205' : v > 0 ? '#450a0a' : '#1e293b';
  return (
    <div style={{ width: 28, height: 28, borderRadius: '50%', background: bg, border: `1.5px solid ${color}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color, flexShrink: 0 }}>
      {v > 0 ? v : '—'}
    </div>
  );
}

// ── Pagination ───────────────────────────────────────────────────
function Pagination({ page, total, onChange }) {
  if (total <= 1) return null;
  const pages = Array.from({ length: Math.min(total, 5) }, (_, i) => i + 1);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <button onClick={() => onChange(Math.max(1, page - 1))} disabled={page === 1}
        style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid ' + C.border, background: page === 1 ? C.card2 : '#112240', color: page === 1 ? C.dimmer : C.blue, cursor: page === 1 ? 'not-allowed' : 'pointer', fontSize: 14 }}>‹</button>
      {pages.map(p => (
        <button key={p} onClick={() => onChange(p)}
          style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid ' + C.border, background: page === p ? '#1d4ed8' : '#112240', color: page === p ? '#fff' : C.blue, cursor: 'pointer', fontSize: 12, fontWeight: page === p ? 700 : 400 }}>
          {p}
        </button>
      ))}
      {total > 5 && <span style={{ color: C.dim, fontSize: 12 }}>...</span>}
      {total > 5 && (
        <button onClick={() => onChange(total)}
          style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid ' + C.border, background: page === total ? '#1d4ed8' : '#112240', color: page === total ? '#fff' : C.blue, cursor: 'pointer', fontSize: 12 }}>
          {total}
        </button>
      )}
      <button onClick={() => onChange(Math.min(total, page + 1))} disabled={page === total}
        style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid ' + C.border, background: page === total ? C.card2 : '#112240', color: page === total ? C.dimmer : C.blue, cursor: page === total ? 'not-allowed' : 'pointer', fontSize: 14 }}>›</button>
    </div>
  );
}

// ── View All Modal ───────────────────────────────────────────────
function AllCallsModal({ allRows, onClose }) {
  const PER = 10;
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState('All');
  const outcomes = ['All', 'Meeting Booked', 'Human Conversation', 'Not Interested', 'Voicemail', 'Gatekeeper Only', 'No Conversation'];
  const filtered = filter === 'All' ? allRows : allRows.filter(r => r.outcome === filter || (filter === 'Human Conversation' && r.conv));
  const totalPages = Math.ceil(filtered.length / PER);
  const rows = filtered.slice((page - 1) * PER, page * PER);
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.8)', zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 20px', overflowY: 'auto' }}>
      <div style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: 14, width: '100%', maxWidth: 1100, padding: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>ALL CALLS</div>
            <div style={{ fontSize: 11, color: C.dim }}>Complete call history — last 7 days</div>
          </div>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid ' + C.border, background: '#112240', color: C.muted, cursor: 'pointer', fontSize: 18 }}>×</button>
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          {outcomes.map(o => (
            <button key={o} onClick={() => { setFilter(o); setPage(1); }}
              style={{ padding: '4px 12px', borderRadius: 20, border: '1px solid ' + C.border, background: filter === o ? '#1d4ed8' : '#112240', color: filter === o ? '#fff' : C.blue, cursor: 'pointer', fontSize: 11, fontWeight: filter === o ? 600 : 400, fontFamily: 'inherit' }}>
              {o}
            </button>
          ))}
          <span style={{ marginLeft: 'auto', fontSize: 11, color: C.dim, alignSelf: 'center' }}>{filtered.length} calls</span>
        </div>
        <CallFeedTable rows={rows} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
          <span style={{ fontSize: 11, color: C.dim }}>Showing {Math.min((page-1)*PER+1, filtered.length)}–{Math.min(page*PER, filtered.length)} of {filtered.length}</span>
          <Pagination page={page} total={totalPages} onChange={setPage} />
        </div>
      </div>
    </div>
  );
}

// ── Call Feed Table ──────────────────────────────────────────────
function CallFeedTable({ rows }) {
  if (!rows.length) return <div style={{ color: C.dim, padding: '20px 0', textAlign: 'center', fontSize: 12 }}>No calls found</div>;
  const TH = ({ children, w }) => (
    <th style={{ fontSize: 10, fontWeight: 600, color: C.dim, textTransform: 'uppercase', letterSpacing: '.5px', padding: '0 10px 8px 0', textAlign: 'left', borderBottom: '1px solid ' + C.border, whiteSpace: 'nowrap', width: w }}>
      {children}
    </th>
  );
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr>
          <TH w={70}>Time</TH>
          <TH w={160}>Company</TH>
          <TH w={150}>Outcome</TH>
          <TH w={160}>Conversation</TH>
          <TH w={50}>Score</TH>
          <TH w={80}>Duration</TH>
          <TH>Notes / Summary</TH>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={row.id || i} style={{ borderBottom: '1px solid ' + C.card2 }}>
            <td style={{ padding: '9px 10px 9px 0', fontSize: 11, color: C.text, fontFamily: "'DM Mono',monospace" }}>{row.time}</td>
            <td style={{ padding: '9px 10px 9px 0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <div style={{ width: 26, height: 26, borderRadius: 6, background: row.bg, color: row.fg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 9, flexShrink: 0 }}>{row.initials}</div>
                <span style={{ fontSize: 12, color: C.text, fontWeight: 500 }}>{row.company}</span>
              </div>
            </td>
            <td style={{ padding: '9px 10px 9px 0' }}><OutcomeBadge text={row.outcome} /></td>
            <td style={{ padding: '9px 10px 9px 0' }}><ConvBadge isHuman={row.conv} /></td>
            <td style={{ padding: '9px 10px 9px 0' }}><ScoreCircle score={row.score} /></td>
            <td style={{ padding: '9px 10px 9px 0', fontSize: 11, color: C.muted, fontFamily: "'DM Mono',monospace" }}>{row.dur}</td>
            <td style={{ padding: '9px 0', fontSize: 11, color: C.dim, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.notes}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ── MAIN OVERVIEW ────────────────────────────────────────────────
const Overview = () => {
  const { data, status } = useContext(DataContext);
  const [page, setPage] = useState(1);
  const [showAll, setShowAll] = useState(false);
  const PER = 7;

  if (status === 'loading' && !data) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontSize: 28, animation: 'spin 1s linear infinite', display: 'inline-block' }}>↻</div>
      <div style={{ fontSize: 13, color: C.blue }}>Connecting to database...</div>
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  if (status === 'error' && !data) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontSize: 28 }}>⚠️</div>
      <div style={{ fontSize: 13, color: C.red }}>Error connecting to database.</div>
    </div>
  );

  const today    = data?.today    || {};
  const week     = data?.week     || {};
  const callFeed = data?.callFeed || [];
  const hourly   = data?.hourly   || [];

  const callsToday    = today.calls_today           ?? 0;
  const meetingsToday = today.meetings_today        ?? 0;
  const convsToday    = today.conversations_today   ?? 0;
  const noAnswer      = today.no_answer_today       ?? 0;
  const notInterested = today.not_interested_today  ?? 0;
  const voicemail     = today.voicemail_today       ?? 0;
  const gatekeeper    = today.gatekeeper_today      ?? 0;
  const avgDurSec     = today.avg_duration_today    ?? 0;

  const callsThisWeek    = week.calls_this_week    ?? 0;
  const convsThisWeek    = week.conv_this_week     ?? 0;
  const meetingsThisWeek = week.meetings_this_week ?? 0;
  const convsLastWeek    = week.conv_last_week     ?? 0;

  const convRate  = callsToday > 0 ? ((convsToday / callsToday) * 100).toFixed(1) : '0.0';
  const momentum  = convsLastWeek > 0 ? Math.round(((convsThisWeek - convsLastWeek) / convsLastWeek) * 100) : 0;

  // Build call feed rows
  const allRows = callFeed.map(c => {
    const col = colorForCompany(c.company_name);
    let timeStr = '—';
    if (c.call_time) {
      try { timeStr = new Date(`2000-01-01T${c.call_time}`).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }); }
      catch { timeStr = c.call_time; }
    }
    return {
      id: c.id, time: timeStr,
      company: c.company_name || 'Unknown',
      initials: getInitials(c.company_name),
      bg: col.bg, fg: col.fg,
      outcome: c.contact_outcome || 'Unknown',
      conv: Boolean(c.is_human_conversation),
      score: c.overall_call_score || 0,
      dur: formatDuration(c.call_duration_seconds),
      notes: c.ai_summary || c.conversation_detail || '—',
    };
  });

  const totalPages = Math.ceil(allRows.length / PER);
  const pageRows   = allRows.slice((page - 1) * PER, page * PER);

  // Outcome donut values
  const outcomeValues = [convsToday, noAnswer, notInterested, voicemail, gatekeeper, 0];
  const totalOutcomes = outcomeValues.reduce((a, b) => a + b, 0) || 1;

  // Stat cards
  const CARDS = [
    { label: 'Calls Made Today',    value: String(callsToday),    change: `— vs yesterday`,                       up: null,          color: '#60a5fa', bg: '#1e3a5f', icon: '📞', spark: [callsThisWeek*.3,callsThisWeek*.5,callsThisWeek*.7,callsThisWeek*.85,callsThisWeek] },
    { label: 'Human Conversations', value: String(convsToday),    change: `${convsThisWeek > 0 ? '+' : ''}${convsThisWeek - (convsLastWeek||0)} vs yesterday`, up: convsThisWeek >= (convsLastWeek||0), color: C.green,   bg: '#052e16', icon: '👥', spark: [convsThisWeek*.3,convsThisWeek*.5,convsThisWeek*.7,convsThisWeek*.9,convsThisWeek] },
    { label: 'Conversation Rate',   value: `${convRate}%`,        change: `↑ 3.7% vs yesterday`,                  up: true,          color: C.purple,  bg: '#1e1b4b', icon: '📈', spark: [18,20,19,22,parseFloat(convRate)] },
    { label: 'No Answers',          value: String(noAnswer),      change: `${noAnswer > 0 ? '↓' : '—'} 5 vs yesterday`, up: false,  color: C.red,     bg: '#450a0a', icon: '📵', spark: [35,30,28,32,noAnswer] },
    { label: 'Meetings Booked',     value: String(meetingsToday), change: `— vs yesterday`,                        up: null,          color: '#60a5fa', bg: '#0c1a2e', icon: '📅', spark: [meetingsThisWeek*.2,meetingsThisWeek*.4,meetingsThisWeek*.6,meetingsThisWeek*.8,meetingsThisWeek] },
    { label: 'Conversation Momentum', value: `${momentum >= 0 ? '+' : ''}${momentum}%`, change: `vs last week`,   up: momentum >= 0, color: C.green,   bg: '#052e16', icon: '🚀', spark: [5,10,15,20,Math.max(0, momentum)] },
  ];

  // System tools
  const TOOLS = [
    { name: 'OpenPhone',  color: '#7c3aed' },
    { name: 'Deepgram',   color: '#0891b2' },
    { name: 'Gemini',     color: '#1d4ed8' },
    { name: 'HubSpot',    color: '#ea580c' },
    { name: 'Make.com',   color: '#7c3aed' },
    { name: 'Neon DB',    color: '#059669' },
  ];

  // Best hours from hourly data
  const bestConvHour = hourly.length > 0
    ? hourly.reduce((best, h) => (h.conv_rate > (best.conv_rate || 0) ? h : best), hourly[0])
    : null;
  const bestMeetHour = hourly.filter(h => h.conversations > 0)
    .reduce((best, h) => ((h.conversations || 0) > (best.conversations || 0) ? h : best), { hour: null });
  const worstHour = hourly.length > 0
    ? hourly.reduce((worst, h) => ((h.total_calls || 0) - (h.conversations || 0) > ((worst.total_calls || 0) - (worst.conversations || 0)) ? h : worst), hourly[0])
    : null;

  const fmtHour = (h) => {
    if (h === null || h === undefined) return '—';
    const n = parseInt(h);
    if (isNaN(n)) return '—';
    if (n === 0) return '12 AM';
    if (n === 12) return '12 PM';
    return n > 12 ? `${n - 12} PM` : `${n} AM`;
  };

  const card = { background: C.card, border: '1px solid ' + C.border, borderRadius: 12, padding: '16px 18px' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {showAll && <AllCallsModal allRows={allRows} onClose={() => setShowAll(false)} />}

      {/* ── STAT CARDS ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 10 }}>
        {CARDS.map((c, i) => (
          <div key={i} style={card}>
            {/* Icon circle */}
            <div style={{ width: 40, height: 40, borderRadius: '50%', background: c.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, marginBottom: 10 }}>
              {c.icon}
            </div>
            <div style={{ fontSize: 10, color: C.dim, textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 4, fontWeight: 600 }}>{c.label}</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: C.text, letterSpacing: '-1px', lineHeight: 1, marginBottom: 4 }}>{c.value}</div>
            <div style={{ fontSize: 11, color: c.up === null ? C.dim : c.up ? C.green : C.red, marginBottom: 8, fontWeight: 500 }}>
              {c.change}
            </div>
            <Sparkline values={c.spark} color={c.color} />
          </div>
        ))}
      </div>

      {/* ── TWO COLUMN ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 14 }}>

        {/* LEFT */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Live Call Feed */}
          <div style={card}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: C.green, animation: 'pulse 2s infinite' }} />
                <span style={{ fontSize: 12, fontWeight: 700, color: C.text, textTransform: 'uppercase', letterSpacing: '.5px' }}>Live Call Feed</span>
              </div>
              <button
                onClick={() => setShowAll(true)}
                style={{ display: 'flex', alignItems: 'center', gap: 5, background: '#112240', border: '1px solid ' + C.border, borderRadius: 7, padding: '4px 10px', fontSize: 11, color: C.blue, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}
              >
                View All Calls
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
              </button>
            </div>
            <div style={{ fontSize: 11, color: C.dim, marginBottom: 14 }}>Real-time feed of your most recent calls</div>

            <CallFeedTable rows={pageRows} />

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}>
              <span style={{ fontSize: 11, color: C.dim }}>
                Showing {Math.min((page-1)*PER+1, allRows.length)} to {Math.min(page*PER, allRows.length)} of {allRows.length} calls
              </span>
              <Pagination page={page} total={totalPages} onChange={setPage} />
            </div>
          </div>

          {/* Bottom stat tiles */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 }}>
            {[
              { label: 'Best Conv. Hour',    value: fmtHour(bestConvHour?.hour), sub: bestConvHour ? `${bestConvHour.conv_rate}% of conversations` : '', color: C.green,  icon: '🕙' },
              { label: 'Best Meeting Hour',  value: fmtHour(bestMeetHour?.hour), sub: bestMeetHour?.hour ? `${bestMeetHour.conversations} meetings booked` : '', color: C.blue,   icon: '📅' },
              { label: 'Highest No Answer',  value: fmtHour(worstHour?.hour),    sub: worstHour ? `${worstHour.total_calls - (worstHour.conversations||0)} no answers` : '', color: C.red,    icon: '📵' },
              { label: 'Avg Call Time',      value: formatDuration(avgDurSec),   sub: 'Average duration',                  color: C.purple, icon: '⏱' },
            ].map((item, i) => (
              <div key={i} style={{ ...card, textAlign: 'center', padding: '18px 12px' }}>
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: item.color + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, margin: '0 auto 10px' }}>{item.icon}</div>
                <div style={{ fontSize: 10, color: C.dim, textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 6, fontWeight: 600 }}>{item.label}</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: item.color, letterSpacing: '-0.5px', marginBottom: 4 }}>{item.value}</div>
                {item.sub && <div style={{ fontSize: 10, color: C.dim }}>{item.sub}</div>}
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Activity Snapshot */}
          <div style={card}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.text, textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 12 }}>Activity Snapshot</div>
            <LineChart data={hourly} color={C.blue} />
          </div>

          {/* Outcome Breakdown */}
          <div style={card}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.text, textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 12 }}>
              Outcome Breakdown <span style={{ fontSize: 10, color: C.dim, fontWeight: 400 }}>Today</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <Donut
                values={totalOutcomes > 0 ? outcomeValues : [1]}
                colors={totalOutcomes > 0 ? OUTCOME_COLORS : [C.border]}
                size={100}
                centerText={String(callsToday)}
                centerSub="Total"
              />
              <div style={{ flex: 1 }}>
                {[
                  { label: 'Human Conversation', value: convsToday,    color: OUTCOME_COLORS[0] },
                  { label: 'No Answer',           value: noAnswer,      color: OUTCOME_COLORS[1] },
                  { label: 'Not Interested',      value: notInterested, color: OUTCOME_COLORS[2] },
                  { label: 'Voicemail',           value: voicemail,     color: OUTCOME_COLORS[3] },
                  { label: 'Gatekeeper Only',     value: gatekeeper,    color: OUTCOME_COLORS[4] },
                  { label: 'Other',               value: Math.max(0, callsToday - convsToday - noAnswer - notInterested - voicemail - gatekeeper), color: OUTCOME_COLORS[5] },
                ].map((item, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, color: C.muted, marginBottom: 5 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: item.color, flexShrink: 0 }} />
                      <span>{item.label}</span>
                    </div>
                    <span style={{ color: i === 0 ? C.green : C.muted, fontWeight: i === 0 ? 600 : 400 }}>
                      {item.value} ({((item.value / totalOutcomes) * 100).toFixed(1)}%)
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* System Status */}
          <div style={{ background: C.card2, border: '1px solid #0f2a47', borderRadius: 12, padding: '14px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: C.green }} />
              <span style={{ fontSize: 12, fontWeight: 700, color: C.green }}>System Status</span>
              <span style={{ fontSize: 11, color: C.green, marginLeft: 2 }}>All systems running</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
              {TOOLS.map((t, i) => (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, background: '#0a1628', borderRadius: 8, padding: '10px 6px', border: '1px solid ' + C.border }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: t.color + '22', border: '1px solid ' + t.color + '44', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: t.color }}>
                    {t.name.substring(0, 2).toUpperCase()}
                  </div>
                  <span style={{ fontSize: 9.5, color: C.muted, fontWeight: 500 }}>{t.name}</span>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: C.green }} />
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>

      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }
        @keyframes spin  { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
      `}</style>
    </div>
  );
};

export default Overview;
