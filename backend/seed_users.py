import os
import uuid
import boto3
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from db.models import Tenant, UserProfile, RoleEnum

user_pool_id = os.getenv("COGNITO_USER_POOL_ID")
region = os.getenv("COGNITO_REGION", "ap-south-1")
if not user_pool_id:
    print("⚠️ COGNITO_USER_POOL_ID not set. Skipping user seeding.")
    exit(0)

print(f"Connecting to Cognito User Pool: {user_pool_id} ({region})...")
try:
    client = boto3.client("cognito-idp", region_name=region)
    paginator = client.get_paginator("list_users")
    users = []
    for page in paginator.paginate(UserPoolId=user_pool_id):
        users.extend(page.get("Users", []))
    print(f"Found {len(users)} users in dev Cognito pool.")
except Exception as e:
    print(f"❌ Failed to fetch users from Cognito: {str(e)}")
    print("Make sure the local Moto Server container is running and healthy.")
    exit(0)

db_url = os.getenv("DATABASE_URL")
engine = create_engine(db_url)
Session = sessionmaker(bind=engine)
db = Session()

def _slugify(text: str) -> str:
    import re
    text = text.lower()
    text = re.sub(r"[^a-z0-9\-]", "-", text)
    text = re.sub(r"-+", "-", text)
    return text.strip("-")

try:
    for u in users:
        email = next((a["Value"] for a in u["Attributes"] if a["Name"] == "email"), None)
        sub = next((a["Value"] for a in u["Attributes"] if a["Name"] == "sub"), None)
        name = next((a["Value"] for a in u["Attributes"] if a["Name"] == "name"), None) or (email.split("@")[0].title() if email else "User")
        if not email or not sub:
            continue

        usr = db.query(UserProfile).filter((UserProfile.cognito_sub == sub) | (UserProfile.email == email)).first()
        if usr:
            if not usr.cognito_sub:
                usr.cognito_sub = sub
                db.commit()
                print(f"Linked existing user: {email} to sub: {sub}")
            continue

        # Create Tenant & User
        dom = email.split("@")[1].split(".")[0].title() if email else "Organisation"
        slug = _slugify(dom)
        t = db.query(Tenant).filter(Tenant.slug == slug).first()
        if not t:
            t = Tenant(
                id=uuid.uuid4(),
                name=f"{dom} Workspace",
                slug=slug,
                plan="pro"
            )
            db.add(t)
            db.commit()
            db.refresh(t)
            print(f"Created Tenant: {t.name} for {email}")

        usr = UserProfile(
            id=uuid.uuid4(),
            email=email,
            full_name=name,
            cognito_sub=sub,
            role=RoleEnum.admin,
            tenant_id=t.id,
            is_active=True,
            is_internal=True,
            account_status="active"
        )
        db.add(usr)
        db.commit()
        print(f"Seeded UserProfile: {email}")
    print("🎉 Idempotent Cognito user seeding complete!")
except Exception as e:
    db.rollback()
    print(f"❌ Database error: {str(e)}")
finally:
    db.close()
