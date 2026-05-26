# ==============================================================================
# AxioraPulse — Windows Local Development Container Orchestrator
# ==============================================================================
# Automates secrets pulling, environment overriding, and isolated Docker execution
# for Windows systems using native PowerShell.
# ==============================================================================

param (
    [switch]$Down = $false,
    [switch]$Rebuild = $false,
    [string]$Profile = "",
    [string]$Env = "",
    [switch]$Help = $false
)

if ($Help) {
    Write-Host "AxioraPulse Container Orchestrator (Windows PowerShell)" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Usage: .\run-local.ps1 [options]"
    Write-Host ""
    Write-Host "Options:"
    Write-Host "  -Down           Stop and tear down the containers, networks, and keep volumes."
    Write-Host "  -Rebuild        Force rebuild of Docker images during startup."
    Write-Host "  -Profile [prof] Override the AWS profile to use."
    Write-Host "  -Env [env]      Override the SSM Parameter Store environment (production/development/staging)."
    Write-Host "  -Help           Show this help message."
    exit 0
}

if ($Down) {
    Write-Host "🛑 Stopping and tearing down the container stack..." -ForegroundColor Yellow
    docker compose -f docker-compose.local.yml down
    Write-Host "✨ System stopped." -ForegroundColor Green
    exit 0
}

# --- Check Docker ---
$dockerCheck = docker info 2>$null
if ($null -eq $dockerCheck) {
    Write-Host "❌ Error: Docker is not running. Please launch Docker Desktop." -ForegroundColor Red
    exit 1
}

# --- Git Branch & Profile Mapping ---
$branch = "develop"
try {
    $branch = (git rev-parse --abbrev-ref HEAD 2>$null).Trim()
} catch {}

$defaultProfile = "dev"
$defaultEnv = "dev"

switch ($branch) {
    "main" {
        $defaultProfile = "default"
        $defaultEnv = "production"
    }
    "staging" {
        $defaultProfile = "qa"
        $defaultEnv = "qa"
    }
    "develop" {
        $defaultProfile = "dev"
        $defaultEnv = "dev"
    }
    Default {
        $defaultProfile = "dev"
        $defaultEnv = "dev"
        Write-Host "💡 Feature/custom branch '$branch' detected. Mapping to 'dev' environment." -ForegroundColor Blue
    }
}

$awsProfile = if ($Profile) { $Profile } else { $defaultProfile }
$ssmEnv = if ($Env) { $Env } else { $defaultEnv }

Write-Host "========================================================================" -ForegroundColor Cyan
Write-Host "🚀 Preparing Local Windows Container Environment" -ForegroundColor Cyan
Write-Host "========================================================================" -ForegroundColor Cyan
Write-Host "   Git Branch:    $branch"
Write-Host "   AWS Profile:   $awsProfile"
Write-Host "   SSM Namespace: axiorapulse/$ssmEnv"
Write-Host "========================================================================" -ForegroundColor Cyan

# --- Build AWS Env and Mount Args ---
$awsEnvArgs = @()
if ($env:AWS_ACCESS_KEY_ID) { $awsEnvArgs += "-e", "AWS_ACCESS_KEY_ID=$env:AWS_ACCESS_KEY_ID" }
if ($env:AWS_SECRET_ACCESS_KEY) { $awsEnvArgs += "-e", "AWS_SECRET_ACCESS_KEY=$env:AWS_SECRET_ACCESS_KEY" }
if ($env:AWS_SESSION_TOKEN) { $awsEnvArgs += "-e", "AWS_SESSION_TOKEN=$env:AWS_SESSION_TOKEN" }
if ($env:AWS_REGION) { $awsEnvArgs += "-e", "AWS_REGION=$env:AWS_REGION" }
if ($env:AWS_DEFAULT_REGION) { $awsEnvArgs += "-e", "AWS_DEFAULT_REGION=$env:AWS_DEFAULT_REGION" }

$awsPath = Join-Path $env:USERPROFILE ".aws"
$awsMountArgs = @()
if (Test-Path $awsPath) {
    # On Windows, we mount the user profile .aws folder
    $awsMountArgs += "-v", "$awsPath`:/root/.aws:ro"
}

# --- Pull Secrets via Chamber ---
Write-Host "📥 Pulling secrets from AWS SSM Parameter Store using Chamber..." -ForegroundColor Yellow

# 1. Pull Global Secrets
$globalArgs = @("run", "--rm") + $awsMountArgs + $awsEnvArgs + @(
    "-e", "HOME=/root",
    "-e", "AWS_PROFILE=$awsProfile",
    "-e", "AWS_REGION=ap-south-1",
    "-e", "AWS_DEFAULT_REGION=ap-south-1",
    "segment/chamber:3", "export", "--format", "dotenv", "axiorapulse"
)
$globalError = $null
$globalOutput = docker $globalArgs 2>$globalError
$globalStatus = $LASTEXITCODE

# 2. Pull Environment Secrets
$envArgs = @("run", "--rm") + $awsMountArgs + $awsEnvArgs + @(
    "-e", "HOME=/root",
    "-e", "AWS_PROFILE=$awsProfile",
    "-e", "AWS_REGION=ap-south-1",
    "-e", "AWS_DEFAULT_REGION=ap-south-1",
    "segment/chamber:3", "export", "--format", "dotenv", "axiorapulse/$ssmEnv"
)
$envError = $null
$envOutput = docker $envArgs 2>$envError
$envStatus = $LASTEXITCODE

if ($envStatus -ne 0) {
    Write-Host "❌ Error: Failed to pull environment secrets from SSM namespace '/axiorapulse/$ssmEnv'." -ForegroundColor Red
    Write-Host "Please verify your active AWS session and credentials." -ForegroundColor Red
    exit 1
}

# --- Generate Configuration Files ---
Write-Host "⚙️  Generating containerized configuration overrides..." -ForegroundColor Yellow

# Combine Outputs
$combinedLines = @()
if ($globalStatus -eq 0 -and $null -ne $globalOutput) { $combinedLines += $globalOutput }
if ($null -ne $envOutput) { $combinedLines += $envOutput }

# Write Backend env
$backendEnvFile = "backend\.env.docker"
$backendContent = @(
    "# ======================================================================",
    "# Generated from AWS SSM (axiorapulse/$ssmEnv) via Chamber (Windows)",
    "# ======================================================================"
) + $combinedLines + @(
    "",
    "# Local Container Overrides",
    "DATABASE_URL=postgresql://postgres:root@pulse-db:5432/nexpulse",
    "FRONTEND_URL=http://localhost:5173",
    "ENVIRONMENT=development"
)
[System.IO.File]::WriteAllLines((Resolve-Path .).Path + "\$backendEnvFile", $backendContent)

# Write Frontend env
$frontendEnvFile = "frontend\.env.local"
$frontendContent = @(
    "# ======================================================================",
    "# Generated from AWS SSM (axiorapulse/$ssmEnv) via Chamber (Windows)",
    "# ======================================================================"
)

foreach ($line in $combinedLines) {
    $trimmedLine = $line.Trim()
    if ($trimmedLine.StartsWith("#") -or [string]::IsNullOrWhiteSpace($trimmedLine)) {
        continue
    }
    
    if ($trimmedLine.StartsWith("VITE_")) {
        $frontendContent += $trimmedLine
    } elseif ($trimmedLine.StartsWith("COGNITO_")) {
        $frontendContent += "VITE_$trimmedLine"
    }
}

$frontendContent += @(
    "",
    "# Local Container Overrides",
    "VITE_API_BASE_URL=http://localhost:8000"
)
[System.IO.File]::WriteAllLines((Resolve-Path .).Path + "\$frontendEnvFile", $frontendContent)

# --- Startup Services ---
Write-Host "🌐 Initializing Docker network & persistent storage..." -ForegroundColor Yellow
Write-Host "🚀 Spinning up local development container stack..." -ForegroundColor Yellow

if ($Rebuild) {
    docker compose -f docker-compose.local.yml up --build -d
} else {
    docker compose -f docker-compose.local.yml up -d
}

Write-Host "========================================================================" -ForegroundColor Green
Write-Host "✅ AxioraPulse container stack is up and active on Windows!" -ForegroundColor Green
Write-Host "========================================================================" -ForegroundColor Green
Write-Host "   🖥️  Frontend UI:    http://localhost:5173"
Write-Host "   ⚙️  Backend API:    http://localhost:8000"
Write-Host "   📖 API Swagger Docs: http://localhost:8000/docs"
Write-Host "   🗄️  Local DB Port:  5432 (Persistent)"
Write-Host "========================================================================" -ForegroundColor Green
Write-Host "💡 To monitor container logs, run:"
Write-Host "   docker compose -f docker-compose.local.yml logs -f"
Write-Host ""
Write-Host "💡 To shutdown the container network, run:"
Write-Host "   .\run-local.ps1 -Down"
Write-Host "========================================================================" -ForegroundColor Green
