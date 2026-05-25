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
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let client;
  try {
    client = await pool.connect();

    const [
      snapshotResult,
      performanceTrendResult,
      convRateTrendResult,
      outcomeBreakdownResult,
      topPerformersResult,
      goalTrackingResult,
      quickStatsResult,
    ] = await Promise.all([

      // PERFORMANCE SNAPSHOT — today vs yesterday
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
          CAST(100.0 * SUM(CASE WHEN call_date = CURRENT_DATE - INTERVAL '1 day' AND is_human_conversation = true THEN 1 ELSE 0 END) / NULLIF(SUM(CASE WHEN call_date = CURRENT_DATE - INTERVAL '1 day' THEN 1 ELSE 0 END), 0) AS DECIMAL(5,1)) as conv_rate_yesterday,
          CAST(AVG(CASE WHEN call_date = CURRENT_DATE THEN NULLIF(overall_call_score, 0) END) AS DECIMAL(5,1)) as avg_score_today,
          CAST(AVG(CASE WHEN call_date = CURRENT_DATE - INTERVAL '1 day' THEN NULLIF(overall_call_score, 0) END) AS DECIMAL(5,1)) as avg_score_yesterday
        FROM public.calls
        WHERE client_id = 1
        AND call_date >= CURRENT_DATE - INTERVAL '1 day'
      `),

      // PERFORMANCE TREND — hourly today (calls, conversations, meetings)
      client.query(`
        SELECT
          EXTRACT(HOUR FROM call_timestamp)::int as hour,
          COUNT(*)::int as calls_made,
          SUM(CASE WHEN is_human_conversation = true THEN 1 ELSE 0 END)::int as conversations,
          SUM(CASE WHEN meeting_booked = true THEN 1 ELSE 0 END)::int as meetings_booked
        FROM public.calls
        WHERE client_id = 1
        AND call_date = CURRENT_DATE
        GROUP BY EXTRACT(HOUR FROM call_timestamp)
        ORDER BY hour
      `),

      // CONVERSATION RATE OVER TIME — hourly today
      client.query(`
        SELECT
          EXTRACT(HOUR FROM call_timestamp)::int as hour,
          CAST(100.0 * SUM(CASE WHEN is_human_conversation = true THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0) AS DECIMAL(5,1)) as conv_rate,
          CAST(100.0 * SUM(CASE WHEN meeting_booked = true THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0) AS DECIMAL(5,1)) as meeting_rate
        FROM public.calls
        WHERE client_id = 1
        AND call_date = CURRENT_DATE
        GROUP BY EXTRACT(HOUR FROM call_timestamp)
        ORDER BY hour
      `),

      // OUTCOME BREAKDOWN — today
      client.query(`
        SELECT
          contact_outcome,
          COUNT(*)::int as count,
          CAST(100.0 * COUNT(*) / NULLIF(SUM(COUNT(*)) OVER (), 0) AS DECIMAL(5,1)) as percentage
        FROM public.calls
        WHERE client_id = 1
        AND call_date = CURRENT_DATE
        GROUP BY contact_outcome
        ORDER BY count DESC
      `),

      // TOP PERFORMERS — today (by SDR/assigned user)
      client.query(`
        SELECT
          COALESCE(c.initiated_by, 'Didier') as sdr_name,
          COUNT(*)::int as calls,
          SUM(CASE WHEN is_human_conversation = true THEN 1 ELSE 0 END)::int as conversations,
          SUM(CASE WHEN meeting_booked = true THEN 1 ELSE 0 END)::int as meetings,
          CAST(100.0 * SUM(CASE WHEN is_human_conversation = true THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0) AS DECIMAL(5,1)) as conv_rate,
          CAST(100.0 * SUM(CASE WHEN meeting_booked = true THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0) AS DECIMAL(5,1)) as meeting_rate
        FROM public.calls c
        WHERE client_id = 1
        AND call_date = CURRENT_DATE
        GROUP BY COALESCE(c.initiated_by, 'Didier')
        ORDER BY calls DESC
      `),

      // GOAL TRACKING — today vs daily targets
      client.query(`
        SELECT
          dt.daily_calls_target,
          dt.daily_conversations_target,
          dt.daily_meetings_target,
          dt.daily_conv_rate_target,
          COALESCE(a.calls_today, 0) as calls_actual,
          COALESCE(a.conv_today, 0) as conv_actual,
          COALESCE(a.meetings_today, 0) as meetings_actual,
          COALESCE(a.conv_rate_today, 0) as conv_rate_actual
        FROM public.daily_targets dt
        LEFT JOIN (
          SELECT
            COUNT(*)::int as calls_today,
            SUM(CASE WHEN is_human_conversation = true THEN 1 ELSE 0 END)::int as conv_today,
            SUM(CASE WHEN meeting_booked = true THEN 1 ELSE 0 END)::int as meetings_today,
            CAST(100.0 * SUM(CASE WHEN is_human_conversation = true THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0) AS DECIMAL(5,1)) as conv_rate_today
          FROM public.calls
          WHERE client_id = 1
          AND call_date = CURRENT_DATE
        ) a ON true
        WHERE dt.client_id = 1
        LIMIT 1
      `),

      // QUICK STATS — best hour, avg duration, avg talk time
      client.query(`
        SELECT
          EXTRACT(HOUR FROM call_timestamp)::int as best_conv_hour,
          CAST(AVG(NULLIF(call_duration_seconds, 0)) AS INTEGER) as avg_duration_seconds
        FROM public.calls
        WHERE client_id = 1
        AND call_date = CURRENT_DATE
        AND is_human_conversation = true
        GROUP BY EXTRACT(HOUR FROM call_timestamp)
        ORDER BY COUNT(*) DESC
        LIMIT 1
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
    console.error('DB Error:', error.message);
    return res.status(500).json({
      error: 'Database error',
      message: error.message,
    });
  }
}
