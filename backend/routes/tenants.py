"""
routes/tenants.py
─────────────────
GET   /tenants/me   — Get current user's tenant
PATCH /tenants/me   — Update tenant name / color / approved_domains
"""

from fastapi import APIRouter, HTTPException

from db.models import RoleEnum, Tenant
from dependencies import CurrentUser, DBSession
from schemas import TenantOut, TenantUpdate

router = APIRouter(prefix="/tenants", tags=["tenants"])

ADMIN_ROLES = {RoleEnum.super_admin, RoleEnum.admin}


@router.get("/me", response_model=TenantOut)
def get_tenant(
    current_user: CurrentUser,
    db: DBSession,
):
    if not current_user.tenant_id:
        raise HTTPException(status_code=404, detail="No tenant associated with this account")
    tenant = db.query(Tenant).filter(Tenant.id == current_user.tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    return TenantOut.model_validate(tenant)


@router.patch("/me", response_model=TenantOut)
def update_tenant(
    body: TenantUpdate,
    current_user: CurrentUser,
    db: DBSession,
):
    """Update org name, theme color, and approved domains (Settings.jsx)."""
    if current_user.role not in ADMIN_ROLES:
        raise HTTPException(status_code=403, detail="Only admins can update organisation settings")

    tenant = db.query(Tenant).filter(Tenant.id == current_user.tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    if body.name is not None:
        tenant.name = body.name
    if body.primary_color is not None:
        tenant.primary_color = body.primary_color
    if body.approved_domains is not None:
        tenant.approved_domains = body.approved_domains

    db.commit()
    db.refresh(tenant)
    return TenantOut.model_validate(tenant)
