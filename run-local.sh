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

# --- Print Help Menu ---
print_help() {
  cat << EOF
AxioraPulse Container Orchestrator

Usage: ./run-local.sh [options]

Options:
  -d, --down           Stop and tear down the containers, networks, and keep volumes.
  -r, --rebuild        Force rebuild of Docker images during startup.
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

# --- Handle Tear Down ---
if [ "$DOWN" = "true" ]; then
  echo "🛑 Stopping and tearing down the container stack..."
  docker compose -f docker-compose.local.yml down
  echo "✨ System stopped."
  exit 0
fi

# --- Check Docker Status ---
if ! docker info >/dev/null 2>&1; then
  echo "❌ Error: Docker is not running. Please launch Docker Desktop or the Docker daemon."
  exit 1
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
  for img in "postgres:17" "motoserver/moto:latest" "axiorapulse-pulse-backend" "axiorapulse-pulse-frontend"; do
    if docker image inspect "$img" >/dev/null 2>&1; then
      IMG_ARCH=$(docker inspect "$img" --format '{{.Architecture}}' 2>/dev/null | tr '[:upper:]' '[:lower:]')
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
            docker pull --platform "$TARGET_PLATFORM" "$img"
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
touch backend/.env.docker
touch frontend/.env.local

# --- Startup Moto & Database First ---
echo "🌐 Spinning up Moto Server and Database containers..."
docker compose -f docker-compose.local.yml up -d pulse-moto pulse-db

# --- Build Backend Container to run Moto seed script ---
echo "📦 Building backend container..."
docker compose -f docker-compose.local.yml build pulse-backend

# --- Seed Moto Server (SSM & Cognito) ---
echo "🌱 Initializing local mock AWS resources (Moto)..."
docker compose -f docker-compose.local.yml run --rm --entrypoint python pulse-backend init_local_aws.py

# --- Move generated Frontend env file ---
if [ -f backend/.env.local ]; then
  mv backend/.env.local frontend/.env.local
  echo "✅ Mapped generated Cognito credentials to frontend."
else
  echo "❌ Error: backend/.env.local not found. Moto initialization failed."
  exit 1
fi

# --- Startup Services ---
echo "🌐 Initializing Docker network & persistent storage..."
echo "🚀 Spining up local development container stack..."

if [ "$REBUILD" = "true" ]; then
  docker compose -f docker-compose.local.yml up --build -d -V --force-recreate pulse-backend pulse-frontend
else
  docker compose -f docker-compose.local.yml up -d --force-recreate pulse-backend pulse-frontend
fi

# --- Wait for Backend to be Healthy & Seed Users ---
echo "⏳ Waiting for backend container to be healthy and start server..."
attempts=0
max_attempts=30
backend_ready=false
while [ $attempts -lt $max_attempts ]; do
  if curl -s http://localhost:8000/health >/dev/null 2>&1; then
    backend_ready=true
    break
  fi
  sleep 1
  attempts=$((attempts+1))
done

if [ "$backend_ready" = "true" ]; then
  echo "🌱 Idempotently seeding Cognito users into the local PostgreSQL database..."
  docker exec -i pulse-backend python -c '
import os, uuid, boto3
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
' || echo "⚠️ User seeding script failed to execute."
else
  echo "⚠️ Backend did not become healthy in time. Skipping Cognito user seeding."
fi

echo "========================================================================"
echo "✅ AxioraPulse container stack is up and active!"
echo "========================================================================"
echo "   🖥️  Frontend UI:    http://localhost:5173"
echo "   ⚙️  Backend API:    http://localhost:8000"
echo "   📖 API Swagger Docs: http://localhost:8000/docs"
echo "   🗄️  Local DB Port:  5432 (Persistent)"
echo "========================================================================"
echo "💡 To monitor container logs, run:"
echo "   docker compose -f docker-compose.local.yml logs -f"
echo ""
echo "💡 To shutdown the container network, run:"
echo "   ./run-local.sh --down"
echo "========================================================================"
