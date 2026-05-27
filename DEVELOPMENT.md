# Quick Development & Deployment Reference

## 🚀 LOCAL DEVELOPMENT

### 1. Full Stack Orchestrator (Recommended)
For full-stack local development (Frontend, Backend, and Database) with AWS SSM Parameter Store integrations and automated secrets mapping, use the orchestrator script `./run-local.sh`.

#### Prerequisites
* **Docker & Docker Compose**: Ensure Docker Desktop (macOS/Windows) or Daemon (Linux) is running.
* **AWS Local Profile**: Every developer **must** have a configured AWS profile named `dev` in their local system. If this profile is missing, contact the DevOps Engineer representing the Dev Environment to configure access.
* **AWS Session**: Ensure your AWS CLI session is active with permissions to access SSM Parameter Store (`ap-south-1`). If using AWS SSO, run:
  ```bash
  aws sso login --profile dev
  ```
  Or verify standard env variables (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, etc.).

#### Usage & Common Options
```bash
# Standard startup (pulls dev secrets and starts stack)
./run-local.sh

# Rebuild containers & clear volumes (use after dependency changes)
./run-local.sh --rebuild

# Stop and teardown the containers
./run-local.sh --down

# Override AWS Profile or SSM environment manually
./run-local.sh -p custom-profile -e staging
```

| Option | Flag | Description |
| :--- | :--- | :--- |
| `-r` | `--rebuild` | Force rebuilds frontend/backend images and recreates anonymous volumes. |
| `-d` | `--down` | Stops and tears down the active local container stack. |
| `-p [profile]` | `--profile [profile]` | Overrides the target AWS profile. |
| `-e [env]` | `--env [env]` | Overrides the target SSM Parameter Store environment (e.g. `dev`, `staging`, `production`). |

#### Reached Ports & Services
Once active, the local stack exposes:
- **Frontend UI**: [http://localhost:5173](http://localhost:5173) (Vite dev server with hot reloading)
- **Backend API**: [http://localhost:8000](http://localhost:8000)
- **API Swagger Docs**: [http://localhost:8000/docs](http://localhost:8000/docs)
- **Local PostgreSQL DB**: `localhost:5432` (`nexpulse` / `postgres` / `root`)

#### Branch-to-Environment Mappings for `./run-local.sh`
The orchestrator automatically maps branches to target profiles and SSM credentials:
- **`main`** branch → AWS profile: `default` | SSM env: `production`
- **`release/*`** branches → AWS profile: `qa` | SSM env: `staging`
- **`develop`** or others → AWS profile: `dev` | SSM env: `dev`

> [!IMPORTANT]
> - **Only one active release at a time**: Since we share a single AWS QA environment, only one release branch should be actively tested on QA at a time.
> - **Git Bash for Windows**: Run `./run-local.sh` using **Git Bash** for local execution.

### 2. Backend & DB Standalone Startup
If you only want to spin up the backend and database without the orchestrator:
```bash
docker-compose up
```
*Note: This relies on local `.env` files and does not fetch configuration from AWS SSM.*

- **Database**: Started automatically with the backend container.
- **Migrations**: Alembic migrations run automatically on container startup via `entrypoint.sh`.

### 3. Troubleshooting Local Environment
* **Expired AWS Session**: If you are using AWS SSO, your session likely expired. Refresh it by running:
  ```bash
  aws sso login --profile <profile>
  ```
* **Missing ~/.aws Directory**: Verify your AWS credentials directory exists. Chamber mounts `$HOME/.aws` to load profiles.
* **SSM Parameter Namespace**: Make sure the target SSM namespace (e.g. `/axiorapulse/dev`) exists in the `ap-south-1` region and your credentials have permission to read from it.
* **Database Migrations Failing**: If you get warnings about Alembic migrations failing because of database mismatch when switching branches:
  * The backend container automatically attempts to self-recover by running `alembic stamp head` and reapplying migrations.
  * If it fails, you can force-recreate your database storage volume:
    ```bash
    docker compose -f docker-compose.local.yml down -v
    ./run-local.sh --rebuild
    ```
    *(Note: This resets your local database contents).*

---

## 🔄 GIT WORKFLOW & TEAM GUIDELINES

### 1. Branch Roles

```text
                  ┌─► [feature/*] ──┐
                  │                 ▼
[main] ◄── [release/v1.2.0] ◄── [develop]
  │               │
  └─► [hotfix/*] ─┴───────────────► (Merged to both)
```

- **`develop`**: The primary integration branch. All active development is merged here first.
- **`feature/*`** or **`bugfix/*`**: Short-lived branches for development. Always branch off `develop` and target `develop` in PRs.
- **`release/vX.Y.Z`** (e.g., `release/v1.0.0`): Cut from `develop` when staging a release. Triggers deployment to the AWS QA environment.
- **`main`**: Reflects production. Merged from `release/*` on approval. Triggers production deployment.
- **`hotfix/*`**: Cut from `main` to address critical production issues, merged to both `main` and `develop`.

### 2. Daily Best Practices (How to Avoid Merge Conflicts)
- **Sync Before You Start**: Always pull the latest `develop` branch before cutting a new branch:
  ```bash
  git checkout develop
  git pull origin develop
  git checkout -b feature/my-cool-feature
  ```
- **Pull Daily**: Keep your feature branch fresh. Pull/rebase `develop` into your branch daily:
  ```bash
  git checkout feature/my-cool-feature
  git pull origin develop
  ```
- **Keep Branches Short-Lived**: Break down features into small, manageable pull requests. Resolving minor conflicts early prevents complex merge headaches later.

### 3. Step-by-Step Release Process
1. **Cut Release Branch**:
   ```bash
   git checkout develop
   git pull origin develop
   git checkout -b release/v1.0.0
   git push origin release/v1.0.0
   ```
   > [!NOTE]
   > Pushing to `release/**` automatically triggers the **QA Deployment** CI/CD pipeline.
2. **QA & Hardening**: Fix bugs directly on the `release/v1.0.0` branch. Pushes redeploy to QA automatically.
3. **Deploy to Production**:
   - Open a PR to merge `release/v1.0.0` into `main`.
   - Merge the PR (triggers production deployment).
   - Tag the release:
     ```bash
     git checkout main
     git pull origin main
     git tag -a v1.0.0 -m "Release v1.0.0"
     git push origin v1.0.0
     ```
4. **Sync Back**: Merge `release/v1.0.0` back into `develop`:
   ```bash
   git checkout develop
   git merge release/v1.0.0
   git push origin develop
   ```






