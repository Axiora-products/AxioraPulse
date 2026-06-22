# AxioraPulse — Security & Production-Readiness Audit Report

- **Date:** 2026-06-22
- **Scope:** Backend (FastAPI), Frontend (React/Vite), Infra (AWS CDK), CI/CD (GitHub Actions), dependencies, secrets, deployment.
- **Method:** Full source review with `file:line` evidence. Confirmed findings are quoted from the current tree; unverifiable items are labeled **Cannot verify**.
- **Branch reviewed:** `develop`

---

## Executive Summary

AxioraPulse is a multi-tenant survey SaaS: FastAPI + PostgreSQL backend, React SPA, AWS Cognito auth (with a parallel OTP/SMS login path), Razorpay payments, multiple AI providers, SMS/Email/WhatsApp, and ECS Fargate deployment.

The application is **not safe to launch**. Authentication is forgeable, the most sensitive endpoints are unauthenticated, payments can be manipulated, and the controls you would rely on under attack (rate limiting, monitoring, audit logging) are absent or non-functional.

| Dimension | Score /100 |
|---|---|
| Overall production readiness | 22 |
| Security | 18 |
| Availability / resilience | 35 |
| Data protection | 25 |

### Severity counts

| Severity | Count |
|---|---|
| Critical | 6 |
| High | 16 |
| Medium | 18 |
| Informational / Pass | — |

### Must-fix before production (P0)

| ID | Title |
|----|-------|
| AP-SEC-001 | Authentication bypass via hardcoded JWT fallback secret |
| AP-SEC-002 | Hardcoded super-admin email backdoor |
| AP-SEC-003 | Entire `/responses/*` API is unauthenticated (PII read/write) |
| AP-SEC-004 | Razorpay webhook signature not verified |
| AP-SEC-005 | Payment plan substitution (pay cheap, get expensive) |
| AP-SEC-006 | Live API keys leaked (git history + working tree) |
| AP-SEC-007 | Unauthenticated cross-tenant file download (IDOR) |
| AP-SEC-008 | Unauthenticated / ungated expensive LLM endpoints (cost abuse) |

---

## Finding Format

Each finding lists: **Severity · Status · Affected · Risk · Exploit · Fix · Acceptance · Safe Test**.
Status values: `Fail` (vulnerable), `Partial` (some control present), `Pass` (verified safe), `Cannot verify`.

---

# CRITICAL FINDINGS

## AP-SEC-001 — Authentication bypass via hardcoded JWT fallback secret
- **Severity:** Critical · **Status:** Fail
- **Affected:** `backend/cognito_utils.py:196-204`; chained with `backend/dependencies.py:41-150`; `backend/routes/otp.py:29,157`
- **Evidence:**
  ```python
  # cognito_utils.py — after Cognito RS256 verification fails:
  OTP_JWT_SECRET = os.getenv("OTP_JWT_SECRET", "otp-secret-key-change-in-production")
  payload = jwt.decode(token, OTP_JWT_SECRET, algorithms=["HS256"], audience=client_id)
  if payload.get("token_use") != "id":
      return None
  return payload
  ```
  `OTP_JWT_SECRET` is **not** provisioned in `backend/ecs-task-def.json`, so production runs the literal default. The `aud` value (`client_id`) is handed out by the unauthenticated `GET /auth/config`.
- **Risk:** Complete authentication bypass and account takeover for any user.
- **Exploit:**
  1. `GET /auth/config` → read `COGNITO_APP_CLIENT_ID`.
  2. `jwt.encode({"sub":"x","email":"victim@org.com","token_use":"id","aud":<client_id>}, "otp-secret-key-change-in-production", algorithm="HS256")`.
  3. Send as `Authorization: Bearer …`. `get_current_user` self-heals/creates the account and authenticates the attacker as that identity.
- **Fix:** Remove the OTP/mock HS256 fallback branches entirely; verify **only** Cognito RS256. If OTP login must mint tokens, use Cognito custom-auth flows. Make all signing secrets fail-closed (raise on missing) like `SECRET_KEY` in `core/config.py:27`.
- **Acceptance:** A token signed with any non-Cognito key is rejected with 401. No code path decodes bearer tokens with an app-held HS256 secret. App refuses to boot if a required secret is unset.
- **Safe test:** In staging, forge a token with the default secret; assert `GET /users/me` returns 401.

## AP-SEC-002 — Hardcoded super-admin email backdoor
- **Severity:** Critical · **Status:** Fail
- **Affected:** `backend/dependencies.py:129,132,145-150`
- **Evidence:**
  ```python
  role=RoleEnum.super_admin if email == "roopsai.work8@gmail.com" else RoleEnum.admin,
  ...
  if user.email == "roopsai.work8@gmail.com":
      if user.role != RoleEnum.super_admin or not user.is_internal:
          user.role = RoleEnum.super_admin
          user.is_internal = True
  ```
- **Risk:** A single personal email address is permanent, un-revocable god-mode baked into source. Combined with AP-SEC-001, an attacker self-promotes to super-admin. If that inbox is ever compromised, the entire platform is owned, and revocation requires a code deploy.
- **Fix:** Drive super-admin from a database flag or an SSM/Secrets-Manager-provisioned allowlist seeded out-of-band. Remove the email literal from code.
- **Acceptance:** No identity/PII literals in source. Super-admin assignment is data-driven, auditable, and revocable without deploying.
- **Safe test:** Grep for hardcoded emails returns none; promoting a user to super-admin is a privileged operation, not a code change.

## AP-SEC-003 — Entire `/responses/*` API is unauthenticated and unscoped (respondent PII)
- **Severity:** Critical · **Status:** Fail
- **Affected:** `backend/routes/responses.py:138,147,193,243,274` (confirmed: no `get_current_user` on any endpoint)
- **Evidence:** `GET /responses/{id}`, `PATCH /responses/{id}`, `POST /responses/{id}/answers|submit|abandon` filter only on `SurveyResponse.id == response_id`. The response model exposes `respondent_email`, `age_range`, `gender`, `occupation`, `city`, and all answers.
- **Risk:** Any unauthenticated party who learns a response UUID reads or rewrites another tenant's respondent PII and answer data (analytics poisoning).
- **Exploit:** Obtain a response UUID (leaked via owner dashboards, share links, referrer headers) → `GET /responses/{id}` returns full PII with no credentials; `PATCH` overwrites it.
- **Fix:** Keep the respondent create/answer-by-session-token flow public **but bind it to the `session_token` the caller holds**. Owner-side reads (`GET /responses/{id}`) require `get_current_user` and `Survey.tenant_id == current_user.tenant_id`. Validate `question_id` belongs to the survey before storing answers.
- **Acceptance:** Reading/patching a response without the matching session token or owning auth returns 401/403.
- **Safe test:** Create a response in tenant A; from an unauthenticated client `GET /responses/{id}` → expect 401 (currently 200 with PII).

## AP-SEC-004 — Razorpay webhook signature not verified
- **Severity:** Critical · **Status:** Fail
- **Affected:** `backend/routes/payments.py:188-235`
- **Evidence:** Docstring claims *"Validates the X-Razorpay-Signature header before processing"*, but the code never reads or verifies the signature. It mutates payment/subscription state directly from the JSON body.
- **Risk:** Anyone can POST forged `payment.captured` / `payment.failed` / `subscription.cancelled` events to flip payment state or cancel a tenant's subscription.
- **Exploit:** `POST /payments/webhook` with `{"event":"subscription.cancelled","payload":{"subscription":{"entity":{"id":"<victim sub>"}}}}` → victim's subscription cancelled.
- **Fix:** Compute `hmac.new(RAZORPAY_WEBHOOK_SECRET, raw_body, sha256).hexdigest()` and compare (constant-time) against `X-Razorpay-Signature` using the **raw** request body. Reject mismatches with 400 before any DB work.
- **Acceptance:** Webhook with a missing/invalid signature returns 400 and performs no mutation.
- **Safe test:** POST a crafted event with no signature → 400; confirm the payment row is unchanged.

## AP-SEC-005 — Payment plan substitution (pay for cheap, receive expensive)
- **Severity:** Critical · **Status:** Fail
- **Affected:** `backend/routes/payments.py:118-182`
- **Evidence:** `/verify` resolves the plan from **`body.plan_code`** (client-controlled) rather than from the `Payment`/order created earlier. The HMAC only covers `order_id|payment_id`, not the plan or amount.
- **Risk:** Revenue loss / entitlement fraud.
- **Exploit:** Create an order for the cheapest paid plan, pay legitimately, then call `/verify` with `plan_code="enterprise"` → subscription is set to Enterprise for the price of the cheap plan.
- **Fix:** Resolve the plan from the stored `Payment.plan_id` set at order creation; ignore `body.plan_code`. Additionally assert `payment.amount_paise == plan.price_paise`.
- **Acceptance:** The activated plan always equals the ordered & paid plan; amount mismatch is rejected.
- **Safe test:** Order Pro, verify with `plan_code=enterprise` → subscription remains Pro.

## AP-SEC-006 — Live API keys leaked (git history + working tree)
- **Severity:** Critical · **Status:** Fail
- **Affected:** Git history commit `aa62a19…:backend/.env.local.template:21`; current working-tree `backend/.env.local.template:21`
- **Evidence:**
  - History contains `OPENAI_KEY='sk-proj-Lz8dr_…'` (committed previously).
  - The current working-tree file (now gitignored) contains a *different* live-looking key `OPENAI_KEY='sk-proj-FQtk…'`.
- **Risk:** The historical key is permanently retrievable by anyone with repo access (and is unremovable without history rewrite). The working-tree key can be re-committed accidentally. Both can run up OpenAI spend / exfiltrate prompts.
- **Fix:**
  1. **Rotate both OpenAI keys immediately** in the OpenAI dashboard (revoke `sk-proj-Lz8dr…` and `sk-proj-FQtk…`).
  2. Replace the working-tree value with a placeholder (`sk-REPLACE_ME`).
  3. Purge the key from history (`git filter-repo` / BFG) and force-push, or treat the key as permanently burned (rotation already covers risk).
  4. Add a pre-commit secret scanner (gitleaks) — see `04-MANUAL-SETUP-GUIDE.md`.
- **Acceptance:** No `sk-`, `rzp_`, or other live secret resolves in the working tree or `HEAD`; the leaked keys are revoked; gitleaks runs in CI and pre-commit.
- **Safe test:** `gitleaks detect` returns zero findings on the current tree; the old keys return 401 from OpenAI.
- **Note:** Other secret types (AWS `AKIA`, Razorpay live, private keys) were **not** found in history (827 commits scanned). `.env`/`.env.*` are correctly gitignored & dockerignored.

---

# HIGH FINDINGS

## AP-SEC-007 — Unauthenticated, non-tenant-scoped file download (IDOR)
- **Severity:** High · **Status:** Fail
- **Affected:** `backend/routes/uploads.py:678-703`
- **Evidence:** `download_file(file_id, db=Depends(get_db))` — no `get_current_user`, no `tenant_id` filter; returns `FileResponse`. Sibling list/delete endpoints *are* tenant-scoped.
- **Risk:** Uploaded documents feed AI survey / CA-agent generation (pitch decks, financials). File UUIDs leak via `file_url` in upload/list responses.
- **Fix:** Require `get_current_user` and `UploadedFile.tenant_id == current_user.tenant_id`.
- **Acceptance:** Downloading another tenant's file returns 403.
- **Safe test:** Upload as tenant A; fetch the URL unauthenticated and as tenant B → both 401/403.

## AP-SEC-008 — Unauthenticated / ungated expensive LLM endpoints (cost abuse)
- **Severity:** High · **Status:** Fail
- **Affected:** `backend/routes/ai.py:1103` (`/ai/translate-survey` — no auth, no rate limit, runs `call_ai_sync(prompt, 4096)`); `backend/routes/ca_agent.py:573` (`max_tokens=16000`, no feature gate); `generate_survey`/`generate_suggestions`/`survey-intelligence` authed but not feature-gated.
- **Risk:** Direct, attacker-controlled spend on your AI accounts; the rate limiter does not help (see AP-SEC-009).
- **Exploit:** Script `POST /ai/translate-survey` with large bodies from anonymous clients → unbounded LLM billing.
- **Fix:** Require auth + `require_feature(...)` + per-tenant daily token/cost budget on every AI route; cap request input length; remove or restrict the unauthenticated route.
- **Acceptance:** No AI route is callable unauthenticated; a per-tenant token budget is enforced and returns 429 when exceeded.
- **Safe test:** Call `/ai/translate-survey` unauthenticated → 401; exceed a tenant budget → 429.

## AP-SEC-009 — Rate limiter is non-functional in production
- **Severity:** High · **Status:** Fail
- **Affected:** `backend/core/rate_limiter.py:4` — `Limiter(key_func=get_remote_address)` with no `storage_uri`; `backend/app/main.py` has no `ProxyHeadersMiddleware` / forwarded-IP trust.
- **Risk:** (a) In-memory counters reset on every deploy; (b) each ECS task has its own counter → effective limit is N×; (c) behind the ALB, `request.client.host` is the load-balancer IP, so all users share one bucket (one client throttles everyone, or limits are meaningless). Confirmed: no Redis anywhere.
- **Fix:** Use a shared store (`storage_uri="redis://…"`); resolve the real client IP from trusted forwarded headers; add per-user/per-tenant keys for authenticated routes.
- **Acceptance:** Limits hold globally across ≥2 replicas and survive restart; per-tenant limits verified.
- **Safe test:** Run k6 against 2 replicas; confirm the aggregate limit (not N×) is enforced.

## AP-SEC-010 — Open email / WhatsApp relays (phishing from your domain)
- **Severity:** High · **Status:** Fail
- **Affected:** `backend/routes/public.py:97` (`/public/send-email`, unauthenticated, attacker controls recipient + title/URL); `backend/routes/users.py:622-740` (`/users/share-survey`, `/bulk-share-survey`, `/bulk-share-whatsapp` — any authed role incl. `viewer`, attacker controls subject + HTML body + recipient list, no rate limit).
- **Risk:** Branded phishing/spam sent with your SES/Resend reputation and WhatsApp sender → deliverability damage + customer-trust damage.
- **Fix:** Authenticate `/public/send-email` or restrict it to server-rendered fixed templates with no caller-controlled body; rate-limit per tenant; role-gate and tenant-scope the share endpoints; restrict recipients.
- **Acceptance:** No endpoint sends caller-controlled HTML to caller-controlled recipients without auth + per-tenant rate limit.
- **Safe test:** POST `/public/send-email` with an arbitrary recipient → blocked/limited.

## AP-SEC-011 — Upload size enforced only after full buffering (OOM DoS)
- **Severity:** High · **Status:** Fail
- **Affected:** `backend/routes/uploads.py:348` (`contents = await file.read()` then 10 MB check); audio paths at `:498`, `:593` (25 MB).
- **Risk:** A multi-GB body is fully read into RAM before the size check; concurrent large uploads exhaust worker memory.
- **Fix:** Stream the upload and abort once the byte limit is exceeded; set body-size caps at the ALB and uvicorn layers as defense-in-depth.
- **Acceptance:** A request exceeding the limit is rejected before the full body is buffered; memory stays flat under a 1 GB upload attempt.
- **Safe test:** Send a 1 GB body in staging; observe early 413 and stable memory.

## AP-SEC-012 — DB connection-pool exhaustion from in-request AI / transcription
- **Severity:** High · **Status:** Fail
- **Affected:** `backend/routes/ai.py` (insights), `backend/routes/ca_agent.py:573`; pool config `backend/db/database.py:16` (`pool_size=10, max_overflow=20`).
- **Risk:** Multi-minute `call_ai_sync` runs while the DB session opened by `Depends(get_current_user)` / `Depends(require_feature)` stays checked out (FastAPI closes yielded sessions only after the response). ~30 concurrent AI requests starve the entire pool and block all endpoints.
- **Fix:** Resolve auth/feature-gate with a short-lived session that is closed before the long call; move heavy AI/transcription to a background worker (queue) and return a job id.
- **Acceptance:** AI calls do not hold a pooled DB connection for their duration; pool never exhausts under concurrent AI load in a load test.
- **Safe test:** Fire 40 concurrent insight requests; confirm other endpoints stay responsive.

## AP-SEC-013 — `/auth/cleanup-unconfirmed` unauthenticated user deletion / enumeration
- **Severity:** High · **Status:** Fail
- **Affected:** `backend/routes/auth.py:325-336`
- **Evidence:** No auth; calls `admin_get_user_status(email)` then `admin_delete_user(email)` for UNCONFIRMED users.
- **Risk:** Account-prep griefing (delete a victim mid-signup) and user-existence enumeration.
- **Fix:** Authenticate (internal/service token) or remove the endpoint; never reveal account status to anonymous callers.
- **Acceptance:** Unauthenticated calls return 401/404 with no status disclosure.

## AP-SEC-014 — Secrets & PII written to logs
- **Severity:** High · **Status:** Fail
- **Affected:** `backend/cognito_utils.py:150` (raw JWT each request); `backend/services/sms.py:26-28` (OTP code + phone when `ENVIRONMENT != production`, default `development`); `backend/routes/otp.py:72` (predictable OTP `"123456"` in non-prod); `backend/routes/ai.py:741` (raw AI response / respondent PII).
- **Risk:** Credential and PII disclosure to CloudWatch / log aggregation; predictable OTP if `ENVIRONMENT` is ever misconfigured in a deployed env.
- **Fix:** Remove token/OTP/PII `print()`s; adopt structured logging with redaction; gate all dev shortcuts behind an explicit strict allowlist (e.g. `ENVIRONMENT == "local"`), never "not production".
- **Acceptance:** No tokens/OTPs/PII appear in logs; OTP is always random in any deployed environment.

## AP-SEC-015 — OTP brute-force window + SMS bombing
- **Severity:** High · **Status:** Fail
- **Affected:** `backend/routes/otp.py:115-122,245-252` (attempt check before code comparison, per-OTP-row only); send throttle is IP-only `3/min` (broken per AP-SEC-009); OTP generated with non-crypto `random` at `:73`.
- **Risk:** Requesting a fresh OTP resets the attempt budget; no per-phone/per-account lockout; SMS cost abuse via SNS.
- **Fix:** Per-phone and per-account lockout with backoff; compare-then-count; `secrets`-based codes; per-phone send cooldown + daily cap.
- **Acceptance:** After N failed attempts the phone/account is locked regardless of new OTP requests; send rate is capped per phone.

## AP-SEC-016 — `invite_token` leaked in API responses & never expires
- **Severity:** High · **Status:** Fail
- **Affected:** `backend/schemas/user.py:20` (`UserProfileOut.invite_token`); returned by `POST /users/invite` and `GET /users/` (no role gate); model `backend/db/models.py:135` (no expiry).
- **Risk:** Any tenant member listing users reads other invited users' active tokens and hijacks the pending account via `accept-invite`.
- **Fix:** Never serialize `invite_token`; add an expiry column and enforce it; role-gate and rate-limit `GET /users/`.
- **Acceptance:** Token never appears in any API response; expired tokens are rejected.

## AP-SEC-017 — Intra-tenant broken object-level authorization; share permissions never enforced
- **Severity:** High · **Status:** Fail
- **Affected:** `backend/routes/surveys.py` survey-object writes filter only by `tenant_id`; lists filter by `created_by`; `SurveyShare` viewer/editor permission is never checked on any write path.
- **Risk:** A user who can't *see* a teammate's survey can still **edit/delete** it by learning its UUID; the entire share-permission model is decorative.
- **Fix:** Enforce ownership and `SurveyShare` permission on every write (`update`, `delete`, questions, etc.).
- **Acceptance:** A user without ownership or an editor share cannot modify a survey (403).

## AP-SEC-018 — `manager` → `admin` privilege escalation via invite
- **Severity:** High · **Status:** Fail
- **Affected:** `backend/routes/users.py:104-183` (`invite_user` allows role `manager` to invite a user with `role=admin`; the role-change endpoint forbids this but invite does not).
- **Risk:** A manager mints an admin account, escalating within the tenant.
- **Fix:** Enforce a role ceiling on invite (a caller may not invite a role higher than their own).
- **Acceptance:** A manager inviting `admin`/`super_admin` is rejected (403).

## AP-SEC-019 — Wildcard CORS in production
- **Severity:** High · **Status:** Fail
- **Affected:** `backend/app/main.py:73-79` — `allow_origins=["*"], allow_methods=["*"], allow_headers=["*"]`.
- **Risk:** Any website can call the API from a browser. (Impact partially limited by Bearer-token auth + `allow_credentials=False`, but still enables broad cross-origin abuse and data scraping where endpoints lack auth.)
- **Fix:** Restrict `allow_origins` to the known `FRONTEND_URL`(s); restrict methods/headers to those used.
- **Acceptance:** Requests from disallowed origins are blocked by CORS.

## AP-SEC-020 — Swagger / ReDoc / OpenAPI exposed in production
- **Severity:** High · **Status:** Fail
- **Affected:** `backend/app/main.py:61-63` — `docs_url="/docs"`, `redoc_url="/redoc"` hardcoded with no environment gate.
- **Risk:** Full public map of the API surface (including the internal endpoints flagged above) aids attackers.
- **Fix:** Disable `/docs`, `/redoc`, `/openapi.json` in production (set to `None` when `ENVIRONMENT == production`).
- **Acceptance:** `/docs` returns 404 in production.

## AP-SEC-021 — No circuit breaker; worst-case AI retry/failover latency in the minutes
- **Severity:** High · **Status:** Fail
- **Affected:** `backend/services/ai_provider.py:297-377` — 3 providers × up to 3 retries × up to 180s timeout + `time.sleep` backoff, no breaker.
- **Risk:** A degraded-but-not-failing provider ties up threadpool workers for minutes per request, cascading into an outage under load.
- **Fix:** Add a circuit breaker per provider; cap total retry budget and total request deadline; shed load fast when providers are unhealthy.
- **Acceptance:** A single request cannot exceed a bounded total deadline; an unhealthy provider is short-circuited.

## AP-SEC-022 — Outbound calls without timeouts (worker hang)
- **Severity:** High · **Status:** Fail
- **Affected:** `backend/routes/demo.py:36,62` (Zoom OAuth + create-meeting `requests.post` with **no timeout**); `backend/services/sms.py:36` (boto3 SNS default timeouts).
- **Risk:** `/demo/schedule` (public) can hang a worker indefinitely if Zoom stalls.
- **Fix:** Add explicit timeouts to every outbound call; configure boto3 `Config(connect_timeout, read_timeout, retries)`.
- **Acceptance:** No outbound HTTP/SDK call can block longer than its configured timeout.

---

# MEDIUM FINDINGS

## AP-SEC-023 — Dependencies with known CVEs
- **Severity:** Medium (some High in context) · **Status:** Fail
- **Affected:** `backend/requirements.txt`, `frontend/package.json`
- **Details:**
  - `python-jose==3.3.0` — algorithm-confusion (CVE-2024-33663) and DoS (CVE-2024-33664); pulls `ecdsa` (Minerva timing advisory). Used for token verification.
  - `python-multipart==0.0.9` — multipart DoS (CVE-2024-53981); fixed in 0.0.18. Reachable on all file/form endpoints.
  - `starlette==0.37.2` — `UploadFile` memory-exhaustion DoS (CVE-2024-47874); fixed in 0.40.0.
  - `xlsx`/SheetJS `^0.18.5` — prototype pollution (CVE-2023-30533) + ReDoS (CVE-2024-22363); **no npm fix** (package abandoned on npm).
  - `passlib==1.7.4` — unmaintained.
- **Fix:** `python-multipart>=0.0.18`, `starlette>=0.40.0` (coordinate FastAPI bump), migrate auth off `python-jose` to `PyJWT`/`authlib`, replace `xlsx` with `exceljs` or pull from the official SheetJS CDN, plan `passlib`→`argon2-cffi`/`bcrypt`.
- **Acceptance:** `pip-audit` and `npm audit` report no High/Critical.

## AP-SEC-024 — No dependency scanning; no Python lockfile
- **Severity:** Medium · **Status:** Fail
- **Affected:** Repo-wide. No `dependabot.yml` / `.snyk` / `pip-audit` / `npm audit` in CI. Backend has no lockfile (only `requirements.txt`); frontend uses `^` ranges (lockfiles committed).
- **Fix:** Add `.github/dependabot.yml` (pip + npm + github-actions); add `pip-audit` + `osv-scanner`/`npm audit` CI steps; pin backend deps with hashes (`pip-compile`). **Verify** that all currently-pinned versions actually resolve (some pins may be ahead of releases — confirm with a clean install).
- **Acceptance:** CI fails on new High/Critical advisories; backend build is reproducible from a lockfile.

## AP-SEC-025 — No optimistic locking; feature-gate TOCTOU
- **Severity:** Medium (High under contention) · **Status:** Fail
- **Affected:** `backend/services/feature_gate.py:53-60` (count-then-act, no lock); no version columns / `SELECT … FOR UPDATE` anywhere.
- **Risk:** Concurrent requests bypass plan limits; concurrent edits to a survey/response/subscription are last-write-wins (lost updates), most dangerous on payment/subscription rows.
- **Fix:** Add a version column (optimistic locking) on mutable business entities; use `SELECT … FOR UPDATE` for limit checks and subscription mutations.
- **Acceptance:** Two concurrent updates cannot silently overwrite; plan limits cannot be exceeded by parallel requests.

## AP-SEC-026 — `/health` leaks DB error and returns 200 when unhealthy
- **Severity:** Medium · **Status:** Fail
- **Affected:** `backend/app/main.py:110-117`
- **Risk:** `str(e)` may leak the connection string (host/port/db/user); returning HTTP 200 while unhealthy defeats ALB/orchestrator health gating and safe rollouts.
- **Fix:** Return 503 with a generic body when unhealthy; log the detail server-side only.
- **Acceptance:** Unhealthy DB → `/health` returns 503 with no internal detail.

## AP-SEC-027 — No structured logging, audit log, or error tracking
- **Severity:** Medium (High for a payments app) · **Status:** Fail
- **Affected:** Repo-wide — `print()` as de-facto logger, no `logging.basicConfig`, no Sentry/APM, no audit trail for admin/payment/security events.
- **Risk:** An attack would be invisible; incidents are not reconstructable; no forensics.
- **Fix:** JSON structured logging; integrate Sentry (backend + frontend); add an append-only audit log for auth, role/permission changes, payments, super-admin actions; ship request logs.
- **Acceptance:** Security-relevant events are queryable and alertable; errors flow to Sentry.

## AP-SEC-028 — No background jobs; stale data growth
- **Severity:** Medium · **Status:** Fail
- **Affected:** No Celery/APScheduler/cron (confirmed). OTP rows and expired tokens are never swept; failed emails/SMS have no retry queue.
- **Fix:** Add a scheduled worker (Celery beat / EventBridge + Lambda / ECS scheduled task) for OTP cleanup, token expiry, and dead-letter retries.
- **Acceptance:** Expired OTP/token rows are purged on a schedule; failed notifications are retried via a queue.

## AP-SEC-029 — Latent auth-bypass endpoints / mock secrets shipped in prod image
- **Severity:** Medium · **Status:** Partial
- **Affected:** `backend/routes/auth.py:339-375` (`/auth/mock-login` mints a token for any email when `MOCK_COGNITO=true`); `MOCK_COGNITO_SECRET` default `mock-secret-key-1234567890` (`cognito_utils.py:67`, `auth.py:372`).
- **Risk:** If `MOCK_COGNITO` is ever true in a reachable environment, this is a full bypass. Currently contained (not set in `ecs-task-def.json`).
- **Fix:** Exclude mock endpoints from production builds (feature flag at import time / router not mounted when `ENVIRONMENT==production`); remove default mock secrets.
- **Acceptance:** Mock auth routes do not exist in the production app; no mock secret defaults.

## AP-SEC-030 — Upload MIME validated from client header only
- **Severity:** Medium · **Status:** Partial
- **Affected:** `backend/routes/uploads.py:342` — allowlist checks `file.content_type` (spoofable) with no magic-byte sniffing.
- **Fix:** Validate content by sniffing magic bytes (e.g. `python-magic`/`filetype`) against the declared type and an extension allowlist; reject mismatches.
- **Acceptance:** A file whose bytes don't match its declared type/extension is rejected.

## AP-SEC-031 — Stored SVG/HTML content risk
- **Severity:** Medium · **Status:** Partial
- **Affected:** `backend/routes/uploads.py` — `text/plain` allowed, no sniffing; download forces `attachment` (mitigates inline render).
- **Risk:** Stored XSS if extracted text or the file is ever rendered inline elsewhere (e.g. in the SPA).
- **Fix:** Sanitize/escape extracted text on render; never serve user files inline; set `Content-Security-Policy` and `X-Content-Type-Options: nosniff`.
- **Acceptance:** Uploaded content cannot execute script in any consumer view.

## AP-SEC-032 — Local Whisper/torch in the API image (CPU DoS + bloat)
- **Severity:** Medium · **Status:** Partial
- **Affected:** `backend/requirements.txt` (`torch`, `openai-whisper`, `numba`, `llvmlite`, `tiktoken`); `backend/routes/uploads.py` local-model path.
- **Risk:** Local CPU transcription under concurrency pins CPU/RAM; multi-GB image increases attack surface and cold-start.
- **Fix:** Use the OpenAI transcription API at runtime and remove the local-inference stack from the API image, **or** split transcription into a dedicated worker service/queue.
- **Acceptance:** The API image no longer ships torch/whisper; transcription runs out-of-band.

## AP-SEC-033 — Prompt injection via raw user input in LLM prompts
- **Severity:** Medium · **Status:** Partial
- **Affected:** `backend/routes/ai.py` (f-string interpolation of `aiContext`, file/audio context), `backend/routes/ca_agent.py` (founder free-text).
- **Risk:** Output-integrity manipulation / system-prompt exfiltration. Impact bounded today (models have no tools/data access; output parsed as JSON).
- **Fix:** Separate system vs. user content; bound all user input lengths; validate/whitelist model output; never give the model tool access without sandboxing.
- **Acceptance:** Injected instructions cannot alter control flow or leak system prompts in a test corpus.

## AP-SEC-034 — No MFA for admins; no re-auth on sensitive actions
- **Severity:** Medium · **Status:** Fail
- **Affected:** Auth/authorization layer overall. OTP is a *primary* login path, not a second factor; super-admin plan/status/user-delete actions require only a bearer token.
- **Fix:** Enforce Cognito MFA for admin/super-admin; add step-up re-authentication for billing changes, role changes, exports, and deletions.
- **Acceptance:** Admin login requires MFA; sensitive actions require recent re-auth.

## AP-SEC-035 — Container & IAM hardening gaps
- **Severity:** Medium · **Status:** Partial
- **Affected:** `backend/Dockerfile`, `backend/Dockerfile.prod` (run as root, no `USER`); `infra/cdk/lib/axiora-pulse-stack.ts:262-265` (`sns:Publish` on `*`), `:249-253` (SSM read across all envs `parameter/axiorapulse/*` + `AmazonSSMReadOnlyAccess`); `infra/cdk/lib/github-oidc-stack.ts` (deployer role reused as task role).
- **Fix:** Non-root container user; scope SNS to needed topics/regions; scope SSM reads to `parameter/axiorapulse/${env}/*`; split the CI deployer role from the ECS task role.
- **Acceptance:** Least-privilege task role; container runs as non-root.

## AP-SEC-036 — `DELETE /users/{id}` allows admin despite "super_admin only" docstring
- **Severity:** Medium · **Status:** Partial
- **Affected:** `backend/routes/users.py:417-456` (check allows `{super_admin, admin}`; tenant-scoped).
- **Fix:** Align the control with intent (restrict to super_admin) or update the contract deliberately; require re-auth for hard delete.
- **Acceptance:** Deletion authority matches documented policy; action is audit-logged.

## AP-SEC-037 — Draft/unpublished surveys readable by slug
- **Severity:** Medium · **Status:** Fail
- **Affected:** `backend/routes/surveys.py:462-481` (`GET /surveys/slug/{slug}` returns full survey + questions with no `status == active` filter).
- **Risk:** Unreleased survey content is publicly fetchable by guessing/learning the slug.
- **Fix:** Only serve `active` surveys publicly by slug; 404 for draft/paused/closed.
- **Acceptance:** A draft survey's slug returns 404 to anonymous callers.

## AP-SEC-038 — `upload_from_drive` arbitrary token pull + raw error leak
- **Severity:** Medium · **Status:** Partial
- **Affected:** `backend/routes/uploads.py:396-480` (downloads any file the supplied Google token can reach; `detail=f"Google Drive error: {str(e)}"` leaks raw upstream error).
- **Fix:** Validate file ownership/scope expectations; return generic error messages; log details server-side.
- **Acceptance:** No raw upstream error reaches the client.

## AP-SEC-039 — Hard deletes with no soft-delete / recoverability
- **Severity:** Medium · **Status:** Fail
- **Affected:** `backend/db/models.py` (cascade deletes), delete routes across surveys/users/uploads.
- **Risk:** A compromised or mistaken admin can irreversibly destroy business-critical data.
- **Fix:** Soft-delete (`deleted_at`) for tenants/surveys/responses/users; background purge after a retention window; confirm RDS PITR (**Cannot verify** retention from code).
- **Acceptance:** Critical deletes are reversible within a retention window.

## AP-SEC-040 — Weak accept-invite password policy
- **Severity:** Medium · **Status:** Partial
- **Affected:** `backend/schemas/invite.py:16` (min length 6), pushed to Cognito at `backend/routes/users.py:511-516`.
- **Fix:** Enforce ≥12 chars consistent with the Cognito policy; rely on Cognito as the single password authority.
- **Acceptance:** Invite acceptance rejects passwords weaker than the Cognito policy.

---

# Items Verified as PASS (do not regress)

- **SQL injection** — ORM with bound parameters throughout; no raw SQL with user input. (`Pass`)
- **Command injection** — ffmpeg/ffprobe use list-form argv, no `shell=True`, file path is server-generated. (`Pass`)
- **Path traversal on upload write** — UUID-based stored filenames neutralize `../`. (`Pass`)
- **Secrets in git history (non-OpenAI)** — no AWS/Razorpay-live/private keys found; `.env*` gitignored & dockerignored. (`Pass`, but see AP-SEC-006)
- **Prod secrets via SSM/Secrets Manager** — `ecs-task-def.json` sources secrets, not plaintext env. (`Pass`)
- **RDS** — private subnets, not publicly accessible, SG-scoped, `storageEncrypted`, multi-AZ in prod. (`Pass`; retention/PITR **Cannot verify**)
- **S3 frontend bucket** — block-all-public + SSL enforced. (`Pass`)
- **AI provider error masking** — API keys masked in error logs (`ai_provider.py:343`). (`Pass`)
- **Outbound timeouts** — set on AI/email/WhatsApp/JWKS/translate (except Zoom/SNS — AP-SEC-022). (`Partial`)
- **`SECRET_KEY` / `DATABASE_URL`** — fail-closed at startup (`core/config.py:24-28`). (`Pass`)
- **CI** — OIDC (no long-lived AWS keys), secrets from SSM at build time, not echoed. (`Pass`)

---

## Appendix A — Production Failure Readiness Matrix

| Scenario | Current behavior (from code) | Risk | Required fix |
|---|---|---|---|
| Traffic 100× | Rate limiter void; pool exhausts; uploads OOM | Critical | Redis limits, queue heavy work, stream uploads |
| DB slow | Sessions held during AI calls → cascade stall | High | Release session pre-AI; statement timeout |
| Email/SMS/WhatsApp fail | Email 500s the request; demo booking already committed | Medium | Catch + async retry; fix tx ordering |
| Payment provider fail | 503 on create; verify path OK | Medium | Keep; add idempotency |
| Attacker controls input | Raw `dict` bodies; prompt injection | Medium-High | Schemas + input caps |
| Background jobs stop | None exist; OTP rows accumulate | Medium | Add scheduled worker |
| Partial deploy | `/health` returns 200 when unhealthy | Medium | Return 503 unhealthy |
| Missing env vars | DB/SECRET_KEY fail; other secrets silently default | Critical | Fail-closed all secrets |
| Concurrent same-record update | Last-write-wins; feature-gate TOCTOU | Medium-High | Optimistic locking / `FOR UPDATE` |
| Restart mid-payment | No idempotency on verify; limiter resets | Medium | Idempotency keys |

## Appendix B — OWASP Top 10 (2021) Mapping

| OWASP | Status | Findings |
|---|---|---|
| A01 Broken Access Control | **Fail** | AP-SEC-003, 007, 016, 017, 018, 036, 037 |
| A02 Cryptographic Failures | **Fail** | AP-SEC-001, 002, 006, 014 |
| A03 Injection | **Partial** | AP-SEC-033 (prompt); SQL/cmd Pass |
| A04 Insecure Design | **Fail** | AP-SEC-005, 015, 025, 028, 034, 039 |
| A05 Security Misconfiguration | **Fail** | AP-SEC-019, 020, 026, 029, 035 |
| A06 Vulnerable Components | **Fail** | AP-SEC-023, 024 |
| A07 Auth Failures | **Fail** | AP-SEC-001, 013, 015, 034, 040 |
| A08 Software/Data Integrity | **Fail** | AP-SEC-004, 024, 029 |
| A09 Logging & Monitoring Failures | **Fail** | AP-SEC-014, 027 |
| A10 SSRF | **Partial** | `download_qr` allowlisted (Pass); AP-SEC-038 (Drive) |

Additional checks: CSRF — N/A (Bearer tokens). CORS — **Fail** (AP-SEC-019). Security headers / CSP / clickjacking — **Cannot verify** (set them: HSTS, `X-Content-Type-Options`, `X-Frame-Options`/`frame-ancestors`, CSP). HTTPS enforcement — **Cannot verify** (enforce at ALB + HSTS). Request/file size limits — **Fail** (AP-SEC-011). Secrets management — **Partial** (AP-SEC-001, 006). CI/CD safety — **Pass** with IAM caveats (AP-SEC-035).
