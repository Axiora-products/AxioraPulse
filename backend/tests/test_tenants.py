from fastapi.testclient import TestClient
from app.main import app
from db.database import SessionLocal
from db.models import UserProfile, RoleEnum

client = TestClient(app)


def test_tenant_lifecycle(auth_headers):
    # Store original values
    db = SessionLocal()
    try:
        user = db.query(UserProfile).filter(UserProfile.email == "dev@axiorapulse.com").first()
        original_role = user.role if user else RoleEnum.viewer
        original_tenant_id = user.tenant_id if user else None
    finally:
        db.close()

    try:
        # Set user as admin for updates
        db = SessionLocal()
        try:
            user = db.query(UserProfile).filter(UserProfile.email == "dev@axiorapulse.com").first()
            if user:
                user.role = RoleEnum.admin
                db.commit()
        finally:
            db.close()

        # 1. Get current tenant
        response = client.get("/tenants/me", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert "id" in data
        assert "name" in data

        # 2. Update tenant info as admin
        payload = {
            "name": "Updated Tenant Name",
            "primary_color": "#00FF00",
            "approved_domains": ["testdomain.com"],
        }
        update_response = client.patch("/tenants/me", json=payload, headers=auth_headers)
        assert update_response.status_code == 200
        assert update_response.json()["name"] == "Updated Tenant Name"
        assert update_response.json()["primary_color"] == "#00FF00"
        assert update_response.json()["approved_domains"] == ["testdomain.com"]

        # 3. Change role to viewer and test update failure (403)
        db = SessionLocal()
        try:
            user = db.query(UserProfile).filter(UserProfile.email == "dev@axiorapulse.com").first()
            if user:
                user.role = RoleEnum.viewer
                db.commit()
        finally:
            db.close()

        payload_viewer = {"name": "Should Fail"}
        forbidden_response = client.patch("/tenants/me", json=payload_viewer, headers=auth_headers)
        assert forbidden_response.status_code == 403

        # 4. Set role back to admin so we bypass the 403 role check, then test no tenant associated (404)
        db = SessionLocal()
        try:
            user = db.query(UserProfile).filter(UserProfile.email == "dev@axiorapulse.com").first()
            if user:
                user.role = RoleEnum.admin
                user.tenant_id = None
                db.commit()
        finally:
            db.close()

        no_tenant_response = client.get("/tenants/me", headers=auth_headers)
        assert no_tenant_response.status_code == 404

        no_tenant_patch_response = client.patch("/tenants/me", json=payload, headers=auth_headers)
        assert no_tenant_patch_response.status_code == 404

    finally:
        # ALWAYS restore original role and tenant_id
        db = SessionLocal()
        try:
            user = db.query(UserProfile).filter(UserProfile.email == "dev@axiorapulse.com").first()
            if user:
                user.role = original_role
                user.tenant_id = original_tenant_id
                db.commit()
        finally:
            db.close()
