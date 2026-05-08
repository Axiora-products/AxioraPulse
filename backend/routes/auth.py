
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
import uuid, os, re

from core.rate_limiter import limiter
from db.database import get_db
from db.models import Tenant, UserProfile, RoleEnum
from schemas import (
    RegisterRequest, LoginRequest, AuthResponse, MeResponse,
    UserProfileOut, TenantOut, UserProfileUpdate, PasswordUpdate,
    MessageResponse
)
from auth_utils import (
    hash_password, verify_password,
    create_access_token, create_refresh_token
)
from dependencies import get_current_user
from jose import jwt, JWTError

router = APIRouter(prefix="/auth", tags=["auth"])
security = HTTPBearer()

SECRET_KEY = os.getenv("SECRET_KEY")
ALGORITHM = os.getenv("ALGORITHM", "HS256")


# ---------------- HELPERS ----------------

def _slugify(text: str):
    text = text.lower().strip()
    text = re.sub(r"[^\w\s-]", "", text)
    text = re.sub(r"[\s_-]+", "-", text)
    return text.strip("-") or "org"


def _build_auth_response(user: UserProfile, db: Session):
    tenant = db.query(Tenant).filter(Tenant.id == user.tenant_id).first()
    profile = UserProfileOut.model_validate(user)

    return {
        "access_token": create_access_token({"sub": str(user.id)}),
        "refresh_token": create_refresh_token({"sub": str(user.id), "type": "refresh"}),
        "token_type": "bearer",
        "user": profile,
        "profile": profile,
        "tenant": TenantOut.model_validate(tenant) if tenant else None,
    }


# ---------------- ROUTES ----------------

@router.post("/register", response_model=AuthResponse)
@limiter.limit("3/minute")
def register(request: Request, body: RegisterRequest, db: Session = Depends(get_db)):
    if db.query(UserProfile).filter(UserProfile.email == body.email).first():
        raise HTTPException(400, "Email already exists")

    tenant = Tenant(
        id=uuid.uuid4(),
        name=body.tenant_name,
        slug=_slugify(body.tenant_name),
    )
    db.add(tenant)
    db.flush()

    user = UserProfile(
        id=uuid.uuid4(),
        email=body.email,
        full_name=body.full_name,
        password_hash=hash_password(body.password),
        role=RoleEnum.super_admin,
        tenant_id=tenant.id,
        is_active=True,
        account_status="active",
    )

    db.add(user)
    db.commit()
    db.refresh(user)

    return _build_auth_response(user, db)


@router.post("/login", response_model=AuthResponse)
@limiter.limit("5/minute")
def login(request: Request, body: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(UserProfile).filter(UserProfile.email == body.email).first()

    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(401, "Invalid credentials")

    return _build_auth_response(user, db)


@router.post("/refresh")
@limiter.limit("10/minute")
def refresh(request: Request, credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])

        if payload.get("type") != "refresh":
            raise HTTPException(401, "Invalid token")

        return {"access_token": create_access_token({"sub": payload["sub"]})}

    except JWTError:
        raise HTTPException(401, "Invalid token")


@router.get("/me", response_model=MeResponse)
@limiter.limit("30/minute")
def me(request: Request, current_user: UserProfile = Depends(get_current_user), db: Session = Depends(get_db)):
    tenant = db.query(Tenant).filter(Tenant.id == current_user.tenant_id).first()
    profile = UserProfileOut.model_validate(current_user)

    return {
        "user": profile,
        "profile": profile,
        "tenant": TenantOut.model_validate(tenant) if tenant else None,
    }


@router.patch("/me/profile")
@limiter.limit("20/minute")
def update_profile(request: Request, body: UserProfileUpdate, current_user: UserProfile = Depends(get_current_user), db: Session = Depends(get_db)):
    current_user.full_name = body.full_name
    db.commit()
    db.refresh(current_user)
    return UserProfileOut.model_validate(current_user)


@router.patch("/me/password")
@limiter.limit("5/minute")
def change_password(request: Request, body: PasswordUpdate, current_user: UserProfile = Depends(get_current_user), db: Session = Depends(get_db)):
    current_user.password_hash = hash_password(body.new_password)
    db.commit()
    return {"message": "Password updated"}
