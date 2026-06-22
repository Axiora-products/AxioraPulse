# Remediation Status — `feature/SecurityFixes`

Snapshot of every finding from [01-AUDIT-REPORT.md](./01-AUDIT-REPORT.md) and its
current state on the `feature/SecurityFixes` branch.

Legend: ✅ Fixed in code · 🟡 Code ready, needs operator action to activate ·
🔧 Operator-only (no code) · ⏳ Deferred (documented)

## Critical
| ID | Title | Status |
|----|-------|--------|
| AP-SEC-001 | Forgeable JWT fallback secret | ✅ removed; secrets fail-closed |
| AP-SEC-002 | Hardcoded super-admin email | ✅ replaced with `SUPER_ADMIN_EMAILS` allowlist (set it) |
| AP-SEC-003 | Unauthenticated `/responses/*` | ✅ session-token bound |
| AP-SEC-004 | Razorpay webhook signature | ✅ verified, fail-closed (needs `RAZORPAY_WEBHOOK_SECRET`) |
| AP-SEC-005 | Payment plan substitution | ✅ plan bound to order + amount check |
| AP-SEC-006 | Leaked API keys | 🔧 rotate keys (you) — gitleaks now blocks recurrence |

## High
| ID | Title | Status |
|----|-------|--------|
| AP-SEC-007 | Unauth cross-tenant file download | ✅ short-lived signed URLs |
| AP-SEC-008 | Ungated/anon AI cost abuse | ✅ anon translate rate-limited+bounded; others authed |
| AP-SEC-009 | Rate limiter non-functional | 🟡 Redis-ready + proxy-aware (set `REDIS_URL`) |
| AP-SEC-010 | Open email/WhatsApp relays | ✅ role-gated, rate-limited, domain-locked |
| AP-SEC-011 | Upload OOM | ✅ streamed size enforcement |
| AP-SEC-012 | DB pool exhaustion during AI | ⏳ partial — bounded by AI deadline (AP-SEC-021); full queue offload deferred |
| AP-SEC-013 | `cleanup-unconfirmed` unauth | ✅ rate-limited + no enumeration |
| AP-SEC-014 | Secrets/PII in logs | ✅ removed + redaction filter |
| AP-SEC-015 | OTP brute-force / SMS bombing | ✅ compare-then-count + crypto codes; per-phone lockout needs Redis (🟡) |
| AP-SEC-016 | invite_token leak / no expiry | ✅ unexposed + 7-day expiry (migration) |
| AP-SEC-017 | Intra-tenant survey IDOR | ✅ object-level authz + share permission |
| AP-SEC-018 | manager→admin escalation | ✅ role ceiling on invite |
| AP-SEC-019 | Wildcard CORS | ✅ restricted to `FRONTEND_URL` |
| AP-SEC-020 | Public Swagger in prod | ✅ disabled in production |
| AP-SEC-021 | No circuit breaker | ✅ per-provider breaker + total deadline |
| AP-SEC-022 | Missing outbound timeouts | ✅ Zoom + SNS bounded |

## Medium
| ID | Title | Status |
|----|-------|--------|
| AP-SEC-023 | Vulnerable deps | ✅ python-multipart + starlette bumped; jose mitigated by explicit-alg usage (replacement = follow-up) |
| AP-SEC-024 | No dependency scanning | ✅ Dependabot + pip-audit/npm-audit/gitleaks CI |
| AP-SEC-025 | No optimistic locking | ⏳ deferred (needs migration + careful testing) |
| AP-SEC-026 | `/health` leaks + 200 | ✅ 503 + generic body |
| AP-SEC-027 | No logging/audit/Sentry | ✅ structured logging + audit_logs + Sentry (set `SENTRY_DSN`) 🟡 |
| AP-SEC-028 | No background cleanup | ⏳ deferred (scheduled worker) |
| AP-SEC-029 | Mock auth / mock secrets in prod | ✅ blocked in prod, defaults removed |
| AP-SEC-030 | MIME client-side only | ✅ magic-byte validation |
| AP-SEC-031 | No security headers/CSP | ✅ API middleware + SPA nginx headers |
| AP-SEC-032 | Whisper/torch in API image | ⏳ deferred (split worker) — non-root container reduces blast radius |
| AP-SEC-033 | Prompt injection input bounds | ✅ inputs bounded |
| AP-SEC-034 | No MFA / step-up | 🔧 enable Cognito MFA (you) |
| AP-SEC-035 | Container root / broad IAM | ✅ non-root container; IAM scoping = CDK follow-up 🟡 |
| AP-SEC-036 | user-delete contract mismatch | ✅ docstring aligned; guards intact |
| AP-SEC-037 | Draft surveys public by slug | ✅ draft excluded |
| AP-SEC-038 | Drive raw error leak | ✅ generic error |
| AP-SEC-039 | No soft-delete | ⏳ deferred (needs migration + read-path changes) |
| AP-SEC-040 | Weak invite password | ✅ min 12 (backend + frontend) |
| AP-SEC-041 | No bot protection | 🔧 add CAPTCHA keys (you) — endpoints already rate-limited |

## Operator action required to reach ceiling
1. **Rotate** the two leaked OpenAI keys (AP-SEC-006).
2. **Set secrets/env:** `SECRET_KEY` (non-default), `SUPER_ADMIN_EMAILS`, `OTP_JWT_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `REDIS_URL`, `SENTRY_DSN`, `FRONTEND_URL`, `ENVIRONMENT=production`.
3. **Provision:** ElastiCache Redis, Sentry project, CAPTCHA provider.
4. **Enable:** Cognito MFA for admins; confirm RDS backups + PITR + `sslmode=require`.
5. **Run migrations:** `alembic upgrade head` (head `d5e6f7a8b9c0`).
6. **Reinstall deps:** `pip install -r backend/requirements.txt` and run the new `security-scan` workflow.

## Deferred (tracked follow-ups, not blockers if accepted as risk)
- AP-SEC-012 full DB-session/queue offload, AP-SEC-025 optimistic locking,
  AP-SEC-028 scheduled cleanup worker, AP-SEC-032 split ML image,
  AP-SEC-039 soft-delete, full `python-jose` replacement.
