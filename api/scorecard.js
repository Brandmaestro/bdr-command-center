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
      overallScoreResult,
      scoreBreakdownResult,
      goalsProgressResult,
      scoreOverTimeResult,
      scoreBySdrResult,
      scoreDistributionResult,
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
          CAST(100.0 * SUM(CASE WHEN call_date >= DATE_TRUNC('month', CURRENT_DATE) AND is_human_conversation = true THEN 1 ELSE 0 END) / NULLIF(SUM(CASE WHEN call_date >= DATE_TRUNC('month', CURRENT_DATE) THEN 1 ELSE 0 END), 0) AS DECIMAL(5,1)) as conv_rate_this_month,
          CAST(100.0 * SUM(CASE WHEN call_date >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '1 month' AND call_date < DATE_TRUNC('month', CURRENT_DATE) AND is_human_conversation = true THEN 1 ELSE 0 END) / NULLIF(SUM(CASE WHEN call_date >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '1 month' AND call_date < DATE_TRUNC('month', CURRENT_DATE) THEN 1 ELSE 0 END), 0) AS DECIMAL(5,1)) as conv_rate_last_month
        FROM public.calls
        WHERE client_id = 1
        AND call_date >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '1 month'
      `),

      // OVERALL SCORE — avg AI score this month vs last
      client.query(`
        SELECT
          CAST(AVG(CASE WHEN c.call_date >= DATE_TRUNC('month', CURRENT_DATE) THEN NULLIF(c.overall_call_score, 0) END) AS DECIMAL(5,1)) as avg_score_this_month,
          CAST(AVG(CASE WHEN c.call_date >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '1 month' AND c.call_date < DATE_TRUNC('month', CURRENT_DATE) THEN NULLIF(c.overall_call_score, 0) END) AS DECIMAL(5,1)) as avg_score_last_month,
          CAST(AVG(CASE WHEN c.call_date >= DATE_TRUNC('month', CURRENT_DATE) THEN NULLIF(ci.technical_fit_score, 0) END) AS DECIMAL(5,1)) as avg_technical_fit,
          CAST(AVG(CASE WHEN c.call_date >= DATE_TRUNC('month', CURRENT_DATE) THEN NULLIF(ci.sentiment_score, 0) END) AS DECIMAL(5,1)) as avg_sentiment,
          CAST(AVG(CASE WHEN c.call_date >= DATE_TRUNC('month', CURRENT_DATE) THEN NULLIF(ci.objection_count, 0) END) AS DECIMAL(5,1)) as avg_objections,
          COUNT(CASE WHEN c.call_date >= DATE_TRUNC('month', CURRENT_DATE) THEN 1 END)::int as scored_calls_this_month
        FROM public.calls c
        LEFT JOIN public.call_intelligence ci ON ci.call_id = c.id
        WHERE c.client_id = 1
        AND c.call_date >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '1 month'
      `),

      // SCORE BREAKDOWN — by category (derived from call intelligence)
      client.query(`
        SELECT
          CAST(AVG(NULLIF(overall_call_score, 0)) AS DECIMAL(5,1)) as activity_volume_score,
          CAST(AVG(NULLIF(sentiment_score, 0)) AS DECIMAL(5,1)) as engagement_quality_score,
          CAST(AVG(NULLIF(technical_fit_score, 0)) AS DECIMAL(5,1)) as conversion_efficiency_score,
          CAST(AVG(NULLIF(overall_score, 0)) AS DECIMAL(5,1)) as pipeline_impact_score
        FROM public.call_intelligence ci
        JOIN public.calls c ON c.id = ci.call_id
        WHERE c.client_id = 1
        AND c.call_date >= DATE_TRUNC('month', CURRENT_DATE)
      `),

      // GOALS PROGRESS — vs daily targets
      client.query(`
        SELECT
          dt.daily_calls_target * 20 as calls_goal,
          dt.daily_conversations_target * 20 as conv_goal,
          dt.daily_meetings_target * 20 as meetings_goal,
          dt.daily_conv_rate_target as conv_rate_goal,
          COALESCE(a.calls_actual, 0) as calls_actual,
          COALESCE(a.conv_actual, 0) as conv_actual,
          COALESCE(a.meetings_actual, 0) as meetings_actual,
          COALESCE(a.conv_rate_actual, 0) as conv_rate_actual
        FROM public.daily_targets dt
        LEFT JOIN (
          SELECT
            COUNT(*)::int as calls_actual,
            SUM(CASE WHEN is_human_conversation = true THEN 1 ELSE 0 END)::int as conv_actual,
            SUM(CASE WHEN meeting_booked = true THEN 1 ELSE 0 END)::int as meetings_actual,
            CAST(100.0 * SUM(CASE WHEN is_human_conversation = true THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0) AS DECIMAL(5,1)) as conv_rate_actual
          FROM public.calls
          WHERE client_id = 1
          AND call_date >= DATE_TRUNC('month', CURRENT_DATE)
        ) a ON true
        WHERE dt.client_id = 1
        LIMIT 1
      `),

      // SCORE OVER TIME — daily avg score this month
      client.query(`
        SELECT
          c.call_date,
          TO_CHAR(c.call_date, 'Mon DD') as date_label,
          CAST(AVG(NULLIF(c.overall_call_score, 0)) AS DECIMAL(5,1)) as avg_score,
          COUNT(*)::int as total_calls
        FROM public.calls c
        WHERE c.client_id = 1
        AND c.call_date >= DATE_TRUNC('month', CURRENT_DATE)
        AND c.overall_call_score IS NOT NULL
        AND c.overall_call_score > 0
        GROUP BY c.call_date
        ORDER BY c.call_date
      `),

      // SCORE BY SDR — this month
      client.query(`
        SELECT
          COALESCE(initiated_by, 'Didier') as sdr_name,
          CAST(AVG(NULLIF(overall_call_score, 0)) AS DECIMAL(5,1)) as avg_score,
          COUNT(*)::int as total_calls
        FROM public.calls
        WHERE client_id = 1
        AND call_date >= DATE_TRUNC('month', CURRENT_DATE)
        AND overall_call_score IS NOT NULL
        AND overall_call_score > 0
        GROUP BY COALESCE(initiated_by, 'Didier')
        ORDER BY avg_score DESC
      `),

      // SCORE DISTRIBUTION — this month
      client.query(`
        SELECT
          CASE
            WHEN overall_call_score >= 90 THEN '90-100'
            WHEN overall_call_score >= 80 THEN '80-89'
            WHEN overall_call_score >= 70 THEN '70-79'
            WHEN overall_call_score >= 60 THEN '60-69'
            ELSE '0-59'
          END as score_range,
          COUNT(*)::int as count
        FROM public.calls
        WHERE client_id = 1
        AND call_date >= DATE_TRUNC('month', CURRENT_DATE)
        AND overall_call_score IS NOT NULL
        AND overall_call_score > 0
        GROUP BY score_range
        ORDER BY score_range
      `),
    ]);

    client.release();

    return res.status(200).json({
      timestamp: new Date().toISOString(),
      snapshot: snapshotResult.rows[0],
      overallScore: overallScoreResult.rows[0],
      scoreBreakdown: scoreBreakdownResult.rows[0],
      goalsProgress: goalsProgressResult.rows[0],
      scoreOverTime: scoreOverTimeResult.rows,
      scoreBySdr: scoreBySdrResult.rows,
      scoreDistribution: scoreDistributionResult.rows,
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
