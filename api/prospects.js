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
      sourceBreakdownResult,
      industryDistributionResult,
      outreachReadinessResult,
      conversionBySourceResult,
      researchIntelligenceResult,
    ] = await Promise.all([

      // SNAPSHOT — prospect counts
      client.query(`
        SELECT
          COUNT(*)::int as total_prospects,
          SUM(CASE WHEN created_at::date = CURRENT_DATE THEN 1 ELSE 0 END)::int as new_today,
          SUM(CASE WHEN created_at >= DATE_TRUNC('week', CURRENT_DATE) THEN 1 ELSE 0 END)::int as new_this_week,
          SUM(CASE WHEN created_at >= DATE_TRUNC('month', CURRENT_DATE) THEN 1 ELSE 0 END)::int as new_this_month,
          SUM(CASE WHEN outreach_ready = true THEN 1 ELSE 0 END)::int as outreach_ready,
          CAST(100.0 * SUM(CASE WHEN outreach_ready = true THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0) AS DECIMAL(5,1)) as outreach_ready_pct,
          CAST(AVG(NULLIF(research_depth_score, 0)) AS DECIMAL(5,1)) as avg_quality_score,
          CAST(100.0 * SUM(CASE WHEN decision_maker_identified = true THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0) AS DECIMAL(5,1)) as decision_maker_pct,
          CAST(100.0 * SUM(CASE WHEN email_verified = true THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0) AS DECIMAL(5,1)) as email_verified_pct,
          CAST(100.0 * SUM(CASE WHEN direct_number_found = true THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0) AS DECIMAL(5,1)) as direct_number_pct,
          CAST(100.0 * SUM(CASE WHEN tech_stack_identified = true THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0) AS DECIMAL(5,1)) as tech_stack_pct,
          CAST(100.0 * SUM(CASE WHEN pain_points_captured = true THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0) AS DECIMAL(5,1)) as pain_points_pct,
          CAST(100.0 * SUM(CASE WHEN existing_provider_found = true THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0) AS DECIMAL(5,1)) as existing_provider_pct,
          CAST(100.0 * SUM(CASE WHEN renewal_timing_identified = true THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0) AS DECIMAL(5,1)) as renewal_timing_pct,
          CAST(100.0 * SUM(CASE WHEN ai_enrichment_used = true THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0) AS DECIMAL(5,1)) as ai_enrichment_pct
        FROM public.prospects
        WHERE organization_id = 1
      `),

      // SOURCE BREAKDOWN
      client.query(`
        SELECT
          COALESCE(source, 'Other') as source,
          COUNT(*)::int as count,
          CAST(100.0 * COUNT(*) / NULLIF(SUM(COUNT(*)) OVER (), 0) AS DECIMAL(5,1)) as percentage
        FROM public.prospects
        WHERE organization_id = 1
        GROUP BY source
        ORDER BY count DESC
      `),

      // INDUSTRY DISTRIBUTION
      client.query(`
        SELECT
          COALESCE(industry, 'Other') as industry,
          COUNT(*)::int as count,
          CAST(100.0 * COUNT(*) / NULLIF(SUM(COUNT(*)) OVER (), 0) AS DECIMAL(5,1)) as percentage
        FROM public.prospects
        WHERE organization_id = 1
        GROUP BY industry
        ORDER BY count DESC
        LIMIT 8
      `),

      // OUTREACH READINESS FUNNEL
      client.query(`
        SELECT
          COUNT(*)::int as total_prospects,
          SUM(CASE WHEN decision_maker_identified = true OR email_verified = true THEN 1 ELSE 0 END)::int as research_complete,
          SUM(CASE WHEN email_verified = true OR direct_number_found = true THEN 1 ELSE 0 END)::int as contact_info_found,
          SUM(CASE WHEN tech_stack_identified = true OR pain_points_captured = true THEN 1 ELSE 0 END)::int as enriched,
          SUM(CASE WHEN outreach_ready = true THEN 1 ELSE 0 END)::int as outreach_ready
        FROM public.prospects
        WHERE organization_id = 1
      `),

      // CONVERSION BY SOURCE — prospects that became calls
      client.query(`
        SELECT
          COALESCE(p.source, 'Other') as source,
          COUNT(DISTINCT p.id)::int as total_prospects,
          COUNT(DISTINCT c.id)::int as calls_made,
          CAST(100.0 * COUNT(DISTINCT c.id) / NULLIF(COUNT(DISTINCT p.id), 0) AS DECIMAL(5,1)) as reply_rate,
          SUM(CASE WHEN c.is_human_conversation = true THEN 1 ELSE 0 END)::int as conversations,
          CAST(100.0 * SUM(CASE WHEN c.is_human_conversation = true THEN 1 ELSE 0 END) / NULLIF(COUNT(DISTINCT c.id), 0) AS DECIMAL(5,1)) as conv_rate,
          SUM(CASE WHEN c.meeting_booked = true THEN 1 ELSE 0 END)::int as meetings_booked,
          CAST(100.0 * SUM(CASE WHEN c.meeting_booked = true THEN 1 ELSE 0 END) / NULLIF(COUNT(DISTINCT c.id), 0) AS DECIMAL(5,1)) as meeting_rate
        FROM public.prospects p
        LEFT JOIN public.calls c ON c.company_name = p.company_name AND c.client_id = 1
        WHERE p.organization_id = 1
        GROUP BY source
        ORDER BY total_prospects DESC
      `),

      // RESEARCH INTELLIGENCE SUMMARY
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
        FROM public.prospects
        WHERE organization_id = 1
      `),
    ]);

    client.release();

    return res.status(200).json({
      timestamp: new Date().toISOString(),
      snapshot: snapshotResult.rows[0],
      sourceBreakdown: sourceBreakdownResult.rows,
      industryDistribution: industryDistributionResult.rows,
      outreachReadiness: outreachReadinessResult.rows[0],
      conversionBySource: conversionBySourceResult.rows,
      researchIntelligence: researchIntelligenceResult.rows[0],
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
