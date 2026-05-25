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
      activityTrendResult,
      activityTypeBreakdownResult,
      activityOutcomeBreakdownResult,
      activityFeedResult,
    ] = await Promise.all([

      // ACTIVITY SNAPSHOT — today vs yesterday
      client.query(`
        SELECT
          SUM(CASE WHEN call_date = CURRENT_DATE THEN 1 ELSE 0 END)::int as total_activities_today,
          SUM(CASE WHEN call_date = CURRENT_DATE - INTERVAL '1 day' THEN 1 ELSE 0 END)::int as total_activities_yesterday,
          SUM(CASE WHEN call_date = CURRENT_DATE THEN 1 ELSE 0 END)::int as calls_today,
          SUM(CASE WHEN call_date = CURRENT_DATE - INTERVAL '1 day' THEN 1 ELSE 0 END)::int as calls_yesterday,
          SUM(CASE WHEN call_date = CURRENT_DATE AND is_human_conversation = true THEN 1 ELSE 0 END)::int as conversations_today,
          SUM(CASE WHEN call_date = CURRENT_DATE - INTERVAL '1 day' AND is_human_conversation = true THEN 1 ELSE 0 END)::int as conversations_yesterday,
          SUM(CASE WHEN call_date = CURRENT_DATE AND meeting_booked = true THEN 1 ELSE 0 END)::int as meetings_today,
          SUM(CASE WHEN call_date = CURRENT_DATE - INTERVAL '1 day' AND meeting_booked = true THEN 1 ELSE 0 END)::int as meetings_yesterday,
          SUM(CASE WHEN call_date = CURRENT_DATE AND contact_outcome = 'No Answer' THEN 1 ELSE 0 END)::int as no_answers_today,
          SUM(CASE WHEN call_date = CURRENT_DATE - INTERVAL '1 day' AND contact_outcome = 'No Answer' THEN 1 ELSE 0 END)::int as no_answers_yesterday,
          CAST(AVG(CASE WHEN call_date = CURRENT_DATE THEN NULLIF(call_duration_seconds, 0) END) AS INTEGER) as avg_duration_today,
          CAST(AVG(CASE WHEN call_date = CURRENT_DATE - INTERVAL '1 day' THEN NULLIF(call_duration_seconds, 0) END) AS INTEGER) as avg_duration_yesterday
        FROM public.calls
        WHERE client_id = 1
        AND call_date >= CURRENT_DATE - INTERVAL '1 day'
      `),

      // ACTIVITY TREND — hourly today (4 lines)
      client.query(`
        SELECT
          EXTRACT(HOUR FROM call_timestamp)::int as hour,
          COUNT(*)::int as total_activities,
          SUM(CASE WHEN is_human_conversation = true THEN 1 ELSE 0 END)::int as conversations,
          SUM(CASE WHEN meeting_booked = true THEN 1 ELSE 0 END)::int as meetings_booked,
          COUNT(*)::int as calls_made
        FROM public.calls
        WHERE client_id = 1
        AND call_date = CURRENT_DATE
        GROUP BY EXTRACT(HOUR FROM call_timestamp)
        ORDER BY hour
      `),

      // ACTIVITY TYPE BREAKDOWN — today
      client.query(`
        SELECT
          contact_outcome as activity_type,
          COUNT(*)::int as count,
          CAST(100.0 * COUNT(*) / NULLIF(SUM(COUNT(*)) OVER (), 0) AS DECIMAL(5,1)) as percentage
        FROM public.calls
        WHERE client_id = 1
        AND call_date = CURRENT_DATE
        GROUP BY contact_outcome
        ORDER BY count DESC
      `),

      // ACTIVITY OUTCOME BREAKDOWN — today
      client.query(`
        SELECT
          CASE
            WHEN meeting_booked = true THEN 'Meeting Booked'
            WHEN contact_outcome ILIKE '%follow%' THEN 'Future Follow-Up'
            WHEN contact_outcome = 'Not Interested' THEN 'Not Interested'
            WHEN contact_outcome ILIKE '%no decision%' OR contact_outcome ILIKE '%gatekeeper%' THEN 'No Decision Maker'
            WHEN contact_outcome ILIKE '%voicemail%' THEN 'Voicemail'
            ELSE 'Other / Disposition'
          END as outcome_label,
          COUNT(*)::int as count,
          CAST(100.0 * COUNT(*) / NULLIF(SUM(COUNT(*)) OVER (), 0) AS DECIMAL(5,1)) as percentage
        FROM public.calls
        WHERE client_id = 1
        AND call_date = CURRENT_DATE
        GROUP BY outcome_label
        ORDER BY count DESC
      `),

      // ACTIVITY FEED — today, paginated (up to 50)
      client.query(`
        SELECT
          c.id,
          c.call_timestamp,
          c.call_time,
          c.company_name,
          c.contact_name,
          c.contact_outcome,
          c.call_duration_seconds,
          c.meeting_booked,
          c.is_human_conversation,
          c.overall_call_score,
          COALESCE(c.initiated_by, 'Didier') as sdr_name,
          ci.ai_summary,
          ci.conversation_detail
        FROM public.calls c
        LEFT JOIN public.call_intelligence ci ON ci.call_id = c.id
        WHERE c.client_id = 1
        AND c.call_date = CURRENT_DATE
        ORDER BY c.call_timestamp DESC
        LIMIT 50
      `),
    ]);

    client.release();

    return res.status(200).json({
      timestamp: new Date().toISOString(),
      snapshot: snapshotResult.rows[0],
      activityTrend: activityTrendResult.rows,
      activityTypeBreakdown: activityTypeBreakdownResult.rows,
      activityOutcomeBreakdown: activityOutcomeBreakdownResult.rows,
      activityFeed: activityFeedResult.rows,
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
