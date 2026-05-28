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

# --- Build AWS CLI Credentials Arguments for Container ---
AWS_ENV_ARGS=()
if [ -n "$AWS_ACCESS_KEY_ID" ]; then
  AWS_ENV_ARGS+=(-e "AWS_ACCESS_KEY_ID=$AWS_ACCESS_KEY_ID")
fi
if [ -n "$AWS_SECRET_ACCESS_KEY" ]; then
  AWS_ENV_ARGS+=(-e "AWS_SECRET_ACCESS_KEY=$AWS_SECRET_ACCESS_KEY")
fi
if [ -n "$AWS_SESSION_TOKEN" ]; then
  AWS_ENV_ARGS+=(-e "AWS_SESSION_TOKEN=$AWS_SESSION_TOKEN")
fi
if [ -n "$AWS_REGION" ]; then
  AWS_ENV_ARGS+=(-e "AWS_REGION=$AWS_REGION")
fi
if [ -n "$AWS_DEFAULT_REGION" ]; then
  AWS_ENV_ARGS+=(-e "AWS_DEFAULT_REGION=$AWS_DEFAULT_REGION")
fi

AWS_MOUNT_ARGS=()
if [ -d "$HOME/.aws" ]; then
  AWS_MOUNT_ARGS=(-v "$HOME/.aws:/root/.aws:ro")
fi

# --- Pull Secrets via Chamber ---
# To support global parameters (like COGNITO_ at the root level /axiorapulse/)
# and environment-specific parameters (like DATABASE_URL under /axiorapulse/dev/),
# we run Chamber twice and merge the results.
echo "📥 Pulling global secrets from AWS SSM Parameter Store (axiorapulse)..."
rm -f .env.pulled.global .env.pulled.env .env.pulled .chamber.global.err .chamber.env.err
set +e

MSYS_NO_PATHCONV=1 docker run --rm \
  "${AWS_MOUNT_ARGS[@]}" \
  "${AWS_ENV_ARGS[@]}" \
  -e HOME=/root \
  -e AWS_PROFILE="$AWS_PROFILE" \
  -e AWS_REGION="ap-south-1" \
  -e AWS_DEFAULT_REGION="ap-south-1" \
  segment/chamber:3 export --format dotenv axiorapulse > .env.pulled.global 2> .chamber.global.err
GLOBAL_STATUS=$?

echo "📥 Pulling environment-specific secrets from AWS SSM Parameter Store (axiorapulse/$ENV)..."
MSYS_NO_PATHCONV=1 docker run --rm \
  "${AWS_MOUNT_ARGS[@]}" \
  "${AWS_ENV_ARGS[@]}" \
  -e HOME=/root \
  -e AWS_PROFILE="$AWS_PROFILE" \
  -e AWS_REGION="ap-south-1" \
  -e AWS_DEFAULT_REGION="ap-south-1" \
  segment/chamber:3 export --format dotenv axiorapulse/"$ENV" > .env.pulled.env 2> .chamber.env.err
ENV_STATUS=$?
set -e

if [ $ENV_STATUS -ne 0 ]; then
  echo "❌ Error: Failed to pull environment-specific secrets using Chamber."
  echo "----------------------------------------------------"
  cat .chamber.env.err || echo "No error log available"
  echo "----------------------------------------------------"
  echo "Please verify:"
  echo "  1. Docker has permission to mount $HOME/.aws."
  echo "  2. Your AWS SSO session or access keys for profile '$AWS_PROFILE' are active."
  echo "     Run 'aws sso login --profile $AWS_PROFILE' if your SSO session expired."
  echo "  3. The SSM namespace '/axiorapulse/$ENV' exists in your ap-south-1 region."
  rm -f .env.pulled.global .env.pulled.env .chamber.global.err .chamber.env.err
  exit 1
fi

if [ $GLOBAL_STATUS -ne 0 ]; then
  echo "⚠️ Warning: Failed to pull global secrets (axiorapulse)."
  echo "   Cognito configuration might not be set in SSM root namespace."
  cat .chamber.global.err || true
fi

# Combine pulled secrets
cat .env.pulled.global .env.pulled.env > .env.pulled 2>/dev/null || true
rm -f .env.pulled.global .env.pulled.env .chamber.global.err .chamber.env.err

# --- Generate Environment Files ---
echo "⚙️  Generating containerized configuration overrides..."

# 1. Generate Backend env
echo "# ======================================================================" > backend/.env.docker
echo "# Generated from AWS SSM (axiorapulse/$ENV) via Chamber" >> backend/.env.docker
echo "# ======================================================================" >> backend/.env.docker
cat .env.pulled >> backend/.env.docker
echo "" >> backend/.env.docker
echo "# Local Container Overrides" >> backend/.env.docker
echo "DATABASE_URL=postgresql://postgres:root@pulse-db:5432/nexpulse" >> backend/.env.docker
echo "FRONTEND_URL=http://localhost:5173" >> backend/.env.docker
echo "ENVIRONMENT=development" >> backend/.env.docker
echo "MOCK_COGNITO=false" >> backend/.env.docker

# 2. Generate Frontend env
echo "# ======================================================================" > frontend/.env.local
echo "# Generated from AWS SSM (axiorapulse/$ENV) via Chamber" >> frontend/.env.local
echo "# ======================================================================" >> frontend/.env.local

# Loop through pulled parameters to extract VITE_ vars and map COGNITO_ vars
while IFS= read -r line || [ -n "$line" ]; do
  # Skip comments and empty lines
  if [[ "$line" =~ ^# ]] || [[ -z "$line" ]]; then
    continue
  fi

  # Forward any existing VITE_ prefix variables
  if [[ "$line" =~ ^VITE_ ]]; then
    echo "$line" >> frontend/.env.local
  # Map Cognito parameters to their Vite equivalents
  elif [[ "$line" =~ ^COGNITO_ ]]; then
    echo "VITE_$line" >> frontend/.env.local
  fi
done < .env.pulled

echo "" >> frontend/.env.local
echo "# Local Container Overrides" >> frontend/.env.local
echo "VITE_API_BASE_URL=http://localhost:8000" >> frontend/.env.local
echo "VITE_MOCK_COGNITO=false" >> frontend/.env.local

rm -f .env.pulled

# --- Startup Services ---
echo "🌐 Initializing Docker network & persistent storage..."
echo "🚀 Spining up local development container stack..."

if [ "$REBUILD" = "true" ]; then
  docker compose -f docker-compose.local.yml up --build -d -V
else
  docker compose -f docker-compose.local.yml up -d
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
    print("Make sure you are logged in to AWS (e.g. \"aws sso login --profile dev\") and your session is active.")
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
