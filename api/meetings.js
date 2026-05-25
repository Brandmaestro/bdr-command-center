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
      meetingFeedResult,
      meetingQualityResult,
      meetingSourceResult,
      pipelineTrackerResult,
      qualityScoreResult,
      bookingHeatmapResult,
      upcomingMeetingsResult,
    ] = await Promise.all([

      // SNAPSHOT — this week vs last week
      client.query(`
        SELECT
          SUM(CASE WHEN c.call_date >= DATE_TRUNC('week', CURRENT_DATE) AND c.meeting_booked = true THEN 1 ELSE 0 END)::int as meetings_this_week,
          SUM(CASE WHEN c.call_date >= DATE_TRUNC('week', CURRENT_DATE) - INTERVAL '7 days' AND c.call_date < DATE_TRUNC('week', CURRENT_DATE) AND c.meeting_booked = true THEN 1 ELSE 0 END)::int as meetings_last_week,
          CAST(AVG(CASE WHEN c.call_date >= DATE_TRUNC('week', CURRENT_DATE) AND c.meeting_booked = true THEN NULLIF(c.overall_call_score, 0) END) AS DECIMAL(5,1)) as avg_quality_this_week,
          CAST(AVG(CASE WHEN c.call_date >= DATE_TRUNC('week', CURRENT_DATE) - INTERVAL '7 days' AND c.call_date < DATE_TRUNC('week', CURRENT_DATE) AND c.meeting_booked = true THEN NULLIF(c.overall_call_score, 0) END) AS DECIMAL(5,1)) as avg_quality_last_week,
          CAST(100.0 * SUM(CASE WHEN c.call_date >= DATE_TRUNC('week', CURRENT_DATE) AND c.meeting_booked = true THEN 1 ELSE 0 END) / NULLIF(SUM(CASE WHEN c.call_date >= DATE_TRUNC('week', CURRENT_DATE) AND c.is_human_conversation = true THEN 1 ELSE 0 END), 0) AS DECIMAL(5,1)) as meeting_conv_rate_this_week,
          CAST(100.0 * SUM(CASE WHEN c.call_date >= DATE_TRUNC('week', CURRENT_DATE) - INTERVAL '7 days' AND c.call_date < DATE_TRUNC('week', CURRENT_DATE) AND c.meeting_booked = true THEN 1 ELSE 0 END) / NULLIF(SUM(CASE WHEN c.call_date >= DATE_TRUNC('week', CURRENT_DATE) - INTERVAL '7 days' AND c.call_date < DATE_TRUNC('week', CURRENT_DATE) AND c.is_human_conversation = true THEN 1 ELSE 0 END), 0) AS DECIMAL(5,1)) as meeting_conv_rate_last_week,
          CAST(AVG(CASE WHEN c.call_date >= DATE_TRUNC('week', CURRENT_DATE) AND c.meeting_booked = true THEN NULLIF(c.call_duration_seconds, 0) END) AS INTEGER) as avg_time_to_book_seconds
        FROM public.calls c
        WHERE c.client_id = 1
        AND c.call_date >= DATE_TRUNC('week', CURRENT_DATE) - INTERVAL '7 days'
      `),

      // MEETING FEED — recent booked meetings
      client.query(`
        SELECT
          m.id,
          m.meeting_datetime,
          m.cal_status,
          m.cal_meeting_url,
          m.invitee_first_name,
          m.invitee_last_name,
          m.invitee_email,
          m.meeting_duration,
          m.est_pipeline_value,
          c.company_name,
          c.contact_name,
          c.overall_call_score,
          c.call_timestamp,
          c.call_date,
          c.call_time,
          c.call_duration_seconds,
          COALESCE(c.initiated_by, 'Didier') as sdr_name,
          ci.ai_summary,
          ci.conversation_detail,
          ci.technical_fit_score
        FROM public.meetings m
        JOIN public.calls c ON c.id = m.call_id
        LEFT JOIN public.call_intelligence ci ON ci.call_id = c.id
        WHERE c.client_id = 1
        ORDER BY m.meeting_datetime DESC
        LIMIT 25
      `),

      // MEETING QUALITY BREAKDOWN
      client.query(`
        SELECT
          CASE
            WHEN c.overall_call_score >= 8 THEN 'High Quality (8-10)'
            WHEN c.overall_call_score >= 6 THEN 'Medium Quality (6-7.9)'
            ELSE 'Low Quality (<6)'
          END as quality_tier,
          COUNT(*)::int as count,
          CAST(100.0 * COUNT(*) / NULLIF(SUM(COUNT(*)) OVER (), 0) AS DECIMAL(5,1)) as percentage
        FROM public.meetings m
        JOIN public.calls c ON c.id = m.call_id
        WHERE c.client_id = 1
        AND c.overall_call_score IS NOT NULL
        AND c.overall_call_score > 0
        GROUP BY quality_tier
        ORDER BY count DESC
      `),

      // MEETING SOURCE ANALYSIS
      client.query(`
        SELECT
          CASE
            WHEN c.call_type ILIKE '%cold%' OR c.call_direction = 'outbound' THEN 'Cold Call'
            WHEN c.call_type ILIKE '%follow%' THEN 'Follow-Up'
            WHEN c.contact_outcome ILIKE '%referral%' THEN 'Referral'
            ELSE 'Other'
          END as source,
          COUNT(*)::int as count,
          CAST(100.0 * COUNT(*) / NULLIF(SUM(COUNT(*)) OVER (), 0) AS DECIMAL(5,1)) as percentage
        FROM public.meetings m
        JOIN public.calls c ON c.id = m.call_id
        WHERE c.client_id = 1
        GROUP BY source
        ORDER BY count DESC
      `),

      // PIPELINE TRACKER — meetings by stage
      client.query(`
        SELECT
          COALESCE(m.cal_status, 'booked') as stage,
          COUNT(*)::int as count,
          CAST(100.0 * COUNT(*) / NULLIF(SUM(COUNT(*)) OVER (), 0) AS DECIMAL(5,1)) as pct_of_total,
          CAST(COALESCE(SUM(m.est_pipeline_value), 0) AS DECIMAL(12,2)) as pipeline_value
        FROM public.meetings m
        JOIN public.calls c ON c.id = m.call_id
        WHERE c.client_id = 1
        GROUP BY COALESCE(m.cal_status, 'booked')
        ORDER BY count DESC
      `),

      // MEETING QUALITY SCORE FACTORS — from AI
      client.query(`
        SELECT
          CAST(AVG(NULLIF(ci.technical_fit_score, 0)) AS DECIMAL(5,1)) as technical_fit_avg,
          CAST(AVG(NULLIF(ci.sentiment_score, 0)) AS DECIMAL(5,1)) as sentiment_avg,
          CAST(AVG(NULLIF(ci.overall_score, 0)) AS DECIMAL(5,1)) as overall_avg,
          CAST(AVG(NULLIF(ci.objection_count, 0)) AS DECIMAL(5,1)) as avg_objections,
          COUNT(*)::int as meetings_analyzed
        FROM public.call_intelligence ci
        JOIN public.calls c ON c.id = ci.call_id
        WHERE c.client_id = 1
        AND c.meeting_booked = true
        AND c.call_date >= DATE_TRUNC('month', CURRENT_DATE)
      `),

      // BOOKING HEATMAP — by day of week and hour
      client.query(`
        SELECT
          EXTRACT(DOW FROM c.call_timestamp)::int as day_of_week,
          EXTRACT(HOUR FROM c.call_timestamp)::int as hour,
          COUNT(*)::int as meetings_booked
        FROM public.calls c
        WHERE c.client_id = 1
        AND c.meeting_booked = true
        AND c.call_date >= DATE_TRUNC('month', CURRENT_DATE)
        GROUP BY day_of_week, hour
        ORDER BY day_of_week, hour
      `),

      // UPCOMING MEETINGS — next 5 scheduled
      client.query(`
        SELECT
          m.id,
          m.meeting_datetime,
          m.cal_meeting_url,
          m.cal_status,
          m.invitee_first_name,
          m.invitee_last_name,
          m.invitee_email,
          m.meeting_duration,
          c.company_name,
          c.contact_name,
          c.overall_call_score,
          ci.conversation_detail
        FROM public.meetings m
        JOIN public.calls c ON c.id = m.call_id
        LEFT JOIN public.call_intelligence ci ON ci.call_id = c.id
        WHERE c.client_id = 1
        AND m.meeting_datetime > NOW()
        ORDER BY m.meeting_datetime ASC
        LIMIT 5
      `),
    ]);

    client.release();

    return res.status(200).json({
      timestamp: new Date().toISOString(),
      snapshot: snapshotResult.rows[0],
      meetingFeed: meetingFeedResult.rows,
      meetingQuality: meetingQualityResult.rows,
      meetingSource: meetingSourceResult.rows,
      pipelineTracker: pipelineTrackerResult.rows,
      qualityScore: qualityScoreResult.rows[0],
      bookingHeatmap: bookingHeatmapResult.rows,
      upcomingMeetings: upcomingMeetingsResult.rows,
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
