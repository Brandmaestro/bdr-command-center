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
      coachingInsightsResult,
      skillScoresResult,
      scoreOverTimeResult,
      topSkillsResult,
      recentSessionsResult,
    ] = await Promise.all([

      // SNAPSHOT — coaching metrics this month vs last
      client.query(`
        SELECT
          CAST(AVG(CASE WHEN c.call_date >= DATE_TRUNC('month', CURRENT_DATE) THEN NULLIF(c.overall_call_score, 0) END) AS DECIMAL(5,1)) as avg_score_this_month,
          CAST(AVG(CASE WHEN c.call_date >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '1 month' AND c.call_date < DATE_TRUNC('month', CURRENT_DATE) THEN NULLIF(c.overall_call_score, 0) END) AS DECIMAL(5,1)) as avg_score_last_month,
          COUNT(CASE WHEN c.call_date >= DATE_TRUNC('month', CURRENT_DATE) AND c.is_human_conversation = true THEN 1 END)::int as coaching_opportunities_this_month,
          COUNT(CASE WHEN c.call_date >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '1 month' AND c.call_date < DATE_TRUNC('month', CURRENT_DATE) AND c.is_human_conversation = true THEN 1 END)::int as coaching_opportunities_last_month,
          CAST(AVG(CASE WHEN c.call_date >= DATE_TRUNC('month', CURRENT_DATE) THEN NULLIF(ci.sentiment_score, 0) END) AS DECIMAL(5,1)) as avg_sentiment_this_month,
          CAST(AVG(CASE WHEN c.call_date >= DATE_TRUNC('month', CURRENT_DATE) THEN NULLIF(ci.objection_count, 0) END) AS DECIMAL(5,1)) as avg_objections_this_month,
          CAST(AVG(CASE WHEN c.call_date >= DATE_TRUNC('month', CURRENT_DATE) THEN NULLIF(ci.technical_fit_score, 0) END) AS DECIMAL(5,1)) as avg_technical_fit_this_month
        FROM public.calls c
        LEFT JOIN public.call_intelligence ci ON ci.call_id = c.id
        WHERE c.client_id = 1
        AND c.call_date >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '1 month'
      `),

      // COACHING INSIGHTS — top objections and patterns from AI
      client.query(`
        SELECT
          ci.objections,
          ci.what_could_be_improved,
          ci.coaching_notes,
          ci.overall_score,
          ci.sentiment_score,
          ci.objection_count,
          c.call_date,
          c.company_name,
          c.overall_call_score
        FROM public.call_intelligence ci
        JOIN public.calls c ON c.id = ci.call_id
        WHERE c.client_id = 1
        AND c.call_date >= DATE_TRUNC('month', CURRENT_DATE)
        AND c.is_human_conversation = true
        ORDER BY c.call_date DESC
        LIMIT 20
      `),

      // SKILL SCORES — derived from AI intelligence fields
      client.query(`
        SELECT
          CAST(AVG(NULLIF(overall_call_score, 0)) AS DECIMAL(5,1)) as overall_avg,
          CAST(AVG(NULLIF(technical_fit_score, 0)) AS DECIMAL(5,1)) as technical_fit_avg,
          CAST(AVG(NULLIF(sentiment_score, 0)) AS DECIMAL(5,1)) as sentiment_avg,
          CAST(AVG(NULLIF(objection_count, 0)) AS DECIMAL(5,1)) as avg_objections,
          COUNT(*)::int as total_analyzed
        FROM public.call_intelligence ci
        JOIN public.calls c ON c.id = ci.call_id
        WHERE c.client_id = 1
        AND c.call_date >= DATE_TRUNC('month', CURRENT_DATE)
        AND c.is_human_conversation = true
      `),

      // SCORE OVER TIME — daily avg this month
      client.query(`
        SELECT
          c.call_date,
          TO_CHAR(c.call_date, 'Mon DD') as date_label,
          CAST(AVG(NULLIF(c.overall_call_score, 0)) AS DECIMAL(5,1)) as avg_score,
          COUNT(*)::int as calls_analyzed
        FROM public.calls c
        JOIN public.call_intelligence ci ON ci.call_id = c.id
        WHERE c.client_id = 1
        AND c.call_date >= DATE_TRUNC('month', CURRENT_DATE)
        AND c.is_human_conversation = true
        GROUP BY c.call_date
        ORDER BY c.call_date
      `),

      // TOP SKILLS TO IMPROVE — lowest scoring areas
      client.query(`
        SELECT
          'Objection Handling' as skill,
          CAST(AVG(CASE WHEN ci.objection_count > 2 THEN c.overall_call_score END) AS DECIMAL(5,1)) as avg_score,
          COUNT(CASE WHEN ci.objection_count > 2 THEN 1 END)::int as opportunity_count
        FROM public.call_intelligence ci
        JOIN public.calls c ON c.id = ci.call_id
        WHERE c.client_id = 1
        AND c.call_date >= DATE_TRUNC('month', CURRENT_DATE)
        AND c.is_human_conversation = true

        UNION ALL

        SELECT
          'Technical Discovery' as skill,
          CAST(AVG(NULLIF(ci.technical_fit_score, 0)) AS DECIMAL(5,1)) as avg_score,
          COUNT(*)::int as opportunity_count
        FROM public.call_intelligence ci
        JOIN public.calls c ON c.id = ci.call_id
        WHERE c.client_id = 1
        AND c.call_date >= DATE_TRUNC('month', CURRENT_DATE)
        AND c.is_human_conversation = true

        UNION ALL

        SELECT
          'Sentiment & Rapport' as skill,
          CAST(AVG(NULLIF(ci.sentiment_score, 0)) AS DECIMAL(5,1)) as avg_score,
          COUNT(*)::int as opportunity_count
        FROM public.call_intelligence ci
        JOIN public.calls c ON c.id = ci.call_id
        WHERE c.client_id = 1
        AND c.call_date >= DATE_TRUNC('month', CURRENT_DATE)
        AND c.is_human_conversation = true

        ORDER BY avg_score ASC NULLS LAST
      `),

      // RECENT COACHING SESSIONS — last 10 human conversations with AI analysis
      client.query(`
        SELECT
          c.call_timestamp,
          c.call_date,
          c.company_name,
          c.contact_name,
          c.overall_call_score,
          c.call_duration_seconds,
          c.contact_outcome,
          c.meeting_booked,
          COALESCE(c.initiated_by, 'Didier') as sdr_name,
          ci.ai_summary,
          ci.what_worked_well,
          ci.what_could_be_improved,
          ci.coaching_notes,
          ci.objections,
          ci.conversation_detail,
          ci.overall_score,
          ci.technical_fit_score,
          ci.sentiment_score,
          ci.objection_count
        FROM public.calls c
        JOIN public.call_intelligence ci ON ci.call_id = c.id
        WHERE c.client_id = 1
        AND c.is_human_conversation = true
        ORDER BY c.call_timestamp DESC
        LIMIT 10
      `),
    ]);

    client.release();

    return res.status(200).json({
      timestamp: new Date().toISOString(),
      snapshot: snapshotResult.rows[0],
      coachingInsights: coachingInsightsResult.rows,
      skillScores: skillScoresResult.rows[0],
      scoreOverTime: scoreOverTimeResult.rows,
      topSkills: topSkillsResult.rows,
      recentSessions: recentSessionsResult.rows,
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
