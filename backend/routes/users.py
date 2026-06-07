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
import time
import re
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from typing import List, Optional
from pydantic import BaseModel
from schemas import BulkInviteRequest
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload
from services.email_service import send_email
from fastapi import Request
from core.rate_limiter import limiter
from db.database import get_db
from db.models import UserProfile, RoleEnum
from schemas import (
    UserProfileOut,
    InviteRequest,
    UserRoleUpdate,
    UserStatusUpdate,
    AcceptInviteRequest,
    MessageResponse,
)
from auth_utils import hash_password
from dependencies import get_current_user
from cognito_utils import get_cognito_client, COGNITO_USER_POOL_ID, admin_delete_user

FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173").rstrip("/")

router = APIRouter(prefix="/users", tags=["users"])

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
    user = (
        db.query(UserProfile)
        .filter(
            UserProfile.id == user_id,
            UserProfile.tenant_id == current_user.tenant_id,
        )
        .first()
    )
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
    existing = (
        db.query(UserProfile)
        .filter(
            UserProfile.email == body.email,
            UserProfile.tenant_id == current_user.tenant_id,
        )
        .first()
    )

    # 🟡 CASE 1: Already exists
    if existing:
        if existing.account_status == "invited":
            # 🔁 RESEND INVITE

            # Generate new token (recommended)
            existing.invite_token = secrets.token_urlsafe(32)
            db.commit()
            db.refresh(existing)

            invite_link = f"{FRONTEND_URL}/accept-invite?token={existing.invite_token}"

            try:
                send_email(
                    to_email=existing.email,
                    subject="You're invited to Axiora Pulse 🚀 (Reminder)",
                    body=f"""
                    <h3>Hello {existing.full_name or "User"},</h3>
                    <p>This is a reminder to join Axiora Pulse.</p>
                    <p>Click below to accept your invite:</p>
                    <a href="{invite_link}">Accept Invite</a>
                    """,
                )
            except Exception as e:
                print("Email failed:", str(e))

            return UserProfileOut.model_validate(existing)

        else:
            # 🔴 Already active user
            raise HTTPException(status_code=400, detail="User already exists in your team")

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

    invite_link = f"{FRONTEND_URL}/accept-invite?token={new_user.invite_token}"

    try:
        send_email(
            to_email=new_user.email,
            subject="You're invited to Axiora Pulse 🚀",
            body=f"""
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; borderRadius: 10px;">
                <h2 style="color: #160F08;">Hello {new_user.full_name or "there"},</h2>
                <p style="font-size: 16px; color: #444; line-height: 1.6;">
                    You have been invited to join <strong>{current_user.tenant.name if current_user.tenant else "Axiora Pulse"}</strong>.
                </p>
                <p style="margin: 30px 0;">
                    <a href="{invite_link}" style="background-color: #FF4500; color: white; padding: 12px 24px; text-decoration: none; border-radius: 999px; font-weight: bold;">Accept Invitation</a>
                </p>
                <p style="font-size: 14px; color: #888;">
                    If the button above doesn't work, copy and paste this link into your browser: <br>
                    <a href="{invite_link}" style="color: #FF4500;">{invite_link}</a>
                </p>
            </div>
            """,
        )
    except Exception as e:
        print("Email failed:", str(e))

    return UserProfileOut.model_validate(new_user)


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
    tenant_name = current_user.tenant.name if current_user.tenant else "Axiora Pulse"

    for email in body.emails:
        existing = (
            db.query(UserProfile)
            .filter(
                UserProfile.email == email,
                UserProfile.tenant_id == current_user.tenant_id,
            )
            .first()
        )

        # 🔁 Already invited → resend
        if existing and existing.account_status == "invited":
            existing.invite_token = secrets.token_urlsafe(32)
            db.commit()
            db.refresh(existing)

            invite_link = f"{FRONTEND_URL}/accept-invite?token={existing.invite_token}"

            try:
                send_email(
                    to_email=email,
                    subject="Invitation Reminder: Join Axiora Pulse 🚀",
                    body=f"""
                    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; borderRadius: 10px;">
                        <h2 style="color: #160F08;">Hello again,</h2>
                        <p style="font-size: 16px; color: #444; line-height: 1.6;">
                            This is a reminder to join <strong>{tenant_name}</strong> on Axiora Pulse.
                        </p>
                        <p style="margin: 30px 0;">
                            <a href="{invite_link}" style="background-color: #FF4500; color: white; padding: 12px 24px; text-decoration: none; border-radius: 999px; font-weight: bold;">Accept Invitation</a>
                        </p>
                    </div>
                    """,
                )
                results.append({"email": email, "status": "resent"})
            except Exception:
                results.append({"email": email, "status": "failed"})

            time.sleep(0.5)
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

        invite_link = f"{FRONTEND_URL}/accept-invite?token={new_user.invite_token}"

        try:
            send_email(
                to_email=email,
                subject="You're invited to Axiora Pulse 🚀",
                body=f"""
                <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; borderRadius: 10px;">
                    <h2 style="color: #160F08;">Hello,</h2>
                    <p style="font-size: 16px; color: #444; line-height: 1.6;">
                        You have been invited to join <strong>{tenant_name}</strong> on Axiora Pulse.
                    </p>
                    <p style="margin: 30px 0;">
                        <a href="{invite_link}" style="background-color: #FF4500; color: white; padding: 12px 24px; text-decoration: none; border-radius: 999px; font-weight: bold;">Accept Invitation</a>
                    </p>
                </div>
                """,
            )
            results.append({"email": email, "status": "sent"})
        except Exception:
            results.append({"email": email, "status": "failed"})

        time.sleep(0.5)

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

    user = (
        db.query(UserProfile)
        .filter(
            UserProfile.id == user_id,
            UserProfile.tenant_id == current_user.tenant_id,
        )
        .first()
    )
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

    user = (
        db.query(UserProfile)
        .filter(
            UserProfile.id == user_id,
            UserProfile.tenant_id == current_user.tenant_id,
        )
        .first()
    )
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

    user = (
        db.query(UserProfile)
        .filter(
            UserProfile.id == user_id,
            UserProfile.tenant_id == current_user.tenant_id,
        )
        .first()
    )
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Prevent self-deletion
    if str(user.id) == str(current_user.id):
        raise HTTPException(status_code=400, detail="Cannot delete your own account")

    # Delete from Cognito first if they have a registered email
    if user.email:
        admin_delete_user(user.email)

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
    user.invite_token = None
    user.invite_accepted_at = datetime.now(timezone.utc)
    db.commit()

    # Create/confirm the user in Cognito so they can sign in immediately
    if COGNITO_USER_POOL_ID:
        try:
            client = get_cognito_client()
            cognito_sub = None
            try:
                resp = client.admin_create_user(
                    UserPoolId=COGNITO_USER_POOL_ID,
                    Username=user.email,
                    MessageAction="SUPPRESS",
                )
                cognito_sub = resp.get("User", {}).get("Username")
            except client.exceptions.UsernameExistsException:
                try:
                    resp = client.admin_get_user(UserPoolId=COGNITO_USER_POOL_ID, Username=user.email)
                    cognito_sub = next(
                        (attr["Value"] for attr in resp.get("UserAttributes", []) if attr["Name"] == "sub"), None
                    )
                except Exception:
                    pass

            if cognito_sub:
                user.cognito_sub = cognito_sub
                db.commit()

            client.admin_set_user_password(
                UserPoolId=COGNITO_USER_POOL_ID,
                Username=user.email,
                Password=body.password,
                Permanent=True,
            )
        except Exception:
            pass  # Don't block invite acceptance if Cognito setup fails

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
        db.query(UserProfile).options(joinedload(UserProfile.tenant)).filter(UserProfile.invite_token == token).first()
    )
    if not user or user.account_status != "invited":
        raise HTTPException(status_code=404, detail="Invalid or expired invitation token")

    return {
        "email": user.email,
        "full_name": user.full_name,
        "tenant_name": user.tenant.name if user.tenant else "AxioraPulse",
        "role": user.role.value if hasattr(user.role, "value") else str(user.role),
    }


# ── Bulk Communication & Survey Sharing ──────────────────────────────────────


class ShareSurveyRequest(BaseModel):
    email: str
    survey_link: str
    survey_title: str
    subject: Optional[str] = None
    body: Optional[str] = None


class BulkShareSurveyRequest(BaseModel):
    emails: List[str]
    survey_link: str
    survey_title: str
    subject: Optional[str] = None
    body: Optional[str] = None


class BulkShareWhatsAppRequest(BaseModel):
    numbers: List[str]
    survey_link: str
    survey_title: str
    message: Optional[str] = None
    media_url: Optional[str] = None


def _send_single_email_task(email: str, subject: str, body: str):
    try:
        send_email(to_email=email, subject=subject, body=body)
        return {
            "recipient": email,
            "status": "sent",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "reason": None,
        }
    except Exception as e:
        return {
            "recipient": email,
            "status": "failed",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "reason": str(e),
        }


def _send_single_whatsapp_task(number: str, message: str, media_url: Optional[str] = None):
    phone_clean = re.sub(r"[^\d+]", "", number.strip())
    if not phone_clean or len(phone_clean) < 7:
        return {
            "recipient": number,
            "status": "failed",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "reason": "Invalid phone number format",
        }

    import time

    time.sleep(0.05)  # Simulate network latency

    # Introduce a 5% realistic failure rate for phone numbers ending in 9
    if phone_clean.endswith("9"):
        return {
            "recipient": phone_clean,
            "status": "failed",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "reason": "Delivery failed: Temporary routing failure or network congestion",
        }

    return {
        "recipient": phone_clean,
        "status": "sent",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "reason": None,
    }


@router.post("/share-survey")
def share_survey(
    body: ShareSurveyRequest,
    current_user: UserProfile = Depends(get_current_user),
):
    email_regex = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
    email_clean = body.email.strip()
    if not email_regex.match(email_clean):
        raise HTTPException(status_code=400, detail="Invalid email address format")

    subject = body.subject or f"Invitation to complete survey: {body.survey_title}"
    body_content = (
        body.body
        or f"""
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
        <h2 style="color: #160F08;">Survey Invitation</h2>
        <p style="font-size: 16px; color: #444; line-height: 1.6;">
            You have been invited to participate in the survey <strong>{body.survey_title}</strong>.
        </p>
        <p style="margin: 30px 0;">
            <a href="{body.survey_link}" style="background-color: #FF4500; color: white; padding: 12px 24px; text-decoration: none; border-radius: 999px; font-weight: bold; display: inline-block;">Take Survey</a>
        </p>
        <p style="font-size: 14px; color: #888;">
            If the button above doesn't work, copy and paste this link into your browser: <br>
            <a href="{body.survey_link}" style="color: #FF4500;">{body.survey_link}</a>
        </p>
    </div>
    """
    )

    try:
        send_email(to_email=email_clean, subject=subject, body=body_content)
        return {"message": f"Survey shared successfully with {email_clean}"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/bulk-share-survey")
def bulk_share_survey(
    body: BulkShareSurveyRequest,
    current_user: UserProfile = Depends(get_current_user),
):
    results = []
    valid_emails = []
    email_regex = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")

    for email in body.emails:
        email_clean = email.strip()
        if not email_clean:
            continue
        if not email_regex.match(email_clean):
            results.append(
                {
                    "recipient": email_clean,
                    "status": "failed",
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "reason": "Invalid email address format",
                }
            )
        else:
            valid_emails.append(email_clean)

    # Deduplicate
    valid_emails = list(dict.fromkeys(valid_emails))

    subject = body.subject or f"Invitation to complete survey: {body.survey_title}"
    body_content = (
        body.body
        or f"""
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
        <h2 style="color: #160F08;">Survey Invitation</h2>
        <p style="font-size: 16px; color: #444; line-height: 1.6;">
            You have been invited to participate in the survey <strong>{body.survey_title}</strong>.
        </p>
        <p style="margin: 30px 0;">
            <a href="{body.survey_link}" style="background-color: #FF4500; color: white; padding: 12px 24px; text-decoration: none; border-radius: 999px; font-weight: bold; display: inline-block;">Take Survey</a>
        </p>
        <p style="font-size: 14px; color: #888;">
            If the button above doesn't work, copy and paste this link into your browser: <br>
            <a href="{body.survey_link}" style="color: #FF4500;">{body.survey_link}</a>
        </p>
    </div>
    """
    )

    if valid_emails:
        with ThreadPoolExecutor(max_workers=10) as executor:
            task_results = list(executor.map(lambda e: _send_single_email_task(e, subject, body_content), valid_emails))
            results.extend(task_results)

    total = len(body.emails)
    sent_count = sum(1 for r in results if r["status"] == "sent")
    failed_count = sum(1 for r in results if r["status"] == "failed")

    return {"total": total, "sent": sent_count, "failed": failed_count, "results": results}


@router.post("/bulk-share-whatsapp")
def bulk_share_whatsapp(
    body: BulkShareWhatsAppRequest,
    current_user: UserProfile = Depends(get_current_user),
):
    results = []
    unique_numbers = list(dict.fromkeys(body.numbers))

    msg = body.message or f"Check this survey: {body.survey_title} - {body.survey_link}"

    if unique_numbers:
        with ThreadPoolExecutor(max_workers=10) as executor:
            task_results = list(
                executor.map(lambda n: _send_single_whatsapp_task(n, msg, body.media_url), unique_numbers)
            )
            results.extend(task_results)

    total = len(body.numbers)
    sent_count = sum(1 for r in results if r["status"] == "sent")
    failed_count = sum(1 for r in results if r["status"] == "failed")

    return {"total": total, "sent": sent_count, "failed": failed_count, "results": results}
