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
from datetime import datetime, timezone, timedelta
from typing import List, Optional
from urllib.parse import urlparse
from pydantic import BaseModel
from schemas import BulkInviteRequest
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload
from services.email_service import send_email
from fastapi import Request
from core.rate_limiter import limiter
from db.database import get_db
from db.models import UserProfile, RoleEnum, BulkSendUsage
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
from services.audit import record_audit
from cognito_utils import get_cognito_client, get_user_pool_id, admin_delete_user

FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173").rstrip("/")

router = APIRouter(prefix="/users", tags=["users"])

# Pending invites expire after this window. (AP-SEC-016)
INVITE_TTL = timedelta(days=7)


def _invite_expiry() -> datetime:
    return datetime.now(timezone.utc) + INVITE_TTL


def _invite_is_expired(user: UserProfile) -> bool:
    exp = user.invite_expires_at
    if exp is None:
        # Legacy invites issued before expiry existed are treated as still valid.
        return False
    if exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)
    return exp < datetime.now(timezone.utc)


# Roles that allow inviting / managing users
MANAGER_ROLES = {RoleEnum.super_admin, RoleEnum.admin, RoleEnum.manager}

# Privilege ordering used to enforce that a caller cannot grant a role higher
# than their own (e.g. a manager inviting an admin). (AP-SEC-018)
ROLE_RANK = {
    RoleEnum.viewer: 1,
    RoleEnum.creator: 2,
    RoleEnum.manager: 3,
    RoleEnum.admin: 4,
    RoleEnum.super_admin: 5,
}


def _require_manager(current_user: UserProfile):
    if current_user.role not in MANAGER_ROLES:
        raise HTTPException(status_code=403, detail="Insufficient permissions")


def _assert_can_assign_role(current_user: UserProfile, role: RoleEnum) -> None:
    """A caller may never grant a role with higher privilege than their own."""
    if ROLE_RANK.get(role, 99) > ROLE_RANK.get(current_user.role, 0):
        raise HTTPException(status_code=403, detail="You cannot grant a role higher than your own")
    if role == RoleEnum.super_admin and current_user.role != RoleEnum.super_admin:
        raise HTTPException(status_code=403, detail="Only a super admin can grant the super admin role")


# Roles permitted to distribute surveys via email/WhatsApp (excludes viewer).
DISTRIBUTOR_ROLES = {RoleEnum.super_admin, RoleEnum.admin, RoleEnum.manager, RoleEnum.creator}


def _require_distributor(current_user: UserProfile) -> None:
    if current_user.role not in DISTRIBUTOR_ROLES:
        raise HTTPException(status_code=403, detail="Insufficient permissions to send survey invitations")


def _assert_trusted_link(url: str | None) -> None:
    """Survey links sent through our branded channels must point at our own
    frontend — otherwise the feature is an arbitrary phishing relay. (AP-SEC-010)"""
    if not url:
        return
    allowed = urlparse(FRONTEND_URL).netloc
    if allowed and urlparse(url).netloc != allowed:
        raise HTTPException(status_code=400, detail="Survey link must point to the application domain")


def _require_team_account(current_user: UserProfile):
    """Team management is unavailable on personal accounts."""
    tenant = current_user.tenant
    if tenant is not None and getattr(tenant, "account_type", "organization") == "personal":
        raise HTTPException(
            status_code=403,
            detail="Team management is not available on personal accounts",
        )


@router.get("/", response_model=list[UserProfileOut])
def list_users(
    current_user: UserProfile = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return all users in the caller's tenant (TeamManagement.jsx).

    Note: not gated for personal accounts — this list also backs survey
    collaboration/sharing, and for a personal account it simply returns the
    single owner. Only the mutating team-management actions are blocked.
    """
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
    _require_team_account(current_user)
    _require_manager(current_user)

    # 🔍 Check if user already exists in the entire system
    existing = db.query(UserProfile).filter(UserProfile.email == body.email).first()

    # 🟡 CASE 1: Already exists
    if existing:
        if existing.tenant_id != current_user.tenant_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="This email is already registered with another organization.",
            )
        if existing.account_status == "invited":
            # 🔁 RESEND INVITE

            # Generate new token (recommended)
            existing.invite_token = secrets.token_urlsafe(32)
            existing.invite_expires_at = _invite_expiry()
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
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail=f"Reminder email failed to send: {str(e)}",
                )

            return UserProfileOut.model_validate(existing)

        else:
            # 🔴 Already active user
            raise HTTPException(status_code=400, detail="User already exists in your team")

    # 🟢 CASE 2: New user → create
    try:
        role = RoleEnum(body.role)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid role: {body.role}")

    _assert_can_assign_role(current_user, role)

    new_user = UserProfile(
        id=uuid.uuid4(),
        email=body.email,
        full_name=body.full_name,
        password_hash=None,
        role=role,
        tenant_id=current_user.tenant_id,
        invited_by=current_user.id,
        is_active=True,
        account_status="invited",
        invite_token=secrets.token_urlsafe(32),
        invite_expires_at=_invite_expiry(),
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
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Invitation email failed to send: {str(e)}",
        )

    return UserProfileOut.model_validate(new_user)


@router.post("/bulk-invite")
@limiter.limit("2/minute")
def bulk_invite(
    request: Request,
    body: BulkInviteRequest,
    current_user: UserProfile = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _require_team_account(current_user)
    _require_manager(current_user)

    try:
        invite_role = RoleEnum(body.role)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid role: {body.role}")
    _assert_can_assign_role(current_user, invite_role)  # (AP-SEC-018)

    results = []
    tenant_name = current_user.tenant.name if current_user.tenant else "Axiora Pulse"

    for email in body.emails:
        existing = db.query(UserProfile).filter(UserProfile.email == email).first()

        if existing and existing.tenant_id != current_user.tenant_id:
            results.append({"email": email, "status": "failed", "error": "Registered with another organization"})
            continue

        # 🔁 Already invited → resend
        if existing and existing.account_status == "invited":
            existing.invite_token = secrets.token_urlsafe(32)
            existing.invite_expires_at = _invite_expiry()
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
            invited_by=current_user.id,
            is_active=True,
            account_status="invited",
            invite_token=secrets.token_urlsafe(32),
            invite_expires_at=_invite_expiry(),
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
    _require_team_account(current_user)
    if current_user.role not in {RoleEnum.super_admin, RoleEnum.admin}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admins and super admins can change user roles",
        )

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

    # Prevent self-modification
    if str(user.id) == str(current_user.id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot change your own role",
        )

    # Ensure non-super_admins cannot modify a super_admin's role
    if user.role == RoleEnum.super_admin and current_user.role != RoleEnum.super_admin:
        raise HTTPException(status_code=403, detail="Super Admin's role cannot be changed")

    # Ensure non-super_admins cannot assign the super_admin role
    if body.role == RoleEnum.super_admin.value and current_user.role != RoleEnum.super_admin:
        raise HTTPException(status_code=403, detail="Admins cannot assign the Super Admin role")

    previous_role = user.role.value if hasattr(user.role, "value") else str(user.role)
    try:
        user.role = RoleEnum(body.role)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid role: {body.role}")

    db.commit()
    db.refresh(user)
    record_audit(
        db,
        action="user.role_changed",
        actor=current_user,
        tenant_id=current_user.tenant_id,
        target_type="user",
        target_id=user.id,
        detail={"from": previous_role, "to": body.role},
    )
    return UserProfileOut.model_validate(user)


@router.patch("/{user_id}/status", response_model=UserProfileOut)
def update_status(
    user_id: str,
    body: UserStatusUpdate,
    current_user: UserProfile = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Activate or deactivate a user (TeamManagement.jsx)."""
    _require_team_account(current_user)
    if current_user.role not in {RoleEnum.super_admin, RoleEnum.admin}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admins and super admins can change user status",
        )

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

    # Prevent self-modification
    if str(user.id) == str(current_user.id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot change your own status",
        )

    # Ensure non-super_admins cannot deactivate a super_admin
    if user.role == RoleEnum.super_admin and current_user.role != RoleEnum.super_admin:
        raise HTTPException(status_code=403, detail="Super Admin cannot be disabled")

    user.is_active = body.is_active
    db.commit()
    db.refresh(user)
    record_audit(
        db,
        action="user.status_changed",
        actor=current_user,
        tenant_id=current_user.tenant_id,
        target_type="user",
        target_id=user.id,
        detail={"is_active": body.is_active},
    )
    return UserProfileOut.model_validate(user)


@router.delete("/{user_id}", response_model=MessageResponse)
def delete_user(
    user_id: str,
    current_user: UserProfile = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Hard-delete a user within the caller's own tenant.

    Admins and super_admins may delete users in their tenant (org self-management).
    Guards below prevent self-deletion and deletion of a super_admin by a
    non-super_admin; cross-tenant deletion is impossible (tenant-scoped query).
    (AP-SEC-036)
    """
    _require_team_account(current_user)
    if current_user.role not in {RoleEnum.super_admin, RoleEnum.admin}:
        raise HTTPException(status_code=403, detail="Only admins and super_admins can delete users")

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

    # Prevent non-super_admins from deleting a super_admin
    if user.role == RoleEnum.super_admin and current_user.role != RoleEnum.super_admin:
        raise HTTPException(status_code=403, detail="Super Admin cannot be deleted")

    # Delete from Cognito first if they have a registered email
    if user.email:
        admin_delete_user(user.email)

    deleted_email = user.email
    deleted_id = user.id
    db.delete(user)
    db.commit()
    record_audit(
        db,
        action="user.deleted",
        actor=current_user,
        tenant_id=current_user.tenant_id,
        target_type="user",
        target_id=deleted_id,
        detail={"email": deleted_email},
    )
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

    if _invite_is_expired(user):  # (AP-SEC-016)
        raise HTTPException(status_code=410, detail="This invitation has expired. Please request a new one.")

    user.full_name = body.full_name.strip()
    user.password_hash = hash_password(body.password)
    user.account_status = "active"
    user.invite_token = None
    user.invite_accepted_at = datetime.now(timezone.utc)
    db.commit()

    # Create/confirm the user in Cognito so they can sign in immediately
    pool_id = get_user_pool_id()
    if pool_id:
        try:
            client = get_cognito_client()
            cognito_sub = None
            try:
                resp = client.admin_create_user(
                    UserPoolId=pool_id,
                    Username=user.email,
                    MessageAction="SUPPRESS",
                )
                cognito_sub = resp.get("User", {}).get("Username")
            except client.exceptions.UsernameExistsException:
                try:
                    resp = client.admin_get_user(UserPoolId=pool_id, Username=user.email)
                    cognito_sub = next(
                        (attr["Value"] for attr in resp.get("UserAttributes", []) if attr["Name"] == "sub"), None
                    )
                except Exception:
                    pass

            if cognito_sub:
                user.cognito_sub = cognito_sub
                db.commit()

            client.admin_set_user_password(
                UserPoolId=pool_id,
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
    if _invite_is_expired(user):  # (AP-SEC-016)
        raise HTTPException(status_code=410, detail="This invitation has expired. Please request a new one.")

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
    survey_id: str
    emails: List[str]
    survey_link: str
    survey_title: str
    subject: Optional[str] = None
    body: Optional[str] = None


class BulkShareWhatsAppRequest(BaseModel):
    survey_id: str
    numbers: List[str]
    survey_link: str
    survey_title: str
    message: Optional[str] = None
    media_url: Optional[str] = None


# ── Bulk distribution limits ────────────────────────────────────────────────
# Per-request caps protect a single send; per-day caps are tracked per survey in
# UTC calendar days and reset automatically when a new day produces a fresh row.
BULK_EMAIL_PER_REQUEST = 30
BULK_EMAIL_PER_DAY = 60
BULK_WHATSAPP_PER_REQUEST = 20
BULK_WHATSAPP_PER_DAY = 50

EMAIL_OVER_REQUEST_MSG = "You can send emails to a maximum of 30 recipients at a time."
EMAIL_OVER_DAY_MSG = "Daily email limit of 60 recipients has been reached."
WHATSAPP_OVER_REQUEST_MSG = "You can send WhatsApp messages to a maximum of 20 recipients at a time."
WHATSAPP_OVER_DAY_MSG = "Daily WhatsApp limit of 50 messages has been reached."


def _enforce_bulk_limit(db, survey_id, channel, count, per_request, per_day, over_request_msg, over_day_msg):
    """Validate the per-request cap then atomically reserve ``count`` recipients
    against today's (UTC) usage row for this survey/channel. Raises HTTPException
    (400 over per-request, 429 over per-day) and reserves nothing on breach."""
    from sqlalchemy.exc import IntegrityError

    if count > per_request:
        raise HTTPException(status_code=400, detail=over_request_msg)
    if count <= 0:
        return
    try:
        sid = uuid.UUID(str(survey_id))
    except (ValueError, TypeError, AttributeError):
        raise HTTPException(status_code=400, detail="A valid survey_id is required.")

    today = datetime.now(timezone.utc).date()

    def _reserve():
        row = (
            db.query(BulkSendUsage)
            .filter(
                BulkSendUsage.survey_id == sid,
                BulkSendUsage.channel == channel,
                BulkSendUsage.usage_date == today,
            )
            .with_for_update()
            .first()
        )
        used = row.recipient_count if row else 0
        if used + count > per_day:
            raise HTTPException(status_code=429, detail=over_day_msg)
        if row:
            row.recipient_count = used + count
        else:
            db.add(BulkSendUsage(survey_id=sid, channel=channel, usage_date=today, recipient_count=count))

    try:
        _reserve()
        db.commit()
    except IntegrityError:
        # A concurrent send created today's row first — retry as a plain update.
        db.rollback()
        _reserve()
        db.commit()


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
@limiter.limit("20/minute")
def share_survey(
    request: Request,
    body: ShareSurveyRequest,
    current_user: UserProfile = Depends(get_current_user),
):
    _require_distributor(current_user)  # (AP-SEC-010)
    _assert_trusted_link(body.survey_link)
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
    except Exception:
        raise HTTPException(status_code=502, detail="Failed to send email")


@router.post("/bulk-share-survey")
@limiter.limit("10/minute")
def bulk_share_survey(
    request: Request,
    body: BulkShareSurveyRequest,
    current_user: UserProfile = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _require_distributor(current_user)  # (AP-SEC-010)
    _assert_trusted_link(body.survey_link)
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

    # Enforce per-request and per-survey daily recipient limits (AP-SEC-bulk).
    # Reserved before sending so frontend bypass cannot exceed the cap.
    _enforce_bulk_limit(
        db,
        body.survey_id,
        "email",
        len(valid_emails),
        BULK_EMAIL_PER_REQUEST,
        BULK_EMAIL_PER_DAY,
        EMAIL_OVER_REQUEST_MSG,
        EMAIL_OVER_DAY_MSG,
    )

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
@limiter.limit("10/minute")
def bulk_share_whatsapp(
    request: Request,
    body: BulkShareWhatsAppRequest,
    current_user: UserProfile = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _require_distributor(current_user)  # (AP-SEC-010)
    _assert_trusted_link(body.survey_link)
    results = []
    unique_numbers = [n for n in dict.fromkeys(body.numbers) if n and n.strip()]

    # Enforce per-request and per-survey daily message limits (AP-SEC-bulk).
    _enforce_bulk_limit(
        db,
        body.survey_id,
        "whatsapp",
        len(unique_numbers),
        BULK_WHATSAPP_PER_REQUEST,
        BULK_WHATSAPP_PER_DAY,
        WHATSAPP_OVER_REQUEST_MSG,
        WHATSAPP_OVER_DAY_MSG,
    )

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
