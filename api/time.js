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
      hourlyEngagementResult,
      dayOfWeekResult,
      hourlyDetailResult,
      bestTimesResult,
    ] = await Promise.all([

      // SNAPSHOT — key time metrics this month vs last
      client.query(`
        SELECT
          CAST(AVG(CASE WHEN call_date >= DATE_TRUNC('month', CURRENT_DATE) THEN NULLIF(call_duration_seconds, 0) END) AS INTEGER) as avg_duration_this_month,
          CAST(AVG(CASE WHEN call_date >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '1 month' AND call_date < DATE_TRUNC('month', CURRENT_DATE) THEN NULLIF(call_duration_seconds, 0) END) AS INTEGER) as avg_duration_last_month,
          CAST(SUM(CASE WHEN call_date >= DATE_TRUNC('month', CURRENT_DATE) THEN COALESCE(call_duration_seconds, 0) END) AS INTEGER) as total_call_seconds_this_month,
          CAST(100.0 * SUM(CASE WHEN call_date >= DATE_TRUNC('month', CURRENT_DATE) AND is_human_conversation = true THEN COALESCE(call_duration_seconds, 0) END) / NULLIF(SUM(CASE WHEN call_date >= DATE_TRUNC('month', CURRENT_DATE) THEN COALESCE(call_duration_seconds, 0) END), 0) AS DECIMAL(5,1)) as pct_time_in_conversations,
          CAST(100.0 * SUM(CASE WHEN call_date >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '1 month' AND call_date < DATE_TRUNC('month', CURRENT_DATE) AND is_human_conversation = true THEN COALESCE(call_duration_seconds, 0) END) / NULLIF(SUM(CASE WHEN call_date >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '1 month' AND call_date < DATE_TRUNC('month', CURRENT_DATE) THEN COALESCE(call_duration_seconds, 0) END), 0) AS DECIMAL(5,1)) as pct_time_in_conversations_last_month
        FROM public.calls
        WHERE client_id = 1
        AND call_date >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '1 month'
      `),

      // HOURLY ENGAGEMENT — best times to call (connect + conversation rate by hour)
      client.query(`
        SELECT
          EXTRACT(HOUR FROM call_timestamp)::int as hour,
          COUNT(*)::int as total_calls,
          SUM(CASE WHEN is_human_conversation = true THEN 1 ELSE 0 END)::int as conversations,
          CAST(100.0 * SUM(CASE WHEN is_human_conversation = true THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0) AS DECIMAL(5,1)) as conv_rate,
          SUM(CASE WHEN meeting_booked = true THEN 1 ELSE 0 END)::int as meetings_booked,
          CAST(100.0 * SUM(CASE WHEN meeting_booked = true THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0) AS DECIMAL(5,1)) as meeting_rate,
          CAST(AVG(NULLIF(call_duration_seconds, 0)) AS INTEGER) as avg_duration_seconds
        FROM public.calls
        WHERE client_id = 1
        AND call_date >= DATE_TRUNC('month', CURRENT_DATE)
        GROUP BY EXTRACT(HOUR FROM call_timestamp)
        ORDER BY hour
      `),

      // DAY OF WEEK — average performance
      client.query(`
        SELECT
          EXTRACT(DOW FROM call_date)::int as day_num,
          TO_CHAR(call_date, 'Day') as day_name,
          COUNT(*)::int as total_calls,
          SUM(CASE WHEN is_human_conversation = true THEN 1 ELSE 0 END)::int as conversations,
          SUM(CASE WHEN meeting_booked = true THEN 1 ELSE 0 END)::int as meetings,
          CAST(100.0 * SUM(CASE WHEN is_human_conversation = true THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0) AS DECIMAL(5,1)) as conv_rate,
          CAST(AVG(NULLIF(call_duration_seconds, 0)) AS INTEGER) as avg_duration_seconds
        FROM public.calls
        WHERE client_id = 1
        AND call_date >= DATE_TRUNC('month', CURRENT_DATE)
        GROUP BY day_num, day_name
        ORDER BY day_num
      `),

      // HOURLY DETAIL TABLE — this month
      client.query(`
        SELECT
          EXTRACT(HOUR FROM call_timestamp)::int as hour,
          COUNT(*)::int as calls_made,
          CAST(100.0 * SUM(CASE WHEN is_human_conversation = true THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0) AS DECIMAL(5,1)) as conv_rate,
          SUM(CASE WHEN is_human_conversation = true THEN 1 ELSE 0 END)::int as human_conv,
          SUM(CASE WHEN meeting_booked = true THEN 1 ELSE 0 END)::int as meetings_booked
        FROM public.calls
        WHERE client_id = 1
        AND call_date >= DATE_TRUNC('month', CURRENT_DATE)
        GROUP BY EXTRACT(HOUR FROM call_timestamp)
        ORDER BY hour
      `),

      // BEST TIMES — top 3 hours for conversations and meetings
      client.query(`
        SELECT
          EXTRACT(HOUR FROM call_timestamp)::int as hour,
          COUNT(*)::int as total_calls,
          SUM(CASE WHEN is_human_conversation = true THEN 1 ELSE 0 END)::int as conversations,
          SUM(CASE WHEN meeting_booked = true THEN 1 ELSE 0 END)::int as meetings,
          CAST(100.0 * SUM(CASE WHEN is_human_conversation = true THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0) AS DECIMAL(5,1)) as conv_rate
        FROM public.calls
        WHERE client_id = 1
        AND call_date >= DATE_TRUNC('month', CURRENT_DATE)
        GROUP BY EXTRACT(HOUR FROM call_timestamp)
        ORDER BY conv_rate DESC
        LIMIT 3
      `),
    ]);

    client.release();

    return res.status(200).json({
      timestamp: new Date().toISOString(),
      snapshot: snapshotResult.rows[0],
      hourlyEngagement: hourlyEngagementResult.rows,
      dayOfWeek: dayOfWeekResult.rows,
      hourlyDetail: hourlyDetailResult.rows,
      bestTimes: bestTimesResult.rows,
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
