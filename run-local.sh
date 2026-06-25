#!/bin/bash

# ==============================================================================
# AxioraPulse — Local Development Container Orchestrator
# ==============================================================================
# Automates secrets pulling, environment overriding, and isolated Docker execution
# for frontend, backend, and PostgreSQL database.
# ==============================================================================

set -e

# --- Default Variables ---
REBUILD="false"
OVERRIDE_PROFILE=""
OVERRIDE_ENV=""
DOWN="false"
TEST="false"

# --- Print Help Menu ---
print_help() {
  cat << EOF
AxioraPulse Container Orchestrator

Usage: ./run-local.sh [options]

Options:
  -d, --down           Stop and tear down the containers, networks, and keep volumes.
  -r, --rebuild        Force rebuild of Docker images during startup.
  -t, --test           Run local linters and tests (starts DB & Floci, runs tests, then shuts down).
  -p, --profile [prof] Override the AWS profile to use.
  -e, --env [env]      Override the SSM Parameter Store environment (production/development/staging).
  -h, --help           Show this help message.

Branch-to-Environment Mappings (Default):
  main                 --> AWS Profile: default | SSM: production
  staging|release/*    --> AWS Profile: qa      | SSM: staging
  develop (or others)  --> AWS Profile: dev     | SSM: dev
EOF
}

# --- Parse Arguments ---
while [[ $# -gt 0 ]]; do
  case "$1" in
    -d|--down)
      DOWN="true"
      shift
      ;;
    -r|--rebuild)
      REBUILD="true"
      shift
      ;;
    -t|--test)
      TEST="true"
      shift
      ;;
    -p|--profile)
      OVERRIDE_PROFILE="$2"
      shift 2
      ;;
    -e|--env)
      OVERRIDE_ENV="$2"
      shift 2
      ;;
    -h|--help)
      print_help
      exit 0
      ;;
    *)
      echo "❌ Unknown option: $1"
      print_help
      exit 1
      ;;
  esac
done

# --- Check Container Engine Status (Docker or Podman) ---
DOCKER_CMD="docker"
if ! docker info >/dev/null 2>&1; then
  if podman info >/dev/null 2>&1; then
    DOCKER_CMD="podman"
    echo "🐳 Docker is not active, but Podman is running. Using Podman as the container engine."
  else
    echo "❌ Error: Neither Docker nor Podman is active."
    if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "cygwin" ]]; then
      if [ -f "/c/Program Files/Docker/Docker/Docker Desktop.exe" ]; then
        echo "💡 Docker Desktop is installed but not running. You can launch it using Git Bash:"
        echo '   "/c/Program Files/Docker/Docker/Docker Desktop.exe" &'
      else
        echo "   Please start Docker Desktop or your Podman machine."
      fi
    elif [[ "$OSTYPE" == "darwin"* ]]; then
      if [ -d "/Applications/Docker.app" ]; then
        echo "💡 Docker Desktop is installed but not running. You can launch it using:"
        echo "   open -a Docker"
      else
        echo "   Please start Docker Desktop or your Podman machine."
      fi
    else
      echo "   Please start the docker service (e.g., 'sudo systemctl start docker') or your Podman service."
    fi
    exit 1
  fi
fi

# --- Handle Tear Down ---
if [ "$DOWN" = "true" ]; then
  echo "🛑 Stopping and tearing down the container stack..."
  $DOCKER_CMD compose -f docker-compose.local.yml down
  
  echo "🛑 Stopping Super Admin Console processes..."
  ADMIN_API_PID=$(lsof -t -i :8001 2>/dev/null || true)
  if [ -n "$ADMIN_API_PID" ]; then
    kill $ADMIN_API_PID 2>/dev/null || true
  fi
  ADMIN_WEB_PID=$(lsof -t -i :5175 2>/dev/null || true)
  if [ -n "$ADMIN_WEB_PID" ]; then
    kill $ADMIN_WEB_PID 2>/dev/null || true
  fi
  
  echo "✨ System stopped."
  exit 0
fi

# --- Architecture & Platform Check ---
HOST_ARCH=$(uname -m | tr '[:upper:]' '[:lower:]')
TARGET_PLATFORM=""

case "$HOST_ARCH" in
  x86_64|amd64)
    TARGET_PLATFORM="linux/amd64"
    ;;
  arm64|aarch64)
    TARGET_PLATFORM="linux/arm64"
    ;;
  *)
    TARGET_PLATFORM=""
    ;;
esac

if [ -n "$TARGET_PLATFORM" ]; then
  # 1. Clean up DOCKER_DEFAULT_PLATFORM if it conflicts with host architecture
  if [ -n "$DOCKER_DEFAULT_PLATFORM" ] && [ "$DOCKER_DEFAULT_PLATFORM" != "$TARGET_PLATFORM" ]; then
    echo "⚠️  Warning: DOCKER_DEFAULT_PLATFORM is set to '$DOCKER_DEFAULT_PLATFORM', but your host architecture is $HOST_ARCH ($TARGET_PLATFORM)."
    echo "   Clearing DOCKER_DEFAULT_PLATFORM for this session to prevent 'exec format error'..."
    unset DOCKER_DEFAULT_PLATFORM
  fi

  # 2. Check for cached images with mismatched architectures
  # Official and custom build images
  for img in "postgres:17-bookworm" "floci/floci:latest" "axiorapulse-pulse-backend" "axiorapulse-pulse-frontend"; do
    if $DOCKER_CMD image inspect "$img" >/dev/null 2>&1; then
      IMG_ARCH=$($DOCKER_CMD inspect "$img" --format '{{.Architecture}}' 2>/dev/null | tr '[:upper:]' '[:lower:]')
      if [ -n "$IMG_ARCH" ]; then
        EXPECTED_ARCH=""
        if [ "$TARGET_PLATFORM" = "linux/amd64" ]; then
          EXPECTED_ARCH="amd64"
        elif [ "$TARGET_PLATFORM" = "linux/arm64" ]; then
          EXPECTED_ARCH="arm64"
        fi

        if [ -n "$EXPECTED_ARCH" ] && [ "$IMG_ARCH" != "$EXPECTED_ARCH" ]; then
          echo "🔄 Mismatched architecture detected for image '$img' (cached: $IMG_ARCH, host: $EXPECTED_ARCH)."
          if [[ "$img" == *"pulse-backend"* || "$img" == *"pulse-frontend"* ]]; then
            echo "   Forcing rebuild of local service image..."
            REBUILD="true"
          else
            echo "   Pulling the correct $TARGET_PLATFORM image..."
            $DOCKER_CMD pull --platform "$TARGET_PLATFORM" "$img"
          fi
        fi
      fi
    fi
  done
fi

# --- Git Branch & Profile Mapping ---
BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "develop")

case "$BRANCH" in
  main)
    DEFAULT_PROFILE="default"
    DEFAULT_ENV="production"
    ;;
  staging|release/*)
    DEFAULT_PROFILE="qa"
    DEFAULT_ENV="staging"
    ;;
  develop)
    DEFAULT_PROFILE="dev"
    DEFAULT_ENV="dev"
    ;;
  *)
    DEFAULT_PROFILE="dev"
    DEFAULT_ENV="dev"
    echo "💡 Feature/custom branch '$BRANCH' detected. Mapping to 'dev' environment."
    ;;
esac

AWS_PROFILE="${OVERRIDE_PROFILE:-$DEFAULT_PROFILE}"
ENV="${OVERRIDE_ENV:-$DEFAULT_ENV}"

export AWS_PROFILE
export AWS_ACCESS_KEY_ID
export AWS_SECRET_ACCESS_KEY
export AWS_SESSION_TOKEN
export AWS_REGION="${AWS_REGION:-ap-south-1}"
export AWS_DEFAULT_REGION="${AWS_DEFAULT_REGION:-ap-south-1}"
export RESEND_API_KEY="${RESEND_API_KEY:-}"

echo "========================================================================"
echo "🚀 Preparing Local Container Environment"
echo "========================================================================"
echo "   Git Branch:   $BRANCH"
echo "   AWS Profile:  $AWS_PROFILE"
echo "   SSM Namespace: axiorapulse/$ENV"
echo "========================================================================"

# --- Generate Dummy Environment Files (to prevent Docker Compose startup error) ---
echo "⚙️  Preparing local environment files..."
mkdir -p backend frontend

# The backend fail-closes on a missing/insecure SECRET_KEY at import time, so an
# empty .env.docker would crash it before init_local_aws.py can generate the real
# one. Seed a valid bootstrap secret on first run to break that chicken-and-egg.
if [ ! -f backend/.env.docker ] || [ ! -s backend/.env.docker ]; then
  boot_secret=$(openssl rand -base64 48 2>/dev/null | tr -dc 'a-zA-Z0-9' | head -c 48)
  if [ -z "$boot_secret" ]; then
    boot_secret="bootstrap-secret-key-for-local-development-purposes"
  fi
  cat << EOF > backend/.env.docker
# Bootstrap env for first container start. Overwritten by init_local_aws.py.
SECRET_KEY=$boot_secret
ENVIRONMENT=development
EOF
fi

if [ ! -f frontend/.env.local ]; then
  touch frontend/.env.local
fi

# --- Startup Services (Unified) ---
echo "🌐 Spin up the local development/test container stack..."
if [ "$TEST" = "true" ]; then
  # Only need db, floci, and backend for running backend tests
  $DOCKER_CMD compose -f docker-compose.local.yml up -d pulse-db pulse-floci pulse-backend
else
  # Startup everything for local development
  if [ "$REBUILD" = "true" ]; then
    $DOCKER_CMD compose -f docker-compose.local.yml up --build -d -V pulse-db pulse-floci pulse-backend pulse-frontend
  else
    $DOCKER_CMD compose -f docker-compose.local.yml up -d pulse-db pulse-floci pulse-backend pulse-frontend
  fi
fi

# --- Wait for Backend to be Healthy ---
echo "⏳ Waiting for backend container to be healthy and start server..."
attempts=0
max_attempts=120
backend_ready=false
while [ $attempts -lt $max_attempts ]; do
  # Check if backend container is still running
  if ! $DOCKER_CMD ps --filter "name=pulse-backend" --filter "status=running" --format "{{.Names}}" | grep -q "pulse-backend"; then
    echo "❌ Error: Backend container 'pulse-backend' is no longer running."
    echo "📢 Backend container logs:"
    $DOCKER_CMD logs pulse-backend
    $DOCKER_CMD compose -f docker-compose.local.yml down
    exit 1
  fi

  if curl -s http://localhost:8000/health >/dev/null 2>&1; then
    backend_ready=true
    break
  fi
  
  attempts=$((attempts+1))
  if [ $((attempts % 10)) -eq 0 ]; then
    echo "   Waiting for backend... (${attempts}/${max_attempts}s)"
  fi
  sleep 1
done

if [ "$backend_ready" != "true" ]; then
  echo "❌ Error: Backend container did not become healthy in time (timeout after ${max_attempts}s)."
  echo "📢 Backend container logs:"
  $DOCKER_CMD logs pulse-backend
  $DOCKER_CMD compose -f docker-compose.local.yml down
  exit 1
fi

# --- Seed Floci Server (SSM & Cognito) inside the running container ---
echo "🌱 Initializing local mock AWS resources (Floci)..."
$DOCKER_CMD exec -i pulse-backend python init_local_aws.py

# --- Move generated Frontend env file ---
if [ -f backend/.env.local ]; then
  mv backend/.env.local frontend/.env.local
  echo "✅ Mapped generated Cognito credentials to frontend."
else
  echo "⚠️ Warning: backend/.env.local not found. Skipping frontend mapping."
fi

# --- Run Local Tests inside Backend Container if Flag is set ---
if [ "$TEST" = "true" ]; then
  echo "========================================================================"
  echo "🔍 Running Local Linters and Tests inside Backend Container"
  echo "========================================================================"

  # Temporarily disable set -e to collect all failures
  set +e

  echo "📦 Installing test dependencies inside container..."
  $DOCKER_CMD exec pulse-backend pip install pytest ruff alembic pytest-cov
  INSTALL_EXIT=$?

  if [ $INSTALL_EXIT -ne 0 ]; then
    echo "❌ Error: Failed to install test dependencies inside the container."
    $DOCKER_CMD compose -f docker-compose.local.yml down
    exit $INSTALL_EXIT
  fi

  echo "👉 Running Ruff Check..."
  $DOCKER_CMD exec pulse-backend ruff check .
  RUFF_CHECK_EXIT=$?

  echo "👉 Running Ruff Format Check..."
  $DOCKER_CMD exec pulse-backend ruff format --check .
  RUFF_FORMAT_EXIT=$?

  echo "👉 Running Alembic Migrations on Test DB..."
  $DOCKER_CMD exec pulse-backend alembic upgrade head
  ALEMBIC_EXIT=$?

  TEST_EXIT_CODE=0
  if [ $ALEMBIC_EXIT -eq 0 ]; then
    echo "👉 Running Backend Pytest with Coverage..."
    $DOCKER_CMD exec -e PYTHONPATH=. pulse-backend pytest --cov=. --cov-report=term-missing --cov-config=.coveragerc tests
    TEST_EXIT_CODE=$?
  else
    echo "❌ Skipping pytest because database migrations failed."
    TEST_EXIT_CODE=$ALEMBIC_EXIT
  fi

  # Restore set -e
  set -e

  echo "🛑 Tearing down local test containers..."
  $DOCKER_CMD compose -f docker-compose.local.yml down >/dev/null 2>&1 || true

  # Determine final exit status
  echo "📊 Exit Codes -> Ruff Check: $RUFF_CHECK_EXIT | Ruff Format: $RUFF_FORMAT_EXIT | Alembic: $ALEMBIC_EXIT | Pytest: $TEST_EXIT_CODE"
  if [ $RUFF_CHECK_EXIT -eq 0 ] && [ $RUFF_FORMAT_EXIT -eq 0 ] && [ $ALEMBIC_EXIT -eq 0 ] && [ $TEST_EXIT_CODE -eq 0 ]; then
    echo "✅ All checks and tests passed successfully!"
    exit 0
  else
    echo "❌ Some checks or tests failed."
    exit 1
  fi
fi

if [ "$backend_ready" = "true" ]; then
  echo "🌱 Idempotently seeding Cognito users into the local PostgreSQL database..."
  $DOCKER_CMD exec -i pulse-backend python -c '
import os, uuid, boto3
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from db.models import Tenant, UserProfile, RoleEnum

region = os.getenv("COGNITO_REGION", "ap-south-1")
endpoint = os.getenv("AWS_ENDPOINT_URL", "http://pulse-floci:4566")

# Always fetch User Pool ID dynamically from local SSM first
try:
    ssm = boto3.client("ssm", region_name=region, endpoint_url=endpoint, aws_access_key_id="mock", aws_secret_access_key="mock")
    res = ssm.get_parameter(Name="/axiorapulse/dev/COGNITO_USER_POOL_ID")
    user_pool_id = res["Parameter"]["Value"]
except Exception as e:
    user_pool_id = os.getenv("COGNITO_USER_POOL_ID")
    print(f"⚠️ Failed to fetch Cognito User Pool ID from SSM: {str(e)}. Falling back to environment variable.")

if not user_pool_id:
    print("⚠️ COGNITO_USER_POOL_ID not resolved. Skipping user seeding.")
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
    print("Make sure the local Floci Server container is running and healthy.")
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
            role=RoleEnum.super_admin if email == "roopsai.work8@gmail.com" else RoleEnum.admin,
            tenant_id=t.id,
            is_active=True,
            is_internal=True,
            account_status="active"
        )
        db.add(usr)
        db.commit()
        print(f"Seeded UserProfile: {email}")

    # Explicitly ensure the super admin user is seeded and correctly configured even if not present in Cognito
    sa_email = "roopsai.work8@gmail.com"
    sa_usr = db.query(UserProfile).filter(UserProfile.email == sa_email).first()
    if not sa_usr:
        dom = "Axiora"
        slug = "axiora"
        t = db.query(Tenant).filter(Tenant.slug == slug).first()
        if not t:
            t = Tenant(
                id=uuid.uuid4(),
                name="Axiora Workspace",
                slug=slug,
                plan="enterprise"
            )
            db.add(t)
            db.commit()
            db.refresh(t)
            print(f"Created Tenant: {t.name} for Super Admin")

        sa_usr = UserProfile(
            id=uuid.uuid4(),
            email=sa_email,
            full_name="Super Admin",
            cognito_sub=None,
            role=RoleEnum.super_admin,
            tenant_id=t.id,
            is_active=True,
            is_internal=True,
            account_status="active"
        )
        db.add(sa_usr)
        db.commit()
        print(f"Explicitly seeded Super Admin UserProfile: {sa_email}")
    else:
        # Update existing profile to ensure it has super_admin role and is_internal = True
        updated = False
        if sa_usr.role != RoleEnum.super_admin:
            sa_usr.role = RoleEnum.super_admin
            updated = True
        if not sa_usr.is_internal:
            sa_usr.is_internal = True
            updated = True
        if updated:
            db.commit()
            print(f"Explicitly promoted existing UserProfile to Super Admin: {sa_email}")

        # Seed a mock personal user and workspace if they do not exist
        personal_email = "john.doe@gmail.com"
        personal_usr = db.query(UserProfile).filter(UserProfile.email == personal_email).first()
        if not personal_usr:
            pt = Tenant(
                id=uuid.uuid4(),
                name="John Doe Personal Workspace",
                slug="johndoe",
                plan="free",
                account_type="personal"
            )
            db.add(pt)
            db.commit()
            db.refresh(pt)
            
            personal_usr = UserProfile(
                id=uuid.uuid4(),
                email=personal_email,
                full_name="John Doe",
                cognito_sub=None,
                role=RoleEnum.creator,
                tenant_id=pt.id,
                is_active=True,
                is_internal=False,
                account_status="active"
            )
            db.add(personal_usr)
            db.commit()
            print("Seeded mock personal user and tenant.")

    # Idempotently seed mock plans, surveys, subscriptions, payments, demos, and waitlist
    from db.models import Plan, Survey, SurveyStatusEnum, Subscription, Payment, DemoSchedule, WaitlistEntry
    import datetime as dt

    # 1. Seed/Update Plans
    plans_to_seed = [
        {
            "id": uuid.UUID("3c7b3b3a-33c3-448c-9c76-f3b610c3b0f5"),
            "code": "basic",
            "name": "Basic",
            "price_paise": 290000,
            "billing_period": "monthly"
        },
        {
            "id": uuid.UUID("3c7b3b3a-33c3-448c-9c76-f3b610c3b0f6"),
            "code": "pro",
            "name": "Pro",
            "price_paise": 790000,
            "billing_period": "monthly"
        },
        {
            "id": uuid.UUID("3c7b3b3a-33c3-448c-9c76-f3b610c3b0f7"),
            "code": "enterprise",
            "name": "Enterprise",
            "price_paise": 4990000,
            "billing_period": "monthly"
        }
    ]
    plan_map = {}
    for p in plans_to_seed:
        existing = db.query(Plan).filter((Plan.id == p["id"]) | (Plan.code == p["code"])).first()
        if not existing:
            plan = Plan(
                id=p["id"],
                code=p["code"],
                name=p["name"],
                price_paise=p["price_paise"],
                billing_period=p["billing_period"],
                is_active=True
            )
            db.add(plan)
            db.commit()
            db.refresh(plan)
            plan_map[p["code"]] = plan
        else:
            existing.price_paise = p["price_paise"]
            db.commit()
            plan_map[p["code"]] = existing

    # 2. Seed mock surveys, subscriptions, payments for tenants
    all_tenants = db.query(Tenant).all()
    now = dt.datetime.now(dt.timezone.utc)
    for t in all_tenants:
        admin_user = db.query(UserProfile).filter(UserProfile.tenant_id == t.id).first()
        creator_id = admin_user.id if admin_user else None

        # Surveys
        s_count = db.query(Survey).filter(Survey.tenant_id == t.id).count()
        if s_count == 0:
            mock_surveys = [
                {
                    "title": f"{t.name} Customer Satisfaction",
                    "slug": f"{t.slug}-csat",
                },
                {
                    "title": f"{t.name} Product Feedback",
                    "slug": f"{t.slug}-feedback",
                }
            ]
            for ms in mock_surveys:
                survey = Survey(
                    id=uuid.uuid4(),
                    title=ms["title"],
                    slug=ms["slug"],
                    status=SurveyStatusEnum.active,
                    tenant_id=t.id,
                    created_by=creator_id
                )
                db.add(survey)
            db.commit()

        # Subscription
        plan_code = "pro"
        if "enterprise" in t.plan or t.slug == "axiorapulse":
            plan_code = "enterprise"
        elif t.slug == "axioraadmin":
            plan_code = "basic"
        plan = plan_map[plan_code]

        sub = db.query(Subscription).filter(Subscription.tenant_id == t.id).first()
        if not sub:
            sub = Subscription(
                id=uuid.uuid4(),
                tenant_id=t.id,
                plan_id=plan.id,
                status="active",
                razorpay_subscription_id=f"sub_mock_{uuid.uuid4().hex[:12]}",
                current_period_start=now - dt.timedelta(days=15),
                current_period_end=now + dt.timedelta(days=15),
                cancel_at_period_end=False
            )
            db.add(sub)
            db.commit()
            db.refresh(sub)
        else:
            sub.plan_id = plan.id
            db.commit()

        # Payments
        pay_count = db.query(Payment).filter(Payment.tenant_id == t.id).count()
        if pay_count == 0:
            p1 = Payment(
                id=uuid.uuid4(),
                tenant_id=t.id,
                subscription_id=sub.id,
                plan_id=plan.id,
                razorpay_order_id=f"order_mock_{uuid.uuid4().hex[:12]}",
                razorpay_payment_id=f"pay_mock_{uuid.uuid4().hex[:12]}",
                amount_paise=plan.price_paise,
                currency="INR",
                status="paid",
                method="card",
                paid_at=now - dt.timedelta(days=2),
                created_at=now - dt.timedelta(days=2)
            )
            db.add(p1)
            
            p2 = Payment(
                id=uuid.uuid4(),
                tenant_id=t.id,
                subscription_id=sub.id,
                plan_id=plan.id,
                razorpay_order_id=f"order_mock_{uuid.uuid4().hex[:12]}",
                razorpay_payment_id=f"pay_mock_{uuid.uuid4().hex[:12]}",
                amount_paise=plan.price_paise,
                currency="INR",
                status="paid",
                method="upi",
                paid_at=now - dt.timedelta(days=10),
                created_at=now - dt.timedelta(days=10)
            )
            db.add(p2)

            for i in range(1, 6):
                pm = Payment(
                    id=uuid.uuid4(),
                    tenant_id=t.id,
                    subscription_id=sub.id,
                    plan_id=plan.id,
                    razorpay_order_id=f"order_mock_{uuid.uuid4().hex[:12]}",
                    razorpay_payment_id=f"pay_mock_{uuid.uuid4().hex[:12]}",
                    amount_paise=plan.price_paise,
                    currency="INR",
                    status="paid",
                    method="netbanking",
                    paid_at=now - dt.timedelta(days=30 * i),
                    created_at=now - dt.timedelta(days=30 * i)
                )
                db.add(pm)
            db.commit()

    # 3. Seed Demo Schedules
    demo_count = db.query(DemoSchedule).count()
    if demo_count == 0:
        demos = [
            {"name": "Arjun Sharma", "email": "arjun.sharma@gmail.com", "date": (now + dt.timedelta(days=2)).strftime("%Y-%m-%d"), "time": "10:00 AM - 10:30 AM", "status": "scheduled"},
            {"name": "Priya Patel", "email": "priya.patel@techsolutions.in", "date": (now + dt.timedelta(days=3)).strftime("%Y-%m-%d"), "time": "2:30 PM - 3:00 PM", "status": "scheduled"},
            {"name": "John Doe", "email": "john.doe@enterprise.com", "date": (now - dt.timedelta(days=1)).strftime("%Y-%m-%d"), "time": "11:30 AM - 12:00 PM", "status": "completed"}
        ]
        for idx, d in enumerate(demos):
            ds = DemoSchedule(
                id=str(uuid.uuid4()),
                name=d["name"],
                email=d["email"],
                demo_date=d["date"],
                time_slot=d["time"],
                meeting_link=f"https://meet.google.com/abc-mock-link-{idx}",
                status=d["status"],
                created_at=now - dt.timedelta(days=idx+1)
            )
            db.add(ds)
        db.commit()

    # 4. Seed Waitlist
    waitlist_count = db.query(WaitlistEntry).count()
    if waitlist_count == 0:
        emails = ["rajesh.kumar@infotech.in", "sarah.connor@skyline.org", "vikram.singh@solutions.co.in", "amit.gupta@startup.io", "elizabeth.swann@caribbean.com"]
        for idx, email in enumerate(emails):
            we = WaitlistEntry(
                id=str(uuid.uuid4()),
                email=email,
                created_at=now - dt.timedelta(days=idx)
            )
            db.add(we)
        db.commit()

    print("🎉 Idempotent Cognito user seeding complete!")
except Exception as e:
    db.rollback()
    print(f"❌ Database error: {str(e)}")
finally:
    db.close()
' || echo "⚠️ User seeding script failed to execute."
else
  echo "⚠️ Backend did not become healthy in time. Skipping Cognito user seeding."
fi

# --- Boot Super Admin Console (FastAPI and Vite) ---
echo "🚀 Starting Super Admin Console..."
cd super-admin/server
if [ ! -d "venv" ]; then
  echo "🔧 Creating python virtual environment for Super Admin API..."
  python3 -m venv venv
fi
source venv/bin/activate
pip install --disable-pip-version-check -r requirements.txt >/dev/null 2>&1
python3 main.py > api.log 2>&1 &
cd ../..

cd super-admin/web
if [ ! -d "node_modules" ]; then
  echo "📥 Installing frontend packages for Super Admin Web..."
  npm install >/dev/null 2>&1
fi
npm run dev > web.log 2>&1 &
cd ../..

echo "========================================================================"
echo "✅ AxioraPulse container stack is up and active!"
echo "========================================================================"
echo "   🖥️  Frontend UI:          http://localhost:5173"
echo "   ⚙️  Backend API:          http://localhost:8000"
echo "   📖 API Swagger Docs:      http://localhost:8000/docs"
echo "   🖥️  Super Admin Console:  http://localhost:5175"
echo "   ⚙️  Super Admin API Docs: http://localhost:8001/docs"
echo "   🗄️  Local DB Port:        5432 (Persistent)"
echo "========================================================================"
echo "💡 To monitor container logs, run:"
echo "   $DOCKER_CMD compose -f docker-compose.local.yml logs -f"
echo ""
echo "💡 To shutdown the container network and admin console, run:"
echo "   ./run-local.sh --down"
echo "========================================================================"

