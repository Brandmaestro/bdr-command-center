// dataHelpers.js
// Utility functions for processing raw API data before rendering

export const calculateConversationRate = (data) => {
  if (!data || data.week.calls_this_week === 0) return 0;
  return ((data.week.conv_this_week / data.week.calls_this_week) * 100).toFixed(1);
};

export const formatCoaching = (coachingArray) => {
  if (!coachingArray) return [];
  return coachingArray.map(item => ({
    ...item,
    what_worked_well: String(item.what_worked_well || ''),
    what_could_be_improved: String(item.what_could_be_improved || ''),
    coaching_notes: String(item.coaching_notes || ''),
    objections: String(item.objections || ''),
  }));
};

export const formatDuration = (seconds) => {
  if (!seconds || seconds === 0) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${String(s).padStart(2, '0')}s`;
};

export const getInitials = (name) => {
  if (!name) return '??';
  return name.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();
};

export const outcomeClass = (outcome) => {
  if (!outcome) return 'other';
  const o = outcome.toLowerCase();
  if (o.includes('meeting') || o.includes('booked')) return 'meeting';
  if (o.includes('follow')) return 'followup';
  if (o.includes('gatekeeper')) return 'gatekeeper';
  if (o.includes('not interested')) return 'notinterested';
  if (o.includes('voicemail')) return 'voicemail';
  return 'other';
};

export const AVATAR_COLORS = [
  { bg: '#1e3a5f', fg: '#60a5fa' },
  { bg: '#052e16', fg: '#4ade80' },
  { bg: '#1e1b4b', fg: '#a5b4fc' },
  { bg: '#450a0a', fg: '#f87171' },
  { bg: '#1c1205', fg: '#fbbf24' },
  { bg: '#0c1a2e', fg: '#60a5fa' },
  { bg: '#1c1917', fg: '#a8a29e' },
];

export const colorForCompany = (name) => {
  if (!name) return AVATAR_COLORS[0];
  return AVATAR_COLORS[Math.abs(name.charCodeAt(0)) % AVATAR_COLORS.length];
};

export const OUTCOME_COLORS = ['#22c55e','#3b82f6','#ef4444','#a855f7','#f97316','#475569'];
export const OUTCOME_LABELS = ['Human Conv.','No Answer','Not Interested','Voicemail','Gatekeeper','Other'];
