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
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST');

  if (req.method === 'POST') {
    // Log a new report generation
    let client;
    try {
      client = await pool.connect();
      const { report_type, report_name, date_range_start, date_range_end, format, scheduled, schedule_freq, next_run_at } = req.body;

      const result = await client.query(`
        INSERT INTO public.reports_log
          (organization_id, user_id, report_type, report_name, date_range_start, date_range_end, format, status, scheduled, schedule_freq, next_run_at)
        VALUES (1, 1, $1, $2, $3, $4, $5, 'generated', $6, $7, $8)
        RETURNING id
      `, [report_type, report_name, date_range_start, date_range_end, format || 'PDF', scheduled || false, schedule_freq, next_run_at]);

      client.release();
      return res.status(200).json({ success: true, id: result.rows[0].id });
    } catch (error) {
      if (client) client.release();
      return res.status(500).json({ error: 'Database error', message: error.message });
    }
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let client;
  try {
    client = await pool.connect();

    const [
      snapshotResult,
      recentReportsResult,
      reportsByTypeResult,
      scheduledReportsResult,
      reportsOverTimeResult,
    ] = await Promise.all([

      // SNAPSHOT — reports generated, viewed, exported, scheduled
      client.query(`
        SELECT
          COUNT(*)::int as total_generated,
          SUM(CASE WHEN created_at >= CURRENT_DATE - INTERVAL '30 days' THEN 1 ELSE 0 END)::int as generated_last_30,
          SUM(CASE WHEN created_at >= CURRENT_DATE - INTERVAL '60 days' AND created_at < CURRENT_DATE - INTERVAL '30 days' THEN 1 ELSE 0 END)::int as generated_prev_30,
          SUM(CASE WHEN scheduled = true THEN 1 ELSE 0 END)::int as scheduled_count,
          SUM(CASE WHEN format = 'PDF' THEN 1 ELSE 0 END)::int as pdf_count,
          COUNT(DISTINCT report_type)::int as unique_types
        FROM public.reports_log
        WHERE organization_id = 1
      `),

      // RECENT REPORTS — last 10
      client.query(`
        SELECT
          id,
          report_type,
          report_name,
          format,
          status,
          file_url,
          scheduled,
          created_at
        FROM public.reports_log
        WHERE organization_id = 1
        ORDER BY created_at DESC
        LIMIT 10
      `),

      // REPORTS BY TYPE
      client.query(`
        SELECT
          report_type,
          COUNT(*)::int as count,
          CAST(100.0 * COUNT(*) / NULLIF(SUM(COUNT(*)) OVER (), 0) AS DECIMAL(5,1)) as percentage
        FROM public.reports_log
        WHERE organization_id = 1
        AND created_at >= CURRENT_DATE - INTERVAL '30 days'
        GROUP BY report_type
        ORDER BY count DESC
      `),

      // SCHEDULED REPORTS
      client.query(`
        SELECT
          id,
          report_type,
          report_name,
          schedule_freq,
          next_run_at,
          status
        FROM public.reports_log
        WHERE organization_id = 1
        AND scheduled = true
        ORDER BY next_run_at ASC
        LIMIT 10
      `),

      // REPORTS OVER TIME — daily last 30 days
      client.query(`
        SELECT
          DATE(created_at) as report_date,
          TO_CHAR(DATE(created_at), 'Mon DD') as date_label,
          COUNT(*)::int as count
        FROM public.reports_log
        WHERE organization_id = 1
        AND created_at >= CURRENT_DATE - INTERVAL '30 days'
        GROUP BY DATE(created_at)
        ORDER BY report_date
      `),
    ]);

    client.release();

    return res.status(200).json({
      timestamp: new Date().toISOString(),
      snapshot: snapshotResult.rows[0],
      recentReports: recentReportsResult.rows,
      reportsByType: reportsByTypeResult.rows,
      scheduledReports: scheduledReportsResult.rows,
      reportsOverTime: reportsOverTimeResult.rows,
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
