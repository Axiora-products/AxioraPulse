# AWS ECS Deployment Setup — AxioraPulse

Complete one-time AWS setup for deploying frontend and backend to ECS Fargate.  
**Region:** `ap-south-1` (Mumbai) | **Account:** `217757579310`

---

## Checklist

```
[ ] 1.  IAM — ecsTaskExecutionRole
[ ] 2.  IAM — ecsTaskRole
[ ] 3.  SSM — 9 secret parameters
[ ] 4.  ECR — axiora/pulse-frontend repository
[ ] 5.  CloudWatch — /ecs/pulse-backend log group
[ ] 6.  CloudWatch — /ecs/pulse-frontend log group
[ ] 7.  VPC — pulse-alb-sg security group
[ ] 8.  VPC — pulse-backend-sg security group
[ ] 9.  VPC — pulse-frontend-sg security group
[ ] 10. ECS — axiora-pulse-cluster
[ ] 11. ALB — pulse-backend-tg target group
[ ] 12. ALB — pulse-frontend-tg target group
[ ] 13. ALB — axiora-pulse-alb load balancer
[ ] 14. ACM — SSL certificate for app.* and api.*
[ ] 15. ALB — HTTPS listener + backend host-based rule
[ ] 16. ECS — Register task definitions (CLI)
[ ] 17. ECR — Push initial images (CLI)
[ ] 18. ECS — pulse-backend-service
[ ] 19. ECS — pulse-frontend-service
[ ] 20. DNS — CNAME records to ALB
[ ] 21. GitHub — Repository secrets
```

---

## Step 1 — IAM: ecsTaskExecutionRole

Allows ECS to pull images from ECR and read secrets from SSM.

1. Go to **IAM → Roles → Create role**
2. Trusted entity type: **AWS service**
3. Use case: **Elastic Container Service Task** → Next
4. Attach these managed policies:
   - `AmazonECSTaskExecutionRolePolicy`
   - `AmazonSSMReadOnlyAccess`
5. Role name: `ecsTaskExecutionRole`
6. **Create role**

---

## Step 2 — IAM: ecsTaskRole

The role your running containers assume.

1. **IAM → Roles → Create role**
2. Trusted entity: **AWS service** → **Elastic Container Service Task** → Next
3. Skip attaching policies (click Next without selecting any)
4. Role name: `ecsTaskRole`
5. **Create role**

---

## Step 3 — SSM Parameter Store: Secrets

Go to **Systems Manager → Parameter Store → Create parameter**

For every parameter below:
- Tier: **Standard**
- Type: **SecureString**
- KMS key: **alias/aws/ssm** (default)

| Parameter Name | Value |
|---|---|
| `/axiorapulse/production/SECRET_KEY` | Long random JWT signing key |
| `/axiorapulse/production/DATABASE_URL` | `postgresql+psycopg2://postgres:[password]@[supabase-host]:5432/postgres` |
| `/axiorapulse/production/OPENAI_API_KEY` | `sk-...` |
| `/axiorapulse/production/GOOGLE_API_KEY` | Google Gemini API key |
| `/axiorapulse/production/RESEND_API_KEY` | From resend.com |
| `/axiorapulse/production/EMAIL_FROM` | `Axiora Pulse <noreply@yourdomain.com>` |
| `/axiorapulse/production/FRONTEND_URL` | `https://app.yourdomain.com` |
| `/axiorapulse/production/EMAIL_USER` | SMTP email address |
| `/axiorapulse/production/EMAIL_PASS` | SMTP app password |

> Create all 9. The task definition references every one of them.

---

## Step 4 — ECR: Frontend Repository

The backend repo already exists. Create the frontend one.

1. Go to **ECR → Repositories → Create repository**
2. Visibility: **Private**
3. Repository name: `axiora/pulse-frontend`
4. Image tag mutability: **Mutable**
5. Encryption: **AES-256** (default)
6. **Create repository**

Your two repos are now:
- `217757579310.dkr.ecr.ap-south-1.amazonaws.com/axiora/pulse-fastapi` ✅
- `217757579310.dkr.ecr.ap-south-1.amazonaws.com/axiora/pulse-frontend` ✅

---

## Step 5 & 6 — CloudWatch: Log Groups

Go to **CloudWatch → Log groups → Create log group**

Create both:

| Log group name | Retention |
|---|---|
| `/ecs/pulse-backend` | 30 days |
| `/ecs/pulse-frontend` | 30 days |

---

## Step 7 — Security Group: ALB

1. **VPC → Security Groups → Create security group**
2. Name: `pulse-alb-sg`
3. Description: `Allow HTTP and HTTPS from internet`
4. VPC: **default VPC**
5. Inbound rules:

| Type | Port | Source |
|---|---|---|
| HTTP | 80 | `0.0.0.0/0` |
| HTTP | 80 | `::/0` |
| HTTPS | 443 | `0.0.0.0/0` |
| HTTPS | 443 | `::/0` |

6. Outbound: leave default (all traffic)
7. **Create security group** — note the SG ID (e.g. `sg-aaaa1111`)

---

## Step 8 — Security Group: Backend

1. **Create security group**
2. Name: `pulse-backend-sg`
3. Description: `Allow port 8000 from ALB only`
4. VPC: **default VPC**
5. Inbound rules:

| Type | Port | Source |
|---|---|---|
| Custom TCP | 8000 | `pulse-alb-sg` (select the SG from Step 7) |

6. Outbound: leave default
7. **Create security group**

---

## Step 9 — Security Group: Frontend

1. **Create security group**
2. Name: `pulse-frontend-sg`
3. Description: `Allow port 80 from ALB only`
4. VPC: **default VPC**
5. Inbound rules:

| Type | Port | Source |
|---|---|---|
| HTTP | 80 | `pulse-alb-sg` (select the SG from Step 7) |

6. Outbound: leave default
7. **Create security group**

---

## Step 10 — ECS: Cluster

1. **ECS → Clusters → Create cluster**
2. Cluster name: `axiora-pulse-cluster`
3. Infrastructure: **AWS Fargate (serverless)** — uncheck EC2
4. Monitoring: enable **Container Insights** (optional but recommended)
5. **Create**

---

## Step 11 — ALB: Backend Target Group

**EC2 → Target Groups → Create target group**

1. Target type: **IP addresses**
2. Name: `pulse-backend-tg`
3. Protocol: **HTTP** | Port: **8000**
4. VPC: **default VPC**
5. Health check:
   - Protocol: **HTTP**
   - Path: `/health`
   - Healthy threshold: **3**
   - Unhealthy threshold: **3**
   - Timeout: **10**
   - Interval: **30**
6. **Next** → skip registering targets → **Create target group**

---

## Step 12 — ALB: Frontend Target Group

**EC2 → Target Groups → Create target group**

1. Target type: **IP addresses**
2. Name: `pulse-frontend-tg`
3. Protocol: **HTTP** | Port: **80**
4. VPC: **default VPC**
5. Health check:
   - Protocol: **HTTP**
   - Path: `/`
   - Healthy threshold: **3**
   - Unhealthy threshold: **3**
   - Timeout: **5**
   - Interval: **30**
6. **Next** → skip registering targets → **Create target group**

---

## Step 13 — ALB: Load Balancer

**EC2 → Load Balancers → Create load balancer → Application Load Balancer**

1. Name: `axiora-pulse-alb`
2. Scheme: **Internet-facing**
3. IP address type: **IPv4**
4. VPC: **default VPC**
5. Mappings: check **all 3 availability zones** (all default subnets)
6. Security groups: remove the default, add **`pulse-alb-sg`**
7. Listeners:
   - Add **HTTP : 80** → Action: **Redirect to HTTPS** (port 443, 301)
   - Add **HTTPS : 443** → Action: Forward to **`pulse-frontend-tg`**
8. **Create load balancer**

**Note the ALB DNS name** from the summary — e.g.:
```
axiora-pulse-alb-123456789.ap-south-1.elb.amazonaws.com
```
You will need this for DNS records.

---

## Step 14 — ACM: SSL Certificate

1. **ACM → Request certificate**
2. Certificate type: **Public**
3. Domain names: add both
   - `app.yourdomain.com`
   - `api.yourdomain.com`
4. Validation method: **DNS validation**
5. **Request**
6. Click the pending certificate → **Create records in Route 53**
   (or copy the CNAME records and add them in your DNS provider manually)
7. Wait for status: **Issued** (~5 minutes)

---

## Step 15 — ALB: HTTPS Listener + Backend Rule

### Attach the SSL certificate

1. **EC2 → Load Balancers → axiora-pulse-alb → Listeners**
2. Click **HTTPS : 443 → Edit**
3. Under **Secure listener settings**, add the ACM certificate from Step 14
4. **Save changes**

### Add backend host-based rule

1. **HTTPS : 443 → Manage rules → Add rule**
2. Name: `backend-host-rule`
3. Condition: **Host header** → `api.yourdomain.com`
4. Action: **Forward to** `pulse-backend-tg`
5. Priority: **1**
6. **Save**

> The default rule (lowest priority) already forwards everything to `pulse-frontend-tg`.  
> Priority 1 means the backend rule is evaluated first.

---

## Step 16 — ECS: Register Task Definitions (CLI)

Run from the repository root with AWS CLI configured for `ap-south-1`:

```bash
# Backend task definition
aws ecs register-task-definition \
  --cli-input-json file://backend/ecs-task-def.json \
  --region ap-south-1

# Frontend task definition
aws ecs register-task-definition \
  --cli-input-json file://frontend/ecs-task-def.json \
  --region ap-south-1
```

Verify in **ECS → Task definitions** — you should see:
- `pulse-backend` at revision 1
- `pulse-frontend` at revision 1

---

## Step 17 — ECR: Push Initial Images (CLI)

ECS services need at least one image in ECR before they can start.  
Run from the repository root:

```bash
# Authenticate Docker to ECR
aws ecr get-login-password --region ap-south-1 | \
  docker login --username AWS --password-stdin \
  217757579310.dkr.ecr.ap-south-1.amazonaws.com

# ── Backend ──────────────────────────────────────────────────────────────────
docker build -f backend/Dockerfile.prod \
  -t 217757579310.dkr.ecr.ap-south-1.amazonaws.com/axiora/pulse-fastapi:latest \
  ./backend

docker push 217757579310.dkr.ecr.ap-south-1.amazonaws.com/axiora/pulse-fastapi:latest

# ── Frontend ─────────────────────────────────────────────────────────────────
# Replace the values below with your actual production values
docker build \
  --build-arg VITE_API_BASE_URL=https://api.yourdomain.com \
  --build-arg VITE_SUPABASE_URL=https://xxxx.supabase.co \
  --build-arg VITE_SUPABASE_ANON_KEY=eyJ... \
  -t 217757579310.dkr.ecr.ap-south-1.amazonaws.com/axiora/pulse-frontend:latest \
  ./frontend

docker push 217757579310.dkr.ecr.ap-south-1.amazonaws.com/axiora/pulse-frontend:latest
```

---

## Step 18 — ECS: Backend Service

**ECS → Clusters → axiora-pulse-cluster → Services → Create**

1. Compute: **Launch type → Fargate**
2. Task definition family: `pulse-backend` | Revision: **LATEST**
3. Service name: `pulse-backend-service`
4. Desired tasks: **1**
5. Networking:
   - VPC: **default VPC**
   - Subnets: select **all 3**
   - Security group: **pulse-backend-sg** (remove the default)
   - Public IP: **Enabled**
6. Load balancing:
   - Type: **Application Load Balancer**
   - Load balancer: `axiora-pulse-alb`
   - Container: `pulse-backend : 8000`
   - Listener: **443 : HTTPS**
   - Target group: **pulse-backend-tg**
7. **Create service**

---

## Step 19 — ECS: Frontend Service

**ECS → Clusters → axiora-pulse-cluster → Services → Create**

1. Compute: **Launch type → Fargate**
2. Task definition family: `pulse-frontend` | Revision: **LATEST**
3. Service name: `pulse-frontend-service`
4. Desired tasks: **1**
5. Networking:
   - VPC: **default VPC**
   - Subnets: select **all 3**
   - Security group: **pulse-frontend-sg** (remove the default)
   - Public IP: **Enabled**
6. Load balancing:
   - Type: **Application Load Balancer**
   - Load balancer: `axiora-pulse-alb`
   - Container: `pulse-frontend : 80`
   - Listener: **443 : HTTPS**
   - Target group: **pulse-frontend-tg**
7. **Create service**

> Watch **ECS → Clusters → axiora-pulse-cluster → Services**.  
> Both services should show tasks going `PROVISIONING → PENDING → RUNNING` (~2–3 min).

---

## Step 20 — DNS: CNAME Records

Add these two records in your DNS provider (Route 53 or other):

| Name | Type | Value |
|---|---|---|
| `app.yourdomain.com` | CNAME | `axiora-pulse-alb-xxxx.ap-south-1.elb.amazonaws.com` |
| `api.yourdomain.com` | CNAME | `axiora-pulse-alb-xxxx.ap-south-1.elb.amazonaws.com` |

Both point to the **same ALB** — the host-based routing rules handle the split.

> If using Route 53 with a root/apex domain, use **A record → Alias → ALB** instead of CNAME.

---

## Step 21 — GitHub: Repository Secrets

Go to your GitHub repo → **Settings → Secrets and variables → Actions → New repository secret**

| Secret | Value |
|---|---|
| `AWS_ACCESS_KEY_ID` | ✅ already set |
| `AWS_SECRET_ACCESS_KEY` | ✅ already set |
| `VITE_API_BASE_URL` | `https://api.yourdomain.com` |
| `VITE_SUPABASE_URL` | `https://xxxx.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon/public key (never the service role key) |

---

## Verification

Once all steps are complete, run:

```bash
# Backend health check
curl https://api.yourdomain.com/health
# Expected: {"status":"ok","service":"Nexora Pulse API"}

# Frontend
curl -I https://app.yourdomain.com
# Expected: HTTP/2 200
```

In **ECS → Clusters → axiora-pulse-cluster → Services**:
- `pulse-backend-service` → **1/1 tasks running**
- `pulse-frontend-service` → **1/1 tasks running**

In **EC2 → Target Groups**:
- `pulse-backend-tg` → target status: **healthy**
- `pulse-frontend-tg` → target status: **healthy**

---

## After Setup: CI/CD is Automatic

Every `git push` to `main` triggers:

| Changed path | Workflow | What happens |
|---|---|---|
| `backend/**` | `deploy-backend.yml` | Builds with `Dockerfile.prod` → pushes to ECR → deploys to `pulse-backend-service` |
| `frontend/**` | `deploy-frontend.yml` | Builds with VITE_ args → pushes to ECR → deploys to `pulse-frontend-service` |

Zero-downtime rolling updates are handled automatically by ECS.
