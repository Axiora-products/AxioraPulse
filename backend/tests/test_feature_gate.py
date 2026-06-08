import pytest
from fastapi import HTTPException
from services.feature_gate import require_feature
from db.database import SessionLocal
from db.models import UserProfile, Tenant, Subscription, Plan, RoleEnum
import uuid


def test_feature_gate_by_calling():
    db = SessionLocal()
    try:
        # Create a temporary tenant, plan, and user to avoid interfering with seed data
        tenant = Tenant(id=uuid.uuid4(), name="Feature Gate Tenant", slug="fg-tenant")
        db.add(tenant)

        # Plan with limits
        plan = Plan(
            id=uuid.uuid4(),
            code="fg-pro",
            name="FG Pro",
            price_paise=9900,
            billing_period="monthly",
            ai_insights_enabled=False,
            max_surveys=1,
            max_team_members=2,
            is_active=True,
        )
        db.add(plan)

        user = UserProfile(
            id=uuid.uuid4(),
            email="fg-user@example.com",
            full_name="FG User",
            tenant_id=tenant.id,
            is_active=True,
            is_internal=False,
            role=RoleEnum.admin,
        )
        db.add(user)
        db.commit()

        # Import config and save original values
        from core import config

        original_disable = config.DISABLE_PAYMENTS
        config.DISABLE_PAYMENTS = False

        # 1. Test when payments are disabled (should pass regardless)
        config.DISABLE_PAYMENTS = True
        checker = require_feature("ai_insights")
        checker(current_user=user, db=db)  # should not raise

        config.DISABLE_PAYMENTS = False

        # 2. Test ai_insights when there's no subscription (should raise 403)
        with pytest.raises(HTTPException) as exc:
            checker(current_user=user, db=db)
        assert exc.value.status_code == 403
        assert "AI insights require a paid plan" in exc.value.detail

        # 3. Add active subscription but with insights disabled
        sub = Subscription(id=uuid.uuid4(), tenant_id=tenant.id, plan_id=plan.id, status="active")
        db.add(sub)
        db.commit()

        with pytest.raises(HTTPException) as exc:
            checker(current_user=user, db=db)
        assert exc.value.status_code == 403

        # 4. Enable insights on the plan and check it passes
        plan.ai_insights_enabled = True
        db.commit()
        checker(current_user=user, db=db)  # should pass now

        # 5. Test create_survey limits
        survey_checker = require_feature("create_survey")
        survey_checker(current_user=user, db=db)  # count = 0, max = 1 (should pass)

        # Create a survey
        from db.models import Survey, SurveyStatusEnum

        survey = Survey(
            id=uuid.uuid4(),
            title="FG Survey",
            slug="fg-survey",
            tenant_id=tenant.id,
            created_by=user.id,
            status=SurveyStatusEnum.draft,
        )
        db.add(survey)
        db.commit()

        # Should raise 403 now because count = 1, max = 1
        with pytest.raises(HTTPException) as exc:
            survey_checker(current_user=user, db=db)
        assert exc.value.status_code == 403
        assert "Survey limit reached" in exc.value.detail

        # 6. Test add_team_member limits
        member_checker = require_feature("add_team_member")
        member_checker(current_user=user, db=db)  # count = 1, max = 2 (should pass)

        # Add another team member
        user2 = UserProfile(
            id=uuid.uuid4(),
            email="fg-user2@example.com",
            full_name="FG User 2",
            tenant_id=tenant.id,
            is_active=True,
            is_internal=False,
            role=RoleEnum.viewer,
        )
        db.add(user2)
        db.commit()

        # Should raise 403 now because count = 2, max = 2
        with pytest.raises(HTTPException) as exc:
            member_checker(current_user=user, db=db)
        assert exc.value.status_code == 403
        assert "Team member limit reached" in exc.value.detail

        # Restore config
        config.DISABLE_PAYMENTS = original_disable

    finally:
        # Clean up all created test entities
        # Note: cascade delete from tenant will clean up users and surveys and subscriptions
        db.delete(tenant)
        db.delete(plan)
        db.commit()
        db.close()
