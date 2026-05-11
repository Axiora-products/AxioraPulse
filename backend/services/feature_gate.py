"""
services/feature_gate.py
────────────────────────
Plan-based feature gating.

Usage in a route:
    from services.feature_gate import require_feature, FeatureGate

    @router.post("/surveys/")
    def create_survey(..., _: None = Depends(require_feature("create_survey"))):
        ...
"""

from fastapi import Depends, HTTPException, status
from sqlalchemy.orm import Session

from db.database import get_db
from db.models import UserProfile, Subscription, Plan, Survey, UserProfile
from dependencies import get_current_user


class _FeatureChecker:
    def __init__(self, feature: str):
        self.feature = feature

    def __call__(
        self,
        current_user: UserProfile = Depends(get_current_user),
        db: Session = Depends(get_db),
    ) -> None:
        if current_user.is_internal:
            return

        sub = (
            db.query(Subscription)
            .filter(
                Subscription.tenant_id == current_user.tenant_id,
                Subscription.status == "active",
            )
            .first()
        )

        plan: Plan | None = sub.plan if sub else None

        if self.feature == "ai_insights":
            if not plan or not plan.ai_insights_enabled:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="AI insights require a paid plan. Please upgrade.",
                )

        elif self.feature == "create_survey":
            if plan and plan.max_surveys is not None:
                count = (
                    db.query(Survey)
                    .filter(Survey.tenant_id == current_user.tenant_id)
                    .count()
                )
                if count >= plan.max_surveys:
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail=f"Survey limit reached ({plan.max_surveys}). Please upgrade your plan.",
                    )

        elif self.feature == "add_team_member":
            if plan and plan.max_team_members is not None:
                count = (
                    db.query(UserProfile)
                    .filter(UserProfile.tenant_id == current_user.tenant_id)
                    .count()
                )
                if count >= plan.max_team_members:
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail=f"Team member limit reached ({plan.max_team_members}). Please upgrade your plan.",
                    )


def require_feature(feature: str) -> _FeatureChecker:
    return _FeatureChecker(feature)
