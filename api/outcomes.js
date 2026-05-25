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
      outcomesOverTimeResult,
      outcomeBreakdownResult,
      pipelineImpactResult,
      outcomeDetailResult,
      winRateResult,
      topPerformersByOutcomeResult,
    ] = await Promise.all([

      // SNAPSHOT — this month vs last month
      client.query(`
        SELECT
          SUM(CASE WHEN call_date >= DATE_TRUNC('month', CURRENT_DATE) AND meeting_booked = true THEN 1 ELSE 0 END)::int as meetings_this_month,
          SUM(CASE WHEN call_date >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '1 month' AND call_date < DATE_TRUNC('month', CURRENT_DATE) AND meeting_booked = true THEN 1 ELSE 0 END)::int as meetings_last_month,
          SUM(CASE WHEN call_date >= DATE_TRUNC('month', CURRENT_DATE) AND is_human_conversation = true THEN 1 ELSE 0 END)::int as conv_this_month,
          SUM(CASE WHEN call_date >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '1 month' AND call_date < DATE_TRUNC('month', CURRENT_DATE) AND is_human_conversation = true THEN 1 ELSE 0 END)::int as conv_last_month
        FROM public.calls
        WHERE client_id = 1
        AND call_date >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '1 month'
      `),

      // OUTCOMES OVER TIME — daily this month (multi-line)
      client.query(`
        SELECT
          call_date,
          TO_CHAR(call_date, 'Mon DD') as date_label,
          SUM(CASE WHEN meeting_booked = true THEN 1 ELSE 0 END)::int as meetings_booked,
          SUM(CASE WHEN is_human_conversation = true THEN 1 ELSE 0 END)::int as conversations,
          SUM(CASE WHEN contact_outcome = 'Not Interested' THEN 1 ELSE 0 END)::int as not_interested,
          SUM(CASE WHEN contact_outcome = 'No Answer' THEN 1 ELSE 0 END)::int as no_answer
        FROM public.calls
        WHERE client_id = 1
        AND call_date >= DATE_TRUNC('month', CURRENT_DATE)
        GROUP BY call_date
        ORDER BY call_date
      `),

      // OUTCOME BREAKDOWN DONUT — this month
      client.query(`
        SELECT
          contact_outcome,
          COUNT(*)::int as count,
          CAST(100.0 * COUNT(*) / NULLIF(SUM(COUNT(*)) OVER (), 0) AS DECIMAL(5,1)) as percentage
        FROM public.calls
        WHERE client_id = 1
        AND call_date >= DATE_TRUNC('month', CURRENT_DATE)
        GROUP BY contact_outcome
        ORDER BY count DESC
      `),

      // PIPELINE IMPACT — meetings to pipeline funnel
      client.query(`
        SELECT
          SUM(CASE WHEN call_date >= DATE_TRUNC('month', CURRENT_DATE) AND meeting_booked = true THEN 1 ELSE 0 END)::int as meetings_booked,
          COUNT(DISTINCT m.id)::int as qualified_meetings,
          CAST(COALESCE(SUM(m.est_pipeline_value), 0) AS DECIMAL(12,2)) as pipeline_value
        FROM public.calls c
        LEFT JOIN public.meetings m ON m.call_id = c.id
        WHERE c.client_id = 1
        AND c.call_date >= DATE_TRUNC('month', CURRENT_DATE)
      `),

      // OUTCOME DETAIL TABLE — this month
      client.query(`
        SELECT
          contact_outcome as outcome_type,
          COUNT(*)::int as count,
          CAST(100.0 * COUNT(*) / NULLIF(SUM(COUNT(*)) OVER (), 0) AS DECIMAL(5,1)) as pct_of_total,
          CAST(100.0 * COUNT(*) / NULLIF(LAG(COUNT(*)) OVER (ORDER BY COUNT(*) DESC), 0) - 100 AS DECIMAL(5,1)) as change_vs_last_month
        FROM public.calls
        WHERE client_id = 1
        AND call_date >= DATE_TRUNC('month', CURRENT_DATE)
        GROUP BY contact_outcome
        ORDER BY count DESC
      `),

      // WIN RATE
      client.query(`
        SELECT
          CAST(100.0 * SUM(CASE WHEN meeting_booked = true THEN 1 ELSE 0 END) / NULLIF(SUM(CASE WHEN is_human_conversation = true THEN 1 ELSE 0 END), 0) AS DECIMAL(5,1)) as win_rate_this_month,
          CAST(100.0 * SUM(CASE WHEN call_date < DATE_TRUNC('month', CURRENT_DATE) AND meeting_booked = true THEN 1 ELSE 0 END) / NULLIF(SUM(CASE WHEN call_date < DATE_TRUNC('month', CURRENT_DATE) AND is_human_conversation = true THEN 1 ELSE 0 END), 0) AS DECIMAL(5,1)) as win_rate_last_month
        FROM public.calls
        WHERE client_id = 1
        AND call_date >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '1 month'
      `),

      // TOP PERFORMERS BY OUTCOME — this month
      client.query(`
        SELECT
          COALESCE(initiated_by, 'Didier') as sdr_name,
          SUM(CASE WHEN meeting_booked = true THEN 1 ELSE 0 END)::int as meetings_booked,
          SUM(CASE WHEN is_human_conversation = true THEN 1 ELSE 0 END)::int as conversations,
          COUNT(*)::int as total_calls
        FROM public.calls
        WHERE client_id = 1
        AND call_date >= DATE_TRUNC('month', CURRENT_DATE)
        GROUP BY COALESCE(initiated_by, 'Didier')
        ORDER BY meetings_booked DESC
        LIMIT 5
      `),
    ]);

    client.release();

    return res.status(200).json({
      timestamp: new Date().toISOString(),
      snapshot: snapshotResult.rows[0],
      outcomesOverTime: outcomesOverTimeResult.rows,
      outcomeBreakdown: outcomeBreakdownResult.rows,
      pipelineImpact: pipelineImpactResult.rows[0],
      outcomeDetail: outcomeDetailResult.rows,
      winRate: winRateResult.rows[0],
      topPerformers: topPerformersByOutcomeResult.rows,
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
