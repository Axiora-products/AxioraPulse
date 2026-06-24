"""
Coverage for the plan/usage gates added for survey limits, bulk-send caps and the
Execute (30-day → expiry) lock. The shared test user is internal and bypasses
these gates, so we exercise the helpers directly with a non-internal user (the
pattern used by test_feature_gate) plus one API call for the inline CA-agent gate.
"""

import uuid
from datetime import datetime, timezone, timedelta

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.main import app
from core import config
from db.database import SessionLocal
from db.models import Tenant, UserProfile, Survey, SurveyStatusEnum, Subscription, Plan, RoleEnum
from routes.surveys import _effective_survey_limit, _assert_within_survey_limit
from routes.users import _enforce_bulk_limit

client = TestClient(app)

# Internal seed user provisioned by conftest (auth_headers resolves to this user).
SEED_COGNITO_SUB = "f1d3ad6a-5031-70d5-9d6a-5013ed87e8d2"


def _seed_user(db):
    return db.query(UserProfile).filter(UserProfile.cognito_sub == SEED_COGNITO_SUB).first()


def test_survey_limit_helpers():
    db = SessionLocal()
    original_disable = config.DISABLE_PAYMENTS
    config.DISABLE_PAYMENTS = False
    tenant = plan = None
    try:
        suffix = uuid.uuid4().hex[:8]
        tenant = Tenant(id=uuid.uuid4(), name=f"Limit Tenant {suffix}", slug=f"limit-{suffix}")
        db.add(tenant)
        user = UserProfile(
            id=uuid.uuid4(),
            email=f"limit-{suffix}@example.com",
            full_name="Limit User",
            tenant_id=tenant.id,
            is_active=True,
            is_internal=False,
            role=RoleEnum.admin,
        )
        db.add(user)
        db.commit()

        # Free tenant (no subscription) → free ceiling, and 0 surveys is within limit.
        assert _effective_survey_limit(db, user) == config.FREE_PLAN_MAX_SURVEYS
        _assert_within_survey_limit(db, user)

        # Create exactly the free number of non-draft surveys.
        ids = []
        for i in range(config.FREE_PLAN_MAX_SURVEYS):
            s = Survey(
                id=uuid.uuid4(),
                title=f"S{i}",
                slug=f"limit-s-{suffix}-{i}",
                tenant_id=tenant.id,
                created_by=user.id,
                status=SurveyStatusEnum.active,
            )
            db.add(s)
            ids.append(s.id)
        db.commit()

        # At the limit → blocked.
        with pytest.raises(HTTPException) as exc:
            _assert_within_survey_limit(db, user)
        assert exc.value.status_code == 403

        # Publishing an existing one excludes itself → back under the limit.
        _assert_within_survey_limit(db, user, exclude_id=ids[0])

        # A paid plan's own max_surveys overrides the free ceiling.
        plan = Plan(
            id=uuid.uuid4(),
            code=f"limit-pro-{suffix}",
            name="Limit Pro",
            price_paise=9900,
            billing_period="monthly",
            max_surveys=5,
            is_active=True,
        )
        db.add(plan)
        db.add(Subscription(id=uuid.uuid4(), tenant_id=tenant.id, plan_id=plan.id, status="active"))
        db.commit()
        assert _effective_survey_limit(db, user) == 5

        # Internal users bypass entirely.
        user.is_internal = True
        db.commit()
        assert _effective_survey_limit(db, user) is None
    finally:
        config.DISABLE_PAYMENTS = original_disable
        db.rollback()
        try:
            if tenant is not None:
                db.query(Tenant).filter(Tenant.id == tenant.id).delete()
            if plan is not None:
                db.query(Plan).filter(Plan.id == plan.id).delete()
            db.commit()
        except Exception:
            db.rollback()
        db.close()


def test_enforce_bulk_limit_branches():
    db = SessionLocal()
    survey_id = uuid.uuid4()
    try:
        user = _seed_user(db)
        db.add(
            Survey(
                id=survey_id,
                title="Bulk Limit",
                slug=f"bulk-{survey_id.hex[:8]}",
                tenant_id=user.tenant_id,
                created_by=user.id,
                status=SurveyStatusEnum.active,
            )
        )
        db.commit()
        sid = str(survey_id)

        # Nothing to reserve → no-op.
        _enforce_bulk_limit(db, sid, "email", 0, 30, 60, "req", "day")

        # Malformed survey_id → 400.
        with pytest.raises(HTTPException) as exc:
            _enforce_bulk_limit(db, "not-a-uuid", "email", 1, 30, 60, "req", "day")
        assert exc.value.status_code == 400

        # Reserve up to the daily cap across two requests (row create then update).
        _enforce_bulk_limit(db, sid, "email", 30, 30, 60, "req", "Daily email limit reached")
        _enforce_bulk_limit(db, sid, "email", 30, 30, 60, "req", "Daily email limit reached")

        # One more recipient exceeds the daily cap → 429.
        with pytest.raises(HTTPException) as exc:
            _enforce_bulk_limit(db, sid, "email", 1, 30, 60, "req", "Daily email limit reached")
        assert exc.value.status_code == 429
    finally:
        try:
            # Cascade removes the bulk_send_usage rows via the survey FK.
            db.query(Survey).filter(Survey.id == survey_id).delete()
            db.commit()
        except Exception:
            db.rollback()
        db.close()


def test_execute_locked_until_expiry(auth_headers):
    db = SessionLocal()
    original_disable = config.DISABLE_PAYMENTS
    config.DISABLE_PAYMENTS = False
    survey_id = uuid.uuid4()
    user = _seed_user(db)
    original_internal = user.is_internal
    try:
        db.add(
            Survey(
                id=survey_id,
                title="Future Expiry",
                slug=f"future-{survey_id.hex[:8]}",
                tenant_id=user.tenant_id,
                created_by=user.id,
                status=SurveyStatusEnum.active,
                expires_at=datetime.now(timezone.utc) + timedelta(days=10),
            )
        )
        # Non-internal so the Execute gate applies.
        user.is_internal = False
        db.commit()

        resp = client.post(f"/ca-agent/surveys/{survey_id}/analyze", json={}, headers=auth_headers)
        assert resp.status_code == 403
        assert "expiry" in resp.json()["detail"].lower()
    finally:
        config.DISABLE_PAYMENTS = original_disable
        user.is_internal = original_internal
        db.commit()
        try:
            db.query(Survey).filter(Survey.id == survey_id).delete()
            db.commit()
        except Exception:
            db.rollback()
        db.close()
