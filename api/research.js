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
      prospectListResult,
      topRenewalsResult,
      decisionMakerResult,
    ] = await Promise.all([

      // SNAPSHOT
      client.query(`
        SELECT
          COUNT(*)::int as total_researched,
          SUM(CASE WHEN research_depth_score >= 80 THEN 1 ELSE 0 END)::int as high_priority,
          SUM(CASE WHEN outreach_ready = true THEN 1 ELSE 0 END)::int as outreach_ready,
          SUM(CASE WHEN updated_at >= CURRENT_DATE - INTERVAL '7 days' THEN 1 ELSE 0 END)::int as new_intel_this_week,
          CAST(AVG(NULLIF(research_depth_score, 0)) AS DECIMAL(5,1)) as avg_fit_score,
          COUNT(CASE WHEN status = 'new' THEN 1 END)::int as watchlist_count
        FROM public.prospects
        WHERE organization_id = 1
      `),

      // PROSPECT LIST — paginated, all fields for the main table
      client.query(`
        SELECT
          p.id,
          p.company_name,
          p.industry,
          p.company_size,
          p.contact_first_name,
          p.contact_last_name,
          p.contact_email,
          p.direct_number,
          p.source,
          p.status,
          p.outreach_ready,
          p.research_depth_score,
          p.decision_maker_identified,
          p.email_verified,
          p.direct_number_found,
          p.tech_stack_identified,
          p.pain_points_captured,
          p.existing_provider_found,
          p.renewal_timing_identified,
          p.ai_enrichment_used,
          p.hubspot_company_id,
          p.updated_at,
          p.created_at,
          -- Last call activity
          MAX(c.call_date) as last_call_date,
          COUNT(c.id)::int as total_calls,
          MAX(c.overall_call_score) as best_call_score
        FROM public.prospects p
        LEFT JOIN public.calls c ON c.company_name = p.company_name AND c.client_id = 1
        WHERE p.organization_id = 1
        GROUP BY p.id
        ORDER BY p.research_depth_score DESC NULLS LAST, p.updated_at DESC
        LIMIT 100
      `),

      // TOP RENEWALS — prospects with soonest renewal timing
      client.query(`
        SELECT
          p.id,
          p.company_name,
          p.industry,
          p.contact_first_name,
          p.contact_last_name,
          p.research_depth_score,
          p.existing_provider_found,
          p.renewal_timing_identified,
          p.updated_at
        FROM public.prospects p
        WHERE p.organization_id = 1
        AND p.renewal_timing_identified = true
        ORDER BY p.research_depth_score DESC NULLS LAST
        LIMIT 5
      `),

      // DECISION MAKER BREAKDOWN — by role/title patterns
      client.query(`
        SELECT
          status,
          COUNT(*)::int as count,
          CAST(AVG(NULLIF(research_depth_score, 0)) AS DECIMAL(5,1)) as avg_score
        FROM public.prospects
        WHERE organization_id = 1
        GROUP BY status
        ORDER BY count DESC
      `),
    ]);

    client.release();

    return res.status(200).json({
      timestamp: new Date().toISOString(),
      snapshot: snapshotResult.rows[0],
      prospectList: prospectListResult.rows,
      topRenewals: topRenewalsResult.rows,
      decisionMakers: decisionMakerResult.rows,
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
