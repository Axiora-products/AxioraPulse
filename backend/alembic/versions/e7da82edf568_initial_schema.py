"""initial schema

Revision ID: e7da82edf568
Revises:
Create Date: 2026-05-08

Captures the full schema as it existed before Alembic was introduced,
replacing init_db.py + update_db_schema.py.
"""

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB

revision: str = "e7da82edf568"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── Enums ────────────────────────────────────────────────────────────────
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE roleenum AS ENUM (
                'super_admin', 'admin', 'manager', 'creator', 'viewer'
            );
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$;
    """)
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE surveystatusenum AS ENUM (
                'draft', 'active', 'paused', 'expired', 'closed'
            );
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$;
    """)
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE questiontypeenum AS ENUM (
                'short_text', 'long_text', 'single_choice', 'multiple_choice',
                'rating', 'scale', 'yes_no', 'dropdown', 'number', 'email',
                'date', 'ranking', 'slider', 'matrix'
            );
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$;
    """)
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE responsestatusenum AS ENUM (
                'in_progress', 'completed', 'abandoned'
            );
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$;
    """)
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE sharepermissionenum AS ENUM (
                'viewer', 'editor'
            );
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$;
    """)

    # ── tenants ───────────────────────────────────────────────────────────────
    op.create_table(
        "tenants",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("slug", sa.String(100), nullable=False),
        sa.Column("plan", sa.String(50), server_default="free"),
        sa.Column("primary_color", sa.String(20), server_default="#FF4500"),
        sa.Column("approved_domains", sa.ARRAY(sa.Text), server_default="{}"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("slug", name="uq_tenants_slug"),
    )

    # ── user_profiles ─────────────────────────────────────────────────────────
    op.create_table(
        "user_profiles",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("full_name", sa.String(255), nullable=True),
        sa.Column("password_hash", sa.String(255), nullable=True),
        sa.Column(
            "role",
            sa.Enum("super_admin", "admin", "manager", "creator", "viewer",
                    name="roleenum", create_type=False),
            nullable=False,
            server_default="viewer",
        ),
        sa.Column("tenant_id", UUID(as_uuid=True),
                  sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=True),
        sa.Column("is_active", sa.Boolean, server_default="true"),
        sa.Column("account_status", sa.String(50), server_default="active"),
        sa.Column("invite_token", sa.String(100), nullable=True),
        sa.Column("invite_accepted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("email", name="uq_user_profiles_email"),
        sa.UniqueConstraint("invite_token", name="uq_user_profiles_invite_token"),
    )

    # ── surveys ───────────────────────────────────────────────────────────────
    op.create_table(
        "surveys",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("title", sa.String(500), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("welcome_message", sa.Text, nullable=True),
        sa.Column("thank_you_message", sa.Text, nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("allow_anonymous", sa.Boolean, server_default="true"),
        sa.Column("require_email", sa.Boolean, server_default="false"),
        sa.Column("show_progress_bar", sa.Boolean, server_default="true"),
        sa.Column("theme_color", sa.String(20), server_default="#FF4500"),
        sa.Column("slug", sa.String(50), nullable=False),
        sa.Column(
            "status",
            sa.Enum("draft", "active", "paused", "expired", "closed",
                    name="surveystatusenum", create_type=False),
            server_default="draft",
        ),
        sa.Column("tenant_id", UUID(as_uuid=True),
                  sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_by", UUID(as_uuid=True),
                  sa.ForeignKey("user_profiles.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("slug", name="uq_surveys_slug"),
    )

    # ── survey_questions ──────────────────────────────────────────────────────
    op.create_table(
        "survey_questions",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("survey_id", UUID(as_uuid=True),
                  sa.ForeignKey("surveys.id", ondelete="CASCADE"), nullable=False),
        sa.Column("question_text", sa.Text, nullable=False),
        sa.Column(
            "question_type",
            sa.Enum("short_text", "long_text", "single_choice", "multiple_choice",
                    "rating", "scale", "yes_no", "dropdown", "number", "email",
                    "date", "ranking", "slider", "matrix",
                    name="questiontypeenum", create_type=False),
            nullable=False,
        ),
        sa.Column("options", JSONB, nullable=True),
        sa.Column("is_required", sa.Boolean, server_default="false"),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("sort_order", sa.Integer, server_default="0"),
        sa.Column("validation_rules", JSONB, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # ── survey_responses ──────────────────────────────────────────────────────
    op.create_table(
        "survey_responses",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("survey_id", UUID(as_uuid=True),
                  sa.ForeignKey("surveys.id", ondelete="CASCADE"), nullable=False),
        sa.Column("session_token", sa.String(100), nullable=True),
        sa.Column("respondent_email", sa.String(255), nullable=True),
        sa.Column(
            "status",
            sa.Enum("in_progress", "completed", "abandoned",
                    name="responsestatusenum", create_type=False),
            server_default="in_progress",
        ),
        sa.Column("started_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_saved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("metadata", JSONB, nullable=True),
        sa.UniqueConstraint("session_token", name="uq_survey_response_session_token"),
    )

    # ── survey_answers ────────────────────────────────────────────────────────
    op.create_table(
        "survey_answers",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("response_id", UUID(as_uuid=True),
                  sa.ForeignKey("survey_responses.id", ondelete="CASCADE"), nullable=False),
        sa.Column("question_id", UUID(as_uuid=True),
                  sa.ForeignKey("survey_questions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("answer_value", sa.Text, nullable=True),
        sa.Column("answer_json", JSONB, nullable=True),
        sa.UniqueConstraint("response_id", "question_id", name="uq_answer_response_question"),
    )

    # ── survey_feedback ───────────────────────────────────────────────────────
    op.create_table(
        "survey_feedback",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("survey_id", UUID(as_uuid=True),
                  sa.ForeignKey("surveys.id", ondelete="CASCADE"), nullable=False),
        sa.Column("rating", sa.Integer, nullable=True),
        sa.Column("comment", sa.Text, nullable=True),
        sa.Column("responded_at", sa.DateTime(timezone=True), nullable=True),
    )

    # ── survey_shares ─────────────────────────────────────────────────────────
    op.create_table(
        "survey_shares",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("survey_id", UUID(as_uuid=True),
                  sa.ForeignKey("surveys.id", ondelete="CASCADE"), nullable=False),
        sa.Column("shared_with", UUID(as_uuid=True),
                  sa.ForeignKey("user_profiles.id", ondelete="CASCADE"), nullable=False),
        sa.Column(
            "permission",
            sa.Enum("viewer", "editor", name="sharepermissionenum", create_type=False),
            server_default="viewer",
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )


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
