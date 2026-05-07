-- ============================================================
-- Axiora PULSE — Analytics Enhancement Migration
-- Run this AFTER the base schema.sql
-- Adds: caching views, performance indexes, analytics helpers
-- ============================================================

-- ============================================================
-- 1. ENHANCED ANALYTICS VIEW
--    Extends the existing survey_analytics view with richer stats
-- ============================================================
CREATE OR REPLACE VIEW public.survey_analytics_enhanced AS
SELECT
  s.id                  AS survey_id,
  s.tenant_id,
  s.title,
  s.status,
  s.created_at,
  s.expires_at,

  -- Response counts
  COUNT(DISTINCT r.id)                                                    AS total_responses,
  COUNT(DISTINCT r.id) FILTER (WHERE r.status = 'completed')             AS completed_count,
  COUNT(DISTINCT r.id) FILTER (WHERE r.status = 'in_progress')           AS in_progress_count,
  COUNT(DISTINCT r.id) FILTER (WHERE r.status = 'abandoned')             AS abandoned_count,

  -- Rates
  CASE WHEN COUNT(DISTINCT r.id) > 0
    THEN ROUND(
      COUNT(DISTINCT r.id) FILTER (WHERE r.status = 'completed')::NUMERIC
      / COUNT(DISTINCT r.id) * 100, 1)
    ELSE 0 END                                                            AS completion_rate,

  CASE WHEN COUNT(DISTINCT r.id) > 0
    THEN ROUND(
      COUNT(DISTINCT r.id) FILTER (WHERE r.status = 'abandoned')::NUMERIC
      / COUNT(DISTINCT r.id) * 100, 1)
    ELSE 0 END                                                            AS abandon_rate,

  -- Timing
  AVG(EXTRACT(EPOCH FROM (r.completed_at - r.started_at)) / 60)
    FILTER (WHERE r.status = 'completed')                                 AS avg_completion_min,
  MIN(EXTRACT(EPOCH FROM (r.completed_at - r.started_at)) / 60)
    FILTER (WHERE r.status = 'completed')                                 AS min_completion_min,
  MAX(EXTRACT(EPOCH FROM (r.completed_at - r.started_at)) / 60)
    FILTER (WHERE r.status = 'completed')                                 AS max_completion_min,

  -- Question count
  (SELECT COUNT(*) FROM public.survey_questions q WHERE q.survey_id = s.id) AS question_count,

  -- Last response
  MAX(r.started_at)                                                       AS last_response_at

FROM public.surveys s
LEFT JOIN public.survey_responses r ON r.survey_id = s.id
GROUP BY s.id, s.tenant_id, s.title, s.status, s.created_at, s.expires_at;

-- ============================================================
-- 2. QUESTION METRICS VIEW
--    Per-question answer statistics for fast dashboard loading
-- ============================================================
CREATE OR REPLACE VIEW public.question_metrics AS
SELECT
  q.id                  AS question_id,
  q.survey_id,
  q.question_text,
  q.question_type,
  q.sort_order,
  q.is_required,

  -- Total answers submitted for this question
  COUNT(DISTINCT a.id)                                                    AS total_answers,

  -- Unique respondents who answered this question
  COUNT(DISTINCT a.response_id)                                           AS unique_respondents,

  -- Average numeric value (for rating / scale / number / slider questions)
  AVG(a.answer_value::NUMERIC)
    FILTER (WHERE a.answer_value ~ '^[0-9]+(\.[0-9]+)?$')               AS avg_numeric_value,

  -- Skip count: respondents who submitted the survey but skipped this question
  (SELECT COUNT(DISTINCT sr.id)
     FROM public.survey_responses sr
     WHERE sr.survey_id = q.survey_id
       AND sr.status = 'completed'
       AND NOT EXISTS (
         SELECT 1 FROM public.survey_answers sa
         WHERE sa.response_id = sr.id AND sa.question_id = q.id
       ))                                                                  AS skip_count

FROM public.survey_questions q
LEFT JOIN public.survey_answers a ON a.question_id = q.id
GROUP BY q.id, q.survey_id, q.question_text, q.question_type, q.sort_order, q.is_required;

-- ============================================================
-- 3. RESPONSE TREND VIEW
--    Daily response counts for the last 90 days — used for trend charts
-- ============================================================
CREATE OR REPLACE VIEW public.response_daily_trend AS
SELECT
  r.survey_id,
  DATE_TRUNC('day', r.started_at)::DATE   AS response_date,
  COUNT(*)                                 AS started_count,
  COUNT(*) FILTER (WHERE r.status = 'completed')  AS completed_count,
  COUNT(*) FILTER (WHERE r.status = 'abandoned')  AS abandoned_count
FROM public.survey_responses r
WHERE r.started_at >= NOW() - INTERVAL '90 days'
GROUP BY r.survey_id, DATE_TRUNC('day', r.started_at)::DATE
ORDER BY response_date;

-- ============================================================
-- 4. DROP-OFF ANALYSIS VIEW
--    Per-question funnel metrics — how many reach and answer each question
-- ============================================================
CREATE OR REPLACE VIEW public.dropoff_analysis AS
WITH question_reach AS (
  SELECT
    q.id          AS question_id,
    q.survey_id,
    q.question_text,
    q.sort_order,
    -- Respondents who answered THIS question
    COUNT(DISTINCT a.response_id) AS answered_count,
    -- Respondents who answered this question OR any LATER question
    COUNT(DISTINCT a2.response_id) AS reached_count
  FROM public.survey_questions q
  LEFT JOIN public.survey_answers a  ON a.question_id = q.id
  -- "reached" = answered any question at or after this sort_order
  LEFT JOIN public.survey_answers a2
    ON a2.response_id IN (
         SELECT response_id FROM public.survey_answers WHERE question_id = q.id
       )
    OR a2.response_id IN (
         SELECT sa.response_id
         FROM public.survey_answers sa
         JOIN public.survey_questions sq ON sq.id = sa.question_id
         WHERE sq.survey_id = q.survey_id AND sq.sort_order >= q.sort_order
       )
  GROUP BY q.id, q.survey_id, q.question_text, q.sort_order
)
SELECT
  question_id,
  survey_id,
  question_text,
  sort_order,
  answered_count,
  reached_count,
  CASE WHEN reached_count > 0
    THEN ROUND((answered_count::NUMERIC / reached_count) * 100, 1)
    ELSE 0 END  AS answer_rate_pct
FROM question_reach
ORDER BY survey_id, sort_order;

-- ============================================================
-- 5. TEXT ANALYTICS CACHE
--    Stores pre-computed sentiment + keyword results for open-text questions
--    Populated by the ai-insights Netlify function or a background job
-- ============================================================
CREATE TABLE IF NOT EXISTS public.text_analytics_cache (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  question_id     UUID NOT NULL REFERENCES public.survey_questions(id) ON DELETE CASCADE,
  survey_id       UUID NOT NULL REFERENCES public.surveys(id) ON DELETE CASCADE,
  tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,

  -- Sentiment summary
  positive_count  INT DEFAULT 0,
  negative_count  INT DEFAULT 0,
  neutral_count   INT DEFAULT 0,

  -- Top keywords as a JSONB array: [{ "word": "...", "count": N }, ...]
  top_keywords    JSONB DEFAULT '[]',

  -- Top themes / topics: [{ "topic": "...", "count": N, "sentiment": "..." }]
  top_topics      JSONB DEFAULT '[]',

  -- Raw AI analysis (from Claude)
  ai_summary      TEXT,

  -- Cache metadata
  response_count  INT DEFAULT 0,
  computed_at     TIMESTAMPTZ DEFAULT now(),
  is_stale        BOOLEAN DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_text_analytics_question ON public.text_analytics_cache(question_id);
CREATE INDEX IF NOT EXISTS idx_text_analytics_survey   ON public.text_analytics_cache(survey_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_text_analytics_unique ON public.text_analytics_cache(question_id);

-- RLS for text_analytics_cache
ALTER TABLE public.text_analytics_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant users can view text analytics"
  ON public.text_analytics_cache FOR SELECT
  USING (tenant_id = public.get_user_tenant_id());

CREATE POLICY "Tenant users can upsert text analytics"
  ON public.text_analytics_cache FOR ALL
  USING (tenant_id = public.get_user_tenant_id());

-- ============================================================
-- 6. RESPONSE SEGMENTS
--    Allows tagging responses by custom segment labels
--    e.g. "Enterprise", "SMB", "India", "USA"
-- ============================================================
CREATE TABLE IF NOT EXISTS public.response_segments (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  response_id   UUID NOT NULL REFERENCES public.survey_responses(id) ON DELETE CASCADE,
  survey_id     UUID NOT NULL REFERENCES public.surveys(id) ON DELETE CASCADE,
  tenant_id     UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  segment_key   TEXT NOT NULL,   -- e.g. "company_size", "region", "user_type"
  segment_value TEXT NOT NULL,   -- e.g. "Enterprise", "India", "Free user"
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_segments_response ON public.response_segments(response_id);
CREATE INDEX IF NOT EXISTS idx_segments_survey   ON public.response_segments(survey_id);
CREATE INDEX IF NOT EXISTS idx_segments_key_val  ON public.response_segments(segment_key, segment_value);

ALTER TABLE public.response_segments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant users can manage segments"
  ON public.response_segments FOR ALL
  USING (tenant_id = public.get_user_tenant_id());

-- ============================================================
-- 7. PERFORMANCE INDEXES
--    Critical for analytics queries at scale
-- ============================================================

-- Fast lookup: answers for a survey (via response join)
CREATE INDEX IF NOT EXISTS idx_answers_answered_at
  ON public.survey_answers(answered_at DESC);

-- Fast lookup: responses by date range
CREATE INDEX IF NOT EXISTS idx_responses_started_at
  ON public.survey_responses(started_at DESC);

CREATE INDEX IF NOT EXISTS idx_responses_status_survey
  ON public.survey_responses(survey_id, status);

-- Fast lookup: questions by type (for filtering analytics by question type)
CREATE INDEX IF NOT EXISTS idx_questions_type
  ON public.survey_questions(question_type);

-- ============================================================
-- 8. HELPER FUNCTION: get_survey_nps
--    Returns NPS breakdown for any survey with a scale question
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_survey_nps(p_survey_id UUID)
RETURNS TABLE (
  nps_score    INT,
  promoters    INT,
  passives     INT,
  detractors   INT,
  total        INT,
  label        TEXT
) AS $$
DECLARE
  v_question_id UUID;
BEGIN
  -- Find the first scale (1-10) question in the survey
  SELECT id INTO v_question_id
  FROM public.survey_questions
  WHERE survey_id = p_survey_id AND question_type = 'scale'
  ORDER BY sort_order
  LIMIT 1;

  IF v_question_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH scores AS (
    SELECT a.answer_value::INT AS score
    FROM public.survey_answers a
    WHERE a.question_id = v_question_id
      AND a.answer_value ~ '^[0-9]+$'
      AND a.answer_value::INT BETWEEN 1 AND 10
  ),
  buckets AS (
    SELECT
      COUNT(*) FILTER (WHERE score >= 9)         AS promoters,
      COUNT(*) FILTER (WHERE score BETWEEN 7 AND 8) AS passives,
      COUNT(*) FILTER (WHERE score <= 6)         AS detractors,
      COUNT(*)                                   AS total
    FROM scores
  )
  SELECT
    CASE WHEN total > 0
      THEN ROUND(((promoters - detractors)::NUMERIC / total) * 100)::INT
      ELSE 0 END,
    promoters::INT,
    passives::INT,
    detractors::INT,
    total::INT,
    CASE
      WHEN total = 0 THEN 'No data'
      WHEN ROUND(((promoters - detractors)::NUMERIC / total) * 100) >= 50 THEN 'Excellent'
      WHEN ROUND(((promoters - detractors)::NUMERIC / total) * 100) >= 20 THEN 'Good'
      WHEN ROUND(((promoters - detractors)::NUMERIC / total) * 100) >= 0  THEN 'Needs work'
      ELSE 'Critical'
    END
  FROM buckets;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ============================================================
-- 9. HELPER FUNCTION: mark_text_analytics_stale
--    Called by trigger whenever new answers arrive for text questions
-- ============================================================
CREATE OR REPLACE FUNCTION public.mark_text_analytics_stale()
RETURNS TRIGGER AS $$
DECLARE
  v_question_type TEXT;
BEGIN
  SELECT question_type INTO v_question_type
  FROM public.survey_questions
  WHERE id = NEW.question_id;

  IF v_question_type IN ('short_text', 'long_text') THEN
    UPDATE public.text_analytics_cache
    SET is_stale = true
    WHERE question_id = NEW.question_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_stale_text_analytics
  AFTER INSERT OR UPDATE ON public.survey_answers
  FOR EACH ROW EXECUTE FUNCTION public.mark_text_analytics_stale();

-- ============================================================
-- DONE
-- ============================================================
-- To verify installation:
-- SELECT * FROM public.survey_analytics_enhanced LIMIT 5;
-- SELECT * FROM public.question_metrics LIMIT 10;
-- SELECT * FROM public.get_survey_nps('<your-survey-id>');
