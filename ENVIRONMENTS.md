# AxioraPulse — Multi-Environment Architecture

## Account Structure

```
┌─────────────────────────────────────────────────────────────────┐
│  AWS Account 1 — DEV          (account id: xxx-dev)             │
│  Branch: develop    Auto-deploy on every push                   │
│  Purpose: Day-to-day development, trainees, feature testing     │
├─────────────────────────────────────────────────────────────────┤
│  AWS Account 2 — STAGING      (account id: xxx-stg)             │
│  Branch: staging    Auto-deploy on PR merge                     │
│  Purpose: QA, client demos, pre-release validation              │
├─────────────────────────────────────────────────────────────────┤
│  AWS Account 3 — PRODUCTION   (account id: 217757579310)        │
│  Branch: main       Manual approval required before deploy      │
│  Purpose: Live users — current account                          │
└─────────────────────────────────────────────────────────────────┘
```

---

## What Lives in Each Account

| Resource | Dev | Staging | Production |
|---|---|---|---|
| ECS Cluster | `axiora-pulse-cluster-dev` | `axiora-pulse-cluster-stg` | `axiora-pulse-cluster` |
| ECS Backend Service | `pulse-backend-service-dev` | `pulse-backend-service-stg` | `pulse-backend-service` |
| ECS Frontend Service | `pulse-frontend-service-dev` | `pulse-frontend-service-stg` | `pulse-frontend-service` |
| ECR (backend image) | `axiora/pulse-fastapi-dev` | `axiora/pulse-fastapi-stg` | `axiora/pulse-fastapi` |
| ECR (frontend image) | `axiora/pulse-nginx-dev` | `axiora/pulse-nginx-stg` | `axiora/pulse-nginx` |
| RDS / Database | `pulse-db-dev` (small) | `pulse-db-stg` (medium) | `pulse-db-prod` (Aurora) |
| Cognito User Pool | Separate pool | Separate pool | Current pool |
| SSM Parameters | `/axiorapulse/dev/...` | `/axiorapulse/staging/...` | `/axiorapulse/production/...` |
| CloudWatch Logs | `/ecs/pulse-backend-dev` | `/ecs/pulse-backend-stg` | `/ecs/pulse-backend` |
| Domain | `dev.axiorapulse.com` | `staging.axiorapulse.com` | `axiorapulse.com` |

---

## Pipeline Flow

```
Developer pushes code
        │
        ├── push to develop ──────────────────────────────────────────┐
        │                                                              ▼
        │                                               GitHub Actions: deploy-dev.yml
        │                                                 Build image → push to DEV ECR
        │                                                 Run DB migrations (alembic)
        │                                                 Update ECS service in DEV account
        │                                                 Post result to Slack/PR comment
        │
        ├── PR merged to staging ────────────────────────────────────┐
        │                                                             ▼
        │                                           GitHub Actions: deploy-staging.yml
        │                                             Build image → push to STAGING ECR
        │                                             Run DB migrations (alembic)
        │                                             Update ECS service in STAGING account
        │                                             Run smoke tests
        │
        └── PR merged to main ────────────────────────────┐
                                                          ▼
                                          GitHub Actions: deploy-prod.yml
                                            Requires manual approval (GitHub Environments)
                                            Build image → push to PROD ECR
                                            Run DB migrations (alembic)
                                            Update ECS service in PROD account
                                            Run smoke tests
```

---

## Branch → Environment Mapping

| Branch | Environment | Trigger | Approval |
|---|---|---|---|
| `develop` | Dev | Auto on every push | None |
| `feature/*`, `fix/*` | Dev (optional) | Manual trigger | None |
| `staging` | Staging | Auto on PR merge to `staging` | PR review |
| `main` | Production | Auto on PR merge to `main` | PR review + manual deploy approval |

**Git flow:**
```
feature/xyz → develop → staging → main
                 ↓           ↓        ↓
                Dev       Staging   Prod
```

---

## GitHub Secrets Per Environment

Each environment gets its own set of secrets in GitHub:

```
# Dev account
AWS_ACCESS_KEY_ID_DEV
AWS_SECRET_ACCESS_KEY_DEV
AWS_ACCOUNT_ID_DEV

# Staging account
AWS_ACCESS_KEY_ID_STG
AWS_SECRET_ACCESS_KEY_STG
AWS_ACCOUNT_ID_STG

# Production account  (already exists)
AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY
AWS_ACCOUNT_ID
```

Use **GitHub Environments** (Settings → Environments) to scope secrets:
- `development` environment → dev secrets
- `staging` environment → staging secrets
- `production` environment → prod secrets + required reviewer approval

---

## SSM Parameter Store Per Environment

Each account has its own SSM parameters. Same parameter names, different values:

```
# Dev account SSM
/axiorapulse/dev/SECRET_KEY
/axiorapulse/dev/DATABASE_URL          ← points to dev RDS
/axiorapulse/dev/COGNITO_USER_POOL_ID  ← dev Cognito pool
/axiorapulse/dev/ANTHROPIC_KEY         ← same key, or a test key
/axiorapulse/dev/EMAIL_FROM
/axiorapulse/dev/FRONTEND_URL          ← https://dev.axiorapulse.com

# Staging account SSM
/axiorapulse/staging/SECRET_KEY
/axiorapulse/staging/DATABASE_URL
...

# Production account SSM  (already exists)
/axiorapulse/production/SECRET_KEY
/axiorapulse/production/DATABASE_URL
...
```

---

## ECS Task Definitions Per Environment

Keep three separate task definition files:

```
backend/ecs-task-def.json          ← production (current)
backend/ecs-task-def-dev.json      ← dev
backend/ecs-task-def-stg.json      ← staging
```

Key differences per file:

| Field | Dev | Staging | Prod |
|---|---|---|---|
| `cpu` | `256` | `512` | `512` |
| `memory` | `512` | `1024` | `1024` |
| `image` | `xxx-dev.dkr.ecr.../pulse-fastapi-dev:latest` | `xxx-stg.dkr.ecr.../pulse-fastapi-stg:latest` | current |
| SSM paths | `/axiorapulse/dev/...` | `/axiorapulse/staging/...` | `/axiorapulse/production/...` |
| Log group | `/ecs/pulse-backend-dev` | `/ecs/pulse-backend-stg` | `/ecs/pulse-backend` |

---

## GitHub Actions Pipeline Files

```
.github/workflows/
├── deploy-backend-dev.yml      ← triggers on push to develop
├── deploy-frontend-dev.yml     ← triggers on push to develop
├── deploy-backend-staging.yml  ← triggers on push to staging
├── deploy-frontend-staging.yml ← triggers on push to staging
├── deploy-backend.yml          ← triggers on push to main (production, existing)
└── deploy-frontend.yml         ← triggers on push to main (production, existing)
```

### Example: `deploy-backend-dev.yml` (skeleton)

```yaml
name: Deploy Backend — Dev

on:
  push:
    branches: [develop]
    paths: [backend/**]

environment: development

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Configure AWS (Dev account)
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID_DEV }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY_DEV }}
          aws-region: ap-south-1

      - name: Build & push to Dev ECR
        run: |
          aws ecr get-login-password | docker login --username AWS \
            --password-stdin ${{ secrets.AWS_ACCOUNT_ID_DEV }}.dkr.ecr.ap-south-1.amazonaws.com
          docker build -t pulse-fastapi-dev ./backend
          docker tag pulse-fastapi-dev:latest \
            ${{ secrets.AWS_ACCOUNT_ID_DEV }}.dkr.ecr.ap-south-1.amazonaws.com/axiora/pulse-fastapi-dev:latest
          docker push \
            ${{ secrets.AWS_ACCOUNT_ID_DEV }}.dkr.ecr.ap-south-1.amazonaws.com/axiora/pulse-fastapi-dev:latest

      - name: Register task definition & update service
        run: |
          aws ecs register-task-definition \
            --cli-input-json file://backend/ecs-task-def-dev.json
          aws ecs update-service \
            --cluster axiora-pulse-cluster-dev \
            --service pulse-backend-service-dev \
            --task-definition pulse-backend-dev \
            --force-new-deployment
```

Staging pipeline is identical — swap `DEV` → `STG`, cluster/service names, task def file.

Production pipeline adds a manual approval gate via GitHub Environments.

---

## Database Strategy

| Env | DB | Size | Data |
|---|---|---|---|
| Dev | RDS PostgreSQL `db.t3.micro` | 20 GB | Seed data + test users |
| Staging | RDS PostgreSQL `db.t3.small` | 50 GB | Anonymised copy of prod (refreshed weekly) |
| Production | Aurora PostgreSQL Serverless | Auto-scales | Live data |

**Never copy prod data to dev.** Staging can have an anonymised snapshot (emails scrambled, names replaced).

---

## Migration Strategy Per Environment

`entrypoint.sh` already runs `alembic upgrade head` on container start.
No change needed — each environment's container runs migrations against its own DATABASE_URL from SSM.

New migrations land in `develop` first → tested in dev → merged to `staging` → tested in staging → merged to `main` → runs in production.

---

## Quick-Start Checklist (for CTO / DevOps)

### For each new AWS account (dev + staging):

- [ ] Create AWS account under the organisation
- [ ] Create ECR repositories (`axiora/pulse-fastapi-dev`, `axiora/pulse-nginx-dev`)
- [ ] Create ECS cluster + services
- [ ] Create RDS instance + set `DATABASE_URL` in SSM
- [ ] Create Cognito User Pool
- [ ] Populate all SSM parameters
- [ ] Create IAM user with ECS/ECR/SSM permissions → add keys to GitHub Secrets
- [ ] Create ACM certificate for subdomain (`dev.axiorapulse.com`)
- [ ] Create ALB + target groups + Route53 record
- [ ] Create GitHub Environment (`development` / `staging`) in repo settings
- [ ] Add new workflow files for each environment

### Terraform (recommended)

All of the above can be done with Terraform using workspaces:

```bash
terraform workspace new dev
terraform workspace new staging
terraform workspace new production

terraform apply -var-file=envs/dev.tfvars
```

One Terraform module, three sets of variables — identical infrastructure, different account credentials.
