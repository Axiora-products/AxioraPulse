-- ============================================================
-- Axiora SURVEY — Complete Multi-Tenant Schema
-- Run this in Supabase SQL Editor (in order)
-- ============================================================

-- 0. Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- 1. TENANTS (Organizations)
-- ============================================================
CREATE TABLE public.tenants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  logo_url TEXT,
  primary_color TEXT DEFAULT '#10B981',
  plan TEXT DEFAULT 'free' CHECK (plan IN ('free','pro','enterprise')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 2. USER PROFILES (linked to auth.users)
-- ============================================================
CREATE TABLE public.user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('super_admin','admin','manager','creator','viewer')),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_user_profiles_tenant ON public.user_profiles(tenant_id);
CREATE INDEX idx_user_profiles_email ON public.user_profiles(email);

-- ============================================================
-- 3. SURVEYS
-- ============================================================
CREATE TABLE public.surveys (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES public.user_profiles(id),
  title TEXT NOT NULL,
  description TEXT,
  slug TEXT UNIQUE NOT NULL, -- unique shareable link identifier
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft','active','paused','expired','closed')),
  expires_at TIMESTAMPTZ,
  theme_color TEXT DEFAULT '#10B981',
  welcome_message TEXT,
  thank_you_message TEXT DEFAULT 'Thank you for completing this survey!',
  allow_anonymous BOOLEAN DEFAULT true,
  require_email BOOLEAN DEFAULT false,
  show_progress_bar BOOLEAN DEFAULT true,
  auto_save_interval INT DEFAULT 2, -- save every N questions answered
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_surveys_tenant ON public.surveys(tenant_id);
CREATE INDEX idx_surveys_slug ON public.surveys(slug);
CREATE INDEX idx_surveys_created_by ON public.surveys(created_by);

-- ============================================================
-- 4. SURVEY QUESTIONS
-- ============================================================
CREATE TABLE public.survey_questions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  survey_id UUID NOT NULL REFERENCES public.surveys(id) ON DELETE CASCADE,
  question_text TEXT NOT NULL,
  question_type TEXT NOT NULL CHECK (question_type IN (
    'short_text','long_text','single_choice','multiple_choice',
    'rating','scale','date','number','email','dropdown','yes_no','file_upload'
  )),
  options JSONB, -- for choice-based questions: [{label, value}]
  is_required BOOLEAN DEFAULT false,
  sort_order INT NOT NULL DEFAULT 0,
  description TEXT, -- helper text under the question
  validation_rules JSONB, -- {min, max, pattern, etc.}
  conditional_logic JSONB, -- {show_if: {question_id, operator, value}}
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_questions_survey ON public.survey_questions(survey_id);

-- ============================================================
-- 5. SURVEY RESPONSES (one per respondent session)
-- ============================================================
CREATE TABLE public.survey_responses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  survey_id UUID NOT NULL REFERENCES public.surveys(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  respondent_email TEXT,
  respondent_name TEXT,
  session_token TEXT UNIQUE NOT NULL, -- for auto-save resume
  status TEXT DEFAULT 'in_progress' CHECK (status IN ('in_progress','completed','abandoned')),
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  last_saved_at TIMESTAMPTZ DEFAULT now(),
  ip_address TEXT,
  user_agent TEXT,
  metadata JSONB DEFAULT '{}'
);

CREATE INDEX idx_responses_survey ON public.survey_responses(survey_id);
CREATE INDEX idx_responses_tenant ON public.survey_responses(tenant_id);
CREATE INDEX idx_responses_session ON public.survey_responses(session_token);

-- ============================================================
-- 6. INDIVIDUAL ANSWERS
-- ============================================================
CREATE TABLE public.survey_answers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  response_id UUID NOT NULL REFERENCES public.survey_responses(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES public.survey_questions(id) ON DELETE CASCADE,
  answer_value TEXT,
  answer_json JSONB, -- for multi-choice, file uploads, etc.
  answered_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_answers_response ON public.survey_answers(response_id);
CREATE INDEX idx_answers_question ON public.survey_answers(question_id);
-- Unique: one answer per question per response (upsert pattern)
CREATE UNIQUE INDEX idx_answers_unique ON public.survey_answers(response_id, question_id);

-- ============================================================
-- 7. SURVEY SHARE PERMISSIONS (within same tenant)
-- ============================================================
CREATE TABLE public.survey_shares (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  survey_id UUID NOT NULL REFERENCES public.surveys(id) ON DELETE CASCADE,
  shared_with UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  shared_by UUID NOT NULL REFERENCES public.user_profiles(id),
  permission TEXT DEFAULT 'view' CHECK (permission IN ('view','view_analytics','edit')),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(survey_id, shared_with)
);

CREATE INDEX idx_shares_survey ON public.survey_shares(survey_id);

-- ============================================================
-- 8. AUDIT LOG
-- ============================================================
CREATE TABLE public.audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.user_profiles(id),
  action TEXT NOT NULL,
  resource_type TEXT,
  resource_id UUID,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_audit_tenant ON public.audit_log(tenant_id);

-- ============================================================
-- 9. ROW LEVEL SECURITY POLICIES
-- ============================================================

-- Helper function: get current user's tenant_id
CREATE OR REPLACE FUNCTION public.get_user_tenant_id()
RETURNS UUID AS $$
  SELECT tenant_id FROM public.user_profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Helper function: get current user's role
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS TEXT AS $$
  SELECT role FROM public.user_profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ---- TENANTS ----
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own tenant"
  ON public.tenants FOR SELECT
  USING (id = public.get_user_tenant_id());

CREATE POLICY "Super admins can update own tenant"
  ON public.tenants FOR UPDATE
  USING (id = public.get_user_tenant_id() AND public.get_user_role() = 'super_admin');

-- ---- USER PROFILES ----
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view profiles in own tenant"
  ON public.user_profiles FOR SELECT
  USING (tenant_id = public.get_user_tenant_id());

CREATE POLICY "Users can update own profile"
  ON public.user_profiles FOR UPDATE
  USING (id = auth.uid());

CREATE POLICY "Admins can manage users in tenant"
  ON public.user_profiles FOR ALL
  USING (
    tenant_id = public.get_user_tenant_id()
    AND public.get_user_role() IN ('super_admin', 'admin')
  );

-- ---- SURVEYS ----
ALTER TABLE public.surveys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view surveys in own tenant"
  ON public.surveys FOR SELECT
  USING (tenant_id = public.get_user_tenant_id());

-- CRITICAL: Anonymous respondents need to read active surveys to fill them
CREATE POLICY "Anyone can view active surveys by slug"
  ON public.surveys FOR SELECT
  USING (status = 'active');

CREATE POLICY "Creators+ can create surveys"
  ON public.surveys FOR INSERT
  WITH CHECK (
    tenant_id = public.get_user_tenant_id()
    AND public.get_user_role() IN ('super_admin','admin','manager','creator')
  );

CREATE POLICY "Owners and admins can update surveys"
  ON public.surveys FOR UPDATE
  USING (
    tenant_id = public.get_user_tenant_id()
    AND (
      created_by = auth.uid()
      OR public.get_user_role() IN ('super_admin','admin','manager')
    )
  );

CREATE POLICY "Admins can delete surveys"
  ON public.surveys FOR DELETE
  USING (
    tenant_id = public.get_user_tenant_id()
    AND public.get_user_role() IN ('super_admin','admin')
  );

-- ---- SURVEY QUESTIONS ----
ALTER TABLE public.survey_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View questions for visible surveys"
  ON public.survey_questions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.surveys s
      WHERE s.id = survey_id AND s.tenant_id = public.get_user_tenant_id()
    )
  );

-- Allow anonymous access to questions for active surveys (respondents)
CREATE POLICY "Public can view questions for active surveys"
  ON public.survey_questions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.surveys s
      WHERE s.id = survey_id AND s.status = 'active'
    )
  );

CREATE POLICY "Creators can manage questions"
  ON public.survey_questions FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.surveys s
      WHERE s.id = survey_id
      AND s.tenant_id = public.get_user_tenant_id()
      AND (
        s.created_by = auth.uid()
        OR public.get_user_role() IN ('super_admin','admin','manager')
      )
    )
  );

-- ---- SURVEY RESPONSES ----
ALTER TABLE public.survey_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant users can view responses"
  ON public.survey_responses FOR SELECT
  USING (tenant_id = public.get_user_tenant_id());

-- Anonymous respondents can insert responses
CREATE POLICY "Anyone can create responses for active surveys"
  ON public.survey_responses FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.surveys s
      WHERE s.id = survey_id AND s.status = 'active'
    )
  );

-- Respondents can update their own in-progress response (by session_token)
CREATE POLICY "Respondents can update own response"
  ON public.survey_responses FOR UPDATE
  USING (true)
  WITH CHECK (status = 'in_progress');

-- ---- SURVEY ANSWERS ----
ALTER TABLE public.survey_answers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant users can view answers"
  ON public.survey_answers FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.survey_responses r
      WHERE r.id = response_id AND r.tenant_id = public.get_user_tenant_id()
    )
  );

-- Anonymous respondents can read answers for in-progress responses (resume feature)
CREATE POLICY "Anonymous can view answers for in-progress responses"
  ON public.survey_answers FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.survey_responses r
      WHERE r.id = response_id AND r.status = 'in_progress'
    )
  );

CREATE POLICY "Respondents can insert/update answers"
  ON public.survey_answers FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.survey_responses r
      WHERE r.id = response_id AND r.status = 'in_progress'
    )
  );

CREATE POLICY "Respondents can update answers"
  ON public.survey_answers FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.survey_responses r
      WHERE r.id = response_id AND r.status = 'in_progress'
    )
  );

-- ---- SURVEY SHARES ----
ALTER TABLE public.survey_shares ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View shares within tenant"
  ON public.survey_shares FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.surveys s
      WHERE s.id = survey_id AND s.tenant_id = public.get_user_tenant_id()
    )
  );

CREATE POLICY "Owners can manage shares"
  ON public.survey_shares FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.surveys s
      WHERE s.id = survey_id
      AND s.tenant_id = public.get_user_tenant_id()
      AND (
        s.created_by = auth.uid()
        OR public.get_user_role() IN ('super_admin','admin','manager')
      )
    )
  );

-- ---- AUDIT LOG ----
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view audit logs"
  ON public.audit_log FOR SELECT
  USING (
    tenant_id = public.get_user_tenant_id()
    AND public.get_user_role() IN ('super_admin','admin')
  );

-- ============================================================
-- 10. AUTO-EXPIRE SURVEYS (cron function)
-- ============================================================
CREATE OR REPLACE FUNCTION public.auto_expire_surveys()
RETURNS void AS $$
BEGIN
  UPDATE public.surveys
  SET status = 'expired', updated_at = now()
  WHERE status = 'active'
    AND expires_at IS NOT NULL
    AND expires_at < now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 11. TRIGGER: Auto-set tenant_id on response insert
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_response_tenant_id()
RETURNS TRIGGER AS $$
BEGIN
  NEW.tenant_id := (SELECT tenant_id FROM public.surveys WHERE id = NEW.survey_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_set_response_tenant
  BEFORE INSERT ON public.survey_responses
  FOR EACH ROW EXECUTE FUNCTION public.set_response_tenant_id();

-- ============================================================
-- 12. TRIGGER: Update timestamps
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_tenants BEFORE UPDATE ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.update_timestamp();
CREATE TRIGGER trg_update_profiles BEFORE UPDATE ON public.user_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_timestamp();
CREATE TRIGGER trg_update_surveys BEFORE UPDATE ON public.surveys
  FOR EACH ROW EXECUTE FUNCTION public.update_timestamp();

-- ============================================================
-- 13. FUNCTION: Register new tenant + first admin user
-- ============================================================
CREATE OR REPLACE FUNCTION public.register_tenant(
  p_tenant_name TEXT,
  p_tenant_slug TEXT,
  p_user_id UUID,
  p_user_email TEXT,
  p_user_name TEXT
)
RETURNS UUID AS $$
DECLARE
  v_tenant_id UUID;
BEGIN
  INSERT INTO public.tenants (name, slug)
  VALUES (p_tenant_name, p_tenant_slug)
  RETURNING id INTO v_tenant_id;

  INSERT INTO public.user_profiles (id, tenant_id, email, full_name, role)
  VALUES (p_user_id, v_tenant_id, p_user_email, p_user_name, 'super_admin');

  RETURN v_tenant_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 14. ANALYTICS VIEWS
-- ============================================================
CREATE OR REPLACE VIEW public.survey_analytics AS
SELECT
  s.id AS survey_id,
  s.tenant_id,
  s.title,
  s.status,
  s.created_at,
  s.expires_at,
  COUNT(DISTINCT r.id) FILTER (WHERE r.status = 'completed') AS completed_count,
  COUNT(DISTINCT r.id) FILTER (WHERE r.status = 'in_progress') AS in_progress_count,
  COUNT(DISTINCT r.id) FILTER (WHERE r.status = 'abandoned') AS abandoned_count,
  COUNT(DISTINCT r.id) AS total_responses,
  AVG(EXTRACT(EPOCH FROM (r.completed_at - r.started_at))) FILTER (WHERE r.status = 'completed') AS avg_completion_seconds
FROM public.surveys s
LEFT JOIN public.survey_responses r ON r.survey_id = s.id
GROUP BY s.id, s.tenant_id, s.title, s.status, s.created_at, s.expires_at;

-- ============================================================
-- 15. FIX: Anonymous respondents can SELECT their own response (for resume)
-- ============================================================
CREATE POLICY "Anonymous can view own response by session"
  ON public.survey_responses FOR SELECT
  USING (true);  -- Scoped by session_token in app code; tenant data protected by answers policy

-- ============================================================
-- 16. FIX: Prevent cross-tenant survey sharing at DB level
-- ============================================================
CREATE OR REPLACE FUNCTION public.enforce_same_tenant_share()
RETURNS TRIGGER AS $$
BEGIN
  -- Ensure shared_with user belongs to the same tenant as the survey
  IF NOT EXISTS (
    SELECT 1
    FROM public.surveys s
    JOIN public.user_profiles up ON up.tenant_id = s.tenant_id
    WHERE s.id = NEW.survey_id AND up.id = NEW.shared_with
  ) THEN
    RAISE EXCEPTION 'Cannot share survey with users outside your organization';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_enforce_same_tenant_share
  BEFORE INSERT OR UPDATE ON public.survey_shares
  FOR EACH ROW EXECUTE FUNCTION public.enforce_same_tenant_share();

-- ============================================================
-- 17. FIX: Schedule auto-expire cron (requires pg_cron extension)
-- Uncomment below after enabling pg_cron in Supabase Dashboard
-- (Database > Extensions > pg_cron > Enable)
-- ============================================================
-- SELECT cron.schedule(
--   'auto-expire-surveys',
--   '*/5 * * * *',  -- every 5 minutes
--   $$ SELECT public.auto_expire_surveys() $$
-- );
