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
      performanceOverTimeResult,
      convRateOverTimeResult,
      heatmapResult,
      dayOfWeekResult,
      hourlyPerformanceResult,
    ] = await Promise.all([

      // SNAPSHOT — this month vs last month
      client.query(`
        SELECT
          SUM(CASE WHEN call_date >= DATE_TRUNC('month', CURRENT_DATE) THEN 1 ELSE 0 END)::int as calls_this_month,
          SUM(CASE WHEN call_date >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '1 month' AND call_date < DATE_TRUNC('month', CURRENT_DATE) THEN 1 ELSE 0 END)::int as calls_last_month,
          SUM(CASE WHEN call_date >= DATE_TRUNC('month', CURRENT_DATE) AND is_human_conversation = true THEN 1 ELSE 0 END)::int as conv_this_month,
          SUM(CASE WHEN call_date >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '1 month' AND call_date < DATE_TRUNC('month', CURRENT_DATE) AND is_human_conversation = true THEN 1 ELSE 0 END)::int as conv_last_month,
          SUM(CASE WHEN call_date >= DATE_TRUNC('month', CURRENT_DATE) AND meeting_booked = true THEN 1 ELSE 0 END)::int as meetings_this_month,
          SUM(CASE WHEN call_date >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '1 month' AND call_date < DATE_TRUNC('month', CURRENT_DATE) AND meeting_booked = true THEN 1 ELSE 0 END)::int as meetings_last_month,
          SUM(CASE WHEN call_date >= DATE_TRUNC('month', CURRENT_DATE) AND contact_outcome = 'No Answer' THEN 1 ELSE 0 END)::int as no_answers_this_month,
          SUM(CASE WHEN call_date >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '1 month' AND call_date < DATE_TRUNC('month', CURRENT_DATE) AND contact_outcome = 'No Answer' THEN 1 ELSE 0 END)::int as no_answers_last_month,
          CAST(100.0 * SUM(CASE WHEN call_date >= DATE_TRUNC('month', CURRENT_DATE) AND is_human_conversation = true THEN 1 ELSE 0 END) / NULLIF(SUM(CASE WHEN call_date >= DATE_TRUNC('month', CURRENT_DATE) THEN 1 ELSE 0 END), 0) AS DECIMAL(5,1)) as conv_rate_this_month,
          CAST(100.0 * SUM(CASE WHEN call_date >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '1 month' AND call_date < DATE_TRUNC('month', CURRENT_DATE) AND is_human_conversation = true THEN 1 ELSE 0 END) / NULLIF(SUM(CASE WHEN call_date >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '1 month' AND call_date < DATE_TRUNC('month', CURRENT_DATE) THEN 1 ELSE 0 END), 0) AS DECIMAL(5,1)) as conv_rate_last_month
        FROM public.calls
        WHERE client_id = 1
        AND call_date >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '1 month'
      `),

      // PERFORMANCE OVER TIME — daily this month (4 lines)
      client.query(`
        SELECT
          call_date,
          TO_CHAR(call_date, 'Mon DD') as date_label,
          COUNT(*)::int as calls_made,
          SUM(CASE WHEN is_human_conversation = true THEN 1 ELSE 0 END)::int as conversations,
          SUM(CASE WHEN meeting_booked = true THEN 1 ELSE 0 END)::int as meetings_booked,
          SUM(CASE WHEN contact_outcome = 'No Answer' THEN 1 ELSE 0 END)::int as no_answers
        FROM public.calls
        WHERE client_id = 1
        AND call_date >= DATE_TRUNC('month', CURRENT_DATE)
        GROUP BY call_date
        ORDER BY call_date
      `),

      // CONVERSION RATE OVER TIME — daily this month
      client.query(`
        SELECT
          call_date,
          TO_CHAR(call_date, 'Mon DD') as date_label,
          CAST(100.0 * SUM(CASE WHEN is_human_conversation = true THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0) AS DECIMAL(5,1)) as conv_rate,
          CAST(100.0 * SUM(CASE WHEN meeting_booked = true THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0) AS DECIMAL(5,1)) as meeting_rate,
          CAST(100.0 * SUM(CASE WHEN meeting_booked = true THEN 1 ELSE 0 END) / NULLIF(SUM(CASE WHEN is_human_conversation = true THEN 1 ELSE 0 END), 0) AS DECIMAL(5,1)) as close_rate
        FROM public.calls
        WHERE client_id = 1
        AND call_date >= DATE_TRUNC('month', CURRENT_DATE)
        GROUP BY call_date
        ORDER BY call_date
      `),

      // ACTIVITY HEATMAP — by day of week and hour (this month)
      client.query(`
        SELECT
          EXTRACT(DOW FROM call_timestamp)::int as day_of_week,
          EXTRACT(HOUR FROM call_timestamp)::int as hour,
          COUNT(*)::int as total_calls,
          SUM(CASE WHEN is_human_conversation = true THEN 1 ELSE 0 END)::int as conversations
        FROM public.calls
        WHERE client_id = 1
        AND call_date >= DATE_TRUNC('month', CURRENT_DATE)
        GROUP BY day_of_week, hour
        ORDER BY day_of_week, hour
      `),

      // DAY OF WEEK PERFORMANCE — this month averages
      client.query(`
        SELECT
          TO_CHAR(call_date, 'Day') as day_name,
          EXTRACT(DOW FROM call_date)::int as day_num,
          COUNT(*)::int as total_calls,
          CAST(100.0 * SUM(CASE WHEN is_human_conversation = true THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0) AS DECIMAL(5,1)) as conv_rate,
          SUM(CASE WHEN meeting_booked = true THEN 1 ELSE 0 END)::int as meetings_booked,
          CAST(100.0 * SUM(CASE WHEN contact_outcome = 'No Answer' THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0) AS DECIMAL(5,1)) as no_answer_rate
        FROM public.calls
        WHERE client_id = 1
        AND call_date >= DATE_TRUNC('month', CURRENT_DATE)
        GROUP BY day_name, day_num
        ORDER BY day_num
      `),

      // HOURLY PERFORMANCE — this month averages
      client.query(`
        SELECT
          EXTRACT(HOUR FROM call_timestamp)::int as hour,
          COUNT(*)::int as total_calls,
          SUM(CASE WHEN is_human_conversation = true THEN 1 ELSE 0 END)::int as conversations,
          CAST(100.0 * SUM(CASE WHEN is_human_conversation = true THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0) AS DECIMAL(5,1)) as conv_rate,
          SUM(CASE WHEN meeting_booked = true THEN 1 ELSE 0 END)::int as meetings_booked
        FROM public.calls
        WHERE client_id = 1
        AND call_date >= DATE_TRUNC('month', CURRENT_DATE)
        GROUP BY EXTRACT(HOUR FROM call_timestamp)
        ORDER BY hour
      `),
    ]);

    client.release();

    return res.status(200).json({
      timestamp: new Date().toISOString(),
      snapshot: snapshotResult.rows[0],
      performanceOverTime: performanceOverTimeResult.rows,
      convRateOverTime: convRateOverTimeResult.rows,
      heatmap: heatmapResult.rows,
      dayOfWeek: dayOfWeekResult.rows,
      hourlyPerformance: hourlyPerformanceResult.rows,
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
