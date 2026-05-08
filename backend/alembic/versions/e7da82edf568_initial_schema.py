"""initial schema

Revision ID: e7da82edf568
Revises:
Create Date: 2026-05-08

Captures the full schema as it existed before Alembic was introduced,
replacing init_db.py + update_db_schema.py.
"""

from typing import Sequence, Union
from alembic import op

revision: str = "e7da82edf568"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE roleenum AS ENUM (
                'super_admin', 'admin', 'manager', 'creator', 'viewer'
            );
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$;

        DO $$ BEGIN
            CREATE TYPE surveystatusenum AS ENUM (
                'draft', 'active', 'paused', 'expired', 'closed'
            );
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$;

        DO $$ BEGIN
            CREATE TYPE questiontypeenum AS ENUM (
                'short_text', 'long_text', 'single_choice', 'multiple_choice',
                'rating', 'scale', 'yes_no', 'dropdown', 'number', 'email',
                'date', 'ranking', 'slider', 'matrix'
            );
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$;

        DO $$ BEGIN
            CREATE TYPE responsestatusenum AS ENUM (
                'in_progress', 'completed', 'abandoned'
            );
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$;

        DO $$ BEGIN
            CREATE TYPE sharepermissionenum AS ENUM (
                'viewer', 'editor'
            );
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$;

        CREATE TABLE IF NOT EXISTS tenants (
            id          UUID PRIMARY KEY,
            name        VARCHAR(255) NOT NULL,
            slug        VARCHAR(100) NOT NULL,
            plan        VARCHAR(50) DEFAULT 'free',
            primary_color VARCHAR(20) DEFAULT '#FF4500',
            approved_domains TEXT[] DEFAULT '{}',
            created_at  TIMESTAMPTZ DEFAULT now(),
            CONSTRAINT uq_tenants_slug UNIQUE (slug)
        );

        CREATE TABLE IF NOT EXISTS user_profiles (
            id                  UUID PRIMARY KEY,
            email               VARCHAR(255) NOT NULL,
            full_name           VARCHAR(255),
            password_hash       VARCHAR(255),
            role                roleenum NOT NULL DEFAULT 'viewer',
            tenant_id           UUID REFERENCES tenants(id) ON DELETE CASCADE,
            is_active           BOOLEAN DEFAULT true,
            account_status      VARCHAR(50) DEFAULT 'active',
            invite_token        VARCHAR(100),
            invite_accepted_at  TIMESTAMPTZ,
            created_at          TIMESTAMPTZ DEFAULT now(),
            CONSTRAINT uq_user_profiles_email UNIQUE (email),
            CONSTRAINT uq_user_profiles_invite_token UNIQUE (invite_token)
        );

        CREATE TABLE IF NOT EXISTS surveys (
            id                UUID PRIMARY KEY,
            title             VARCHAR(500) NOT NULL,
            description       TEXT,
            welcome_message   TEXT,
            thank_you_message TEXT,
            expires_at        TIMESTAMPTZ,
            allow_anonymous   BOOLEAN DEFAULT true,
            require_email     BOOLEAN DEFAULT false,
            show_progress_bar BOOLEAN DEFAULT true,
            theme_color       VARCHAR(20) DEFAULT '#FF4500',
            slug              VARCHAR(50) NOT NULL,
            status            surveystatusenum DEFAULT 'draft',
            tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
            created_by        UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
            created_at        TIMESTAMPTZ DEFAULT now(),
            CONSTRAINT uq_surveys_slug UNIQUE (slug)
        );

        CREATE TABLE IF NOT EXISTS survey_questions (
            id              UUID PRIMARY KEY,
            survey_id       UUID NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
            question_text   TEXT NOT NULL,
            question_type   questiontypeenum NOT NULL,
            options         JSONB,
            is_required     BOOLEAN DEFAULT false,
            description     TEXT,
            sort_order      INTEGER DEFAULT 0,
            validation_rules JSONB,
            created_at      TIMESTAMPTZ DEFAULT now()
        );

        CREATE TABLE IF NOT EXISTS survey_responses (
            id                UUID PRIMARY KEY,
            survey_id         UUID NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
            session_token     VARCHAR(100),
            respondent_email  VARCHAR(255),
            status            responsestatusenum DEFAULT 'in_progress',
            started_at        TIMESTAMPTZ DEFAULT now(),
            completed_at      TIMESTAMPTZ,
            last_saved_at     TIMESTAMPTZ,
            metadata          JSONB,
            CONSTRAINT uq_survey_response_session_token UNIQUE (session_token)
        );

        CREATE TABLE IF NOT EXISTS survey_answers (
            id            UUID PRIMARY KEY,
            response_id   UUID NOT NULL REFERENCES survey_responses(id) ON DELETE CASCADE,
            question_id   UUID NOT NULL REFERENCES survey_questions(id) ON DELETE CASCADE,
            answer_value  TEXT,
            answer_json   JSONB,
            CONSTRAINT uq_answer_response_question UNIQUE (response_id, question_id)
        );

        CREATE TABLE IF NOT EXISTS survey_feedback (
            id           UUID PRIMARY KEY,
            survey_id    UUID NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
            rating       INTEGER,
            comment      TEXT,
            responded_at TIMESTAMPTZ
        );

        CREATE TABLE IF NOT EXISTS survey_shares (
            id          UUID PRIMARY KEY,
            survey_id   UUID NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
            shared_with UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
            permission  sharepermissionenum DEFAULT 'viewer',
            created_at  TIMESTAMPTZ DEFAULT now()
        );
    """)


def downgrade() -> None:
    op.drop_table("survey_shares")
    op.drop_table("survey_feedback")
    op.drop_table("survey_answers")
    op.drop_table("survey_responses")
    op.drop_table("survey_questions")
    op.drop_table("surveys")
    op.drop_table("user_profiles")
    op.drop_table("tenants")

    op.execute("DROP TYPE IF EXISTS sharepermissionenum")
    op.execute("DROP TYPE IF EXISTS responsestatusenum")
    op.execute("DROP TYPE IF EXISTS questiontypeenum")
    op.execute("DROP TYPE IF EXISTS surveystatusenum")
    op.execute("DROP TYPE IF EXISTS roleenum")
