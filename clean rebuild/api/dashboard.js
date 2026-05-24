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
      todayResult,
      yesterdayResult,
      weekResult,
      callFeedResult,
      hourlyResult,
      outcomesResult,
      dailyTrendResult,
      weeklyTrendResult,
      meetingsResult,
      coachingResult,
      scoreTrendResult,
    ] = await Promise.all([

      // TODAY
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
          CAST(
            100.0 * SUM(CASE WHEN is_human_conversation = true THEN 1 ELSE 0 END)
            / NULLIF(COUNT(*), 0)
          AS DECIMAL(5,1)) as conversation_rate_today
        FROM public.calls
        WHERE client_id = 1
        AND call_date = CURRENT_DATE
      `),

      // YESTERDAY
      client.query(`
        SELECT
          COUNT(*)::int as calls_yesterday,
          SUM(CASE WHEN meeting_booked = true THEN 1 ELSE 0 END)::int as meetings_yesterday,
          SUM(CASE WHEN is_human_conversation = true THEN 1 ELSE 0 END)::int as conversations_yesterday,
          CAST(
            100.0 * SUM(CASE WHEN is_human_conversation = true THEN 1 ELSE 0 END)
            / NULLIF(COUNT(*), 0)
          AS DECIMAL(5,1)) as conversation_rate_yesterday
        FROM public.calls
        WHERE client_id = 1
        AND call_date = CURRENT_DATE - INTERVAL '1 day'
      `),

      // THIS WEEK VS LAST WEEK
      client.query(`
        SELECT
          SUM(CASE WHEN call_date >= DATE_TRUNC('week', CURRENT_DATE) THEN 1 ELSE 0 END)::int as calls_this_week,
          SUM(CASE WHEN call_date >= DATE_TRUNC('week', CURRENT_DATE) AND is_human_conversation = true THEN 1 ELSE 0 END)::int as conv_this_week,
          SUM(CASE WHEN call_date >= DATE_TRUNC('week', CURRENT_DATE) AND meeting_booked = true THEN 1 ELSE 0 END)::int as meetings_this_week,
          SUM(CASE WHEN call_date < DATE_TRUNC('week', CURRENT_DATE) AND call_date >= DATE_TRUNC('week', CURRENT_DATE) - INTERVAL '7 days' THEN 1 ELSE 0 END)::int as calls_last_week,
          SUM(CASE WHEN call_date < DATE_TRUNC('week', CURRENT_DATE) AND call_date >= DATE_TRUNC('week', CURRENT_DATE) - INTERVAL '7 days' AND is_human_conversation = true THEN 1 ELSE 0 END)::int as conv_last_week,
          SUM(CASE WHEN call_date < DATE_TRUNC('week', CURRENT_DATE) AND call_date >= DATE_TRUNC('week', CURRENT_DATE) - INTERVAL '7 days' AND meeting_booked = true THEN 1 ELSE 0 END)::int as meetings_last_week
        FROM public.calls
        WHERE client_id = 1
      `),

      // CALL FEED - last 7 days
      client.query(`
        SELECT
          c.id,
          c.call_timestamp,
          c.call_date,
          c.call_time,
          c.company_name,
          c.contact_name,
          c.contact_outcome,
          c.overall_call_score,
          c.call_duration_seconds,
          c.meeting_booked,
          c.is_human_conversation,
          c.recording_url,
          ci.ai_summary,
          ci.conversation_detail
        FROM public.calls c
        LEFT JOIN public.call_intelligence ci ON ci.call_id = c.id
        WHERE c.client_id = 1
        AND c.call_date >= CURRENT_DATE - INTERVAL '7 days'
        ORDER BY c.call_timestamp DESC
        LIMIT 50
      `),

      // HOURLY TODAY
      client.query(`
        SELECT
          EXTRACT(HOUR FROM call_timestamp)::int as hour,
          COUNT(*)::int as total_calls,
          SUM(CASE WHEN is_human_conversation = true THEN 1 ELSE 0 END)::int as conversations,
          CAST(
            100.0 * SUM(CASE WHEN is_human_conversation = true THEN 1 ELSE 0 END)
            / NULLIF(COUNT(*), 0)
          AS DECIMAL(5,1)) as conv_rate
        FROM public.calls
        WHERE client_id = 1
        AND call_date = CURRENT_DATE
        GROUP BY EXTRACT(HOUR FROM call_timestamp)
        ORDER BY hour
      `),

      // OUTCOMES TODAY
      client.query(`
        SELECT contact_outcome, COUNT(*)::int as count
        FROM public.calls
        WHERE client_id = 1
        AND call_date = CURRENT_DATE
        GROUP BY contact_outcome
        ORDER BY count DESC
      `),

      // DAILY TREND - last 7 days
      client.query(`
        SELECT
          call_date,
          TO_CHAR(call_date, 'Dy') as day_name,
          COUNT(*)::int as total_calls,
          SUM(CASE WHEN is_human_conversation = true THEN 1 ELSE 0 END)::int as conversations,
          SUM(CASE WHEN meeting_booked = true THEN 1 ELSE 0 END)::int as meetings,
          CAST(
            100.0 * SUM(CASE WHEN is_human_conversation = true THEN 1 ELSE 0 END)
            / NULLIF(COUNT(*), 0)
          AS DECIMAL(5,1)) as conv_rate
        FROM public.calls
        WHERE client_id = 1
        AND call_date >= CURRENT_DATE - INTERVAL '7 days'
        GROUP BY call_date
        ORDER BY call_date
      `),

      // WEEKLY TREND
      client.query(`
        SELECT
          call_date,
          TO_CHAR(call_date, 'Dy') as day_name,
          COUNT(*)::int as total_calls,
          SUM(CASE WHEN is_human_conversation = true THEN 1 ELSE 0 END)::int as conversations,
          SUM(CASE WHEN meeting_booked = true THEN 1 ELSE 0 END)::int as meetings
        FROM public.calls
        WHERE client_id = 1
        AND call_date >= DATE_TRUNC('week', CURRENT_DATE) - INTERVAL '7 days'
        GROUP BY call_date
        ORDER BY call_date
      `),

      // MEETINGS
      client.query(`
        SELECT
          m.id,
          m.meeting_datetime,
          m.est_pipeline_value,
          m.cal_meeting_url,
          m.cal_status,
          c.company_name,
          c.contact_name,
          c.overall_call_score,
          c.call_timestamp
        FROM public.meetings m
        JOIN public.calls c ON c.id = m.call_id
        WHERE c.client_id = 1
        ORDER BY m.meeting_datetime DESC
        LIMIT 10
      `),

      // COACHING
      client.query(`
        SELECT
          c.call_timestamp,
          c.company_name,
          c.contact_name,
          c.overall_call_score,
          c.call_duration_seconds,
          c.contact_outcome,
          c.meeting_booked,
          ci.ai_summary,
          ci.what_worked_well,
          ci.what_could_be_improved,
          ci.coaching_notes,
          ci.objections,
          ci.conversation_detail,
          ci.overall_score,
          ci.technical_fit_score,
          ci.objection_count,
          ci.sentiment_score
        FROM public.calls c
        JOIN public.call_intelligence ci ON ci.call_id = c.id
        WHERE c.client_id = 1
        AND c.is_human_conversation = true
        ORDER BY c.call_timestamp DESC
        LIMIT 10
      `),

      // SCORE TREND
      client.query(`
        SELECT
          call_date,
          CAST(AVG(NULLIF(overall_call_score, 0)) AS DECIMAL(5,1)) as avg_score,
          COUNT(*)::int as total_calls
        FROM public.calls
        WHERE client_id = 1
        AND overall_call_score IS NOT NULL
        AND overall_call_score > 0
        AND call_date >= CURRENT_DATE - INTERVAL '7 days'
        GROUP BY call_date
        ORDER BY call_date
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
    console.error('DB Error:', error.message);
    return res.status(500).json({
      error: 'Database error',
      message: error.message,
    });
  }
}
