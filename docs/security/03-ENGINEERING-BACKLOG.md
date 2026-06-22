# AxioraPulse — Engineering Backlog (developer-ready tickets)

Each ticket: **Priority · Finding · Story · Acceptance Criteria · Files · Implementation approach.**
Priorities: **P0** (launch blocker, 24h), **P1** (3 days), **P2** (7 days / pre-launch), **P3** (post-launch).

Copy these directly into Jira/Linear/GitHub Issues. IDs match findings in [01-AUDIT-REPORT.md](./01-AUDIT-REPORT.md).

---

## SEC-001 · P0 · Remove forgeable JWT fallback secret
- **Finding:** AP-SEC-001
- **Story:** As an attacker, I must not be able to forge a valid token with an app-held secret.
- **Acceptance:**
  - `verify_cognito_token` only verifies Cognito RS256 (JWKS); no HS256 fallback branch remains.
  - If OTP login is retained, tokens are issued via Cognito custom-auth, not a side HS256 secret.
  - App raises at startup if any required secret is missing (mirror `core/config.py`).
  - A token signed with the old default secret returns 401.
- **Files:** `backend/cognito_utils.py:145-204`, `backend/routes/otp.py:29,146-157`, `backend/core/config.py`
- **Approach:** Delete the `OTP_JWT_SECRET`/`MOCK_COGNITO_SECRET` decode branches. Centralize secret loading in `config.py` with fail-closed checks. If OTP must stay short-term, gate it behind a Cognito-issued token; otherwise remove the fallback acceptance entirely.

## SEC-002 · P0 · Remove hardcoded super-admin email
- **Finding:** AP-SEC-002
- **Story:** As a platform owner, super-admin must be data-driven and revocable without a deploy.
- **Acceptance:** No email/identity literals in code; super-admin set via DB flag/SSM allowlist; demotion possible at runtime.
- **Files:** `backend/dependencies.py:124-156`
- **Approach:** Remove the `roopsai.work8@gmail.com` branches. Seed the real super-admin via a one-off admin script / migration reading an SSM allowlist. Keep the self-heal logic only for legitimate Cognito↔profile linking.

## SEC-003 · P0 · Authenticate & scope `/responses/*`
- **Finding:** AP-SEC-003
- **Story:** As a respondent I can submit my own session; as an owner I can read responses for my tenant; nobody else can.
- **Acceptance:** Respondent create/answer requires a matching `session_token`; owner reads require `get_current_user` + tenant match; `question_id` validated against the survey; cross-tenant read → 401/403.
- **Files:** `backend/routes/responses.py` (all endpoints)
- **Approach:** Split into a public respondent router (session-token-bound) and an authenticated owner router. Add a helper that loads a response and asserts either the caller's session token or `Survey.tenant_id == current_user.tenant_id`.

## SEC-004 · P0 · Verify Razorpay webhook signature
- **Finding:** AP-SEC-004
- **Story:** As the billing system, I must reject forged webhook events.
- **Acceptance:** Invalid/missing `X-Razorpay-Signature` → 400, no mutation; signature computed over the raw body with `RAZORPAY_WEBHOOK_SECRET`, constant-time compare.
- **Files:** `backend/routes/payments.py:188-235`
- **Approach:** Read `await request.body()` (raw), compute HMAC-SHA256, `hmac.compare_digest` vs header. Razorpay SDK provides `utility.verify_webhook_signature`. Reject before parsing.

## SEC-005 · P0 · Bind payment verify to ordered plan
- **Finding:** AP-SEC-005
- **Story:** As a customer I receive exactly the plan I paid for.
- **Acceptance:** Plan resolved from `Payment.plan_id` (set at order creation), not `body.plan_code`; `payment.amount_paise == plan.price_paise` asserted.
- **Files:** `backend/routes/payments.py:118-182`
- **Approach:** Load `Payment` by `razorpay_order_id` + tenant, then `plan = payment.plan`. Remove reliance on `body.plan_code`.

## SEC-006 · P0 · Rotate & purge leaked API keys; add secret scanning
- **Finding:** AP-SEC-006
- **Story:** As a platform owner, no live secret is recoverable from the repo.
- **Acceptance:** Both OpenAI keys rotated/revoked; working-tree value is a placeholder; gitleaks runs in pre-commit and CI with zero findings; history scrubbed or keys confirmed dead.
- **Files:** `backend/.env.local.template`, `.pre-commit-config.yaml`, `.github/workflows/`
- **Approach:** Rotate in the OpenAI console. Replace the value with `sk-REPLACE_ME`. Add `gitleaks` to `.pre-commit-config.yaml` and a CI job. Optionally `git filter-repo` to remove the historical blob (coordinate force-push).

## SEC-007 · P0 · Authorize file download
- **Finding:** AP-SEC-007
- **Story:** As a user I can only download files belonging to my tenant.
- **Acceptance:** `/uploads/download/{file_id}` requires auth and `UploadedFile.tenant_id == current_user.tenant_id`; other-tenant/anonymous → 403/401.
- **Files:** `backend/routes/uploads.py:678-703`
- **Approach:** Add `current_user: UserProfile = Depends(get_current_user)` and a tenant filter on the query.

## SEC-008 · P0 · Lock down AI endpoints (auth, gate, rate-limit, budget)
- **Finding:** AP-SEC-008 (+ Phase 3 budget extension)
- **Story:** As a platform owner, AI spend is authenticated, plan-gated, and bounded per tenant.
- **Acceptance:** No AI route callable unauthenticated; every AI route has `require_feature` + rate limit; per-tenant daily token budget enforced (429 when exceeded); request input length capped.
- **Files:** `backend/routes/ai.py` (incl. `:1103`), `backend/routes/ca_agent.py:522-573`, `backend/services/feature_gate.py`
- **Approach:** Add auth + `require_feature` to `translate-survey`, `generate_survey`, `generate_suggestions`, `survey-intelligence`, `ca_agent`. Track per-tenant token usage in Redis/DB; enforce budget in a dependency. Truncate user input to documented limits.

## SEC-009 · P1 · Redis-backed, correctly-keyed rate limiting
- **Finding:** AP-SEC-009
- **Story:** As the platform, rate limits are global, persistent, and per real client/tenant.
- **Acceptance:** `storage_uri` points at Redis; client IP resolved via trusted forwarded headers; per-user/tenant keys on authed routes; limits hold across ≥2 replicas and across restart.
- **Files:** `backend/core/rate_limiter.py`, `backend/app/main.py`
- **Approach:** `Limiter(key_func=..., storage_uri="redis://…")`. Add Starlette `ProxyHeadersMiddleware` (or Uvicorn `--forwarded-allow-ips`) with the ALB/VPC CIDR trusted. Use a key func that prefers authenticated tenant/user id, falling back to forwarded IP.

## SEC-010 · P1 · Close email/WhatsApp relays
- **Finding:** AP-SEC-010
- **Acceptance:** `/public/send-email` requires auth or uses fixed server templates with no caller HTML; share endpoints role-gated, tenant-scoped, per-tenant rate-limited.
- **Files:** `backend/routes/public.py:97-118`, `backend/routes/users.py:622-740`
- **Approach:** Replace caller-supplied `body`/`subject` with template IDs + safe params. Add `@limiter.limit` keyed per tenant. Verify the survey link belongs to the caller's tenant.

## SEC-011 · P1 · Stream-enforce upload size
- **Finding:** AP-SEC-011
- **Acceptance:** Bodies over the limit rejected before full buffering; memory flat under a 1 GB attempt; ALB + uvicorn body caps set.
- **Files:** `backend/routes/uploads.py:340-360,490-600`
- **Approach:** Read in chunks (`await file.read(CHUNK)`), accumulate length, abort with 413 past the cap; or use Starlette's `Request.stream()`. Configure ALB `routing.http.*` / uvicorn limits.

## SEC-012 · P1 · Prevent DB pool exhaustion during AI calls
- **Finding:** AP-SEC-012
- **Acceptance:** AI calls do not hold a pooled DB connection for their duration; pool never exhausts in a 40-concurrent-AI load test.
- **Files:** `backend/routes/ai.py`, `backend/routes/ca_agent.py`, `backend/db/database.py`
- **Approach:** Resolve auth/feature-gate in a short `with SessionLocal() as s:` block that closes before the long call; re-open a session only to persist results. Long-term: queue AI work (see SEC-027/Phase 4).

## SEC-013 · P0 · Authenticate `/auth/cleanup-unconfirmed`
- **Finding:** AP-SEC-013
- **Acceptance:** Unauthenticated calls return 401/404; no account-status disclosure.
- **Files:** `backend/routes/auth.py:325-336`
- **Approach:** Require an internal service token or remove; merge into the authenticated signup-retry flow.

## SEC-014 · P0 · Remove secrets/PII from logs; structured logging
- **Finding:** AP-SEC-014
- **Acceptance:** No tokens/OTPs/PII in logs; OTP always random in deployed envs; dev shortcuts gated by `ENVIRONMENT == "local"` allowlist.
- **Files:** `backend/cognito_utils.py:150`, `backend/services/sms.py:26-28`, `backend/routes/otp.py:72,200`, `backend/routes/ai.py:741`
- **Approach:** Delete sensitive `print()`s; introduce `logging.basicConfig` + JSON formatter + a redaction filter. Replace `not in (production,prod)` checks with an explicit allowlist.

## SEC-015 · P1 · OTP hardening
- **Finding:** AP-SEC-015
- **Acceptance:** Per-phone + per-account lockout with backoff; compare-then-count; `secrets`-generated codes; per-phone send cooldown + daily cap.
- **Files:** `backend/routes/otp.py:42-130,200-260`, `backend/services/sms.py`
- **Approach:** Move attempt/lock state to Redis keyed by phone+account. Generate codes with `secrets.randbelow`. Add send-cooldown keys.

## SEC-016 · P1 · Protect invite tokens
- **Finding:** AP-SEC-016
- **Acceptance:** `invite_token` never serialized; tokens expire; `GET /users/` role-gated + rate-limited.
- **Files:** `backend/schemas/user.py:20`, `backend/routes/users.py:65-101,459-471`, `backend/db/models.py:135` (+ migration for `invite_expires_at`)
- **Approach:** Remove `invite_token` from `UserProfileOut`. Add `invite_expires_at`; reject expired in `accept_invite`. Gate the list endpoint to manager+.

## SEC-017 · P1 · Enforce survey object-level authorization
- **Finding:** AP-SEC-017
- **Acceptance:** Survey writes require creator ownership or an editor `SurveyShare`; others → 403.
- **Files:** `backend/routes/surveys.py` (write endpoints)
- **Approach:** Add a `_require_survey_write(survey, user)` helper checking `created_by == user.id` OR an editor share; call it on update/delete/question/feedback mutations.

## SEC-018 · P1 · Role ceiling on invite
- **Finding:** AP-SEC-018
- **Acceptance:** A caller cannot invite a role higher than their own; manager inviting admin/super_admin → 403.
- **Files:** `backend/routes/users.py:104-183`
- **Approach:** Compare requested role rank vs caller role rank before creating the invite.

## SEC-019 · P1 · Restrict CORS
- **Finding:** AP-SEC-019
- **Acceptance:** Only `FRONTEND_URL` origin(s) allowed; disallowed origins blocked.
- **Files:** `backend/app/main.py:73-79`
- **Approach:** Build `allow_origins` from a config list; restrict methods/headers.

## SEC-020 · P1 · Hide API docs in production
- **Finding:** AP-SEC-020
- **Acceptance:** `/docs`, `/redoc`, `/openapi.json` return 404 in production.
- **Files:** `backend/app/main.py:57-64`
- **Approach:** `docs_url=None if ENVIRONMENT=="production" else "/docs"` (same for redoc/openapi).

## SEC-021 · P2 · Circuit breaker + bounded AI deadline
- **Finding:** AP-SEC-021
- **Acceptance:** A request cannot exceed a bounded total deadline; an unhealthy provider is short-circuited.
- **Files:** `backend/services/ai_provider.py:297-377`
- **Approach:** Add a per-provider breaker (failure count + cooldown) and a global per-request deadline; reduce per-call timeouts; cap total retries across providers.

## SEC-022 · P2 · Add missing outbound timeouts
- **Finding:** AP-SEC-022
- **Acceptance:** No outbound call can block beyond its timeout.
- **Files:** `backend/routes/demo.py:36,62`, `backend/services/sms.py:36`
- **Approach:** Add `timeout=` to Zoom `requests.post`; configure boto3 `Config(connect_timeout, read_timeout, retries={"max_attempts":2})`.

## SEC-023 · P2 · Patch vulnerable dependencies
- **Finding:** AP-SEC-023
- **Acceptance:** `pip-audit`/`npm audit` report no High/Critical; auth no longer on `python-jose`.
- **Files:** `backend/requirements.txt`, `frontend/package.json`
- **Approach:** Bump `python-multipart>=0.0.18`, `starlette>=0.40.0` (+ FastAPI), migrate token verification to `PyJWT`/`authlib`, replace `xlsx` with `exceljs` or SheetJS CDN.

## SEC-024 · P2 · Dependency scanning + backend lockfile
- **Finding:** AP-SEC-024
- **Acceptance:** Dependabot enabled (pip/npm/actions); CI runs `pip-audit` + `osv-scanner`/`npm audit`; backend builds from a hashed lockfile; all pins confirmed to resolve.
- **Files:** `.github/dependabot.yml`, `.github/workflows/`, `backend/requirements*.txt`
- **Approach:** Add `pip-tools` (`requirements.in` → hashed `requirements.txt`). Add scanning jobs that fail on High/Critical.

## SEC-025 · P2 · Optimistic locking + row locks
- **Finding:** AP-SEC-025
- **Acceptance:** Concurrent updates can't silently overwrite; plan limits can't be exceeded by parallel requests.
- **Files:** `backend/db/models.py`, `backend/services/feature_gate.py`, `backend/routes/payments.py` (+ migration)
- **Approach:** Add `version_id` columns with SQLAlchemy `version_id_col`; use `with_for_update()` for limit checks and subscription mutations.

## SEC-026 · P1 · Health endpoint correctness
- **Finding:** AP-SEC-026
- **Acceptance:** Unhealthy DB → 503 + generic body; detail logged server-side only.
- **Files:** `backend/app/main.py:110-117`
- **Approach:** Return `JSONResponse(status_code=503, ...)` without `str(e)`.

## SEC-027 · P2 · Observability + audit logging
- **Finding:** AP-SEC-027
- **Acceptance:** Structured logs; Sentry (backend+frontend); append-only audit log for auth/role/permission/payment/super-admin events; alerts configured.
- **Files:** `backend/app/main.py`, new `backend/core/logging.py`, new `audit_log` model, sensitive routes
- **Approach:** Add `sentry-sdk`; central logging config; an `AuditLog` table + helper invoked from sensitive handlers; CloudWatch alarms / Sentry alerts.

## SEC-028 · P3 · Scheduled cleanup worker
- **Finding:** AP-SEC-028
- **Acceptance:** Expired OTP/token rows purged on schedule; failed notifications retried via DLQ.
- **Files:** new worker (EventBridge+Lambda / ECS scheduled task)
- **Approach:** Periodic job to delete expired rows; SQS DLQ for email/SMS retries.

## SEC-029 · P2 · Remove mock auth from prod
- **Finding:** AP-SEC-029
- **Acceptance:** `/auth/mock-login` not present in production; no mock secret defaults.
- **Files:** `backend/routes/auth.py:339-376`, `backend/cognito_utils.py:66-67`
- **Approach:** Only mount mock routes when `ENVIRONMENT != production`; delete default secret strings.

## SEC-030 · P2 · Magic-byte MIME validation
- **Finding:** AP-SEC-030 · **Files:** `backend/routes/uploads.py:342`
- **Approach:** Use `filetype`/`python-magic` to sniff bytes; cross-check against declared type + extension allowlist; reject mismatch.

## SEC-031 · P3 · CSP, nosniff, escape rendered content
- **Finding:** AP-SEC-031 · **Files:** `backend/app/main.py` (headers middleware), frontend render paths, `frontend/nginx.conf.template`
- **Approach:** Add a security-headers middleware/edge config; ensure extracted text is escaped where rendered.

## SEC-034 · P3 · MFA + step-up re-auth
- **Finding:** AP-SEC-034 · **Files:** Cognito config, `backend/dependencies.py`, sensitive routes
- **Approach:** Require Cognito MFA for admin/super-admin; add a recent-auth check dependency for billing/role/delete/export.

## SEC-035 · P3 · Container & IAM hardening
- **Finding:** AP-SEC-035 · **Files:** `backend/Dockerfile.prod`, `infra/cdk/lib/axiora-pulse-stack.ts`, `infra/cdk/lib/github-oidc-stack.ts`
- **Approach:** Add non-root `USER`; scope SNS/SSM resources to env path; split deployer vs task roles.

## SEC-036 · P2 · Align user-delete authority
- **Finding:** AP-SEC-036 · **Files:** `backend/routes/users.py:417-456`
- **Approach:** Restrict to super_admin (or update contract deliberately); audit-log + require re-auth.

## SEC-037 · P2 · Public slug serves only active surveys
- **Finding:** AP-SEC-037 · **Files:** `backend/routes/surveys.py:462-481`
- **Approach:** Add `status == active` filter; 404 otherwise.

## SEC-038 · P2 · Generic Drive errors
- **Finding:** AP-SEC-038 · **Files:** `backend/routes/uploads.py:396-480`
- **Approach:** Catch and return a generic message; log details server-side.

## SEC-039 · P3 · Soft-delete + recovery
- **Finding:** AP-SEC-039 · **Files:** `backend/db/models.py`, delete routes (+ migration)
- **Approach:** Add `deleted_at`; filter it out of reads; background purge after retention; confirm RDS PITR.

## SEC-040 · P3 · Strong invite password
- **Finding:** AP-SEC-040 · **Files:** `backend/schemas/invite.py:16`
- **Approach:** Min length ≥12; rely on Cognito policy.

## SEC-041 · P3 · Bot protection on public forms
- **Finding:** (Abuse resistance) · **Files:** `backend/routes/public.py`, `backend/routes/demo.py`, `backend/routes/otp.py`, frontend forms
- **Approach:** Add CAPTCHA (Cloudflare Turnstile / reCAPTCHA) verification to waitlist, demo, send-email, OTP-request.
