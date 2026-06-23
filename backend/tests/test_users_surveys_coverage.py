"""Targeted diff-coverage tests for routes/users.py and routes/surveys.py.

These exercise the specific guard / validation / error branches that the
existing suites do not reach. Pure helper functions are unit-tested directly;
endpoint-only branches are driven through the TestClient with auth_headers.
"""

from datetime import datetime, timedelta, timezone

import uuid

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.main import app
from db.database import SessionLocal
from db.models import (
    RoleEnum,
    SharePermissionEnum,
    UserProfile,
)

import routes.surveys as surveys_module
import routes.users as users_module

client = TestClient(app)


# ── helpers ──────────────────────────────────────────────────────────────────


def _create_survey(auth_headers, title="Coverage Survey", status="draft"):
    payload = {
        "title": title,
        "status": status,
        "questions": [
            {"question_text": "Q1?", "question_type": "yes_no", "sort_order": 1},
            {"question_text": "Q2?", "question_type": "yes_no", "sort_order": 2},
        ],
    }
    resp = client.post("/surveys/", json=payload, headers=auth_headers)
    assert resp.status_code == 201
    return resp.json()


class _FakeQuery:
    """Minimal stand-in for a SQLAlchemy query chain used by
    _authorize_survey_write: db.query(...).filter(...).first()."""

    def __init__(self, result):
        self._result = result

    def filter(self, *args, **kwargs):
        return self

    def first(self):
        return self._result


class _FakeDB:
    def __init__(self, share_result):
        self._share_result = share_result

    def query(self, *args, **kwargs):
        return _FakeQuery(self._share_result)


# ── users.py: _invite_is_expired (lines 60, 62) ──────────────────────────────


def test_invite_is_expired_legacy_none_is_valid():
    # Line 60: invites with no expiry (legacy) are treated as still valid.
    user = UserProfile(id=uuid.uuid4(), email="legacy@example.com", invite_expires_at=None)
    assert users_module._invite_is_expired(user) is False


def test_invite_is_expired_naive_datetime_assumed_utc():
    # Line 62: a naive datetime is treated as UTC. A future naive expiry => not expired.
    future_naive = datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(days=1)
    user = UserProfile(id=uuid.uuid4(), email="naive@example.com", invite_expires_at=future_naive)
    assert users_module._invite_is_expired(user) is False

    past_naive = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=1)
    user.invite_expires_at = past_naive
    assert users_module._invite_is_expired(user) is True


# ── users.py: _assert_can_assign_role (lines 88, 90) ─────────────────────────


def test_assert_can_assign_role_higher_than_own_blocked():
    # Line 88: a manager cannot grant admin (higher privilege than their own).
    manager = UserProfile(id=uuid.uuid4(), email="mgr@example.com", role=RoleEnum.manager)
    with pytest.raises(HTTPException) as exc:
        users_module._assert_can_assign_role(manager, RoleEnum.admin)
    assert exc.value.status_code == 403
    assert "higher than your own" in exc.value.detail


def test_assert_can_assign_role_super_admin_guard_line_90():
    # Line 90: only a super_admin may grant the super_admin role. To reach this
    # guard the caller must first pass the rank check on line 87, so we
    # temporarily raise the admin rank to super_admin level. The caller is still
    # RoleEnum.admin (not super_admin), so line 90 fires.
    admin = UserProfile(id=uuid.uuid4(), email="adm@example.com", role=RoleEnum.admin)

    original = users_module.ROLE_RANK[RoleEnum.admin]
    users_module.ROLE_RANK[RoleEnum.admin] = users_module.ROLE_RANK[RoleEnum.super_admin]
    try:
        with pytest.raises(HTTPException) as exc:
            users_module._assert_can_assign_role(admin, RoleEnum.super_admin)
        assert exc.value.status_code == 403
        assert "super admin" in exc.value.detail.lower()
    finally:
        users_module.ROLE_RANK[RoleEnum.admin] = original


# ── users.py: _require_distributor (line 99) ─────────────────────────────────


def test_require_distributor_viewer_blocked():
    # Line 99: a viewer is not a distributor and must be rejected.
    viewer = UserProfile(id=uuid.uuid4(), email="view@example.com", role=RoleEnum.viewer)
    with pytest.raises(HTTPException) as exc:
        users_module._require_distributor(viewer)
    assert exc.value.status_code == 403
    assert "survey invitations" in exc.value.detail


# ── users.py: _assert_trusted_link (lines 106, 109) ──────────────────────────


def test_assert_trusted_link_none_returns():
    # Line 106: a None/empty link short-circuits and is allowed.
    assert users_module._assert_trusted_link(None) is None
    assert users_module._assert_trusted_link("") is None


def test_assert_trusted_link_foreign_host_blocked():
    # Line 109: a link pointing at a different host is rejected (anti-phishing).
    with pytest.raises(HTTPException) as exc:
        users_module._assert_trusted_link("http://evil.example.com/survey/x")
    assert exc.value.status_code == 400
    assert "application domain" in exc.value.detail


# ── users.py: invite resend sets expiry (line 194) ───────────────────────────


def test_invite_resend_refreshes_expiry(auth_headers):
    # Lines 193-194: re-inviting an already-invited user regenerates the token
    # and refreshes invite_expires_at.
    email = f"resend_{uuid.uuid4().hex}@example.com"
    first = client.post(
        "/users/invite",
        json={"email": email, "full_name": "Resend User", "role": "viewer"},
        headers=auth_headers,
    )
    assert first.status_code == 200

    db = SessionLocal()
    try:
        before = db.query(UserProfile).filter(UserProfile.email == email).first()
        old_token = before.invite_token
    finally:
        db.close()

    second = client.post(
        "/users/invite",
        json={"email": email, "full_name": "Resend User", "role": "viewer"},
        headers=auth_headers,
    )
    assert second.status_code == 200

    db = SessionLocal()
    try:
        after = db.query(UserProfile).filter(UserProfile.email == email).first()
        assert after.invite_token != old_token
        assert after.invite_expires_at is not None
    finally:
        db.close()


# ── users.py: bulk_invite invalid role + resend (lines 295-296, 312) ─────────


def test_bulk_invite_invalid_role_rejected(auth_headers):
    # Lines 295-296: an unknown role string passes the str schema but fails
    # RoleEnum(...) conversion, returning 400.
    resp = client.post(
        "/users/bulk-invite",
        json={"emails": [f"bad_{uuid.uuid4().hex}@example.com"], "role": "not-a-real-role"},
        headers=auth_headers,
    )
    assert resp.status_code == 400
    assert "Invalid role" in resp.json()["detail"]


def test_bulk_invite_resend_refreshes_expiry(auth_headers):
    # Line 312: bulk re-inviting an already-invited user refreshes its expiry.
    email = f"bulk_resend_{uuid.uuid4().hex}@example.com"
    first = client.post(
        "/users/bulk-invite",
        json={"emails": [email], "role": "viewer"},
        headers=auth_headers,
    )
    assert first.status_code == 200

    second = client.post(
        "/users/bulk-invite",
        json={"emails": [email], "role": "viewer"},
        headers=auth_headers,
    )
    assert second.status_code == 200
    assert second.json()["results"] == [{"email": email, "status": "resent"}]


# ── users.py: delete_user audit path (lines 546-547, 550) ────────────────────


def test_delete_user_records_audit(auth_headers):
    # Lines 546-547 (capture email/id) and 550 (record_audit) run on a
    # successful delete of a teammate.
    email = f"to_delete_{uuid.uuid4().hex}@example.com"
    invite = client.post(
        "/users/invite",
        json={"email": email, "full_name": "Delete Me", "role": "viewer"},
        headers=auth_headers,
    )
    assert invite.status_code == 200
    user_id = invite.json()["id"]

    resp = client.delete(f"/users/{user_id}", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["message"] == "User deleted successfully"


# ── users.py: accept-invite / invite-info expiry (lines 580, 642) ────────────


def _make_expired_invite(auth_headers):
    email = f"expired_{uuid.uuid4().hex}@example.com"
    invite = client.post(
        "/users/invite",
        json={"email": email, "full_name": "Expired Invite", "role": "viewer"},
        headers=auth_headers,
    )
    assert invite.status_code == 200

    db = SessionLocal()
    try:
        user = db.query(UserProfile).filter(UserProfile.email == email).first()
        token = user.invite_token
        user.invite_expires_at = datetime.now(timezone.utc) - timedelta(days=1)
        db.commit()
    finally:
        db.close()
    return token


def test_accept_invite_expired_returns_410(auth_headers):
    # Line 580: accepting an expired invite returns 410 Gone.
    token = _make_expired_invite(auth_headers)
    resp = client.patch(
        f"/users/accept-invite?token={token}",
        json={"full_name": "Late User", "password": "SecretPassword123!"},
    )
    assert resp.status_code == 410
    assert "expired" in resp.json()["detail"].lower()


def test_invite_info_expired_returns_410(auth_headers):
    # Line 642: invite-info for an expired invite returns 410 Gone.
    token = _make_expired_invite(auth_headers)
    resp = client.get(f"/users/invite-info/{token}")
    assert resp.status_code == 410
    assert "expired" in resp.json()["detail"].lower()


# ── users.py: share-survey email send failure (lines 765-766) ────────────────


def test_share_survey_email_failure_returns_502(auth_headers, monkeypatch):
    # Lines 765-766: when send_email raises, the endpoint reports 502.
    def _boom(*args, **kwargs):
        raise RuntimeError("smtp down")

    monkeypatch.setattr(users_module, "send_email", _boom)

    payload = {
        "email": "recipient@example.com",
        "survey_title": "Coverage Survey",
        "survey_link": "http://localhost:5173/survey/cov",
    }
    resp = client.post("/users/share-survey", json=payload, headers=auth_headers)
    assert resp.status_code == 502
    assert "Failed to send email" in resp.json()["detail"]


# ── surveys.py: _authorize_survey_write helper (lines 98-100, 109-111) ───────


def test_authorize_survey_write_creator_allowed():
    # Lines 98-99: a plain creator who owns the survey is authorized.
    user_id = uuid.uuid4()
    user = UserProfile(id=user_id, email="creator@example.com", role=RoleEnum.creator)

    class _Survey:
        id = uuid.uuid4()
        created_by = user_id

    # No share needed; ownership short-circuits before the share query.
    surveys_module._authorize_survey_write(_Survey(), user, _FakeDB(share_result=None))


def test_authorize_survey_write_editor_share_allowed():
    # Lines 100-110: a creator who is not the owner but holds an editor share
    # is authorized.
    user = UserProfile(id=uuid.uuid4(), email="shared@example.com", role=RoleEnum.creator)

    class _Survey:
        id = uuid.uuid4()
        created_by = uuid.uuid4()  # someone else

    class _Share:
        permission = SharePermissionEnum.editor

    surveys_module._authorize_survey_write(_Survey(), user, _FakeDB(share_result=_Share()))


def test_authorize_survey_write_no_access_blocked():
    # Line 111: a non-owner creator without an editor share is rejected.
    user = UserProfile(id=uuid.uuid4(), email="noaccess@example.com", role=RoleEnum.creator)

    class _Survey:
        id = uuid.uuid4()
        created_by = uuid.uuid4()

    with pytest.raises(HTTPException) as exc:
        surveys_module._authorize_survey_write(_Survey(), user, _FakeDB(share_result=None))
    assert exc.value.status_code == 403
    assert "permission to modify" in exc.value.detail


# ── surveys.py: endpoint call sites of _authorize_survey_write ──────────────
# Lines 744 / 786 / 823 are reached when the seeded admin (a SURVEY_ADMIN_ROLE)
# successfully passes the object-level authorization check inside each endpoint.


def test_update_survey_status_authorizes_and_publishes(auth_headers):
    # Line 744: status endpoint runs _authorize_survey_write then publishes.
    survey = _create_survey(auth_headers, title="Status Survey", status="draft")
    resp = client.patch(
        f"/surveys/{survey['id']}/status",
        json={"status": "active"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "active"


def test_replace_questions_authorizes(auth_headers):
    # Line 823: PUT questions runs _authorize_survey_write before replacing.
    survey = _create_survey(auth_headers, title="Replace Q Survey")
    resp = client.put(
        f"/surveys/{survey['id']}/questions",
        json=[
            {"question_text": "New Q1?", "question_type": "yes_no", "sort_order": 1},
            {"question_text": "New Q2?", "question_type": "short_text", "sort_order": 2},
        ],
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


def test_delete_survey_authorizes(auth_headers):
    # Line 786: DELETE survey runs _authorize_survey_write before deleting.
    survey = _create_survey(auth_headers, title="Delete Me Survey")
    resp = client.delete(f"/surveys/{survey['id']}", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["message"] == "Survey deleted"


# ── surveys.py: revoke_share survey-not-found (line 973) ─────────────────────


def test_revoke_share_survey_not_found_returns_404(auth_headers):
    # Line 973: revoking a share for a non-existent survey returns 404.
    missing_survey = uuid.uuid4()
    missing_share = uuid.uuid4()
    resp = client.delete(
        f"/surveys/{missing_survey}/shares/{missing_share}",
        headers=auth_headers,
    )
    assert resp.status_code == 404
    assert resp.json()["detail"] == "Survey not found"
