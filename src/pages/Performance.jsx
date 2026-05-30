import React, { useContext, useState, useMemo } from 'react';
import { DataContext } from '../data/DataContext.jsx';
import {
  AreaChart, Area, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts';

// ── Design tokens ─────────────────────────────────────────────────
const C = {
  bg:       '#060d1a',
  surface:  '#0a1628',
  card:     '#0d1f38',
  deep:     '#071428',
  border:   '#1e3a5f',
  accent:   '#2563eb',
  hi:       '#60a5fa',
  green:    '#22c55e',
  red:      '#ef4444',
  amber:    '#f59e0b',
  purple:   '#a78bfa',
  text:     '#e2e8f0',
  muted:    '#94a3b8',
  dim:      '#475569',
  dimmer:   '#334155',
};

const OUTCOME_COLORS = {
  'Meeting Booked':            C.green,
  'Human Conversation':        C.hi,
  'Not Interested':            C.red,
  'No Interest':               C.red,
  'Do Not Call':               '#f97316',
  'No Thank You':              '#fb923c',
  'I Am Fine':                 '#fca5a5',
  'I Am Good':                 '#fca5a5',
  'No':                        '#fca5a5',
  'Hang Up After Introduction':'#f87171',
  'No Answer':                 C.dimmer,
  'Voicemail':                 '#64748b',
  'Left Voicemail':            '#64748b',
  'Gatekeeper Only':           C.amber,
  'Callback Requested':        C.purple,
  'Future Follow-Up':          C.purple,
};
const oc = (o) => OUTCOME_COLORS[o] || C.dim;

// ── Shared UI primitives ──────────────────────────────────────────
const sel = {
  background: C.card, border: `1px solid ${C.border}`, borderRadius: 7,
  color: C.muted, fontSize: 12, padding: '6px 10px', cursor: 'pointer',
  fontFamily: 'inherit', outline: 'none', minWidth: 120,
};

function Card({ children, style = {} }) {
  return <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 18, ...style }}>{children}</div>;
}

function Sec({ children, right }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '1px' }}>{children}</div>
      {right && <div>{right}</div>}
    </div>
  );
}

function Tip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: '#0d1f38', border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 12px', fontSize: 11 }}>
      <div style={{ color: C.muted, marginBottom: 4 }}>{label}</div>
      {payload.map((p, i) => <div key={i} style={{ color: p.color, fontWeight: 600 }}>{p.name}: {p.value}</div>)}
    </div>
  );
}

function Delta({ curr, prev, invert }) {
  if (prev == null || prev === 0 || curr == null) return null;
  const diff = curr - prev;
  const pct  = Math.abs((diff / prev) * 100).toFixed(1);
  const up   = diff >= 0;
  const good = invert ? !up : up;
  return (
    <span style={{ fontSize: 10, fontWeight: 700, color: good ? C.green : C.red }}>
      {up ? '↑' : '↓'} {pct}% vs prev
    </span>
  );
}

// ── Filter bar ────────────────────────────────────────────────────
function FilterBar({
  dateRange, setDateRange,
  customStart, setCustomStart, customEnd, setCustomEnd,
  selectedBDR, setSelectedBDR, bdrList,
  selectedCompany, setSelectedCompany, companyList,
}) {
  const [showCustom, setShowCustom] = useState(dateRange === 'Custom');

  const handleDateChange = (e) => {
    const v = e.target.value;
    if (v === 'Custom') { setShowCustom(true); }
    else { setShowCustom(false); setDateRange(v); }
  };

  const applyCustom = () => {
    if (customStart && customEnd) { setDateRange('Custom'); }
  };

  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: '12px 18px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>

      {/* Metric Timeframe */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 10, color: C.dim, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', whiteSpace: 'nowrap' }}>Metric Timeframe</span>
        <select value={dateRange === 'Custom' ? 'Custom' : dateRange} onChange={handleDateChange} style={sel}>
          <option>Today</option>
          <option>Yesterday</option>
          <option>This Week</option>
          <option>Last Week</option>
          <option>This Month</option>
          <option>Last Month</option>
          <option value="Custom">Custom Range 📅</option>
        </select>
        {(showCustom || dateRange === 'Custom') && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)}
              style={{ ...sel, minWidth: 0, padding: '5px 8px' }} />
            <span style={{ color: C.dim, fontSize: 11 }}>to</span>
            <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)}
              style={{ ...sel, minWidth: 0, padding: '5px 8px' }} />
            <button onClick={applyCustom} style={{ background: C.accent, border: 'none', borderRadius: 7, padding: '5px 12px', color: '#fff', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700 }}>Apply</button>
          </div>
        )}
      </div>

      <div style={{ width: 1, height: 24, background: C.border }} />

      {/* BDR filter */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 10, color: C.dim, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px' }}>BDR</span>
        <select value={selectedBDR} onChange={e => setSelectedBDR(e.target.value)} style={sel}>
          <option value="All">All BDRs</option>
          {bdrList.map(b => <option key={b} value={b}>{b}</option>)}
        </select>
      </div>

      {/* Company filter */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 10, color: C.dim, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px' }}>Company</span>
        <select value={selectedCompany} onChange={e => setSelectedCompany(e.target.value)} style={sel}>
          <option value="All">All Companies</option>
          {companyList.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {/* Active filter chips */}
      <div style={{ display: 'flex', gap: 6, marginLeft: 'auto', flexWrap: 'wrap' }}>
        {selectedBDR !== 'All' && (
          <span style={{ background: '#1e3a5f', color: C.hi, fontSize: 10, padding: '3px 10px', borderRadius: 20, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}>
            👤 {selectedBDR}
            <span onClick={() => setSelectedBDR('All')} style={{ cursor: 'pointer', opacity: .7 }}>✕</span>
          </span>
        )}
        {selectedCompany !== 'All' && (
          <span style={{ background: '#1e3a5f', color: C.hi, fontSize: 10, padding: '3px 10px', borderRadius: 20, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}>
            🏢 {selectedCompany}
            <span onClick={() => setSelectedCompany('All')} style={{ cursor: 'pointer', opacity: .7 }}>✕</span>
          </span>
        )}
      </div>
    </div>
  );
}

// ── Stat snapshot card ────────────────────────────────────────────
function StatCard({ icon, label, value, prev, invert, color = C.hi, suffix = '' }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 6, flex: 1, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        <span style={{ fontSize: 18 }}>{icon}</span>
        <span style={{ fontSize: 10, color: C.muted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.5px' }}>{label}</span>
      </div>
      <div style={{ fontSize: 28, fontWeight: 800, color, lineHeight: 1 }}>{value ?? 0}{suffix}</div>
      <Delta curr={value} prev={prev} invert={invert} />
    </div>
  );
}

// ── Goal tracking bar ─────────────────────────────────────────────
function GoalBar({ icon, label, actual, goal, color }) {
  const pct    = goal > 0 ? Math.min((actual / goal) * 100, 100) : 0;
  const over   = goal > 0 && actual > goal;
  const status = over ? 'Exceeding' : pct >= 70 ? 'On Track' : 'Behind';
  const sc     = over ? C.green : pct >= 70 ? C.hi : C.amber;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: `1px solid ${C.border}20` }}>
      <span style={{ fontSize: 16, width: 22, textAlign: 'center' }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, color: C.text, fontWeight: 500, marginBottom: 4 }}>{label}</div>
        <div style={{ height: 5, background: C.border, borderRadius: 3, overflow: 'hidden' }}>
          <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 3, transition: 'width .6s ease' }} />
        </div>
      </div>
      <div style={{ fontSize: 11, color: C.muted, minWidth: 70, textAlign: 'right' }}>{actual} / {goal}</div>
      <div style={{ fontSize: 11, color: C.muted, minWidth: 36, textAlign: 'right' }}>{pct.toFixed(0)}%</div>
      <div style={{ fontSize: 10, fontWeight: 700, color: sc, minWidth: 62, textAlign: 'right' }}>{status}</div>
    </div>
  );
}

// ── Booking Efficiency card ───────────────────────────────────────
function EffCard({ icon, label, value, sub, color = C.hi }) {
  return (
    <div style={{ background: C.deep, border: `1px solid ${C.border}`, borderRadius: 10, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 4, position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 8, right: 10, fontSize: 22, opacity: .1 }}>{icon}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 15 }}>{icon}</span>
        <span style={{ fontSize: 10, color: C.muted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.4px', lineHeight: 1.3 }}>{label}</span>
      </div>
      <div style={{ fontSize: 30, fontWeight: 800, color, lineHeight: 1.1 }}>{value ?? '—'}</div>
      {sub && <div style={{ fontSize: 10, color: C.dim, lineHeight: 1.4 }}>{sub}</div>}
    </div>
  );
}

// ── Scope selector ────────────────────────────────────────────────
function ScopeSelector({ scope, setScope }) {
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {['Personal', 'Team', 'Leaderboard'].map(s => (
        <button key={s} onClick={() => setScope(s)} style={{
          background: scope === s ? C.accent : C.surface,
          border: `1px solid ${scope === s ? C.accent : C.border}`,
          borderRadius: 6, padding: '4px 10px', fontSize: 10,
          color: scope === s ? '#fff' : C.muted,
          cursor: 'pointer', fontFamily: 'inherit', fontWeight: scope === s ? 700 : 500,
        }}>{s}</button>
      ))}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────
const Performance = () => {
  const {
    data, status,
    dateRange, setDateRange,
    customStart, setCustomStart, customEnd, setCustomEnd,
    selectedBDR, setSelectedBDR, bdrList,
    selectedCompany, setSelectedCompany, companyList,
  } = useContext(DataContext);

  const [scope, setScope] = useState('Personal');

  if (status === 'loading' && !data) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: C.hi, fontSize: 14 }}>
      Loading performance data...
    </div>
  );
  if (status === 'error') return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: C.red, fontSize: 14 }}>
      Error connecting to database.
    </div>
  );
  if (!data) return null;

  const snap     = data.snapshot         || {};
  const trend    = data.performanceTrend || [];
  const convT    = data.convRateTrend    || [];
  const outcomes = data.outcomeBreakdown || [];
  const perfs    = data.topPerformers    || [];
  const goals    = data.goalTracking     || {};
  const eff      = data.bookingEfficiency || {};

  // Merge trend + conv trend by label
  const chartData = useMemo(() => {
    const map = {};
    trend.forEach(r => { map[r.label] = { ...map[r.label], label: r.label, calls_made: r.calls_made, conversations: r.conversations, meetings_booked: r.meetings_booked }; });
    convT.forEach(r => { map[r.label] = { ...map[r.label], conv_rate: r.conv_rate }; });
    return Object.values(map);
  }, [trend, convT]);

  const totalCalls = outcomes.reduce((s, o) => s + (o.count || 0), 0);

  // Next booking probability
  const nextBookingPct = eff.conversations_per_booking && eff.convs_since_last_booking != null
    ? Math.min(100, Math.round((eff.convs_since_last_booking / eff.conversations_per_booking) * 100))
    : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ── FILTER BAR ── */}
      <FilterBar
        dateRange={dateRange} setDateRange={setDateRange}
        customStart={customStart} setCustomStart={setCustomStart}
        customEnd={customEnd} setCustomEnd={setCustomEnd}
        selectedBDR={selectedBDR} setSelectedBDR={setSelectedBDR} bdrList={bdrList}
        selectedCompany={selectedCompany} setSelectedCompany={setSelectedCompany} companyList={companyList}
      />

      {/* ── PERFORMANCE SNAPSHOT ── */}
      <div>
        <Sec>Performance Snapshot</Sec>
        <div style={{ display: 'flex', gap: 12 }}>
          <StatCard icon="📞" label="Calls Made"          value={snap.calls_today}           prev={snap.calls_yesterday}             color={C.hi} />
          <StatCard icon="👥" label="Human Conversations" value={snap.conv_today}             prev={snap.conv_yesterday}              color={C.green} />
          <StatCard icon="📈" label="Conversation Rate"   value={snap.conv_rate_today}        prev={snap.conv_rate_yesterday}         color={C.purple} suffix="%" />
          <StatCard icon="🚫" label="No Interest"         value={snap.no_interest_today}      prev={snap.no_interest_yesterday}       color={C.red} invert />
          <StatCard icon="📅" label="Meetings Booked"     value={snap.meetings_today}         prev={snap.meetings_yesterday}         color={C.green} />
          <StatCard icon="🎯" label="Conversion Rate"     value={snap.conversion_rate_today}  prev={snap.conversion_rate_yesterday}  color={C.amber} suffix="%" />
        </div>
      </div>

      {/* ── CHARTS ROW ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 300px', gap: 14 }}>

        {/* Performance Trend */}
        <Card>
          <Sec>Performance Trend</Sec>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="gC" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={C.hi} stopOpacity={.3}/><stop offset="100%" stopColor={C.hi} stopOpacity={0}/></linearGradient>
                <linearGradient id="gG" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={C.green} stopOpacity={.3}/><stop offset="100%" stopColor={C.green} stopOpacity={0}/></linearGradient>
              </defs>
              <XAxis dataKey="label" tick={{ fill: C.dim, fontSize: 9 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: C.dim, fontSize: 9 }} axisLine={false} tickLine={false} />
              <Tooltip content={<Tip />} />
              <Area type="monotone" dataKey="calls_made"     name="Calls"         stroke={C.hi}     fill="url(#gC)" strokeWidth={2} dot={false} />
              <Area type="monotone" dataKey="conversations"  name="Conversations" stroke={C.green}  fill="url(#gG)" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="meetings_booked" name="Meetings"     stroke={C.purple} strokeWidth={2} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </Card>

        {/* Conversation Rate Over Time */}
        <Card>
          <Sec right={<span style={{ fontSize: 20, fontWeight: 800, color: C.green }}>{snap.conv_rate_today ?? 0}%</span>}>
            Conversation Rate Over Time
          </Sec>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="gR" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={C.hi} stopOpacity={.25}/><stop offset="100%" stopColor={C.hi} stopOpacity={0}/></linearGradient>
              </defs>
              <XAxis dataKey="label" tick={{ fill: C.dim, fontSize: 9 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: C.dim, fontSize: 9 }} axisLine={false} tickLine={false} unit="%" />
              <Tooltip content={<Tip />} />
              <Area type="monotone" dataKey="conv_rate" name="Conv Rate %" stroke={C.hi} fill="url(#gR)" strokeWidth={2} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </Card>

        {/* Outcome Breakdown */}
        <Card>
          <Sec>Outcome Breakdown</Sec>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <ResponsiveContainer width={100} height={100}>
              <PieChart>
                <Pie data={outcomes} dataKey="count" cx="50%" cy="50%" outerRadius={46} innerRadius={28} strokeWidth={0}>
                  {outcomes.map((o, i) => <Cell key={i} fill={oc(o.contact_outcome)} />)}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3, paddingTop: 2 }}>
              {outcomes.slice(0, 7).map((o, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10 }}>
                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: oc(o.contact_outcome), flexShrink: 0 }} />
                  <span style={{ color: C.muted, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.contact_outcome}</span>
                  <span style={{ color: C.text, fontWeight: 700 }}>{o.percentage}%</span>
                  <span style={{ color: C.dim }}>({o.count})</span>
                </div>
              ))}
              <div style={{ fontSize: 10, color: C.dim, marginTop: 4 }}>{totalCalls} Total Calls</div>
            </div>
          </div>
        </Card>
      </div>

      {/* ── TOP PERFORMERS + GOAL TRACKING ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>

        {/* Top Performers */}
        <Card>
          <Sec>Top Performers</Sec>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr>
                {['#', 'BDR', 'Calls', 'Convs', 'Conv%', 'Meetings', 'Booking%'].map(h => (
                  <th key={h} style={{ textAlign: h === 'BDR' ? 'left' : 'center', color: C.dim, fontWeight: 600, padding: '4px 8px', borderBottom: `1px solid ${C.border}`, fontSize: 10, textTransform: 'uppercase', letterSpacing: '.4px' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {perfs.map((p, i) => (
                <tr key={i}>
                  <td style={{ textAlign: 'center', padding: '7px 8px', color: C.dim, fontSize: 11 }}>{i + 1}</td>
                  <td style={{ padding: '7px 8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      <div style={{ width: 22, height: 22, borderRadius: '50%', background: C.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                        {(p.sdr_name || '?')[0].toUpperCase()}
                      </div>
                      <span style={{ color: C.text, fontWeight: 500 }}>{p.sdr_name}</span>
                    </div>
                  </td>
                  <td style={{ textAlign: 'center', padding: '7px 8px', color: C.hi,    fontWeight: 700 }}>{p.calls}</td>
                  <td style={{ textAlign: 'center', padding: '7px 8px', color: C.muted              }}>{p.conversations}</td>
                  <td style={{ textAlign: 'center', padding: '7px 8px', color: C.muted              }}>{p.conv_rate}%</td>
                  <td style={{ textAlign: 'center', padding: '7px 8px', color: C.green, fontWeight: 700 }}>{p.meetings}</td>
                  <td style={{ textAlign: 'center', padding: '7px 8px' }}>
                    <span style={{
                      background: (p.conv_rate_pct||0) > 15 ? '#052e16' : (p.conv_rate_pct||0) > 8 ? '#1e3a5f' : '#450a0a',
                      color: (p.conv_rate_pct||0) > 15 ? C.green : (p.conv_rate_pct||0) > 8 ? C.hi : C.red,
                      padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700,
                    }}>{p.conv_rate_pct ?? 0}%</span>
                  </td>
                </tr>
              ))}
              {perfs.length === 0 && (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: 20, color: C.dim, fontSize: 12 }}>No data for selected period</td></tr>
              )}
            </tbody>
          </table>
        </Card>

        {/* Goal Tracking */}
        <Card>
          <Sec>Goal Tracking</Sec>
          <GoalBar icon="📞" label="Calls Made"          actual={snap.calls_today          ?? 0} goal={goals.calls_goal          ?? 120} color={C.hi} />
          <GoalBar icon="👥" label="Human Conversations" actual={snap.conv_today            ?? 0} goal={goals.conversations_goal  ?? 30}  color={C.green} />
          <GoalBar icon="📈" label="Conversation Rate"   actual={snap.conv_rate_today       ?? 0} goal={20}                               color={C.purple} />
          <GoalBar icon="📅" label="Meetings Booked"     actual={snap.meetings_today        ?? 0} goal={goals.meetings_goal       ?? 4}   color={C.green} />
          <GoalBar icon="🎯" label="Conversion Rate"     actual={snap.conversion_rate_today ?? 0} goal={10}                               color={C.amber} />
        </Card>
      </div>

      {/* ── BOOKING EFFICIENCY METRICS ── */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '1px' }}>Booking Efficiency Metrics</span>
            <span style={{ background: '#1e3a5f', color: C.hi, fontSize: 9, padding: '2px 7px', borderRadius: 4, fontWeight: 700 }}>ℹ</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 10, color: C.dim }}>Metric Scope:</span>
            <ScopeSelector scope={scope} setScope={setScope} />
          </div>
        </div>

        {/* Row 1 — Primary */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 12, marginBottom: 12 }}>
          <EffCard icon="🚫" label="No Interest Before Booking"
            value={eff.no_interest_before_booking ?? '—'}
            sub={`${eff.total_no_interest ?? 0} no interests ÷ ${eff.total_bookings ?? 0} bookings`}
            color={C.red} />
          <EffCard icon="🔥" label="No Interest Reset"
            value={eff.no_interest_streak ?? 0}
            sub={eff.last_booking_time ? `Last booking: ${eff.last_booking_time}` : 'No bookings in period'}
            color={C.amber} />
          <EffCard icon="💬" label="Conversations Per Booking"
            value={eff.conversations_per_booking ?? '—'}
            sub={`${eff.total_conversations ?? 0} convs ÷ ${eff.total_bookings ?? 0} bookings`}
            color={C.green} />
          <EffCard icon="📞" label="Calls Per Booking"
            value={eff.calls_per_booking ?? '—'}
            sub={`${eff.total_calls ?? 0} calls ÷ ${eff.total_bookings ?? 0} bookings`}
            color={C.hi} />
          <EffCard icon="🚀" label="Booking Momentum"
            value={eff.avg_booking_run_convs ?? '—'}
            sub="Avg convs to book (all time)"
            color={C.amber} />
          <EffCard icon="🎯" label="Next Booking Probability"
            value={nextBookingPct != null ? `${nextBookingPct}%` : '—'}
            sub={`${eff.convs_since_last_booking ?? 0} convs since last booking`}
            color={C.purple} />
        </div>

        {/* Row 2 — Streaks */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr) 1fr', gap: 12 }}>
          <EffCard icon="📞" label="Current Call Streak"
            value={eff.calls_since_last_booking ?? 0}
            sub="Calls since last booking"
            color={C.hi} />
          <EffCard icon="👥" label="Current Conversation Streak"
            value={eff.convs_since_last_booking ?? 0}
            sub="Conversations since last booking"
            color={C.green} />
          <EffCard icon="🏆" label="Best Booking Run"
            value={eff.best_booking_run_convs ? `1 / ${eff.best_booking_run_convs}` : '—'}
            sub={`1 booking per ${eff.best_booking_run_convs ?? '?'} conversations`}
            color={C.amber} />
          <EffCard icon="📉" label="Longest Dry Spell"
            value={eff.longest_dry_spell_calls ?? 0}
            sub="Calls without booking"
            color={C.red} />
          {/* AI Insight */}
          <div style={{ background: C.deep, border: `1px solid ${C.border}`, borderRadius: 10, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontSize: 10, color: C.amber, fontWeight: 700 }}>💡 AI Insight</div>
            <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.5 }}>
              {eff.conversations_per_booking
                ? `It takes ~${eff.calls_per_booking ?? '?'} calls and ~${eff.conversations_per_booking} conversations to produce a meeting. You're ${eff.convs_since_last_booking ?? 0} conversations into your current cycle.`
                : 'Not enough data in this period to calculate booking efficiency.'}
            </div>
          </div>
        </div>
      </div>

    </div>
  );
};

export default Performance;
