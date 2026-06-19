import pytest
import uuid
from fastapi.testclient import TestClient
from app.main import app
from db.database import SessionLocal
from db.models import Tenant

client = TestClient(app)


@pytest.fixture
def super_admin_auth(monkeypatch):
    import dependencies
    import routes.auth
    
    super_sub = f"super-sub-{uuid.uuid4()}"
    
    def mock_verify(token):
        if token == "super-admin-token":
            return {
                "sub": super_sub,
                "email": "roopsai.work8@gmail.com",
                "name": "Super Admin User",
                "token_use": "id",
            }
        elif token == "regular-token":
            return {
                "sub": "regular-user-sub",
                "email": "regular@example.com",
                "name": "Regular User",
                "token_use": "id",
            }
        return None

    monkeypatch.setattr(dependencies, "verify_cognito_token", mock_verify)
    monkeypatch.setattr(routes.auth, "verify_cognito_token", mock_verify)


def test_super_admin_unauthorized_for_regular_user(super_admin_auth):
    headers = {"Authorization": "Bearer regular-token"}
    response = client.get("/super-admin/stats", headers=headers)
    assert response.status_code == 403  # Forbidden for non-super-admins


def test_super_admin_stats_success(super_admin_auth):
    headers = {"Authorization": "Bearer super-admin-token"}
    response = client.get("/super-admin/stats", headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert "total_tenants" in data
    assert "total_users" in data
    assert "total_surveys" in data
    assert "total_responses" in data
    assert "monthly_recurring_revenue" in data
    assert "usage_by_tenant" in data


def test_super_admin_tenants_directory(super_admin_auth):
    headers = {"Authorization": "Bearer super-admin-token"}
    response = client.get("/super-admin/tenants", headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    if len(data) > 0:
        tenant = data[0]
        assert "id" in tenant
        assert "name" in tenant
        assert "slug" in tenant
        assert "owner_email" in tenant
        assert "plan_type" in tenant
        assert "is_active" in tenant


def test_super_admin_update_plan_and_status(super_admin_auth):
    # 1. Create a dummy tenant to modify
    db = SessionLocal()
    tenant_id = uuid.uuid4()
    tenant = Tenant(
        id=tenant_id,
        name="Test SA Corp",
        slug="test-sa-corp",
        plan="free",
        is_active=True,
    )
    db.add(tenant)
    db.commit()
    db.refresh(tenant)
    db.close()

    headers = {"Authorization": "Bearer super-admin-token"}

    try:
        # 2. Update Plan
        plan_response = client.patch(
            f"/super-admin/tenants/{tenant_id}/plan",
            headers=headers,
            json={"plan_type": "enterprise"},
        )
        assert plan_response.status_code == 200
        assert plan_response.json()["tenant"]["plan_type"] == "enterprise"

        # 3. Toggle Status (Suspend)
        status_response = client.patch(
            f"/super-admin/tenants/{tenant_id}/status",
            headers=headers,
            json={"is_active": False},
        )
        assert status_response.status_code == 200
        assert status_response.json()["tenant"]["is_active"] is False

        # Verify in database
        db = SessionLocal()
        t_db = db.query(Tenant).filter(Tenant.id == tenant_id).first()
        assert t_db.plan == "enterprise"
        assert t_db.is_active is False
        db.close()
    finally:
        # Cleanup
        db = SessionLocal()
        t_db = db.query(Tenant).filter(Tenant.id == tenant_id).first()
        if t_db:
            db.delete(t_db)
            db.commit()
        db.close()
