"""
db/models.py
────────────
SQLAlchemy ORM models for NexoraPulse.
All tables use UUID primary keys and mirror the Supabase schema exactly
so the frontend data shapes remain unchanged.
"""

import uuid
from sqlalchemy import (
    Column, String, Boolean, DateTime, Integer, Text,
    ForeignKey, Enum as SAEnum, UniqueConstraint, ARRAY
)
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from db.database import Base
from datetime import datetime

import enum


# ── Enumerations ──────────────────────────────────────────────────────────────

class RoleEnum(str, enum.Enum):
    super_admin = "super_admin"
    admin       = "admin"
    manager     = "manager"
    creator     = "creator"
    viewer      = "viewer"


class SurveyStatusEnum(str, enum.Enum):
    draft   = "draft"
    active  = "active"
    paused  = "paused"
    expired = "expired"
    closed  = "closed"


class QuestionTypeEnum(str, enum.Enum):
    short_text      = "short_text"
    long_text       = "long_text"
    single_choice   = "single_choice"
    multiple_choice = "multiple_choice"
    rating          = "rating"
    scale           = "scale"
    yes_no          = "yes_no"
    dropdown        = "dropdown"
    number          = "number"
    email           = "email"
    date            = "date"
    ranking         = "ranking"
    slider          = "slider"
    matrix          = "matrix"


class ResponseStatusEnum(str, enum.Enum):
    in_progress = "in_progress"
    completed   = "completed"
    abandoned   = "abandoned"


class SharePermissionEnum(str, enum.Enum):
    viewer = "viewer"
    editor = "editor"


# ── Models ────────────────────────────────────────────────────────────────────

class Tenant(Base):
    """
    Represents an organisation / workspace.
    Every user_profile belongs to exactly one tenant.
    """
    __tablename__ = "tenants"

    id              = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name            = Column(String(255), nullable=False)
    slug            = Column(String(100), unique=True,index=True,nullable=False)
    plan            = Column(String(50), default="free")
    primary_color   = Column(String(20), default="#FF4500")
    approved_domains = Column(ARRAY(Text), default=[])
    created_at      = Column(DateTime(timezone=True), server_default=func.now())

    # relationships
    users    = relationship("UserProfile", back_populates="tenant", cascade="all, delete-orphan")
    surveys  = relationship("Survey", back_populates="tenant", cascade="all, delete-orphan")


class UserProfile(Base):
    """
    Stores all user data.  The `id` is also the authentication identity
    (stored in the JWT `sub` claim), so there is no separate auth table.
    """
    __tablename__ = "user_profiles"

    id                 = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email              = Column(String(255), unique=True,index=True, nullable=False)
    full_name          = Column(String(255), nullable=True)
    password_hash      = Column(String(255), nullable=True)   # nullable for invited-but-not-yet-setup users
    role               = Column(SAEnum(RoleEnum), nullable=False, default=RoleEnum.viewer)
    tenant_id          = Column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"),index=True, nullable=True)
    is_active          = Column(Boolean, default=True)
    account_status     = Column(String(50), default="active")  # 'active' | 'invited'
    invite_token       = Column(String(100), unique=True, nullable=True)
    invite_accepted_at = Column(DateTime(timezone=True), nullable=True)
    created_at         = Column(DateTime(timezone=True), server_default=func.now())

    # relationships
    tenant            = relationship("Tenant", back_populates="users")
    surveys_created   = relationship("Survey", back_populates="creator", foreign_keys="Survey.created_by")


class Survey(Base):
    """
    A survey belongs to a tenant and is created by a user.
    """
    __tablename__ = "surveys"

    id                = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title             = Column(String(500), nullable=False)
    description       = Column(Text, nullable=True)
    welcome_message   = Column(Text, nullable=True)
    thank_you_message = Column(Text, nullable=True)
    expires_at        = Column(DateTime(timezone=True), nullable=True)
    allow_anonymous   = Column(Boolean, default=True)
    require_email     = Column(Boolean, default=False)
    show_progress_bar = Column(Boolean, default=True)
    theme_color       = Column(String(20), default="#FF4500")
    slug              = Column(String(50), unique=True, nullable=False)
    status            = Column(SAEnum(SurveyStatusEnum), default=SurveyStatusEnum.draft)
    tenant_id         = Column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    created_by        = Column(UUID(as_uuid=True), ForeignKey("user_profiles.id", ondelete="SET NULL"), nullable=True)
    created_at        = Column(DateTime(timezone=True), server_default=func.now())

    # relationships
    tenant    = relationship("Tenant", back_populates="surveys")
    creator   = relationship("UserProfile", back_populates="surveys_created", foreign_keys=[created_by])
    questions = relationship("SurveyQuestion", back_populates="survey", cascade="all, delete-orphan", order_by="SurveyQuestion.sort_order")
    responses = relationship("SurveyResponse", back_populates="survey", cascade="all, delete-orphan")
    feedbacks = relationship("SurveyFeedback", back_populates="survey", cascade="all, delete-orphan")
    shares    = relationship("SurveyShare", back_populates="survey", cascade="all, delete-orphan")


class SurveyQuestion(Base):
    """
    An individual question inside a survey.
    `options` is JSONB — can be a list of {label, value} objects or
    a {rows: [...], columns: [...]} object for matrix questions.
    """
    __tablename__ = "survey_questions"

    id               = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    survey_id        = Column(UUID(as_uuid=True), ForeignKey("surveys.id", ondelete="CASCADE"), nullable=False)
    question_text    = Column(Text, nullable=False)
    question_type    = Column(SAEnum(QuestionTypeEnum), nullable=False)
    options          = Column(JSONB, nullable=True)
    is_required      = Column(Boolean, default=False)
    description      = Column(Text, nullable=True)
    sort_order       = Column(Integer, default=0)
    validation_rules = Column(JSONB, nullable=True)
    created_at       = Column(DateTime(timezone=True), server_default=func.now())

    # relationships
    survey  = relationship("Survey", back_populates="questions")
    answers = relationship("SurveyAnswer", back_populates="question", cascade="all, delete-orphan")


class SurveyResponse(Base):
    """
    One respondent's response session for a survey.
    `session_token` is a browser-generated random token stored in localStorage
    so respondents can resume an in-progress response.
    """
    __tablename__ = "survey_responses"

    id                = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    survey_id         = Column(UUID(as_uuid=True), ForeignKey("surveys.id", ondelete="CASCADE"),index=True, nullable=False)
    session_token     = Column(String(100), nullable=True)
    respondent_email  = Column(String(255), nullable=True)
    status            = Column(SAEnum(ResponseStatusEnum), default=ResponseStatusEnum.in_progress)
    started_at        = Column(DateTime(timezone=True), server_default=func.now())
    completed_at      = Column(DateTime(timezone=True), nullable=True)
    last_saved_at     = Column(DateTime(timezone=True), nullable=True)
    response_metadata = Column("metadata", JSONB, nullable=True)

    # demographics
    age_range = Column(String(50), nullable=True)
    gender = Column(String(50), nullable=True)
    occupation = Column(String(100), nullable=True)
    city = Column(String(100), nullable=True)

    __table_args__ = (
        UniqueConstraint("session_token", name="uq_survey_response_session_token"),
    )

    # relationships
    survey  = relationship("Survey", back_populates="responses")
    survey_answers = relationship("SurveyAnswer", back_populates="response", cascade="all, delete-orphan")


class SurveyAnswer(Base):
    """
    One answer for one question in one response session.
    `answer_json` holds structured data (arrays, objects) for multi-select,
    ranking and matrix questions. `answer_value` holds scalar values.
    """
    __tablename__ = "survey_answers"

    id           = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    response_id  = Column(UUID(as_uuid=True), ForeignKey("survey_responses.id", ondelete="CASCADE"),index=True, nullable=False)
    question_id  = Column(UUID(as_uuid=True), ForeignKey("survey_questions.id", ondelete="CASCADE"), nullable=False)
    answer_value = Column(Text, nullable=True)
    answer_json  = Column(JSONB, nullable=True)

    __table_args__ = (
        UniqueConstraint("response_id", "question_id", name="uq_answer_response_question"),
    )

    # relationships
    response = relationship("SurveyResponse", back_populates="survey_answers")
    question = relationship("SurveyQuestion", back_populates="answers")


class SurveyFeedback(Base):
    """
    Post-survey meta-feedback collected on the thank-you screen.
    Separate from survey_answers so it doesn't pollute response analytics.
    """
    __tablename__ = "survey_feedback"

    id           = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    survey_id    = Column(UUID(as_uuid=True), ForeignKey("surveys.id", ondelete="CASCADE"), nullable=False)
    rating       = Column(Integer, nullable=True)
    comment      = Column(Text, nullable=True)
    responded_at = Column(DateTime(timezone=True), nullable=True)

    # relationships
    survey = relationship("Survey", back_populates="feedbacks")


class SurveyShare(Base):
    """
    Tracks which users have been granted explicit access to a survey.
    Used for team sharing in SurveyEdit.jsx.
    """
    __tablename__ = "survey_shares"

    id           = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    survey_id    = Column(UUID(as_uuid=True), ForeignKey("surveys.id", ondelete="CASCADE"), nullable=False)
    shared_with  = Column(UUID(as_uuid=True), ForeignKey("user_profiles.id", ondelete="CASCADE"), nullable=False)
    permission   = Column(SAEnum(SharePermissionEnum), default=SharePermissionEnum.viewer)
    created_at   = Column(DateTime(timezone=True), server_default=func.now())

    # relationships
    survey = relationship("Survey", back_populates="shares")
    user   = relationship("UserProfile")

class DemoSchedule(Base):
    __tablename__ = "demo_schedules"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))

    name = Column(String, nullable=False)
    email = Column(String, nullable=False)

    # demo booking details
    demo_date = Column(String, nullable=False)
    time_slot = Column(String, nullable=False)

    # assigned meet link
    meeting_link = Column(String, nullable=False)

    # booking status
    status = Column(String, default="scheduled")

    created_at = Column(DateTime, default=datetime.utcnow)
