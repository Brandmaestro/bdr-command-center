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

  const USER_ID = 1; // Didier — will be dynamic after auth is added
  const ORG_ID = 1;  // Evident IT

  // ── SAVE SETTINGS ────────────────────────────────────────────
  if (req.method === 'POST') {
    let client;
    try {
      client = await pool.connect();
      const { preferences, notifications } = req.body;

      if (preferences) {
        await client.query(`
          INSERT INTO public.user_dashboard_preferences (
            user_id,
            daily_prospect_target, weekly_meetings_target, daily_calls_target,
            prospect_inventory_min, research_completion_target, followup_response_target,
            scoring_sensitivity, coaching_strictness, qualification_threshold,
            objection_detection, discovery_detection, sentiment_analysis, ai_summary_length,
            date_format, timezone, currency, business_hours_start, business_hours_end, week_starts_on,
            updated_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
            $15, $16, $17, $18, $19, $20, NOW()
          )
          ON CONFLICT (user_id) DO UPDATE SET
            daily_prospect_target       = EXCLUDED.daily_prospect_target,
            weekly_meetings_target      = EXCLUDED.weekly_meetings_target,
            daily_calls_target          = EXCLUDED.daily_calls_target,
            prospect_inventory_min      = EXCLUDED.prospect_inventory_min,
            research_completion_target  = EXCLUDED.research_completion_target,
            followup_response_target    = EXCLUDED.followup_response_target,
            scoring_sensitivity         = EXCLUDED.scoring_sensitivity,
            coaching_strictness         = EXCLUDED.coaching_strictness,
            qualification_threshold     = EXCLUDED.qualification_threshold,
            objection_detection         = EXCLUDED.objection_detection,
            discovery_detection         = EXCLUDED.discovery_detection,
            sentiment_analysis          = EXCLUDED.sentiment_analysis,
            ai_summary_length           = EXCLUDED.ai_summary_length,
            date_format                 = EXCLUDED.date_format,
            timezone                    = EXCLUDED.timezone,
            currency                    = EXCLUDED.currency,
            business_hours_start        = EXCLUDED.business_hours_start,
            business_hours_end          = EXCLUDED.business_hours_end,
            week_starts_on              = EXCLUDED.week_starts_on,
            updated_at                  = NOW()
        `, [
          USER_ID,
          preferences.daily_prospect_target    ?? 150,
          preferences.weekly_meetings_target   ?? 20,
          preferences.daily_calls_target       ?? 50,
          preferences.prospect_inventory_min   ?? 1000,
          preferences.research_completion_target ?? 90,
          preferences.followup_response_target ?? 25,
          preferences.scoring_sensitivity      ?? 'high',
          preferences.coaching_strictness      ?? 'medium',
          preferences.qualification_threshold  ?? 75,
          preferences.objection_detection      ?? 'high',
          preferences.discovery_detection      ?? 'medium',
          preferences.sentiment_analysis       ?? true,
          preferences.ai_summary_length        ?? 'detailed',
          preferences.date_format              ?? 'MM/DD/YYYY',
          preferences.timezone                 ?? 'America/Winnipeg',
          preferences.currency                 ?? 'USD',
          preferences.business_hours_start     ?? '08:00',
          preferences.business_hours_end       ?? '18:00',
          preferences.week_starts_on           ?? 'Monday',
        ]);
      }

      if (notifications) {
        await client.query(`
          INSERT INTO public.user_notification_preferences (
            user_id,
            low_prospect_inventory, meeting_rate_drop, followup_overdue,
            research_backlog, daily_performance_summary,
            meeting_booked, call_analysis_complete, weekly_report,
            updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
          ON CONFLICT (user_id) DO UPDATE SET
            low_prospect_inventory    = EXCLUDED.low_prospect_inventory,
            meeting_rate_drop         = EXCLUDED.meeting_rate_drop,
            followup_overdue          = EXCLUDED.followup_overdue,
            research_backlog          = EXCLUDED.research_backlog,
            daily_performance_summary = EXCLUDED.daily_performance_summary,
            meeting_booked            = EXCLUDED.meeting_booked,
            call_analysis_complete    = EXCLUDED.call_analysis_complete,
            weekly_report             = EXCLUDED.weekly_report,
            updated_at                = NOW()
        `, [
          USER_ID,
          notifications.low_prospect_inventory    ?? true,
          notifications.meeting_rate_drop         ?? true,
          notifications.followup_overdue          ?? true,
          notifications.research_backlog          ?? false,
          notifications.daily_performance_summary ?? true,
          notifications.meeting_booked            ?? true,
          notifications.call_analysis_complete    ?? true,
          notifications.weekly_report             ?? true,
        ]);
      }

      client.release();
      return res.status(200).json({ success: true });

    } catch (error) {
      if (client) client.release();
      return res.status(500).json({ error: 'Database error', message: error.message });
    }
  }

  // ── READ SETTINGS ─────────────────────────────────────────────
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let client;
  try {
    client = await pool.connect();

    const [
      preferencesResult,
      notificationsResult,
      userResult,
      orgResult,
    ] = await Promise.all([

      // USER DASHBOARD PREFERENCES
      client.query(`
        SELECT * FROM public.user_dashboard_preferences
        WHERE user_id = $1
      `, [USER_ID]),

      // USER NOTIFICATION PREFERENCES
      client.query(`
        SELECT * FROM public.user_notification_preferences
        WHERE user_id = $1
      `, [USER_ID]),

      // USER INFO
      client.query(`
        SELECT id, name, email, role, org_id
        FROM public.users
        WHERE id = $1
      `, [USER_ID]),

      // ORG INFO
      client.query(`
        SELECT id, name
        FROM public.organizations
        WHERE id = $1
      `, [ORG_ID]),
    ]);

    client.release();

    return res.status(200).json({
      timestamp: new Date().toISOString(),
      preferences: preferencesResult.rows[0] || null,
      notifications: notificationsResult.rows[0] || null,
      user: userResult.rows[0] || null,
      org: orgResult.rows[0] || null,
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
