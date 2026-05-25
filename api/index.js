import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST');

  const page = req.query.page || 'dashboard';

  // ── POST routes (settings + reports) ─────────────────────────
  if (req.method === 'POST') {
    if (page === 'settings') return handleSettingsSave(req, res);
    if (page === 'reports')  return handleReportLog(req, res);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ── Route to correct handler ──────────────────────────────────
  switch (page) {
    case 'dashboard':    return handleDashboard(req, res);
    case 'performance':  return handlePerformance(req, res);
    case 'activity':     return handleActivity(req, res);
    case 'trends':       return handleTrends(req, res);
    case 'outcomes':     return handleOutcomes(req, res);
    case 'time':         return handleTime(req, res);
    case 'scorecard':    return handleScorecard(req, res);
    case 'coaching':     return handleCoaching(req, res);
    case 'meetings':     return handleMeetings(req, res);
    case 'prospects':    return handleProspects(req, res);
    case 'research':     return handleResearch(req, res);
    case 'reports':      return handleReports(req, res);
    case 'settings':     return handleSettings(req, res);
    default:             return res.status(404).json({ error: 'Unknown page' });
  }
}

// ── DASHBOARD (Overview) ──────────────────────────────────────────
async function handleDashboard(req, res) {
  let client;
  try {
    client = await pool.connect();
    const [
      todayResult, yesterdayResult, weekResult, callFeedResult,
      hourlyResult, outcomesResult, dailyTrendResult, weeklyTrendResult,
      meetingsResult, coachingResult, scoreTrendResult,
    ] = await Promise.all([
      client.query(`
        SELECT
          COUNT(*)::int as calls_today,
          SUM(CASE WHEN meeting_booked = true THEN 1 ELSE 0 END)::int as meetings_today,
          SUM(CASE WHEN is_human_conversation = true THEN 1 ELSE 0 END)::int as conversations_today,
          SUM(CASE WHEN contact_outcome = 'Not Interested' THEN 1 ELSE 0 END)::int as not_interested_today,
          SUM(CASE WHEN contact_outcome = 'No Answer' THEN 1 ELSE 0 END)::int as no_answer_today,
          SUM(CASE WHEN contact_outcome ILIKE '%voicemail%' THEN 1 ELSE 0 END)::int as voicemail_today,
          SUM(CASE WHEN contact_outcome ILIKE '%gatekeeper%' THEN 1 ELSE 0 END)::int as gatekeeper_today,
          CAST(AVG(NULLIF(overall_call_score, 0)) AS DECIMAL(5,1)) as avg_score_today,
          CAST(AVG(NULLIF(call_duration_seconds, 0)) AS INTEGER) as avg_duration_today,
          CAST(100.0 * SUM(CASE WHEN is_human_conversation = true THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0) AS DECIMAL(5,1)) as conversation_rate_today
        FROM public.calls WHERE client_id = 1 AND call_date = CURRENT_DATE
      `),
      client.query(`
        SELECT
          COUNT(*)::int as calls_yesterday,
          SUM(CASE WHEN meeting_booked = true THEN 1 ELSE 0 END)::int as meetings_yesterday,
          SUM(CASE WHEN is_human_conversation = true THEN 1 ELSE 0 END)::int as conversations_yesterday,
          CAST(100.0 * SUM(CASE WHEN is_human_conversation = true THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0) AS DECIMAL(5,1)) as conversation_rate_yesterday
        FROM public.calls WHERE client_id = 1 AND call_date = CURRENT_DATE - INTERVAL '1 day'
      `),
      client.query(`
        SELECT
          SUM(CASE WHEN call_date >= DATE_TRUNC('week', CURRENT_DATE) THEN 1 ELSE 0 END)::int as calls_this_week,
          SUM(CASE WHEN call_date >= DATE_TRUNC('week', CURRENT_DATE) AND is_human_conversation = true THEN 1 ELSE 0 END)::int as conv_this_week,
          SUM(CASE WHEN call_date >= DATE_TRUNC('week', CURRENT_DATE) AND meeting_booked = true THEN 1 ELSE 0 END)::int as meetings_this_week,
          SUM(CASE WHEN call_date < DATE_TRUNC('week', CURRENT_DATE) AND call_date >= DATE_TRUNC('week', CURRENT_DATE) - INTERVAL '7 days' THEN 1 ELSE 0 END)::int as calls_last_week,
          SUM(CASE WHEN call_date < DATE_TRUNC('week', CURRENT_DATE) AND call_date >= DATE_TRUNC('week', CURRENT_DATE) - INTERVAL '7 days' AND is_human_conversation = true THEN 1 ELSE 0 END)::int as conv_last_week,
          SUM(CASE WHEN call_date < DATE_TRUNC('week', CURRENT_DATE) AND call_date >= DATE_TRUNC('week', CURRENT_DATE) - INTERVAL '7 days' AND meeting_booked = true THEN 1 ELSE 0 END)::int as meetings_last_week
        FROM public.calls WHERE client_id = 1
      `),
      client.query(`
        SELECT c.id, c.call_timestamp, c.call_date, c.call_time, c.company_name, c.contact_name,
          c.contact_outcome, c.overall_call_score, c.call_duration_seconds, c.meeting_booked,
          c.is_human_conversation, c.recording_url, ci.ai_summary, ci.conversation_detail
        FROM public.calls c
        LEFT JOIN public.call_intelligence ci ON ci.call_id = c.id
        WHERE c.client_id = 1 AND c.call_date >= CURRENT_DATE - INTERVAL '7 days'
        ORDER BY c.call_timestamp DESC LIMIT 50
      `),
      client.query(`
        SELECT EXTRACT(HOUR FROM call_timestamp)::int as hour, COUNT(*)::int as total_calls,
          SUM(CASE WHEN is_human_conversation = true THEN 1 ELSE 0 END)::int as conversations,
          CAST(100.0 * SUM(CASE WHEN is_human_conversation = true THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0) AS DECIMAL(5,1)) as conv_rate
        FROM public.calls WHERE client_id = 1 AND call_date = CURRENT_DATE
        GROUP BY EXTRACT(HOUR FROM call_timestamp) ORDER BY hour
      `),
      client.query(`
        SELECT contact_outcome, COUNT(*)::int as count FROM public.calls
        WHERE client_id = 1 AND call_date = CURRENT_DATE
        GROUP BY contact_outcome ORDER BY count DESC
      `),
      client.query(`
        SELECT call_date, TO_CHAR(call_date, 'Dy') as day_name, COUNT(*)::int as total_calls,
          SUM(CASE WHEN is_human_conversation = true THEN 1 ELSE 0 END)::int as conversations,
          SUM(CASE WHEN meeting_booked = true THEN 1 ELSE 0 END)::int as meetings,
          CAST(100.0 * SUM(CASE WHEN is_human_conversation = true THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0) AS DECIMAL(5,1)) as conv_rate
        FROM public.calls WHERE client_id = 1 AND call_date >= CURRENT_DATE - INTERVAL '7 days'
        GROUP BY call_date ORDER BY call_date
      `),
      client.query(`
        SELECT call_date, TO_CHAR(call_date, 'Dy') as day_name, COUNT(*)::int as total_calls,
          SUM(CASE WHEN is_human_conversation = true THEN 1 ELSE 0 END)::int as conversations,
          SUM(CASE WHEN meeting_booked = true THEN 1 ELSE 0 END)::int as meetings
        FROM public.calls WHERE client_id = 1
        AND call_date >= DATE_TRUNC('week', CURRENT_DATE) - INTERVAL '7 days'
        GROUP BY call_date ORDER BY call_date
      `),
      client.query(`
        SELECT m.id, m.meeting_datetime, m.est_pipeline_value, m.cal_meeting_url, m.cal_status,
          c.company_name, c.contact_name, c.overall_call_score, c.call_timestamp
        FROM public.meetings m JOIN public.calls c ON c.id = m.call_id
        WHERE c.client_id = 1 ORDER BY m.meeting_datetime DESC LIMIT 10
      `),
      client.query(`
        SELECT c.call_timestamp, c.company_name, c.contact_name, c.overall_call_score,
          c.call_duration_seconds, c.contact_outcome, c.meeting_booked,
          ci.ai_summary, ci.what_worked_well, ci.what_could_be_improved,
          ci.coaching_notes, ci.objections, ci.conversation_detail,
          ci.overall_score, ci.technical_fit_score, ci.objection_count, ci.sentiment_score
        FROM public.calls c JOIN public.call_intelligence ci ON ci.call_id = c.id
        WHERE c.client_id = 1 AND c.is_human_conversation = true
        ORDER BY c.call_timestamp DESC LIMIT 10
      `),
      client.query(`
        SELECT call_date,
          CAST(AVG(NULLIF(overall_call_score, 0)) AS DECIMAL(5,1)) as avg_score,
          COUNT(*)::int as total_calls
        FROM public.calls WHERE client_id = 1
        AND overall_call_score IS NOT NULL AND overall_call_score > 0
        AND call_date >= CURRENT_DATE - INTERVAL '7 days'
        GROUP BY call_date ORDER BY call_date
      `),
    ]);
    client.release();
    return res.status(200).json({
      timestamp: new Date().toISOString(),
      today: todayResult.rows[0],
      yesterday: yesterdayResult.rows[0],
      week: weekResult.rows[0],
      callFeed: callFeedResult.rows,
      hourly: hourlyResult.rows,
      outcomes: outcomesResult.rows,
      dailyTrend: dailyTrendResult.rows,
      weeklyTrend: weeklyTrendResult.rows,
      meetings: meetingsResult.rows,
      coaching: coachingResult.rows,
      scoreTrend: scoreTrendResult.rows,
    });
  } catch (error) {
    if (client) client.release();
    return res.status(500).json({ error: 'Database error', message: error.message });
  }
}

// ── PERFORMANCE ───────────────────────────────────────────────────
async function handlePerformance(req, res) {
  let client;
  try {
    client = await pool.connect();
    const [snapshotResult, performanceTrendResult, convRateTrendResult, outcomeBreakdownResult, topPerformersResult, goalTrackingResult, quickStatsResult] = await Promise.all([
      client.query(`
        SELECT
          SUM(CASE WHEN call_date = CURRENT_DATE THEN 1 ELSE 0 END)::int as calls_today,
          SUM(CASE WHEN call_date = CURRENT_DATE - INTERVAL '1 day' THEN 1 ELSE 0 END)::int as calls_yesterday,
          SUM(CASE WHEN call_date = CURRENT_DATE AND is_human_conversation = true THEN 1 ELSE 0 END)::int as conv_today,
          SUM(CASE WHEN call_date = CURRENT_DATE - INTERVAL '1 day' AND is_human_conversation = true THEN 1 ELSE 0 END)::int as conv_yesterday,
          SUM(CASE WHEN call_date = CURRENT_DATE AND meeting_booked = true THEN 1 ELSE 0 END)::int as meetings_today,
          SUM(CASE WHEN call_date = CURRENT_DATE - INTERVAL '1 day' AND meeting_booked = true THEN 1 ELSE 0 END)::int as meetings_yesterday,
          SUM(CASE WHEN call_date = CURRENT_DATE AND contact_outcome = 'No Answer' THEN 1 ELSE 0 END)::int as no_answers_today,
          SUM(CASE WHEN call_date = CURRENT_DATE - INTERVAL '1 day' AND contact_outcome = 'No Answer' THEN 1 ELSE 0 END)::int as no_answers_yesterday,
          CAST(100.0 * SUM(CASE WHEN call_date = CURRENT_DATE AND is_human_conversation = true THEN 1 ELSE 0 END) / NULLIF(SUM(CASE WHEN call_date = CURRENT_DATE THEN 1 ELSE 0 END), 0) AS DECIMAL(5,1)) as conv_rate_today,
          CAST(100.0 * SUM(CASE WHEN call_date = CURRENT_DATE - INTERVAL '1 day' AND is_human_conversation = true THEN 1 ELSE 0 END) / NULLIF(SUM(CASE WHEN call_date = CURRENT_DATE - INTERVAL '1 day' THEN 1 ELSE 0 END), 0) AS DECIMAL(5,1)) as conv_rate_yesterday
        FROM public.calls WHERE client_id = 1 AND call_date >= CURRENT_DATE - INTERVAL '1 day'
      `),
      client.query(`
        SELECT EXTRACT(HOUR FROM call_timestamp)::int as hour, COUNT(*)::int as calls_made,
          SUM(CASE WHEN is_human_conversation = true THEN 1 ELSE 0 END)::int as conversations,
          SUM(CASE WHEN meeting_booked = true THEN 1 ELSE 0 END)::int as meetings_booked
        FROM public.calls WHERE client_id = 1 AND call_date = CURRENT_DATE
        GROUP BY EXTRACT(HOUR FROM call_timestamp) ORDER BY hour
      `),
      client.query(`
        SELECT EXTRACT(HOUR FROM call_timestamp)::int as hour,
          CAST(100.0 * SUM(CASE WHEN is_human_conversation = true THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0) AS DECIMAL(5,1)) as conv_rate,
          CAST(100.0 * SUM(CASE WHEN meeting_booked = true THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0) AS DECIMAL(5,1)) as meeting_rate
        FROM public.calls WHERE client_id = 1 AND call_date = CURRENT_DATE
        GROUP BY EXTRACT(HOUR FROM call_timestamp) ORDER BY hour
      `),
      client.query(`
        SELECT contact_outcome, COUNT(*)::int as count,
          CAST(100.0 * COUNT(*) / NULLIF(SUM(COUNT(*)) OVER (), 0) AS DECIMAL(5,1)) as percentage
        FROM public.calls WHERE client_id = 1 AND call_date = CURRENT_DATE
        GROUP BY contact_outcome ORDER BY count DESC
      `),
      client.query(`
        SELECT COALESCE(initiated_by, 'Didier') as sdr_name, COUNT(*)::int as calls,
          SUM(CASE WHEN is_human_conversation = true THEN 1 ELSE 0 END)::int as conversations,
          SUM(CASE WHEN meeting_booked = true THEN 1 ELSE 0 END)::int as meetings,
          CAST(100.0 * SUM(CASE WHEN is_human_conversation = true THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0) AS DECIMAL(5,1)) as conv_rate
        FROM public.calls WHERE client_id = 1 AND call_date = CURRENT_DATE
        GROUP BY COALESCE(initiated_by, 'Didier') ORDER BY calls DESC
      `),
      client.query(`
        SELECT dt.daily_calls_target, dt.daily_conversations_target, dt.daily_meetings_target, dt.daily_conv_rate_target,
          COALESCE(a.calls_today, 0) as calls_actual, COALESCE(a.conv_today, 0) as conv_actual,
          COALESCE(a.meetings_today, 0) as meetings_actual, COALESCE(a.conv_rate_today, 0) as conv_rate_actual
        FROM public.daily_targets dt
        LEFT JOIN (
          SELECT COUNT(*)::int as calls_today,
            SUM(CASE WHEN is_human_conversation = true THEN 1 ELSE 0 END)::int as conv_today,
            SUM(CASE WHEN meeting_booked = true THEN 1 ELSE 0 END)::int as meetings_today,
            CAST(100.0 * SUM(CASE WHEN is_human_conversation = true THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0) AS DECIMAL(5,1)) as conv_rate_today
          FROM public.calls WHERE client_id = 1 AND call_date = CURRENT_DATE
        ) a ON true
        WHERE dt.client_id = 1 LIMIT 1
      `),
      client.query(`
        SELECT EXTRACT(HOUR FROM call_timestamp)::int as best_conv_hour,
          CAST(AVG(NULLIF(call_duration_seconds, 0)) AS INTEGER) as avg_duration_seconds
        FROM public.calls WHERE client_id = 1 AND call_date = CURRENT_DATE AND is_human_conversation = true
        GROUP BY EXTRACT(HOUR FROM call_timestamp) ORDER BY COUNT(*) DESC LIMIT 1
      `),
    ]);
    client.release();
    return res.status(200).json({
      timestamp: new Date().toISOString(),
      snapshot: snapshotResult.rows[0],
      performanceTrend: performanceTrendResult.rows,
      convRateTrend: convRateTrendResult.rows,
      outcomeBreakdown: outcomeBreakdownResult.rows,
      topPerformers: topPerformersResult.rows,
      goalTracking: goalTrackingResult.rows[0],
      quickStats: quickStatsResult.rows[0],
    });
  } catch (error) {
    if (client) client.release();
    return res.status(500).json({ error: 'Database error', message: error.message });
  }
}

// ── ACTIVITY ──────────────────────────────────────────────────────
async function handleActivity(req, res) {
  let client;
  try {
    client = await pool.connect();
    const [snapshotResult, activityTrendResult, activityTypeResult, activityOutcomeResult, activityFeedResult] = await Promise.all([
      client.query(`
        SELECT
          SUM(CASE WHEN call_date = CURRENT_DATE THEN 1 ELSE 0 END)::int as total_activities_today,
          SUM(CASE WHEN call_date = CURRENT_DATE - INTERVAL '1 day' THEN 1 ELSE 0 END)::int as total_activities_yesterday,
          SUM(CASE WHEN call_date = CURRENT_DATE AND is_human_conversation = true THEN 1 ELSE 0 END)::int as conversations_today,
          SUM(CASE WHEN call_date = CURRENT_DATE - INTERVAL '1 day' AND is_human_conversation = true THEN 1 ELSE 0 END)::int as conversations_yesterday,
          SUM(CASE WHEN call_date = CURRENT_DATE AND meeting_booked = true THEN 1 ELSE 0 END)::int as meetings_today,
          SUM(CASE WHEN call_date = CURRENT_DATE - INTERVAL '1 day' AND meeting_booked = true THEN 1 ELSE 0 END)::int as meetings_yesterday,
          SUM(CASE WHEN call_date = CURRENT_DATE AND contact_outcome = 'No Answer' THEN 1 ELSE 0 END)::int as no_answers_today,
          SUM(CASE WHEN call_date = CURRENT_DATE - INTERVAL '1 day' AND contact_outcome = 'No Answer' THEN 1 ELSE 0 END)::int as no_answers_yesterday,
          CAST(AVG(CASE WHEN call_date = CURRENT_DATE THEN NULLIF(call_duration_seconds, 0) END) AS INTEGER) as avg_duration_today,
          CAST(AVG(CASE WHEN call_date = CURRENT_DATE - INTERVAL '1 day' THEN NULLIF(call_duration_seconds, 0) END) AS INTEGER) as avg_duration_yesterday
        FROM public.calls WHERE client_id = 1 AND call_date >= CURRENT_DATE - INTERVAL '1 day'
      `),
      client.query(`
        SELECT EXTRACT(HOUR FROM call_timestamp)::int as hour, COUNT(*)::int as total_activities,
          SUM(CASE WHEN is_human_conversation = true THEN 1 ELSE 0 END)::int as conversations,
          SUM(CASE WHEN meeting_booked = true THEN 1 ELSE 0 END)::int as meetings_booked,
          COUNT(*)::int as calls_made
        FROM public.calls WHERE client_id = 1 AND call_date = CURRENT_DATE
        GROUP BY EXTRACT(HOUR FROM call_timestamp) ORDER BY hour
      `),
      client.query(`
        SELECT contact_outcome as activity_type, COUNT(*)::int as count,
          CAST(100.0 * COUNT(*) / NULLIF(SUM(COUNT(*)) OVER (), 0) AS DECIMAL(5,1)) as percentage
        FROM public.calls WHERE client_id = 1 AND call_date = CURRENT_DATE
        GROUP BY contact_outcome ORDER BY count DESC
      `),
      client.query(`
        SELECT CASE
            WHEN meeting_booked = true THEN 'Meeting Booked'
            WHEN contact_outcome ILIKE '%follow%' THEN 'Future Follow-Up'
            WHEN contact_outcome = 'Not Interested' THEN 'Not Interested'
            WHEN contact_outcome ILIKE '%no decision%' OR contact_outcome ILIKE '%gatekeeper%' THEN 'No Decision Maker'
            WHEN contact_outcome ILIKE '%voicemail%' THEN 'Voicemail'
            ELSE 'Other / Disposition'
          END as outcome_label,
          COUNT(*)::int as count,
          CAST(100.0 * COUNT(*) / NULLIF(SUM(COUNT(*)) OVER (), 0) AS DECIMAL(5,1)) as percentage
        FROM public.calls WHERE client_id = 1 AND call_date = CURRENT_DATE
        GROUP BY outcome_label ORDER BY count DESC
      `),
      client.query(`
        SELECT c.id, c.call_timestamp, c.call_time, c.company_name, c.contact_name, c.contact_outcome,
          c.call_duration_seconds, c.meeting_booked, c.is_human_conversation, c.overall_call_score,
          COALESCE(c.initiated_by, 'Didier') as sdr_name, ci.ai_summary, ci.conversation_detail
        FROM public.calls c LEFT JOIN public.call_intelligence ci ON ci.call_id = c.id
        WHERE c.client_id = 1 AND c.call_date = CURRENT_DATE
        ORDER BY c.call_timestamp DESC LIMIT 50
      `),
    ]);
    client.release();
    return res.status(200).json({
      timestamp: new Date().toISOString(),
      snapshot: snapshotResult.rows[0],
      activityTrend: activityTrendResult.rows,
      activityTypeBreakdown: activityTypeResult.rows,
      activityOutcomeBreakdown: activityOutcomeResult.rows,
      activityFeed: activityFeedResult.rows,
    });
  } catch (error) {
    if (client) client.release();
    return res.status(500).json({ error: 'Database error', message: error.message });
  }
}

// ── TRENDS ────────────────────────────────────────────────────────
async function handleTrends(req, res) {
  let client;
  try {
    client = await pool.connect();
    const [snapshotResult, perfOverTimeResult, convRateResult, heatmapResult, dayOfWeekResult, hourlyResult] = await Promise.all([
      client.query(`
        SELECT
          SUM(CASE WHEN call_date >= DATE_TRUNC('month', CURRENT_DATE) THEN 1 ELSE 0 END)::int as calls_this_month,
          SUM(CASE WHEN call_date >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '1 month' AND call_date < DATE_TRUNC('month', CURRENT_DATE) THEN 1 ELSE 0 END)::int as calls_last_month,
          SUM(CASE WHEN call_date >= DATE_TRUNC('month', CURRENT_DATE) AND is_human_conversation = true THEN 1 ELSE 0 END)::int as conv_this_month,
          SUM(CASE WHEN call_date >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '1 month' AND call_date < DATE_TRUNC('month', CURRENT_DATE) AND is_human_conversation = true THEN 1 ELSE 0 END)::int as conv_last_month,
          SUM(CASE WHEN call_date >= DATE_TRUNC('month', CURRENT_DATE) AND meeting_booked = true THEN 1 ELSE 0 END)::int as meetings_this_month,
          SUM(CASE WHEN call_date >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '1 month' AND call_date < DATE_TRUNC('month', CURRENT_DATE) AND meeting_booked = true THEN 1 ELSE 0 END)::int as meetings_last_month,
          CAST(100.0 * SUM(CASE WHEN call_date >= DATE_TRUNC('month', CURRENT_DATE) AND is_human_conversation = true THEN 1 ELSE 0 END) / NULLIF(SUM(CASE WHEN call_date >= DATE_TRUNC('month', CURRENT_DATE) THEN 1 ELSE 0 END), 0) AS DECIMAL(5,1)) as conv_rate_this_month,
          CAST(100.0 * SUM(CASE WHEN call_date >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '1 month' AND call_date < DATE_TRUNC('month', CURRENT_DATE) AND is_human_conversation = true THEN 1 ELSE 0 END) / NULLIF(SUM(CASE WHEN call_date >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '1 month' AND call_date < DATE_TRUNC('month', CURRENT_DATE) THEN 1 ELSE 0 END), 0) AS DECIMAL(5,1)) as conv_rate_last_month
        FROM public.calls WHERE client_id = 1 AND call_date >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '1 month'
      `),
      client.query(`
        SELECT call_date, TO_CHAR(call_date, 'Mon DD') as date_label, COUNT(*)::int as calls_made,
          SUM(CASE WHEN is_human_conversation = true THEN 1 ELSE 0 END)::int as conversations,
          SUM(CASE WHEN meeting_booked = true THEN 1 ELSE 0 END)::int as meetings_booked,
          SUM(CASE WHEN contact_outcome = 'No Answer' THEN 1 ELSE 0 END)::int as no_answers
        FROM public.calls WHERE client_id = 1 AND call_date >= DATE_TRUNC('month', CURRENT_DATE)
        GROUP BY call_date ORDER BY call_date
      `),
      client.query(`
        SELECT call_date, TO_CHAR(call_date, 'Mon DD') as date_label,
          CAST(100.0 * SUM(CASE WHEN is_human_conversation = true THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0) AS DECIMAL(5,1)) as conv_rate,
          CAST(100.0 * SUM(CASE WHEN meeting_booked = true THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0) AS DECIMAL(5,1)) as meeting_rate
        FROM public.calls WHERE client_id = 1 AND call_date >= DATE_TRUNC('month', CURRENT_DATE)
        GROUP BY call_date ORDER BY call_date
      `),
      client.query(`
        SELECT EXTRACT(DOW FROM call_timestamp)::int as day_of_week,
          EXTRACT(HOUR FROM call_timestamp)::int as hour, COUNT(*)::int as total_calls,
          SUM(CASE WHEN is_human_conversation = true THEN 1 ELSE 0 END)::int as conversations
        FROM public.calls WHERE client_id = 1 AND call_date >= DATE_TRUNC('month', CURRENT_DATE)
        GROUP BY day_of_week, hour ORDER BY day_of_week, hour
      `),
      client.query(`
        SELECT TO_CHAR(call_date, 'Day') as day_name, EXTRACT(DOW FROM call_date)::int as day_num,
          COUNT(*)::int as total_calls,
          CAST(100.0 * SUM(CASE WHEN is_human_conversation = true THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0) AS DECIMAL(5,1)) as conv_rate,
          SUM(CASE WHEN meeting_booked = true THEN 1 ELSE 0 END)::int as meetings_booked,
          CAST(100.0 * SUM(CASE WHEN contact_outcome = 'No Answer' THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0) AS DECIMAL(5,1)) as no_answer_rate
        FROM public.calls WHERE client_id = 1 AND call_date >= DATE_TRUNC('month', CURRENT_DATE)
        GROUP BY day_name, day_num ORDER BY day_num
      `),
      client.query(`
        SELECT EXTRACT(HOUR FROM call_timestamp)::int as hour, COUNT(*)::int as total_calls,
          SUM(CASE WHEN is_human_conversation = true THEN 1 ELSE 0 END)::int as conversations,
          CAST(100.0 * SUM(CASE WHEN is_human_conversation = true THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0) AS DECIMAL(5,1)) as conv_rate,
          SUM(CASE WHEN meeting_booked = true THEN 1 ELSE 0 END)::int as meetings_booked
        FROM public.calls WHERE client_id = 1 AND call_date >= DATE_TRUNC('month', CURRENT_DATE)
        GROUP BY EXTRACT(HOUR FROM call_timestamp) ORDER BY hour
      `),
    ]);
    client.release();
    return res.status(200).json({
      timestamp: new Date().toISOString(),
      snapshot: snapshotResult.rows[0],
      performanceOverTime: perfOverTimeResult.rows,
      convRateOverTime: convRateResult.rows,
      heatmap: heatmapResult.rows,
      dayOfWeek: dayOfWeekResult.rows,
      hourlyPerformance: hourlyResult.rows,
    });
  } catch (error) {
    if (client) client.release();
    return res.status(500).json({ error: 'Database error', message: error.message });
  }
}

// ── OUTCOMES ──────────────────────────────────────────────────────
async function handleOutcomes(req, res) {
  let client;
  try {
    client = await pool.connect();
    const [snapshotResult, overTimeResult, breakdownResult, pipelineResult, detailResult, winRateResult, topPerfResult] = await Promise.all([
      client.query(`
        SELECT
          SUM(CASE WHEN call_date >= DATE_TRUNC('month', CURRENT_DATE) AND meeting_booked = true THEN 1 ELSE 0 END)::int as meetings_this_month,
          SUM(CASE WHEN call_date >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '1 month' AND call_date < DATE_TRUNC('month', CURRENT_DATE) AND meeting_booked = true THEN 1 ELSE 0 END)::int as meetings_last_month,
          SUM(CASE WHEN call_date >= DATE_TRUNC('month', CURRENT_DATE) AND is_human_conversation = true THEN 1 ELSE 0 END)::int as conv_this_month,
          SUM(CASE WHEN call_date >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '1 month' AND call_date < DATE_TRUNC('month', CURRENT_DATE) AND is_human_conversation = true THEN 1 ELSE 0 END)::int as conv_last_month
        FROM public.calls WHERE client_id = 1 AND call_date >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '1 month'
      `),
      client.query(`
        SELECT call_date, TO_CHAR(call_date, 'Mon DD') as date_label,
          SUM(CASE WHEN meeting_booked = true THEN 1 ELSE 0 END)::int as meetings_booked,
          SUM(CASE WHEN is_human_conversation = true THEN 1 ELSE 0 END)::int as conversations,
          SUM(CASE WHEN contact_outcome = 'Not Interested' THEN 1 ELSE 0 END)::int as not_interested,
          SUM(CASE WHEN contact_outcome = 'No Answer' THEN 1 ELSE 0 END)::int as no_answer
        FROM public.calls WHERE client_id = 1 AND call_date >= DATE_TRUNC('month', CURRENT_DATE)
        GROUP BY call_date ORDER BY call_date
      `),
      client.query(`
        SELECT contact_outcome, COUNT(*)::int as count,
          CAST(100.0 * COUNT(*) / NULLIF(SUM(COUNT(*)) OVER (), 0) AS DECIMAL(5,1)) as percentage
        FROM public.calls WHERE client_id = 1 AND call_date >= DATE_TRUNC('month', CURRENT_DATE)
        GROUP BY contact_outcome ORDER BY count DESC
      `),
      client.query(`
        SELECT SUM(CASE WHEN c.call_date >= DATE_TRUNC('month', CURRENT_DATE) AND c.meeting_booked = true THEN 1 ELSE 0 END)::int as meetings_booked,
          COUNT(DISTINCT m.id)::int as qualified_meetings,
          CAST(COALESCE(SUM(m.est_pipeline_value), 0) AS DECIMAL(12,2)) as pipeline_value
        FROM public.calls c LEFT JOIN public.meetings m ON m.call_id = c.id
        WHERE c.client_id = 1 AND c.call_date >= DATE_TRUNC('month', CURRENT_DATE)
      `),
      client.query(`
        SELECT contact_outcome as outcome_type, COUNT(*)::int as count,
          CAST(100.0 * COUNT(*) / NULLIF(SUM(COUNT(*)) OVER (), 0) AS DECIMAL(5,1)) as pct_of_total
        FROM public.calls WHERE client_id = 1 AND call_date >= DATE_TRUNC('month', CURRENT_DATE)
        GROUP BY contact_outcome ORDER BY count DESC
      `),
      client.query(`
        SELECT
          CAST(100.0 * SUM(CASE WHEN meeting_booked = true THEN 1 ELSE 0 END) / NULLIF(SUM(CASE WHEN is_human_conversation = true THEN 1 ELSE 0 END), 0) AS DECIMAL(5,1)) as win_rate_this_month,
          CAST(100.0 * SUM(CASE WHEN call_date < DATE_TRUNC('month', CURRENT_DATE) AND meeting_booked = true THEN 1 ELSE 0 END) / NULLIF(SUM(CASE WHEN call_date < DATE_TRUNC('month', CURRENT_DATE) AND is_human_conversation = true THEN 1 ELSE 0 END), 0) AS DECIMAL(5,1)) as win_rate_last_month
        FROM public.calls WHERE client_id = 1 AND call_date >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '1 month'
      `),
      client.query(`
        SELECT COALESCE(initiated_by, 'Didier') as sdr_name,
          SUM(CASE WHEN meeting_booked = true THEN 1 ELSE 0 END)::int as meetings_booked,
          SUM(CASE WHEN is_human_conversation = true THEN 1 ELSE 0 END)::int as conversations,
          COUNT(*)::int as total_calls
        FROM public.calls WHERE client_id = 1 AND call_date >= DATE_TRUNC('month', CURRENT_DATE)
        GROUP BY COALESCE(initiated_by, 'Didier') ORDER BY meetings_booked DESC LIMIT 5
      `),
    ]);
    client.release();
    return res.status(200).json({
      timestamp: new Date().toISOString(),
      snapshot: snapshotResult.rows[0],
      outcomesOverTime: overTimeResult.rows,
      outcomeBreakdown: breakdownResult.rows,
      pipelineImpact: pipelineResult.rows[0],
      outcomeDetail: detailResult.rows,
      winRate: winRateResult.rows[0],
      topPerformers: topPerfResult.rows,
    });
  } catch (error) {
    if (client) client.release();
    return res.status(500).json({ error: 'Database error', message: error.message });
  }
}

// ── TIME INTELLIGENCE ─────────────────────────────────────────────
async function handleTime(req, res) {
  let client;
  try {
    client = await pool.connect();
    const [snapshotResult, hourlyResult, dayOfWeekResult, hourlyDetailResult, bestTimesResult] = await Promise.all([
      client.query(`
        SELECT
          CAST(AVG(CASE WHEN call_date >= DATE_TRUNC('month', CURRENT_DATE) THEN NULLIF(call_duration_seconds, 0) END) AS INTEGER) as avg_duration_this_month,
          CAST(AVG(CASE WHEN call_date >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '1 month' AND call_date < DATE_TRUNC('month', CURRENT_DATE) THEN NULLIF(call_duration_seconds, 0) END) AS INTEGER) as avg_duration_last_month,
          CAST(100.0 * SUM(CASE WHEN call_date >= DATE_TRUNC('month', CURRENT_DATE) AND is_human_conversation = true THEN COALESCE(call_duration_seconds, 0) END) / NULLIF(SUM(CASE WHEN call_date >= DATE_TRUNC('month', CURRENT_DATE) THEN COALESCE(call_duration_seconds, 0) END), 0) AS DECIMAL(5,1)) as pct_time_in_conversations
        FROM public.calls WHERE client_id = 1 AND call_date >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '1 month'
      `),
      client.query(`
        SELECT EXTRACT(HOUR FROM call_timestamp)::int as hour, COUNT(*)::int as total_calls,
          SUM(CASE WHEN is_human_conversation = true THEN 1 ELSE 0 END)::int as conversations,
          CAST(100.0 * SUM(CASE WHEN is_human_conversation = true THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0) AS DECIMAL(5,1)) as conv_rate,
          SUM(CASE WHEN meeting_booked = true THEN 1 ELSE 0 END)::int as meetings_booked,
          CAST(100.0 * SUM(CASE WHEN meeting_booked = true THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0) AS DECIMAL(5,1)) as meeting_rate,
          CAST(AVG(NULLIF(call_duration_seconds, 0)) AS INTEGER) as avg_duration_seconds
        FROM public.calls WHERE client_id = 1 AND call_date >= DATE_TRUNC('month', CURRENT_DATE)
        GROUP BY EXTRACT(HOUR FROM call_timestamp) ORDER BY hour
      `),
      client.query(`
        SELECT EXTRACT(DOW FROM call_date)::int as day_num, TO_CHAR(call_date, 'Day') as day_name,
          COUNT(*)::int as total_calls,
          SUM(CASE WHEN is_human_conversation = true THEN 1 ELSE 0 END)::int as conversations,
          SUM(CASE WHEN meeting_booked = true THEN 1 ELSE 0 END)::int as meetings,
          CAST(100.0 * SUM(CASE WHEN is_human_conversation = true THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0) AS DECIMAL(5,1)) as conv_rate,
          CAST(AVG(NULLIF(call_duration_seconds, 0)) AS INTEGER) as avg_duration_seconds
        FROM public.calls WHERE client_id = 1 AND call_date >= DATE_TRUNC('month', CURRENT_DATE)
        GROUP BY day_num, day_name ORDER BY day_num
      `),
      client.query(`
        SELECT EXTRACT(HOUR FROM call_timestamp)::int as hour, COUNT(*)::int as calls_made,
          CAST(100.0 * SUM(CASE WHEN is_human_conversation = true THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0) AS DECIMAL(5,1)) as conv_rate,
          SUM(CASE WHEN is_human_conversation = true THEN 1 ELSE 0 END)::int as human_conv,
          SUM(CASE WHEN meeting_booked = true THEN 1 ELSE 0 END)::int as meetings_booked
        FROM public.calls WHERE client_id = 1 AND call_date >= DATE_TRUNC('month', CURRENT_DATE)
        GROUP BY EXTRACT(HOUR FROM call_timestamp) ORDER BY hour
      `),
      client.query(`
        SELECT EXTRACT(HOUR FROM call_timestamp)::int as hour, COUNT(*)::int as total_calls,
          SUM(CASE WHEN is_human_conversation = true THEN 1 ELSE 0 END)::int as conversations,
          SUM(CASE WHEN meeting_booked = true THEN 1 ELSE 0 END)::int as meetings,
          CAST(100.0 * SUM(CASE WHEN is_human_conversation = true THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0) AS DECIMAL(5,1)) as conv_rate
        FROM public.calls WHERE client_id = 1 AND call_date >= DATE_TRUNC('month', CURRENT_DATE)
        GROUP BY EXTRACT(HOUR FROM call_timestamp) ORDER BY conv_rate DESC LIMIT 3
      `),
    ]);
    client.release();
    return res.status(200).json({
      timestamp: new Date().toISOString(),
      snapshot: snapshotResult.rows[0],
      hourlyEngagement: hourlyResult.rows,
      dayOfWeek: dayOfWeekResult.rows,
      hourlyDetail: hourlyDetailResult.rows,
      bestTimes: bestTimesResult.rows,
    });
  } catch (error) {
    if (client) client.release();
    return res.status(500).json({ error: 'Database error', message: error.message });
  }
}

// ── SCORECARD ─────────────────────────────────────────────────────
async function handleScorecard(req, res) {
  let client;
  try {
    client = await pool.connect();
    const [snapshotResult, scoreResult, breakdownResult, goalsResult, scoreOverTimeResult, scoreBySdrResult, distributionResult] = await Promise.all([
      client.query(`
        SELECT
          SUM(CASE WHEN call_date >= DATE_TRUNC('month', CURRENT_DATE) THEN 1 ELSE 0 END)::int as calls_this_month,
          SUM(CASE WHEN call_date >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '1 month' AND call_date < DATE_TRUNC('month', CURRENT_DATE) THEN 1 ELSE 0 END)::int as calls_last_month,
          SUM(CASE WHEN call_date >= DATE_TRUNC('month', CURRENT_DATE) AND meeting_booked = true THEN 1 ELSE 0 END)::int as meetings_this_month,
          SUM(CASE WHEN call_date >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '1 month' AND call_date < DATE_TRUNC('month', CURRENT_DATE) AND meeting_booked = true THEN 1 ELSE 0 END)::int as meetings_last_month,
          CAST(100.0 * SUM(CASE WHEN call_date >= DATE_TRUNC('month', CURRENT_DATE) AND is_human_conversation = true THEN 1 ELSE 0 END) / NULLIF(SUM(CASE WHEN call_date >= DATE_TRUNC('month', CURRENT_DATE) THEN 1 ELSE 0 END), 0) AS DECIMAL(5,1)) as conv_rate_this_month
        FROM public.calls WHERE client_id = 1 AND call_date >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '1 month'
      `),
      client.query(`
        SELECT
          CAST(AVG(CASE WHEN c.call_date >= DATE_TRUNC('month', CURRENT_DATE) THEN NULLIF(c.overall_call_score, 0) END) AS DECIMAL(5,1)) as avg_score_this_month,
          CAST(AVG(CASE WHEN c.call_date >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '1 month' AND c.call_date < DATE_TRUNC('month', CURRENT_DATE) THEN NULLIF(c.overall_call_score, 0) END) AS DECIMAL(5,1)) as avg_score_last_month
        FROM public.calls c WHERE c.client_id = 1 AND c.call_date >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '1 month'
      `),
      client.query(`
        SELECT
          CAST(AVG(NULLIF(overall_call_score, 0)) AS DECIMAL(5,1)) as activity_volume_score,
          CAST(AVG(NULLIF(sentiment_score, 0)) AS DECIMAL(5,1)) as engagement_quality_score,
          CAST(AVG(NULLIF(technical_fit_score, 0)) AS DECIMAL(5,1)) as conversion_efficiency_score,
          CAST(AVG(NULLIF(overall_score, 0)) AS DECIMAL(5,1)) as pipeline_impact_score
        FROM public.call_intelligence ci JOIN public.calls c ON c.id = ci.call_id
        WHERE c.client_id = 1 AND c.call_date >= DATE_TRUNC('month', CURRENT_DATE)
      `),
      client.query(`
        SELECT dt.daily_calls_target * 20 as calls_goal, dt.daily_conversations_target * 20 as conv_goal,
          dt.daily_meetings_target * 20 as meetings_goal, dt.daily_conv_rate_target as conv_rate_goal,
          COALESCE(a.calls_actual, 0) as calls_actual, COALESCE(a.conv_actual, 0) as conv_actual,
          COALESCE(a.meetings_actual, 0) as meetings_actual, COALESCE(a.conv_rate_actual, 0) as conv_rate_actual
        FROM public.daily_targets dt
        LEFT JOIN (
          SELECT COUNT(*)::int as calls_actual,
            SUM(CASE WHEN is_human_conversation = true THEN 1 ELSE 0 END)::int as conv_actual,
            SUM(CASE WHEN meeting_booked = true THEN 1 ELSE 0 END)::int as meetings_actual,
            CAST(100.0 * SUM(CASE WHEN is_human_conversation = true THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0) AS DECIMAL(5,1)) as conv_rate_actual
          FROM public.calls WHERE client_id = 1 AND call_date >= DATE_TRUNC('month', CURRENT_DATE)
        ) a ON true WHERE dt.client_id = 1 LIMIT 1
      `),
      client.query(`
        SELECT c.call_date, TO_CHAR(c.call_date, 'Mon DD') as date_label,
          CAST(AVG(NULLIF(c.overall_call_score, 0)) AS DECIMAL(5,1)) as avg_score
        FROM public.calls c WHERE c.client_id = 1 AND c.call_date >= DATE_TRUNC('month', CURRENT_DATE)
        AND c.overall_call_score IS NOT NULL AND c.overall_call_score > 0
        GROUP BY c.call_date ORDER BY c.call_date
      `),
      client.query(`
        SELECT COALESCE(initiated_by, 'Didier') as sdr_name,
          CAST(AVG(NULLIF(overall_call_score, 0)) AS DECIMAL(5,1)) as avg_score, COUNT(*)::int as total_calls
        FROM public.calls WHERE client_id = 1 AND call_date >= DATE_TRUNC('month', CURRENT_DATE)
        AND overall_call_score IS NOT NULL AND overall_call_score > 0
        GROUP BY COALESCE(initiated_by, 'Didier') ORDER BY avg_score DESC
      `),
      client.query(`
        SELECT CASE
            WHEN overall_call_score >= 90 THEN '90-100'
            WHEN overall_call_score >= 80 THEN '80-89'
            WHEN overall_call_score >= 70 THEN '70-79'
            WHEN overall_call_score >= 60 THEN '60-69'
            ELSE '0-59'
          END as score_range, COUNT(*)::int as count
        FROM public.calls WHERE client_id = 1 AND call_date >= DATE_TRUNC('month', CURRENT_DATE)
        AND overall_call_score IS NOT NULL AND overall_call_score > 0
        GROUP BY score_range ORDER BY score_range
      `),
    ]);
    client.release();
    return res.status(200).json({
      timestamp: new Date().toISOString(),
      snapshot: snapshotResult.rows[0],
      overallScore: scoreResult.rows[0],
      scoreBreakdown: breakdownResult.rows[0],
      goalsProgress: goalsResult.rows[0],
      scoreOverTime: scoreOverTimeResult.rows,
      scoreBySdr: scoreBySdrResult.rows,
      scoreDistribution: distributionResult.rows,
    });
  } catch (error) {
    if (client) client.release();
    return res.status(500).json({ error: 'Database error', message: error.message });
  }
}

// ── AI COACHING ───────────────────────────────────────────────────
async function handleCoaching(req, res) {
  let client;
  try {
    client = await pool.connect();
    const [snapshotResult, insightsResult, skillsResult, scoreOverTimeResult, topSkillsResult, sessionsResult] = await Promise.all([
      client.query(`
        SELECT
          CAST(AVG(CASE WHEN c.call_date >= DATE_TRUNC('month', CURRENT_DATE) THEN NULLIF(c.overall_call_score, 0) END) AS DECIMAL(5,1)) as avg_score_this_month,
          CAST(AVG(CASE WHEN c.call_date >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '1 month' AND c.call_date < DATE_TRUNC('month', CURRENT_DATE) THEN NULLIF(c.overall_call_score, 0) END) AS DECIMAL(5,1)) as avg_score_last_month,
          COUNT(CASE WHEN c.call_date >= DATE_TRUNC('month', CURRENT_DATE) AND c.is_human_conversation = true THEN 1 END)::int as coaching_opportunities_this_month
        FROM public.calls c LEFT JOIN public.call_intelligence ci ON ci.call_id = c.id
        WHERE c.client_id = 1 AND c.call_date >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '1 month'
      `),
      client.query(`
        SELECT ci.objections, ci.what_could_be_improved, ci.coaching_notes,
          ci.overall_score, ci.sentiment_score, ci.objection_count,
          c.call_date, c.company_name, c.overall_call_score
        FROM public.call_intelligence ci JOIN public.calls c ON c.id = ci.call_id
        WHERE c.client_id = 1 AND c.call_date >= DATE_TRUNC('month', CURRENT_DATE) AND c.is_human_conversation = true
        ORDER BY c.call_date DESC LIMIT 20
      `),
      client.query(`
        SELECT
          CAST(AVG(NULLIF(overall_call_score, 0)) AS DECIMAL(5,1)) as overall_avg,
          CAST(AVG(NULLIF(technical_fit_score, 0)) AS DECIMAL(5,1)) as technical_fit_avg,
          CAST(AVG(NULLIF(sentiment_score, 0)) AS DECIMAL(5,1)) as sentiment_avg,
          CAST(AVG(NULLIF(objection_count, 0)) AS DECIMAL(5,1)) as avg_objections,
          COUNT(*)::int as total_analyzed
        FROM public.call_intelligence ci JOIN public.calls c ON c.id = ci.call_id
        WHERE c.client_id = 1 AND c.call_date >= DATE_TRUNC('month', CURRENT_DATE) AND c.is_human_conversation = true
      `),
      client.query(`
        SELECT c.call_date, TO_CHAR(c.call_date, 'Mon DD') as date_label,
          CAST(AVG(NULLIF(c.overall_call_score, 0)) AS DECIMAL(5,1)) as avg_score
        FROM public.calls c JOIN public.call_intelligence ci ON ci.call_id = c.id
        WHERE c.client_id = 1 AND c.call_date >= DATE_TRUNC('month', CURRENT_DATE) AND c.is_human_conversation = true
        GROUP BY c.call_date ORDER BY c.call_date
      `),
      client.query(`
        SELECT 'Objection Handling' as skill,
          CAST(AVG(CASE WHEN ci.objection_count > 2 THEN c.overall_call_score END) AS DECIMAL(5,1)) as avg_score,
          COUNT(CASE WHEN ci.objection_count > 2 THEN 1 END)::int as opportunity_count
        FROM public.call_intelligence ci JOIN public.calls c ON c.id = ci.call_id
        WHERE c.client_id = 1 AND c.call_date >= DATE_TRUNC('month', CURRENT_DATE) AND c.is_human_conversation = true
        UNION ALL
        SELECT 'Technical Discovery' as skill,
          CAST(AVG(NULLIF(ci.technical_fit_score, 0)) AS DECIMAL(5,1)) as avg_score, COUNT(*)::int as opportunity_count
        FROM public.call_intelligence ci JOIN public.calls c ON c.id = ci.call_id
        WHERE c.client_id = 1 AND c.call_date >= DATE_TRUNC('month', CURRENT_DATE) AND c.is_human_conversation = true
        UNION ALL
        SELECT 'Sentiment & Rapport' as skill,
          CAST(AVG(NULLIF(ci.sentiment_score, 0)) AS DECIMAL(5,1)) as avg_score, COUNT(*)::int as opportunity_count
        FROM public.call_intelligence ci JOIN public.calls c ON c.id = ci.call_id
        WHERE c.client_id = 1 AND c.call_date >= DATE_TRUNC('month', CURRENT_DATE) AND c.is_human_conversation = true
        ORDER BY avg_score ASC NULLS LAST
      `),
      client.query(`
        SELECT c.call_timestamp, c.call_date, c.company_name, c.contact_name, c.overall_call_score,
          c.call_duration_seconds, c.contact_outcome, c.meeting_booked,
          COALESCE(c.initiated_by, 'Didier') as sdr_name,
          ci.ai_summary, ci.what_worked_well, ci.what_could_be_improved,
          ci.coaching_notes, ci.objections, ci.conversation_detail,
          ci.overall_score, ci.technical_fit_score, ci.sentiment_score, ci.objection_count
        FROM public.calls c JOIN public.call_intelligence ci ON ci.call_id = c.id
        WHERE c.client_id = 1 AND c.is_human_conversation = true
        ORDER BY c.call_timestamp DESC LIMIT 10
      `),
    ]);
    client.release();
    return res.status(200).json({
      timestamp: new Date().toISOString(),
      snapshot: snapshotResult.rows[0],
      coachingInsights: insightsResult.rows,
      skillScores: skillsResult.rows[0],
      scoreOverTime: scoreOverTimeResult.rows,
      topSkills: topSkillsResult.rows,
      recentSessions: sessionsResult.rows,
    });
  } catch (error) {
    if (client) client.release();
    return res.status(500).json({ error: 'Database error', message: error.message });
  }
}

// ── BOOKED MEETINGS ───────────────────────────────────────────────
async function handleMeetings(req, res) {
  let client;
  try {
    client = await pool.connect();
    const [snapshotResult, feedResult, qualityResult, sourceResult, pipelineResult, qualityScoreResult, heatmapResult, upcomingResult] = await Promise.all([
      client.query(`
        SELECT
          SUM(CASE WHEN c.call_date >= DATE_TRUNC('week', CURRENT_DATE) AND c.meeting_booked = true THEN 1 ELSE 0 END)::int as meetings_this_week,
          SUM(CASE WHEN c.call_date >= DATE_TRUNC('week', CURRENT_DATE) - INTERVAL '7 days' AND c.call_date < DATE_TRUNC('week', CURRENT_DATE) AND c.meeting_booked = true THEN 1 ELSE 0 END)::int as meetings_last_week,
          CAST(AVG(CASE WHEN c.call_date >= DATE_TRUNC('week', CURRENT_DATE) AND c.meeting_booked = true THEN NULLIF(c.overall_call_score, 0) END) AS DECIMAL(5,1)) as avg_quality_this_week,
          CAST(100.0 * SUM(CASE WHEN c.call_date >= DATE_TRUNC('week', CURRENT_DATE) AND c.meeting_booked = true THEN 1 ELSE 0 END) / NULLIF(SUM(CASE WHEN c.call_date >= DATE_TRUNC('week', CURRENT_DATE) AND c.is_human_conversation = true THEN 1 ELSE 0 END), 0) AS DECIMAL(5,1)) as meeting_conv_rate_this_week
        FROM public.calls c WHERE c.client_id = 1 AND c.call_date >= DATE_TRUNC('week', CURRENT_DATE) - INTERVAL '7 days'
      `),
      client.query(`
        SELECT m.id, m.meeting_datetime, m.cal_status, m.cal_meeting_url,
          m.invitee_first_name, m.invitee_last_name, m.invitee_email, m.meeting_duration, m.est_pipeline_value,
          c.company_name, c.contact_name, c.overall_call_score, c.call_timestamp, c.call_date, c.call_time,
          c.call_duration_seconds, COALESCE(c.initiated_by, 'Didier') as sdr_name,
          ci.ai_summary, ci.conversation_detail, ci.technical_fit_score
        FROM public.meetings m JOIN public.calls c ON c.id = m.call_id
        LEFT JOIN public.call_intelligence ci ON ci.call_id = c.id
        WHERE c.client_id = 1 ORDER BY m.meeting_datetime DESC LIMIT 25
      `),
      client.query(`
        SELECT CASE
            WHEN c.overall_call_score >= 8 THEN 'High Quality (8-10)'
            WHEN c.overall_call_score >= 6 THEN 'Medium Quality (6-7.9)'
            ELSE 'Low Quality (<6)'
          END as quality_tier, COUNT(*)::int as count,
          CAST(100.0 * COUNT(*) / NULLIF(SUM(COUNT(*)) OVER (), 0) AS DECIMAL(5,1)) as percentage
        FROM public.meetings m JOIN public.calls c ON c.id = m.call_id
        WHERE c.client_id = 1 AND c.overall_call_score IS NOT NULL AND c.overall_call_score > 0
        GROUP BY quality_tier ORDER BY count DESC
      `),
      client.query(`
        SELECT CASE
            WHEN c.call_type ILIKE '%cold%' OR c.call_direction = 'outbound' THEN 'Cold Call'
            WHEN c.call_type ILIKE '%follow%' THEN 'Follow-Up'
            ELSE 'Other'
          END as source, COUNT(*)::int as count,
          CAST(100.0 * COUNT(*) / NULLIF(SUM(COUNT(*)) OVER (), 0) AS DECIMAL(5,1)) as percentage
        FROM public.meetings m JOIN public.calls c ON c.id = m.call_id
        WHERE c.client_id = 1 GROUP BY source ORDER BY count DESC
      `),
      client.query(`
        SELECT COALESCE(m.cal_status, 'booked') as stage, COUNT(*)::int as count,
          CAST(100.0 * COUNT(*) / NULLIF(SUM(COUNT(*)) OVER (), 0) AS DECIMAL(5,1)) as pct_of_total,
          CAST(COALESCE(SUM(m.est_pipeline_value), 0) AS DECIMAL(12,2)) as pipeline_value
        FROM public.meetings m JOIN public.calls c ON c.id = m.call_id
        WHERE c.client_id = 1 GROUP BY COALESCE(m.cal_status, 'booked') ORDER BY count DESC
      `),
      client.query(`
        SELECT CAST(AVG(NULLIF(ci.technical_fit_score, 0)) AS DECIMAL(5,1)) as technical_fit_avg,
          CAST(AVG(NULLIF(ci.sentiment_score, 0)) AS DECIMAL(5,1)) as sentiment_avg,
          CAST(AVG(NULLIF(ci.overall_score, 0)) AS DECIMAL(5,1)) as overall_avg,
          COUNT(*)::int as meetings_analyzed
        FROM public.call_intelligence ci JOIN public.calls c ON c.id = ci.call_id
        WHERE c.client_id = 1 AND c.meeting_booked = true AND c.call_date >= DATE_TRUNC('month', CURRENT_DATE)
      `),
      client.query(`
        SELECT EXTRACT(DOW FROM c.call_timestamp)::int as day_of_week,
          EXTRACT(HOUR FROM c.call_timestamp)::int as hour, COUNT(*)::int as meetings_booked
        FROM public.calls c WHERE c.client_id = 1 AND c.meeting_booked = true
        AND c.call_date >= DATE_TRUNC('month', CURRENT_DATE)
        GROUP BY day_of_week, hour ORDER BY day_of_week, hour
      `),
      client.query(`
        SELECT m.id, m.meeting_datetime, m.cal_meeting_url, m.cal_status,
          m.invitee_first_name, m.invitee_last_name, m.meeting_duration,
          c.company_name, c.contact_name, c.overall_call_score, ci.conversation_detail
        FROM public.meetings m JOIN public.calls c ON c.id = m.call_id
        LEFT JOIN public.call_intelligence ci ON ci.call_id = c.id
        WHERE c.client_id = 1 AND m.meeting_datetime > NOW()
        ORDER BY m.meeting_datetime ASC LIMIT 5
      `),
    ]);
    client.release();
    return res.status(200).json({
      timestamp: new Date().toISOString(),
      snapshot: snapshotResult.rows[0],
      meetingFeed: feedResult.rows,
      meetingQuality: qualityResult.rows,
      meetingSource: sourceResult.rows,
      pipelineTracker: pipelineResult.rows,
      qualityScore: qualityScoreResult.rows[0],
      bookingHeatmap: heatmapResult.rows,
      upcomingMeetings: upcomingResult.rows,
    });
  } catch (error) {
    if (client) client.release();
    return res.status(500).json({ error: 'Database error', message: error.message });
  }
}

// ── PROSPECTS ─────────────────────────────────────────────────────
async function handleProspects(req, res) {
  let client;
  try {
    client = await pool.connect();
    const [snapshotResult, sourceResult, industryResult, funnelResult, convResult, researchResult] = await Promise.all([
      client.query(`
        SELECT COUNT(*)::int as total_prospects,
          SUM(CASE WHEN created_at::date = CURRENT_DATE THEN 1 ELSE 0 END)::int as new_today,
          SUM(CASE WHEN created_at >= DATE_TRUNC('week', CURRENT_DATE) THEN 1 ELSE 0 END)::int as new_this_week,
          SUM(CASE WHEN created_at >= DATE_TRUNC('month', CURRENT_DATE) THEN 1 ELSE 0 END)::int as new_this_month,
          SUM(CASE WHEN outreach_ready = true THEN 1 ELSE 0 END)::int as outreach_ready,
          CAST(100.0 * SUM(CASE WHEN outreach_ready = true THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0) AS DECIMAL(5,1)) as outreach_ready_pct,
          CAST(AVG(NULLIF(research_depth_score, 0)) AS DECIMAL(5,1)) as avg_quality_score
        FROM public.prospects WHERE organization_id = 1
      `),
      client.query(`
        SELECT COALESCE(source, 'Other') as source, COUNT(*)::int as count,
          CAST(100.0 * COUNT(*) / NULLIF(SUM(COUNT(*)) OVER (), 0) AS DECIMAL(5,1)) as percentage
        FROM public.prospects WHERE organization_id = 1
        GROUP BY source ORDER BY count DESC
      `),
      client.query(`
        SELECT COALESCE(industry, 'Other') as industry, COUNT(*)::int as count,
          CAST(100.0 * COUNT(*) / NULLIF(SUM(COUNT(*)) OVER (), 0) AS DECIMAL(5,1)) as percentage
        FROM public.prospects WHERE organization_id = 1
        GROUP BY industry ORDER BY count DESC LIMIT 8
      `),
      client.query(`
        SELECT COUNT(*)::int as total_prospects,
          SUM(CASE WHEN decision_maker_identified = true OR email_verified = true THEN 1 ELSE 0 END)::int as research_complete,
          SUM(CASE WHEN email_verified = true OR direct_number_found = true THEN 1 ELSE 0 END)::int as contact_info_found,
          SUM(CASE WHEN tech_stack_identified = true OR pain_points_captured = true THEN 1 ELSE 0 END)::int as enriched,
          SUM(CASE WHEN outreach_ready = true THEN 1 ELSE 0 END)::int as outreach_ready
        FROM public.prospects WHERE organization_id = 1
      `),
      client.query(`
        SELECT COALESCE(p.source, 'Other') as source, COUNT(DISTINCT p.id)::int as total_prospects,
          COUNT(DISTINCT c.id)::int as calls_made,
          CAST(100.0 * COUNT(DISTINCT c.id) / NULLIF(COUNT(DISTINCT p.id), 0) AS DECIMAL(5,1)) as reply_rate,
          SUM(CASE WHEN c.is_human_conversation = true THEN 1 ELSE 0 END)::int as conversations,
          CAST(100.0 * SUM(CASE WHEN c.meeting_booked = true THEN 1 ELSE 0 END) / NULLIF(COUNT(DISTINCT c.id), 0) AS DECIMAL(5,1)) as meeting_rate
        FROM public.prospects p LEFT JOIN public.calls c ON c.company_name = p.company_name AND c.client_id = 1
        WHERE p.organization_id = 1 GROUP BY source ORDER BY total_prospects DESC
      `),
      client.query(`
        SELECT
          CAST(100.0 * SUM(CASE WHEN decision_maker_identified = true THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0) AS DECIMAL(5,1)) as decision_maker_pct,
          CAST(100.0 * SUM(CASE WHEN direct_number_found = true THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0) AS DECIMAL(5,1)) as direct_number_pct,
          CAST(100.0 * SUM(CASE WHEN email_verified = true THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0) AS DECIMAL(5,1)) as email_verified_pct,
          CAST(100.0 * SUM(CASE WHEN tech_stack_identified = true THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0) AS DECIMAL(5,1)) as tech_stack_pct,
          CAST(100.0 * SUM(CASE WHEN pain_points_captured = true THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0) AS DECIMAL(5,1)) as pain_points_pct,
          CAST(100.0 * SUM(CASE WHEN existing_provider_found = true THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0) AS DECIMAL(5,1)) as existing_provider_pct,
          CAST(100.0 * SUM(CASE WHEN renewal_timing_identified = true THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0) AS DECIMAL(5,1)) as renewal_timing_pct,
          CAST(100.0 * SUM(CASE WHEN ai_enrichment_used = true THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0) AS DECIMAL(5,1)) as ai_enrichment_pct,
          CAST(AVG(NULLIF(research_depth_score, 0)) AS DECIMAL(5,1)) as avg_research_depth_score
        FROM public.prospects WHERE organization_id = 1
      `),
    ]);
    client.release();
    return res.status(200).json({
      timestamp: new Date().toISOString(),
      snapshot: snapshotResult.rows[0],
      sourceBreakdown: sourceResult.rows,
      industryDistribution: industryResult.rows,
      outreachReadiness: funnelResult.rows[0],
      conversionBySource: convResult.rows,
      researchIntelligence: researchResult.rows[0],
    });
  } catch (error) {
    if (client) client.release();
    return res.status(500).json({ error: 'Database error', message: error.message });
  }
}

// ── RESEARCH ──────────────────────────────────────────────────────
async function handleResearch(req, res) {
  let client;
  try {
    client = await pool.connect();
    const [snapshotResult, listResult, renewalsResult, decisionResult] = await Promise.all([
      client.query(`
        SELECT COUNT(*)::int as total_researched,
          SUM(CASE WHEN research_depth_score >= 80 THEN 1 ELSE 0 END)::int as high_priority,
          SUM(CASE WHEN outreach_ready = true THEN 1 ELSE 0 END)::int as outreach_ready,
          SUM(CASE WHEN updated_at >= CURRENT_DATE - INTERVAL '7 days' THEN 1 ELSE 0 END)::int as new_intel_this_week,
          CAST(AVG(NULLIF(research_depth_score, 0)) AS DECIMAL(5,1)) as avg_fit_score
        FROM public.prospects WHERE organization_id = 1
      `),
      client.query(`
        SELECT p.id, p.company_name, p.industry, p.company_size,
          p.contact_first_name, p.contact_last_name, p.contact_email, p.direct_number,
          p.source, p.status, p.outreach_ready, p.research_depth_score,
          p.decision_maker_identified, p.email_verified, p.direct_number_found,
          p.tech_stack_identified, p.pain_points_captured, p.existing_provider_found,
          p.renewal_timing_identified, p.ai_enrichment_used, p.hubspot_company_id,
          p.updated_at, p.created_at,
          MAX(c.call_date) as last_call_date, COUNT(c.id)::int as total_calls
        FROM public.prospects p LEFT JOIN public.calls c ON c.company_name = p.company_name AND c.client_id = 1
        WHERE p.organization_id = 1 GROUP BY p.id
        ORDER BY p.research_depth_score DESC NULLS LAST, p.updated_at DESC LIMIT 100
      `),
      client.query(`
        SELECT id, company_name, industry, contact_first_name, contact_last_name,
          research_depth_score, renewal_timing_identified, updated_at
        FROM public.prospects WHERE organization_id = 1 AND renewal_timing_identified = true
        ORDER BY research_depth_score DESC NULLS LAST LIMIT 5
      `),
      client.query(`
        SELECT status, COUNT(*)::int as count,
          CAST(AVG(NULLIF(research_depth_score, 0)) AS DECIMAL(5,1)) as avg_score
        FROM public.prospects WHERE organization_id = 1
        GROUP BY status ORDER BY count DESC
      `),
    ]);
    client.release();
    return res.status(200).json({
      timestamp: new Date().toISOString(),
      snapshot: snapshotResult.rows[0],
      prospectList: listResult.rows,
      topRenewals: renewalsResult.rows,
      decisionMakers: decisionResult.rows,
    });
  } catch (error) {
    if (client) client.release();
    return res.status(500).json({ error: 'Database error', message: error.message });
  }
}

// ── REPORTS ───────────────────────────────────────────────────────
async function handleReports(req, res) {
  let client;
  try {
    client = await pool.connect();
    const [snapshotResult, recentResult, byTypeResult, scheduledResult, overTimeResult] = await Promise.all([
      client.query(`
        SELECT COUNT(*)::int as total_generated,
          SUM(CASE WHEN created_at >= CURRENT_DATE - INTERVAL '30 days' THEN 1 ELSE 0 END)::int as generated_last_30,
          SUM(CASE WHEN scheduled = true THEN 1 ELSE 0 END)::int as scheduled_count,
          COUNT(DISTINCT report_type)::int as unique_types
        FROM public.reports_log WHERE organization_id = 1
      `),
      client.query(`
        SELECT id, report_type, report_name, format, status, file_url, scheduled, created_at
        FROM public.reports_log WHERE organization_id = 1
        ORDER BY created_at DESC LIMIT 10
      `),
      client.query(`
        SELECT report_type, COUNT(*)::int as count,
          CAST(100.0 * COUNT(*) / NULLIF(SUM(COUNT(*)) OVER (), 0) AS DECIMAL(5,1)) as percentage
        FROM public.reports_log WHERE organization_id = 1 AND created_at >= CURRENT_DATE - INTERVAL '30 days'
        GROUP BY report_type ORDER BY count DESC
      `),
      client.query(`
        SELECT id, report_type, report_name, schedule_freq, next_run_at, status
        FROM public.reports_log WHERE organization_id = 1 AND scheduled = true
        ORDER BY next_run_at ASC LIMIT 10
      `),
      client.query(`
        SELECT DATE(created_at) as report_date, TO_CHAR(DATE(created_at), 'Mon DD') as date_label, COUNT(*)::int as count
        FROM public.reports_log WHERE organization_id = 1 AND created_at >= CURRENT_DATE - INTERVAL '30 days'
        GROUP BY DATE(created_at) ORDER BY report_date
      `),
    ]);
    client.release();
    return res.status(200).json({
      timestamp: new Date().toISOString(),
      snapshot: snapshotResult.rows[0],
      recentReports: recentResult.rows,
      reportsByType: byTypeResult.rows,
      scheduledReports: scheduledResult.rows,
      reportsOverTime: overTimeResult.rows,
    });
  } catch (error) {
    if (client) client.release();
    return res.status(500).json({ error: 'Database error', message: error.message });
  }
}

async function handleReportLog(req, res) {
  let client;
  try {
    client = await pool.connect();
    const { report_type, report_name, date_range_start, date_range_end, format, scheduled, schedule_freq, next_run_at } = req.body;
    const result = await client.query(`
      INSERT INTO public.reports_log (organization_id, user_id, report_type, report_name, date_range_start, date_range_end, format, status, scheduled, schedule_freq, next_run_at)
      VALUES (1, 1, $1, $2, $3, $4, $5, 'generated', $6, $7, $8) RETURNING id
    `, [report_type, report_name, date_range_start, date_range_end, format || 'PDF', scheduled || false, schedule_freq, next_run_at]);
    client.release();
    return res.status(200).json({ success: true, id: result.rows[0].id });
  } catch (error) {
    if (client) client.release();
    return res.status(500).json({ error: 'Database error', message: error.message });
  }
}

// ── SETTINGS ──────────────────────────────────────────────────────
async function handleSettings(req, res) {
  let client;
  try {
    client = await pool.connect();
    const [prefsResult, notifsResult, userResult, orgResult] = await Promise.all([
      client.query(`SELECT * FROM public.user_dashboard_preferences WHERE user_id = 1`),
      client.query(`SELECT * FROM public.user_notification_preferences WHERE user_id = 1`),
      client.query(`SELECT id, name, email, role, org_id FROM public.users WHERE id = 1`),
      client.query(`SELECT id, name FROM public.organizations WHERE id = 1`),
    ]);
    client.release();
    return res.status(200).json({
      timestamp: new Date().toISOString(),
      preferences: prefsResult.rows[0] || null,
      notifications: notifsResult.rows[0] || null,
      user: userResult.rows[0] || null,
      org: orgResult.rows[0] || null,
    });
  } catch (error) {
    if (client) client.release();
    return res.status(500).json({ error: 'Database error', message: error.message });
  }
}

async function handleSettingsSave(req, res) {
  let client;
  try {
    client = await pool.connect();
    const { preferences, notifications } = req.body;
    if (preferences) {
      await client.query(`
        INSERT INTO public.user_dashboard_preferences (user_id, daily_prospect_target, weekly_meetings_target, daily_calls_target, prospect_inventory_min, research_completion_target, followup_response_target, scoring_sensitivity, coaching_strictness, qualification_threshold, objection_detection, discovery_detection, sentiment_analysis, ai_summary_length, date_format, timezone, currency, business_hours_start, business_hours_end, week_starts_on, updated_at)
        VALUES (1, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, NOW())
        ON CONFLICT (user_id) DO UPDATE SET
          daily_prospect_target=$1, weekly_meetings_target=$2, daily_calls_target=$3,
          prospect_inventory_min=$4, research_completion_target=$5, followup_response_target=$6,
          scoring_sensitivity=$7, coaching_strictness=$8, qualification_threshold=$9,
          objection_detection=$10, discovery_detection=$11, sentiment_analysis=$12,
          ai_summary_length=$13, date_format=$14, timezone=$15, currency=$16,
          business_hours_start=$17, business_hours_end=$18, week_starts_on=$19, updated_at=NOW()
      `, [
        preferences.daily_prospect_target ?? 150, preferences.weekly_meetings_target ?? 20,
        preferences.daily_calls_target ?? 50, preferences.prospect_inventory_min ?? 1000,
        preferences.research_completion_target ?? 90, preferences.followup_response_target ?? 25,
        preferences.scoring_sensitivity ?? 'high', preferences.coaching_strictness ?? 'medium',
        preferences.qualification_threshold ?? 75, preferences.objection_detection ?? 'high',
        preferences.discovery_detection ?? 'medium', preferences.sentiment_analysis ?? true,
        preferences.ai_summary_length ?? 'detailed', preferences.date_format ?? 'MM/DD/YYYY',
        preferences.timezone ?? 'America/Winnipeg', preferences.currency ?? 'USD',
        preferences.business_hours_start ?? '08:00', preferences.business_hours_end ?? '18:00',
        preferences.week_starts_on ?? 'Monday',
      ]);
    }
    if (notifications) {
      await client.query(`
        INSERT INTO public.user_notification_preferences (user_id, low_prospect_inventory, meeting_rate_drop, followup_overdue, research_backlog, daily_performance_summary, meeting_booked, call_analysis_complete, weekly_report, updated_at)
        VALUES (1, $1, $2, $3, $4, $5, $6, $7, $8, NOW())
        ON CONFLICT (user_id) DO UPDATE SET
          low_prospect_inventory=$1, meeting_rate_drop=$2, followup_overdue=$3,
          research_backlog=$4, daily_performance_summary=$5, meeting_booked=$6,
          call_analysis_complete=$7, weekly_report=$8, updated_at=NOW()
      `, [
        notifications.low_prospect_inventory ?? true, notifications.meeting_rate_drop ?? true,
        notifications.followup_overdue ?? true, notifications.research_backlog ?? false,
        notifications.daily_performance_summary ?? true, notifications.meeting_booked ?? true,
        notifications.call_analysis_complete ?? true, notifications.weekly_report ?? true,
      ]);
    }
    client.release();
    return res.status(200).json({ success: true });
  } catch (error) {
    if (client) client.release();
    return res.status(500).json({ error: 'Database error', message: error.message });
  }
}
