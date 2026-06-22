# AxioraPulse — Launch Verification Checklist (Go / No-Go)

A single gate before onboarding paying customers. **No-Go** if any P0 box is unchecked. Each check has a concrete, safe test you can run in staging. Sign off at the bottom.

---

## P0 — Launch blockers (all must pass)

- [ ] **AP-SEC-006 — Secrets rotated.** `gitleaks detect` = 0 findings; old OpenAI keys return 401 from OpenAI; working-tree template has a placeholder.
- [ ] **AP-SEC-001 — No forgeable tokens.** A token signed with `otp-secret-key-change-in-production` → `GET /users/me` returns 401. App refuses to boot with a required secret unset.
- [ ] **AP-SEC-002 — No hardcoded admin.** Grep finds no email literals; super-admin is data-driven; demotion works without deploy.
- [ ] **AP-SEC-003 — Responses protected.** Unauthenticated `GET/PATCH /responses/{id}` → 401; cross-tenant owner read → 403.
- [ ] **AP-SEC-004 — Webhook verified.** `POST /payments/webhook` without a valid signature → 400, no DB change.
- [ ] **AP-SEC-005 — Plan integrity.** Order Pro + verify with `plan_code=enterprise` → subscription stays Pro.
- [ ] **AP-SEC-007 — File download authorized.** Other-tenant/anonymous `GET /uploads/download/{id}` → 403/401.
- [ ] **AP-SEC-008 — AI locked down.** `/ai/translate-survey` unauthenticated → 401; tenant over budget → 429.
- [ ] **AP-SEC-013 — cleanup-unconfirmed closed.** Unauthenticated call → 401/404, no status leak.
- [ ] **AP-SEC-014 — No secrets/PII in logs.** Auth + OTP flow produces no token/OTP/PII in logs; OTP random in staging.

## P1 — Must pass before launch

- [ ] **AP-SEC-009 — Rate limits real.** k6 against 2 replicas enforces the aggregate limit (not N×); limits survive restart.
- [ ] **AP-SEC-010 — No open relays.** `/public/send-email` to arbitrary recipient blocked/limited; share endpoints role-gated.
- [ ] **AP-SEC-011 — Upload size bounded.** 1 GB body → early 413; worker memory stays flat.
- [ ] **AP-SEC-012 — Pool survives AI load.** 40 concurrent AI calls; other endpoints stay responsive.
- [ ] **AP-SEC-015 — OTP hardened.** Brute attempts lock the phone/account regardless of fresh OTP requests; send rate capped per phone.
- [ ] **AP-SEC-016 — Invite tokens safe.** No `invite_token` in any API response; expired token rejected.
- [ ] **AP-SEC-017 — Survey authz.** Non-owner without editor share → 403 on update/delete.
- [ ] **AP-SEC-018 — Invite ceiling.** Manager inviting admin → 403.
- [ ] **AP-SEC-019 — CORS locked.** Disallowed origin blocked.
- [ ] **AP-SEC-020 — Docs hidden.** `/docs` → 404 in production.
- [ ] **AP-SEC-026 — Health gates.** DB down → `/health` returns 503, generic body.

## P2 — Strongly recommended before launch

- [ ] **AP-SEC-021/022 — Resilience.** Provider-failure injection: bounded request deadline; no worker hangs (Zoom timeout).
- [ ] **AP-SEC-023/024 — Deps clean.** `pip-audit` + `npm audit` no High/Critical; Dependabot active; backend lockfile present.
- [ ] **AP-SEC-025 — Concurrency safe.** Parallel updates don't silently overwrite; plan limits hold under parallel create.
- [ ] **AP-SEC-027 — Observability.** Errors reach Sentry; admin/payment/security events appear in the audit log; alerts fire.
- [ ] **AP-SEC-029 — No mock auth in prod.** `/auth/mock-login` absent in production build.
- [ ] **AP-SEC-030 — MIME sniffing.** File with mismatched bytes/type rejected.
- [ ] **AP-SEC-037 — Draft privacy.** Draft survey slug → 404 anonymously.

## P3 — Pre-launch hardening / post-launch

- [ ] **AP-SEC-031** CSP + nosniff set; rendered file/extracted text escaped.
- [ ] **AP-SEC-034** MFA required for admins; step-up re-auth on billing/role/delete/export.
- [ ] **AP-SEC-035** Non-root container; least-privilege IAM; scoped SSM; split roles.
- [ ] **AP-SEC-039** Soft-delete + retention live; RDS PITR confirmed.
- [ ] **AP-SEC-040** Invite password ≥12 chars.
- [ ] **AP-SEC-041** CAPTCHA on public forms.
- [ ] **AP-SEC-028 / 032** Cleanup worker scheduled; heavy ML moved out of API image.

## Infra sign-off (manual — see Guide §10)

- [ ] RDS backups + PITR confirmed; `sslmode=require`.
- [ ] ElastiCache private + TLS + SG-scoped.
- [ ] ALB HTTPS-only + HSTS + request-size limit.
- [ ] Security headers at edge.
- [ ] `ENVIRONMENT=production` set explicitly; `MOCK_COGNITO` false; `DISABLE_PAYMENTS` false.
- [ ] No source maps shipped to prod; no secret in `VITE_*`.

---

## Sign-off

| Role | Name | Date | Decision (Go / No-Go) |
|---|---|---|---|
| Security reviewer | | | |
| Backend lead | | | |
| DevOps | | | |
| CTO | | | |

**Launch is GO only when all P0 + P1 boxes and the infra sign-off are checked.**
