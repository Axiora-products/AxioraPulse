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

    [Alias("t","c")]
    [Switch]$Test,

    [Alias("p")]
    [String]$Profile,

    [Alias("e","env")]
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
    Write-Host "  -t, -Test           Run local linters and tests (starts DB & Floci, runs tests, then shuts down)."
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
        $isMac = $false
        $isLinux = $false
        if ($PSVersionTable.PSVersion.Major -ge 6) {
            $isMac = $IsMacOS
            $isLinux = $IsLinux
        }
        
        if ($isMac) {
            if (Test-Path -Path "/Applications/Docker.app") {
                Write-Host "💡 Docker Desktop is installed but not running. You can launch it using:"
                Write-Host "   open -a Docker"
            } else {
                Write-Host "   Please start Docker Desktop or your Podman machine."
            }
        } elseif ($isLinux) {
            Write-Host "   Please start the docker service (e.g., 'sudo systemctl start docker') or your Podman service."
        } else {
            $DockerDesktopPath = "C:\Program Files\Docker\Docker\Docker Desktop.exe"
            if (Test-Path -Path $DockerDesktopPath) {
                Write-Host "💡 Docker Desktop is installed but not running. You can start it from your start menu or run:"
                Write-Host "   Start-Process '$DockerDesktopPath'"
            } else {
                Write-Host "   Please ensure Docker Desktop, the Docker daemon, or a Podman machine is running and try again."
            }
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
$HostArch = ""
if ($PSVersionTable.PSVersion.Major -ge 6) {
    try {
        $HostArch = [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture.ToString().ToLower()
    } catch {}
}
if (-not $HostArch) {
    $HostArch = ($env:PROCESSOR_ARCHITEW6432, $env:PROCESSOR_ARCHITECTURE | Where-Object {$_} | Select-Object -First 1)
}

if ($HostArch) {
    $HostArch = $HostArch.ToLower()
} else {
    $HostArch = "amd64"
}

$TargetPlatform = ""
if ($HostArch -eq "amd64" -or $HostArch -eq "x64" -or $HostArch -eq "x86_64") {
    $TargetPlatform = "linux/amd64"
} elseif ($HostArch -eq "arm64" -or $HostArch -eq "aarch64") {
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
    $Images = @("postgres:17-bookworm", "floci/floci:latest", "axiorapulse-pulse-backend", "axiorapulse-pulse-frontend")
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

# --- Startup Services (Unified) ---
Write-Host "🌐 Spin up the local development/test container stack..."
if ($Test) {
    # Only need db, floci, and backend for running backend tests
    & $DockerCmd compose -f docker-compose.local.yml up -d pulse-db pulse-floci pulse-backend
} else {
    # Startup everything for local development
    if ($Rebuild) {
        & $DockerCmd compose -f docker-compose.local.yml up --build -d -V pulse-db pulse-floci pulse-backend pulse-frontend
    } else {
        & $DockerCmd compose -f docker-compose.local.yml up -d pulse-db pulse-floci pulse-backend pulse-frontend
    }
}

# --- Wait for Backend to be Healthy ---
Write-Host "⏳ Waiting for backend container to be healthy and start server..."
$attempts = 0
$max_attempts = 30
$backend_ready = $false

while ($attempts -lt $max_attempts) {
    try {
        $response = Invoke-RestMethod -Uri "http://localhost:8000/health" -TimeoutSec 1 -ErrorAction SilentlyContinue
        $backend_ready = $true
        break
    } catch {
        # Not ready yet
    }
    Start-Sleep -Seconds 1
    $attempts++
}

if (-not $backend_ready) {
    Write-Host "❌ Error: Backend container did not become healthy in time."
    & $DockerCmd compose -f docker-compose.local.yml down
    exit 1
}

# --- Seed Floci Server (SSM & Cognito) inside the running container ---
Write-Host "🌱 Initializing local mock AWS resources (Floci)..."
& $DockerCmd exec -i pulse-backend python init_local_aws.py

# --- Move generated Frontend env file ---
if (Test-Path -Path "backend\.env.local") {
    Move-Item -Path "backend\.env.local" -Destination "frontend\.env.local" -Force
    Write-Host "✅ Mapped generated Cognito credentials to frontend."
} else {
    Write-Host "⚠️ Warning: backend\.env.local not found. Skipping frontend mapping."
}

# --- Run Local Tests inside Backend Container if Flag is set ---
if ($Test) {
    Write-Host "======================================================================="
    Write-Host "🔍 Running Local Linters and Tests inside Backend Container"
    Write-Host "======================================================================="

    Write-Host "📦 Installing test dependencies inside container..."
    & $DockerCmd exec pulse-backend pip install pytest ruff alembic pytest-cov
    $InstallExit = $LASTEXITCODE
    if ($InstallExit -ne 0) {
        Write-Host "❌ Error: Failed to install test dependencies inside container."
        & $DockerCmd compose -f docker-compose.local.yml down
        exit $InstallExit
    }

    Write-Host "👉 Running Ruff Check..."
    & $DockerCmd exec pulse-backend ruff check .
    $RuffCheckExit = $LASTEXITCODE

    Write-Host "👉 Running Ruff Format Check..."
    & $DockerCmd exec pulse-backend ruff format --check .
    $RuffFormatExit = $LASTEXITCODE

    Write-Host "👉 Running Alembic Migrations on Test DB..."
    & $DockerCmd exec pulse-backend alembic upgrade head
    $AlembicExit = $LASTEXITCODE

    $TestExitCode = 0
    if ($AlembicExit -eq 0) {
        Write-Host "👉 Running Backend Pytest with Coverage..."
        & $DockerCmd exec -e PYTHONPATH=. pulse-backend pytest --cov=. --cov-report=term-missing --cov-config=.coveragerc tests
        $TestExitCode = $LASTEXITCODE
    } else {
        Write-Host "❌ Skipping pytest because database migrations failed."
        $TestExitCode = $AlembicExit
    }

    Write-Host "🛑 Tearing down local test containers..."
    & $DockerCmd compose -f docker-compose.local.yml down *>$null

    if ($RuffCheckExit -eq 0 -and $RuffFormatExit -eq 0 -and $AlembicExit -eq 0 -and $TestExitCode -eq 0) {
        Write-Host "✅ All checks and tests passed successfully!"
        exit 0
    } else {
        Write-Host "❌ Some checks or tests failed."
        exit 1
    }
}

if ($backend_ready) {
    Write-Host "🌱 Idempotently seeding Cognito users into the local PostgreSQL database..."
    
    $pythonScript = @'
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

