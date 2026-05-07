"""
routes/users.py
───────────────
GET    /users/          — List team members (tenant-scoped)
POST   /users/invite    — Invite a new user to the tenant
PATCH  /users/{id}/role — Change a user's role
PATCH  /users/{id}/status — Activate / deactivate
DELETE /users/{id}      — Delete user (super_admin only)
PATCH  /users/{id}/accept-invite — Set password + activate invited user
GET    /users/{id}      — Get single user profile
"""

import uuid
import secrets
import os
from schemas import BulkInviteRequest
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload
from services.email_service import send_email
from slowapi.util import get_remote_address
from fastapi import Request
from core.rate_limiter import limiter
from db.database import get_db
from db.models import UserProfile, RoleEnum
from schemas import (
    UserProfileOut, InviteRequest, UserRoleUpdate,
    UserStatusUpdate, AcceptInviteRequest, MessageResponse,
)
from auth_utils import hash_password
from dependencies import get_current_user

router = APIRouter(prefix="/users", tags=["users"])

FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")

# Roles that allow inviting / managing users
MANAGER_ROLES = {RoleEnum.super_admin, RoleEnum.admin, RoleEnum.manager}


def _require_manager(current_user: UserProfile):
    if current_user.role not in MANAGER_ROLES:
        raise HTTPException(status_code=403, detail="Insufficient permissions")


@router.get("/", response_model=list[UserProfileOut])
def list_users(
    current_user: UserProfile = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return all users in the caller's tenant (TeamManagement.jsx)."""
    users = (
        db.query(UserProfile)
        .filter(UserProfile.tenant_id == current_user.tenant_id)
        .order_by(UserProfile.created_at)
        .all()
    )
    return [UserProfileOut.model_validate(u) for u in users]


@router.get("/{user_id}", response_model=UserProfileOut)
def get_user(
    user_id: str,
    current_user: UserProfile = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user = db.query(UserProfile).filter(
        UserProfile.id == user_id,
        UserProfile.tenant_id == current_user.tenant_id,
    ).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return UserProfileOut.model_validate(user)

@router.post("/invite", response_model=UserProfileOut, status_code=status.HTTP_200_OK)
@limiter.limit("3/minute")
def invite_user(
    request: Request,
    body: InviteRequest,
    current_user: UserProfile = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Invite or re-invite a user.

    - New user → create + send email
    - Already invited → resend email
    - Already active → block
    """
    _require_manager(current_user)

    # 🔍 Check if user already exists
    existing = db.query(UserProfile).filter(
        UserProfile.email == body.email,
        UserProfile.tenant_id == current_user.tenant_id,
    ).first()

    # 🟡 CASE 1: Already exists
    if existing:
        if existing.account_status == "invited":
            # 🔁 RESEND INVITE

            # Generate new token (recommended)
            existing.invite_token = secrets.token_urlsafe(32)
            db.commit()
            db.refresh(existing)

            invite_link = f"{FRONTEND_URL}/accept-invite/{existing.invite_token}"

            try:
                send_email(
                    to_email=existing.email,
                    subject="You're invited to Axiora Pulse 🚀 (Reminder)",
                    body=f"""
                    <h3>Hello {existing.full_name or 'User'},</h3>
                    <p>This is a reminder to join Axiora Pulse.</p>
                    <p>Click below to accept your invite:</p>
                    <a href="{invite_link}">Accept Invite</a>
                    """
                )
            except Exception as e:
                print("Email failed:", str(e))

            return UserProfileOut.model_validate(existing)

        else:
            # 🔴 Already active user
            raise HTTPException(
                status_code=400,
                detail="User already exists in your team"
            )

    # 🟢 CASE 2: New user → create
    try:
        role = RoleEnum(body.role)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid role: {body.role}")

    new_user = UserProfile(
        id=uuid.uuid4(),
        email=body.email,
        full_name=body.full_name,
        password_hash=None,
        role=role,
        tenant_id=current_user.tenant_id,
        is_active=True,
        account_status="invited",
        invite_token=secrets.token_urlsafe(32),
    )

    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    invite_link = f"{FRONTEND_URL}/accept-invite/{new_user.invite_token}"

    try:
        send_email(
            to_email=new_user.email,
            subject="You're invited to Nexora Pulse 🚀",
            body=f"""
            <h3>Hello {new_user.full_name or 'User'},</h3>
            <p>You have been invited to join Nexora Pulse.</p>
            <p>Click below to accept your invite:</p>
            <a href="{invite_link}">Accept Invite</a>
            """
        )
    except Exception as e:
        print("Email failed:", str(e))

    return UserProfileOut.model_validate(new_user)

import time

@router.post("/bulk-invite")
@limiter.limit("2/minute")
def bulk_invite(
    request: Request,
    body: BulkInviteRequest,
    current_user: UserProfile = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _require_manager(current_user)

    results = []

    for email in body.emails:

        existing = db.query(UserProfile).filter(
            UserProfile.email == email,
            UserProfile.tenant_id == current_user.tenant_id,
        ).first()

        # 🔁 Already invited → resend
        if existing and existing.account_status == "invited":

            existing.invite_token = secrets.token_urlsafe(32)
            db.commit()
            db.refresh(existing)

            invite_link = f"{FRONTEND_URL}/accept-invite/{existing.invite_token}"

            try:
                send_email(
                    to_email=email,
                    subject="You're invited (Reminder) 🚀",
                    body=f"""
                    <h3>Hello {existing.full_name or 'User'},</h3>
                    <p>This is a reminder to join Axiora Pulse.</p>
                    <a href="{invite_link}">Accept Invite</a>
                    """
                )
                results.append({"email": email, "status": "resent"})
            except Exception:
                results.append({"email": email, "status": "failed"})

            time.sleep(1)
            continue

        # ❌ Already active
        if existing:
            results.append({"email": email, "status": "already exists"})
            continue

        # 🆕 New user
        new_user = UserProfile(
            id=uuid.uuid4(),
            email=email,
            full_name=None,
            password_hash=None,
            role=RoleEnum(body.role),
            tenant_id=current_user.tenant_id,
            is_active=True,
            account_status="invited",
            invite_token=secrets.token_urlsafe(32),
        )

        db.add(new_user)
        db.commit()
        db.refresh(new_user)

        invite_link = f"{FRONTEND_URL}/accept-invite/{new_user.invite_token}"

        try:
            send_email(
                to_email=email,
                subject="You're invited 🚀",
                body=f"""
                <h3>Hello,</h3>
                <p>You are invited to Axiora Pulse.</p>
                <a href="{invite_link}">Accept Invite</a>
                """
            )
            results.append({"email": email, "status": "sent"})
        except Exception:
            results.append({"email": email, "status": "failed"})

        time.sleep(1)  # ⚠️ prevent Gmail blocking

    return {"results": results}

@router.patch("/{user_id}/role", response_model=UserProfileOut)
def update_role(
    user_id: str,
    body: UserRoleUpdate,
    current_user: UserProfile = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update a user's role (TeamManagement.jsx)."""
    _require_manager(current_user)

    user = db.query(UserProfile).filter(
        UserProfile.id == user_id,
        UserProfile.tenant_id == current_user.tenant_id,
    ).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    try:
        user.role = RoleEnum(body.role)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid role: {body.role}")

    db.commit()
    db.refresh(user)
    return UserProfileOut.model_validate(user)


@router.patch("/{user_id}/status", response_model=UserProfileOut)
def update_status(
    user_id: str,
    body: UserStatusUpdate,
    current_user: UserProfile = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Activate or deactivate a user (TeamManagement.jsx)."""
    _require_manager(current_user)

    user = db.query(UserProfile).filter(
        UserProfile.id == user_id,
        UserProfile.tenant_id == current_user.tenant_id,
    ).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.is_active = body.is_active
    db.commit()
    db.refresh(user)
    return UserProfileOut.model_validate(user)


@router.delete("/{user_id}", response_model=MessageResponse)
def delete_user(
    user_id: str,
    current_user: UserProfile = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Hard-delete a user.  Only super_admin can delete.
    Replaces the Netlify delete-user function.
    """
    if current_user.role != RoleEnum.super_admin:
        raise HTTPException(status_code=403, detail="Only super_admin can delete users")

    user = db.query(UserProfile).filter(
        UserProfile.id == user_id,
        UserProfile.tenant_id == current_user.tenant_id,
    ).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Prevent self-deletion
    if str(user.id) == str(current_user.id):
        raise HTTPException(status_code=400, detail="Cannot delete your own account")

    db.delete(user)
    db.commit()
    return {"message": "User deleted successfully"}


@router.patch("/accept-invite", response_model=MessageResponse)
def accept_invite(
    token: str,
    body: AcceptInviteRequest,
    db: Session = Depends(get_db),
):
    """
    Called from AcceptInvite.jsx after the invited user enters their
    name + password. Validates via invite_token.
    """
    user = db.query(UserProfile).filter(UserProfile.invite_token == token).first()
    if not user:
        raise HTTPException(status_code=404, detail="Invalid or expired invitation token")
    
    if user.account_status != "invited":
        raise HTTPException(status_code=400, detail="User is already active")

    from datetime import datetime, timezone
    user.full_name = body.full_name.strip()
    user.password_hash = hash_password(body.password)
    user.account_status = "active"
    user.invite_token = None # Clear token after use
    user.invite_accepted_at = datetime.now(timezone.utc)
    db.commit()
    return {"message": "Invite accepted. Account is now active."}


@router.get("/invite-info/{token}")
def get_invite_info(
    token: str,
    db: Session = Depends(get_db),
):
    """
    Public endpoint to fetch user/tenant info based on an invite token.
    Used by AcceptInvite.jsx to show "Join Organisation" details.
    """
    user = (
        db.query(UserProfile)
        .options(joinedload(UserProfile.tenant))
        .filter(UserProfile.invite_token == token)
        .first()
    )
    if not user or user.account_status != "invited":
        raise HTTPException(status_code=404, detail="Invalid or expired invitation token")

    return {
        "email": user.email,
        "full_name": user.full_name,
        "tenant_name": user.tenant.name if user.tenant else "NexoraPulse",
        "role": user.role.value if hasattr(user.role, "value") else str(user.role),
    }
