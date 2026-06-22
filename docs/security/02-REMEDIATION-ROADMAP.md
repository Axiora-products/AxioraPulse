# AxioraPulse — Remediation Roadmap

A time-boxed plan to reach launch-readiness. Phases are cumulative — do not start a later phase's "nice to have" while a P0 is open. Each item links to its finding in [01-AUDIT-REPORT.md](./01-AUDIT-REPORT.md) and its ticket in [03-ENGINEERING-BACKLOG.md](./03-ENGINEERING-BACKLOG.md).

> **Sequencing rule:** several code fixes depend on manual prerequisites (rotate keys, provision Redis, add Secrets Manager entries). Do the **Manual prerequisites** column first or in parallel — see [04-MANUAL-SETUP-GUIDE.md](./04-MANUAL-SETUP-GUIDE.md).

---

## Phase 0 — Within 24 hours (launch blockers)

These are remotely exploitable today. Treat as an incident.

| Order | ID | Action | Manual prerequisite |
|---|----|--------|---------------------|
| 1 | AP-SEC-006 | **Rotate the leaked OpenAI keys now** (both); replace working-tree value with placeholder; add gitleaks pre-commit. | Rotate in OpenAI dashboard |
| 2 | AP-SEC-001 | Remove OTP/mock HS256 fallback in `verify_cognito_token`; make secrets fail-closed. | Provision a strong `OTP_JWT_SECRET` only if OTP login is kept |
| 3 | AP-SEC-002 | Remove hardcoded super-admin email; seed super-admin via data. | Seed the real super-admin row/flag out-of-band |
| 4 | AP-SEC-003 | Add auth + session-token binding to all `/responses/{id}` read/update/submit. | — |
| 5 | AP-SEC-004 | Verify Razorpay webhook signature (raw body, constant-time). | Add `RAZORPAY_WEBHOOK_SECRET` to Secrets Manager |
| 6 | AP-SEC-005 | Bind `/payments/verify` plan to the stored order plan; assert amount. | — |
| 7 | AP-SEC-007 | Require auth + tenant scope on `/uploads/download/{file_id}`. | — |
| 8 | AP-SEC-008 | Auth + feature-gate + rate-limit `/ai/translate-survey` and all AI routes. | — |
| 9 | AP-SEC-013 | Authenticate/remove `/auth/cleanup-unconfirmed`. | — |
| 10 | AP-SEC-014 | Remove raw token / OTP / PII `print()`s. | — |

**Exit criteria:** all 10 verified via the staging tests in the audit report; no anonymous request can read PII, forge identity, manipulate payments, or run LLM calls.

---

## Phase 1 — Within 3 days

| ID | Action | Manual prerequisite |
|----|--------|---------------------|
| AP-SEC-009 | Redis-backed rate limiter + trusted forwarded client IP + per-tenant keys. | Provision Redis (ElastiCache) |
| AP-SEC-010 | Close email/WhatsApp relays; template-only + per-tenant limits + role gate. | — |
| AP-SEC-011 | Stream-enforce upload size before buffering; ALB/uvicorn body caps. | Set ALB request size limit |
| AP-SEC-012 | Release DB session before long AI calls (short-lived auth session). | — |
| AP-SEC-015 | OTP lockout + per-phone throttle + `secrets` codes. | (uses Redis) |
| AP-SEC-016 | Stop serializing `invite_token`; add expiry; role-gate `GET /users/`. | — |
| AP-SEC-017 | Enforce ownership / `SurveyShare` permission on survey writes. | — |
| AP-SEC-018 | Role ceiling on invite. | — |
| AP-SEC-019 | Restrict CORS to `FRONTEND_URL`. | Confirm prod origin(s) |
| AP-SEC-020 | Disable `/docs`, `/redoc`, `/openapi.json` in production. | — |
| AP-SEC-026 | `/health` → 503 + generic body when unhealthy. | — |

**Exit criteria:** rate limits hold across replicas; no relay/IDOR/escalation paths; docs hidden; health gates rollouts.

---

## Phase 2 — Within 7 days

| ID | Action | Manual prerequisite |
|----|--------|---------------------|
| AP-SEC-021 | Circuit breaker + bounded total deadline on AI providers. | — |
| AP-SEC-022 | Timeouts on Zoom + boto3 SNS. | — |
| AP-SEC-023 | Patch `python-multipart`, `starlette`, migrate off `python-jose`, replace `xlsx`. | — |
| AP-SEC-024 | Dependabot + `pip-audit`/`osv-scanner`/`npm audit` in CI; backend lockfile. | — |
| AP-SEC-025 | Optimistic locking + `FOR UPDATE` on payments/feature-gate. | DB migration |
| AP-SEC-027 | Structured logging + Sentry + audit log for admin/payment/security events. | Create Sentry project |
| AP-SEC-029 | Exclude mock-login from prod build; remove mock secret defaults. | — |
| AP-SEC-030 | Server-side magic-byte MIME validation. | — |
| AP-SEC-037 | Public slug serves only `active` surveys. | — |
| AP-SEC-038 | Generic Drive error messages. | — |

**Exit criteria:** dependency scan clean; observability in place; resilience verified under provider-failure injection.

---

## Phase 3 — Before production launch

| ID | Action | Manual prerequisite |
|----|--------|---------------------|
| AP-SEC-008 (ext.) | Per-tenant AI cost/token budgets with hard caps. | (uses Redis/DB) |
| AP-SEC-031 | CSP + `nosniff` + escape rendered file/extracted text. | — |
| AP-SEC-034 | MFA for admins; step-up re-auth on billing/role/delete/export. | Cognito MFA config |
| AP-SEC-035 | Non-root container; least-privilege IAM; scoped SSM path; split deployer/task roles. | CDK change + redeploy |
| AP-SEC-039 | Soft-delete + retention for tenants/surveys/responses/users; confirm RDS PITR. | Verify RDS backup retention |
| AP-SEC-040 | Enforce ≥12-char password on invite. | — |
| Bot protection | CAPTCHA on waitlist / demo / send-email / OTP request. | CAPTCHA provider keys |
| Security headers | HSTS, `X-Frame-Options`/`frame-ancestors`, `X-Content-Type-Options`, Referrer-Policy. | ALB/edge config |
| DB TLS | Enforce `sslmode=require` on `DATABASE_URL`. | RDS param / connstring |

**Exit criteria:** [05-VERIFICATION-CHECKLIST.md](./05-VERIFICATION-CHECKLIST.md) fully green.

---

## Phase 4 — After launch, before scale

| ID | Action |
|----|--------|
| AP-SEC-032 | Move Whisper/torch out of the API image into a dedicated worker. |
| AP-SEC-028 | Scheduled worker for OTP/token cleanup + dead-letter retries. |
| — | Idempotency keys on payment verify; load testing + autoscaling validation; SLOs + alerting; consider Postgres RLS as defense-in-depth. |

---

## Ownership & estimates (suggested)

| Phase | Eng effort (rough) | Owner |
|---|---|---|
| Phase 0 | 2–3 dev-days (focused) | Backend lead + you (manual rotations) |
| Phase 1 | 4–6 dev-days | Backend + DevOps |
| Phase 2 | 5–8 dev-days | Backend + DevOps |
| Phase 3 | 5–8 dev-days | Fullstack + DevOps |
| Phase 4 | ongoing | Platform |

Estimates assume one or two engineers familiar with the codebase. Manual prerequisites (key rotation, Redis, Secrets Manager, Sentry, CAPTCHA, Cognito MFA) are mostly hours, not days, but are blocking — schedule them up front.
