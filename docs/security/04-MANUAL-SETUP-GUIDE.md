# AxioraPulse — Manual Setup & Integration Guide

Everything in this document must be done **by a human** (you / DevOps) — it cannot be solved by a code change alone. Code fixes in the backlog depend on these. Do **Section 1 (Secret rotation)** immediately.

> Conventions: AWS region examples use `ap-south-1` (matches `COGNITO_REGION` default). Replace placeholders in `<…>`. Commands assume the AWS CLI is authenticated with sufficient privileges.

---

## 1. 🔴 Rotate leaked secrets (do this first — AP-SEC-006)

Two OpenAI keys are exposed (one in git history, one in the working tree). Both must be considered compromised.

1. **OpenAI console → API keys →** revoke:
   - `sk-proj-Lz8dr…` (in git history, commit `aa62a19`)
   - `sk-proj-FQtk…` (current `backend/.env.local.template`)
2. Create a new key, store it **only** in Secrets Manager / SSM (Section 3) and your local `.env` (never the template).
3. Replace the value in `backend/.env.local.template` with a placeholder:
   ```bash
   OPENAI_KEY='sk-REPLACE_ME_LOCAL_ONLY'
   ```
4. While you're here, rotate **any** secret that has ever been pasted into a tracked or shared file as a precaution: `SECRET_KEY`, `RAZORPAY_KEY_SECRET`, `TWILIO_AUTH_TOKEN`, `META_WHATSAPP_ACCESS_TOKEN`, `ZOOM_CLIENT_SECRET`.
5. (Optional but recommended) Purge the historical key blob:
   ```bash
   pip install git-filter-repo
   git filter-repo --path backend/.env.local.template --invert-paths
   # coordinate a force-push with the team; everyone re-clones
   ```
   If a history rewrite is too disruptive, rotation (step 1) already neutralizes the risk — the key just remains visible-but-dead.

---

## 2. Generate strong application secrets

Generate fresh, high-entropy values for every signing secret. Never reuse the `*-change-in-production` / `mock-*` defaults.

```bash
# 64-char URL-safe secrets
python -c "import secrets; print(secrets.token_urlsafe(48))"   # SECRET_KEY
python -c "import secrets; print(secrets.token_urlsafe(48))"   # OTP_JWT_SECRET (only if OTP login is retained)
```

After SEC-001 lands, `OTP_JWT_SECRET` and `MOCK_COGNITO_SECRET` should no longer be *accepted* by the verifier. Until then, at minimum set a strong `OTP_JWT_SECRET` so the default isn't in use.

---

## 3. Provision secrets to AWS (SSM Parameter Store / Secrets Manager)

The app reads prod secrets via `ecs-task-def.json` (good). Add the **missing** ones and the new integration secrets. Use the per-environment path `parameter/axiorapulse/<env>/…` (and tighten the IAM read scope per AP-SEC-035).

```bash
ENV=prod   # or qa / dev

# Core (verify these exist; add if missing)
aws ssm put-parameter --name "/axiorapulse/$ENV/SECRET_KEY"            --type SecureString --value "<generated>" --overwrite
aws ssm put-parameter --name "/axiorapulse/$ENV/OTP_JWT_SECRET"        --type SecureString --value "<generated>" --overwrite

# NEW — required by webhook signature fix (SEC-004)
aws ssm put-parameter --name "/axiorapulse/$ENV/RAZORPAY_WEBHOOK_SECRET" --type SecureString --value "<from Razorpay dashboard>" --overwrite

# NEW — observability (SEC-027)
aws ssm put-parameter --name "/axiorapulse/$ENV/SENTRY_DSN"           --type SecureString --value "<sentry dsn>" --overwrite

# NEW — Redis for rate limiting / OTP state (SEC-009/015)
aws ssm put-parameter --name "/axiorapulse/$ENV/REDIS_URL"            --type SecureString --value "rediss://<elasticache-endpoint>:6379/0" --overwrite

# NEW — bot protection (SEC-041)
aws ssm put-parameter --name "/axiorapulse/$ENV/TURNSTILE_SECRET"     --type SecureString --value "<captcha secret>" --overwrite
```

Then add each new key to `backend/ecs-task-def.json` under `secrets` (valueFrom = the SSM ARN), and reference it in code via `os.getenv`. **Do not** put these in `environment` (plaintext) blocks.

---

## 4. Provision Redis (ElastiCache) — required for SEC-009, SEC-015, SEC-008 budgets

The current in-memory rate limiter is non-functional across ECS tasks. A shared store is mandatory.

1. **Create** an ElastiCache for Redis (or Valkey) cluster in the **same VPC/private subnets** as the backend.
2. **Security group:** allow inbound `6379` **only** from the backend service SG (mirror the RDS pattern in `infra/cdk/lib/axiora-pulse-stack.ts`).
3. **Encryption:** enable in-transit (TLS → use `rediss://`) and at-rest.
4. **CDK:** add an `elasticache.CfnReplicationGroup` (or `aws-elasticache` L2) to `axiora-pulse-stack.ts`; output the endpoint; wire it into the SSM `REDIS_URL` above.
5. Add `redis>=5` (and `slowapi`'s redis storage extra / `limits[redis]`) to `requirements.txt`.

Backend wiring (for the dev implementing SEC-009):
```python
# core/rate_limiter.py
limiter = Limiter(key_func=resolve_key, storage_uri=os.environ["REDIS_URL"])
```

---

## 5. Trusted proxy / real client IP — required for SEC-009

Behind the ALB, `request.client.host` is the load-balancer IP. Pick one:

- **Uvicorn:** start with `--proxy-headers --forwarded-allow-ips="<ALB/VPC CIDR>"` (update `entrypoint.sh` / `ecs-task-def.json` command).
- **App-level:** add Starlette `ProxyHeadersMiddleware` trusting only the ALB subnet, then key the limiter on the resolved IP / authenticated tenant id.

Never trust `X-Forwarded-For` blindly — restrict to the known infra CIDR or you reintroduce spoofing.

---

## 6. Integration setup

### 6.1 Razorpay webhook (SEC-004)
1. Razorpay Dashboard → **Settings → Webhooks → Add**.
2. URL: `https://<api-domain>/api/payments/webhook`.
3. Set a **webhook secret**; store it as `RAZORPAY_WEBHOOK_SECRET` (Section 3).
4. Subscribe to `payment.captured`, `payment.failed`, `subscription.cancelled` (match the handler).
5. Confirm live vs test keys match the environment.

### 6.2 Sentry / error tracking (SEC-027)
1. Create two Sentry projects: `axiorapulse-backend` (Python) and `axiorapulse-frontend` (React).
2. Backend: add `sentry-sdk[fastapi]` to `requirements.txt`; init with `SENTRY_DSN` + `environment` + `traces_sample_rate`.
3. Frontend: add `@sentry/react`; init with `VITE_SENTRY_DSN`.
4. Configure alert rules (new issue, error-rate spike) → Slack/email.

### 6.3 CAPTCHA / bot protection (SEC-041)
1. Choose Cloudflare Turnstile (free) or reCAPTCHA v3.
2. Add the site key to the frontend (public) and the secret to SSM (`TURNSTILE_SECRET`).
3. Verify the token server-side on waitlist / demo / send-email / OTP-request handlers.

### 6.4 Cognito MFA (SEC-034)
1. Cognito User Pool → **Sign-in experience → MFA** → set to **Required** (TOTP at minimum) for admin groups.
2. Enforce in the app for `admin`/`super_admin` roles; add a step-up re-auth check for billing/role/delete/export.

### 6.5 Uptime monitoring
Point an external monitor (e.g. healthchecks.io / CloudWatch Synthetics / Better Stack) at `/api/health` (which will return 503 when unhealthy after SEC-026).

---

## 7. Dependency upgrades & scanning (SEC-023, SEC-024)

### 7.1 Confirm the current pins actually resolve
Some backend pins may be ahead of published releases. Validate before trusting:
```bash
cd backend
python -m venv .venv && . .venv/Scripts/activate    # Windows: .venv\Scripts\Activate.ps1
pip install -r requirements.txt --dry-run            # surfaces any non-existent version
pip install pip-audit && pip-audit -r requirements.txt
```
Fix any version that fails to resolve (use the real latest from PyPI).

### 7.2 Apply security bumps
```text
python-multipart>=0.0.18
starlette>=0.40.0           # coordinate with a FastAPI bump
# replace python-jose for token verification with PyJWT or authlib
```
Frontend:
```bash
cd frontend
npm audit
# replace xlsx (abandoned on npm) with exceljs, or install from the official SheetJS CDN
```

### 7.3 Backend lockfile (reproducible builds)
```bash
pip install pip-tools
# author requirements.in (top-level deps only), then:
pip-compile --generate-hashes -o requirements.txt requirements.in
```

### 7.4 Enable automated scanning
Create `.github/dependabot.yml`:
```yaml
version: 2
updates:
  - package-ecosystem: pip
    directory: /backend
    schedule: { interval: weekly }
  - package-ecosystem: npm
    directory: /frontend
    schedule: { interval: weekly }
  - package-ecosystem: npm
    directory: /infra/cdk
    schedule: { interval: weekly }
  - package-ecosystem: github-actions
    directory: /
    schedule: { interval: weekly }
```
Add a CI job running `pip-audit` + `osv-scanner` (backend) and `npm audit --audit-level=high` (frontend), failing on High/Critical.

### 7.5 Slim the API image (SEC-032)
Confirm whether any runtime path actually calls local Whisper. If transcription uses the OpenAI API, remove `torch`, `openai-whisper`, `numba`, `llvmlite`, `tiktoken`, `ffmpeg-python` from the API image (move to a separate worker if needed). This cuts image size by gigabytes and removes a large CVE surface.

---

## 8. Secret scanning in git (SEC-006)

Add to `.pre-commit-config.yaml`:
```yaml
  - repo: https://github.com/gitleaks/gitleaks
    rev: v8.18.4
    hooks:
      - id: gitleaks
```
Add a CI job: `gitleaks detect --source . --redact`. Install hooks locally: `pre-commit install`.

---

## 9. Environment variable reference

Complete matrix (derived from `core/config.py`, `cognito_utils.py`, `auth_utils.py`, route/service files, and `backend/.env.local.template`). **Secret** = must come from SSM/Secrets Manager in prod, never plaintext.

| Variable | Secret? | Required | Prod guidance |
|---|---|---|---|
| `SECRET_KEY` | ✅ | Yes (fails closed) | Strong random; rotate the leaked-era value |
| `DATABASE_URL` | ✅ | Yes (fails closed) | Append `?sslmode=require` |
| `OTP_JWT_SECRET` | ✅ | If OTP retained | Strong random; **must not** be the default (AP-SEC-001) |
| `MOCK_COGNITO` | — | No | Must be **false/unset** in prod (AP-SEC-029) |
| `MOCK_COGNITO_SECRET` | ✅ | No | Remove default; not used once mock disabled |
| `COGNITO_REGION` | — | Yes | e.g. `ap-south-1` |
| `COGNITO_USER_POOL_ID` | — | Yes | From SSM (already wired) |
| `COGNITO_APP_CLIENT_ID` | — | Yes | Public-ish, but stops feeding AP-SEC-001 once fallback removed |
| `ALGORITHM` | — | No | Leave default `HS256` only for legacy `auth_utils`; prefer removing |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | — | No | Lower from 1440 (24h) to ≤60 |
| `REFRESH_TOKEN_EXPIRE_DAYS` | — | No | Add rotation/revocation (SEC backlog) |
| `RAZORPAY_KEY_ID` | — | Payments | Match env (test/live) |
| `RAZORPAY_KEY_SECRET` | ✅ | Payments | Secret |
| `RAZORPAY_WEBHOOK_SECRET` | ✅ | Payments | **NEW** — add (SEC-004) |
| `DISABLE_PAYMENTS` | — | No | Must be **false** in prod |
| `OPENAI_KEY` / `ANTHROPIC_KEY` / `GEMINI_KEY` | ✅ | AI | Rotate OpenAI (Section 1) |
| `REDIS_URL` | ✅ | Yes (after SEC-009) | **NEW** — ElastiCache `rediss://` |
| `SENTRY_DSN` / `VITE_SENTRY_DSN` | partial | Recommended | **NEW** (SEC-027) |
| `TURNSTILE_SECRET` | ✅ | Recommended | **NEW** (SEC-041) |
| `AWS_SES_REGION` / `EMAIL_FROM` | — | Email | — |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_WHATSAPP_FROM` | ✅ token | WhatsApp | Secret = auth token |
| `META_WHATSAPP_ACCESS_TOKEN` / `META_WHATSAPP_PHONE_NUMBER_ID` | ✅ token | WhatsApp | Secret = access token |
| `ZOOM_ACCOUNT_ID` / `ZOOM_CLIENT_ID` / `ZOOM_CLIENT_SECRET` | ✅ secret | Demo | Secret = client secret |
| `MIGRATION_LAMBDA_SECRET` | ✅ | Migration | Already wired; fails closed when empty |
| `FRONTEND_URL` | — | Yes | Drives CORS allowlist (SEC-019) |
| `ENVIRONMENT` | — | Yes | **Set explicitly to `production`** — many dev shortcuts trigger when unset (AP-SEC-014) |
| `AWS_ENDPOINT_URL` | — | Local only | Unset in prod (LocalStack) |

> **Critical operational note:** `ENVIRONMENT` defaults to `development`. If it is unset or misspelled in a deployed env, the app prints OTP codes, uses the predictable OTP `123456`, and enables other dev shortcuts. **Always set `ENVIRONMENT=production` explicitly in prod.**

---

## 10. Database & infra checklist (manual verification — Cannot verify from code)

- [ ] RDS automated backups enabled; retention ≥7 days; **PITR** confirmed.
- [ ] `DATABASE_URL` enforces TLS (`sslmode=require`).
- [ ] ElastiCache provisioned, private, TLS, SG-scoped (Section 4).
- [ ] ALB enforces HTTPS (HTTP→HTTPS redirect) + HSTS; request size limit set (SEC-011).
- [ ] Security headers at edge: HSTS, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY` / CSP `frame-ancestors`, Referrer-Policy.
- [ ] Container runs as non-root (SEC-035); image scanned (ECR scan-on-push).
- [ ] IAM: task role scoped to `parameter/axiorapulse/<env>/*`, SNS to needed topics; deployer role separate from task role (SEC-035).
- [ ] Frontend prod build: `build.sourcemap=false` in `vite.config` (don't ship source maps) — verify.
- [ ] Vite: confirm no real secret is exposed via `VITE_*` (pool/client IDs are OK; keys are not).

---

## 11. Suggested execution order (manual track)

1. **Now:** Section 1 (rotate OpenAI keys) + Section 8 (gitleaks).
2. **Day 0–1:** Section 2 + 3 (generate & provision secrets, add `RAZORPAY_WEBHOOK_SECRET`), Section 6.1 (webhook). Unblocks SEC-001/004/005.
3. **Day 1–2:** Section 4 + 5 (Redis + proxy headers). Unblocks SEC-009/015.
4. **Day 2–4:** Section 6.2 (Sentry), Section 7 (deps + scanning), Section 10 infra verification.
5. **Pre-launch:** Section 6.3/6.4 (CAPTCHA, MFA), Section 11 sign-off via [05-VERIFICATION-CHECKLIST.md](./05-VERIFICATION-CHECKLIST.md).
