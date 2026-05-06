-- ─────────────────────────────────────────────────────────────────────────────
-- survey_feedback table
-- Stores quick post-survey feedback from respondents (rating + optional comment)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.survey_feedback (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id     UUID NOT NULL REFERENCES public.surveys(id) ON DELETE CASCADE,
  rating        SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment       TEXT,
  responded_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast lookups per survey
CREATE INDEX IF NOT EXISTS survey_feedback_survey_id_idx ON public.survey_feedback(survey_id);

-- RLS: public insert (respondents don't need auth), only authenticated can read
ALTER TABLE public.survey_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can submit feedback"
  ON public.survey_feedback FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Authenticated users can view feedback for their surveys"
  ON public.survey_feedback FOR SELECT
  TO authenticated
  USING (
    survey_id IN (
      SELECT id FROM public.surveys WHERE tenant_id = (
        SELECT tenant_id FROM public.user_profiles WHERE id = auth.uid()
      )
    )
  );
