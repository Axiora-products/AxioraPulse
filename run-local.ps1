<#
.SYNOPSIS
    AxioraPulse — Local Development Container Orchestrator for PowerShell (Docker & Podman support)
.DESCRIPTION
    Automates secrets pulling, environment overriding, and isolated Docker/Podman execution
    for frontend, backend, and PostgreSQL database.
.PARAMETER Down
    Stop and tear down the containers, networks, and keep volumes.
.PARAMETER Rebuild
    Force rebuild of Docker/Podman images during startup.
.PARAMETER Profile
    Override the AWS profile to use.
.PARAMETER Env
    Override the SSM Parameter Store environment (production/staging/dev).
.PARAMETER Help
    Show this help message.
#>
param (
    [Alias("d")]
    [Switch]$Down,

    [Alias("r")]
    [Switch]$Rebuild,

    [Alias("p")]
    [String]$Profile,

    [Alias("e")]
    [String]$EnvName,

    [Alias("h")]
    [Switch]$Help
)

# --- Print Help Menu ---
if ($Help) {
    Write-Host "AxioraPulse Container Orchestrator"
    Write-Host ""
    Write-Host "Usage: .\run-local.ps1 [options]"
    Write-Host ""
    Write-Host "Options:"
    Write-Host "  -d, -Down           Stop and tear down the containers, networks, and keep volumes."
    Write-Host "  -r, -Rebuild        Force rebuild of Docker/Podman images during startup."
    Write-Host "  -p, -Profile [prof] Override the AWS profile to use."
    Write-Host "  -e, -EnvName [env]  Override the SSM Parameter Store environment (production/development/staging)."
    Write-Host "  -h, -Help           Show this help message."
    Write-Host ""
    Write-Host "Branch-to-Environment Mappings (Default):"
    Write-Host "  main                 --> AWS Profile: default | SSM: production"
    Write-Host "  staging|release/*    --> AWS Profile: qa      | SSM: staging"
    Write-Host "  develop (or others)  --> AWS Profile: dev     | SSM: dev"
    exit 0
}

# --- Check Container Engine Status (Docker or Podman) ---
$DockerCmd = "docker"

# Check if Docker is running
docker info >$null 2>&1
if ($LASTEXITCODE -ne 0) {
    # Check if Podman is running
    podman info >$null 2>&1
    if ($LASTEXITCODE -eq 0) {
        $DockerCmd = "podman"
        Write-Host "🐳 Docker is not active, but Podman is running. Using Podman as the container engine."
    } else {
        Write-Host "❌ Error: Neither Docker nor Podman is active."
        $DockerDesktopPath = "C:\Program Files\Docker\Docker\Docker Desktop.exe"
        if (Test-Path -Path $DockerDesktopPath) {
            Write-Host "💡 Docker Desktop is installed but not running. You can start it from your start menu or run:"
            Write-Host "   Start-Process '$DockerDesktopPath'"
        } else {
            Write-Host "   Please ensure Docker Desktop, the Docker daemon, or a Podman machine is running and try again."
        }
        exit 1
    }
}

# --- Handle Tear Down ---
if ($Down) {
    Write-Host "🛑 Stopping and tearing down the container stack..."
    & $DockerCmd compose -f docker-compose.local.yml down
    Write-Host "✨ System stopped."
    exit 0
}

# --- Architecture & Platform Check ---
$HostArch = ($env:PROCESSOR_ARCHITEW6432, $env:PROCESSOR_ARCHITECTURE | Where-Object {$_} | Select-Object -First 1)
if ($HostArch) {
    $HostArch = $HostArch.ToLower()
} else {
    $HostArch = "amd64"
}

$TargetPlatform = ""
if ($HostArch -eq "amd64") {
    $TargetPlatform = "linux/amd64"
} elseif ($HostArch -eq "arm64") {
    $TargetPlatform = "linux/arm64"
}

if ($TargetPlatform) {
    # 1. Clean up DOCKER_DEFAULT_PLATFORM if it conflicts with host architecture
    if ($env:DOCKER_DEFAULT_PLATFORM -and ($env:DOCKER_DEFAULT_PLATFORM -ne $TargetPlatform)) {
        Write-Host "⚠️  Warning: DOCKER_DEFAULT_PLATFORM is set to '$($env:DOCKER_DEFAULT_PLATFORM)', but your host architecture is $HostArch ($TargetPlatform)."
        Write-Host "   Clearing DOCKER_DEFAULT_PLATFORM for this session to prevent 'exec format error'..."
        Remove-Item Env:\DOCKER_DEFAULT_PLATFORM -ErrorAction SilentlyContinue
    }

    # 2. Check for cached images with mismatched architectures
    $Images = @("postgres:17", "motoserver/moto:latest", "axiorapulse-pulse-backend", "axiorapulse-pulse-frontend")
    foreach ($img in $Images) {
        & $DockerCmd image inspect $img >$null 2>&1
        if ($LASTEXITCODE -eq 0) {
            $ImgArch = (& $DockerCmd inspect $img --format '{{.Architecture}}' 2>$null)
            if ($ImgArch) {
                $ImgArch = $ImgArch.Trim().ToLower()
                $ExpectedArch = ""
                if ($TargetPlatform -eq "linux/amd64") {
                    $ExpectedArch = "amd64"
                } elseif ($TargetPlatform -eq "linux/arm64") {
                    $ExpectedArch = "arm64"
                }

                if ($ExpectedArch -and ($ImgArch -ne $ExpectedArch)) {
                    Write-Host "🔄 Mismatched architecture detected for image '$img' (cached: $ImgArch, host: $ExpectedArch)."
                    if ($img -like "*pulse-backend*" -or $img -like "*pulse-frontend*") {
                        Write-Host "   Forcing rebuild of local service image..."
                        $Rebuild = $true
                    } else {
                        Write-Host "   Pulling the correct $TargetPlatform image..."
                        & $DockerCmd pull --platform $TargetPlatform $img
                    }
                }
            }
        }
    }
}

# --- Git Branch & Profile Mapping ---
$Branch = "develop"
try {
    $GitBranch = (git rev-parse --abbrev-ref HEAD 2>$null)
    if ($GitBranch) {
        $Branch = $GitBranch.Trim()
    }
} catch {}

$DefaultProfile = "dev"
$DefaultEnv = "dev"

switch -Regex ($Branch) {
    "^main$" {
        $DefaultProfile = "default"
        $DefaultEnv = "production"
    }
    "^(staging|release/.*)$" {
        $DefaultProfile = "qa"
        $DefaultEnv = "staging"
    }
    "^develop$" {
        $DefaultProfile = "dev"
        $DefaultEnv = "dev"
    }
    Default {
        $DefaultProfile = "dev"
        $DefaultEnv = "dev"
        Write-Host "💡 Feature/custom branch '$Branch' detected. Mapping to 'dev' environment."
    }
}

$AwsProfileToSet = if ($Profile) { $Profile } else { $DefaultProfile }
$EnvToSet = if ($EnvName) { $EnvName } else { $DefaultEnv }

$env:AWS_PROFILE = $AwsProfileToSet
if (-not $env:AWS_REGION) { $env:AWS_REGION = "ap-south-1" }
if (-not $env:AWS_DEFAULT_REGION) { $env:AWS_DEFAULT_REGION = "ap-south-1" }

Write-Host "========================================================================"
Write-Host "🚀 Preparing Local Container Environment"
Write-Host "========================================================================"
Write-Host "   Container Engine: $DockerCmd"
Write-Host "   Git Branch:       $Branch"
Write-Host "   AWS Profile:      $AwsProfileToSet"
Write-Host "   SSM Namespace:    axiorapulse/$EnvToSet"
Write-Host "========================================================================"

# --- Generate Dummy Environment Files (to prevent Docker Compose startup error) ---
Write-Host "⚙️  Preparing local environment files..."
if (-not (Test-Path -Path "backend")) { New-Item -ItemType Directory -Path "backend" | Out-Null }
if (-not (Test-Path -Path "frontend")) { New-Item -ItemType Directory -Path "frontend" | Out-Null }

if (-not (Test-Path -Path "backend\.env.docker")) { New-Item -ItemType File -Path "backend\.env.docker" | Out-Null }
if (-not (Test-Path -Path "frontend\.env.local")) { New-Item -ItemType File -Path "frontend\.env.local" | Out-Null }

# --- Startup Moto & Database First ---
Write-Host "🌐 Spinning up Moto Server and Database containers..."
& $DockerCmd compose -f docker-compose.local.yml up -d pulse-moto pulse-db

# --- Build Backend Container to run Moto seed script ---
Write-Host "📦 Building backend container..."
& $DockerCmd compose -f docker-compose.local.yml build pulse-backend

# --- Seed Moto Server (SSM & Cognito) ---
Write-Host "🌱 Initializing local mock AWS resources (Moto)..."
& $DockerCmd compose -f docker-compose.local.yml run --rm --entrypoint python pulse-backend init_local_aws.py

# --- Move generated Frontend env file ---
if (Test-Path -Path "backend\.env.local") {
    Move-Item -Path "backend\.env.local" -Destination "frontend\.env.local" -Force
    Write-Host "✅ Mapped generated Cognito credentials to frontend."
} else {
    Write-Host "❌ Error: backend\.env.local not found. Moto initialization failed."
    exit 1
}

# --- Startup Services ---
Write-Host "🌐 Initializing Docker network & persistent storage..."
Write-Host "🚀 Spining up local development container stack..."

if ($Rebuild) {
    & $DockerCmd compose -f docker-compose.local.yml up --build -d -V --force-recreate pulse-backend pulse-frontend
} else {
    & $DockerCmd compose -f docker-compose.local.yml up -d --force-recreate pulse-backend pulse-frontend
}

# --- Wait for Backend to be Healthy & Seed Users ---
Write-Host "⏳ Waiting for backend container to be healthy and start server..."
$attempts = 0
$max_attempts = 30
$backend_ready = $false

while ($attempts -lt $max_attempts) {
    try {
        # Check health using native Invoke-WebRequest or Invoke-RestMethod
        $response = Invoke-RestMethod -Uri "http://localhost:8000/health" -TimeoutSec 1 -ErrorAction SilentlyContinue
        $backend_ready = $true
        break
    } catch {
        # Endpoint not ready yet
    }
    Start-Sleep -Seconds 1
    $attempts++
}

if ($backend_ready) {
    Write-Host "🌱 Idempotently seeding Cognito users into the local PostgreSQL database..."
    
    $pythonScript = @'
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
'@

    try {
        # Piping the Here-String script via standard input to docker/podman exec python
        $pythonScript | & $DockerCmd exec -i pulse-backend python
        if ($LASTEXITCODE -ne 0) {
            Write-Host "⚠️ User seeding script failed to execute."
        }
    } catch {
        Write-Host "⚠️ User seeding script failed to execute."
    }
} else {
    Write-Host "⚠️ Backend did not become healthy in time. Skipping Cognito user seeding."
}

Write-Host "========================================================================"
Write-Host "✅ AxioraPulse container stack is up and active!"
Write-Host "========================================================================"
Write-Host "   🖥️  Frontend UI:    http://localhost:5173"
Write-Host "   ⚙️  Backend API:    http://localhost:8000"
Write-Host "   📖 API Swagger Docs: http://localhost:8000/docs"
Write-Host "   🗄️  Local DB Port:  5432 (Persistent)"
Write-Host "========================================================================"
Write-Host "💡 To monitor container logs, run:"
Write-Host "   $DockerCmd compose -f docker-compose.local.yml logs -f"
Write-Host ""
Write-Host "💡 To shutdown the container network, run:"
Write-Host "   .\run-local.ps1 -Down"
Write-Host "========================================================================"
