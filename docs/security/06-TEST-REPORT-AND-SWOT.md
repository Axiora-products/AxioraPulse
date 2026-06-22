# AxioraPulse — Devil's-Advocate Test Report & SWOT

- **Date:** 2026-06-22
- **Branch under test:** `feature/SecurityFixes` (17 commits, 67 files, +3729/−280)
- **Tester stance:** adversarial — trying to break it, not bless it.

> **Honesty about method.** I could not run the live application end-to-end here:
> there is no database, no AWS (Cognito/SES/SNS/Razorpay), and heavy deps
> (torch, openai, fastapi, etc.) are not installed in this environment. So this is
> **not** a click-through QA pass. It is: (a) execution of every pure-logic module
> I *can* import, with adversarial inputs; (b) static review of failure modes;
> (c) analysis of whether the changes are verifiable. Anything requiring a running
> stack is marked **NOT RUN — must be tested in staging**.

---

## VERDICT: 🔴 NOT production-ready yet

Not because the security work is wrong — it is solid — but because **it is unverified against a running system and has very likely broken the existing test suite**, plus several controls are best-effort until infra is provisioned. Concretely, the blockers are below.

---

## 1. Critical findings (the devil's advocate's case)

### 🔴 T-1. The security changes likely break a large part of the existing test suite — and it was never run
There is a real, substantial test suite (24 files, `backend/tests/`), but it **cannot be run in this environment** (pytest + deps absent) and the new changes contradict what several tests assert:

| Test file | Why it now fails (evidence) |
|---|---|
| `test_responses.py` | Calls `GET/PATCH /responses/{id}`, `/answers`, `/submit`, `/abandon` with **no session token** (lines 40,46,52,57,69,101…). AP-SEC-003 now returns **403**. |
| `test_cognito_utils.py` | Hard-codes `OTP_JWT_SECRET="otp-secret-key-change-in-production"` and the mock default (lines 160,217,236). AP-SEC-001 now **rejects** those defaults → verification returns None. |
| `test_dependencies.py` / `test_super_admin.py` | Rely on hard-coded `roopsai.work8@gmail.com` for super-admin (lines 221, 22). AP-SEC-002 now requires `SUPER_ADMIN_EMAILS` env (unset in `conftest`, which only sets `GEMINI_KEY`). |
| `test_uploads.py` | `GET /uploads/download/{id}` sent with `auth_headers` (line 191). AP-SEC-007 now needs a **signed `?token=`**, not a bearer → 403. |
| `test_payments.py` | `/verify` with `plan_code` (lines 51-93). AP-SEC-005 now resolves plan from the order + asserts amount match. |
| `test_auth.py` | `cleanup-unconfirmed` now rate-limited and returns `{"ok": true}` not `{"deleted":…}` (lines 280-285). |
| `test_otp.py` | OTP issue path now requires `OTP_JWT_SECRET` to be set or returns 503 (line 131). |

**Impact:** I changed security contracts correctly, but I did **not** update the tests or `conftest` to match, and could not execute them. Until the suite is updated and green, the branch's real behavior is unverified.
**Required:** update `conftest.py` (set `SUPER_ADMIN_EMAILS`, `OTP_JWT_SECRET`, `MOCK_COGNITO_SECRET`, `ENVIRONMENT=local`), update the affected tests to the new contracts (send `X-Session-Token`, signed download token, plan-from-order), then run the full suite + add regression tests for every AP-SEC fix.

### 🟠 T-2. Content moderation is bypassable (keyword filters always are)
Adversarial probes against `validate_ai_context` — **confirmed bypasses**:
- `"sell c0caine and her0in"` (leetspeak) → **passed**
- `"s q l   i n j e c t i o n"` (spaced) → **passed**
- `"ѕһɑск into the bank system"` (Cyrillic homoglyphs) → **passed**
- `"perform SQLi on websites"` (abbreviation) → **passed**

Caught correctly: zero-width-in-word, full-width spaces (NFKC normalization works), newlines, ALL-CAPS, `phishingcampaign` (no space).
**Reality:** a determined attacker *can* get prohibited text past the regex layer. The backstops are (a) the AI **safety guardrail** in the system prompt (treats the brief as data, refuses harmful output) and (b) the blast radius is "a generated survey," not code execution. **This is a good-faith filter, not a guarantee** — set expectations accordingly, and consider adding the OpenAI Moderation API as a second pass for higher assurance.

### 🟠 T-3. SSRF guard has a DNS-rebinding (TOCTOU) gap
`extract_from_url` validates the host with `socket.getaddrinfo` and then calls `requests.get`, which performs **its own DNS resolution**. A malicious domain can return a public IP at validation time and a private IP (e.g. `169.254.169.254`) at fetch time — bypassing the check. The per-hop redirect validation has the same gap.
**Confirmed safe** against direct private/loopback/link-local IPs, non-http(s), bad ports, oversized bodies (all blocked in tests). **Required hardening:** resolve once and **pin the IP** (connect to the resolved address with the original `Host` header), or route link-fetching through an egress proxy/allowlist.

### 🟠 T-4. Several controls are per-process (in-memory) until Redis is wired
Rate limiter, OTP/violation counters, and the AI circuit breaker all fall back to in-memory state. Across multiple ECS tasks they are **N× weaker and reset on deploy**. The code is Redis-ready (`REDIS_URL`) but **Redis is not provisioned** → in production today these protections are largely ineffective. (Already flagged as AP-SEC-009/015; restated because it directly affects "production ready".)

### 🟠 T-5. Nothing has been run against real infrastructure
- Backend deps were **not install-verified** (`pip install -r requirements.txt` not run; this branch newly adds pypdf/docx/openpyxl/bs4/pillow/pytesseract and bumps starlette/multipart — version resolution unconfirmed).
- **Migrations not applied** — the alembic head merge (`c4d5e6f7a8b9`) + `invite_expires_at` + `audit_logs` must be run; if they fail, the app won't start.
- Frontend builds ✅ (verified `npm run build`), but no runtime/browser testing of the new notification, content-safety, or extraction UIs.
- OCR depends on the `tesseract-ocr` binary (added to Dockerfile) — unverified in a built image.

---

## 2. What I *did* test (and results)

| Area | Method | Result |
|---|---|---|
| Content moderation accuracy | 19-case corpus (legit vs prohibited) | ✅ 0 false-positives / 0 misses on corpus |
| Moderation bypass resistance | 10 adversarial encodings | ⚠️ 4 bypasses (T-2) |
| Extraction: CSV/TXT | unit | ✅ structured 96% / text 97% |
| Extraction: sanitize | unit | ✅ strips control/zero-width, truncates |
| SSRF guard | 7 hostile URLs | ✅ blocks localhost/127/169.254/private/ftp/port-22; allows public https. ⚠️ DNS-rebinding gap (T-3) |
| Frontend build | `npm run build` | ✅ passes (pre-existing chunk/import warnings only) |
| Backend lint/compile | `ruff` + `compileall` on changed files | ✅ clean |
| Alembic graph | static head/dangling check | ✅ single head, no dangling refs |
| PDF/DOCX/XLSX/OCR extraction | — | ❌ NOT RUN (libs absent) — defensive fallbacks only |
| Every HTTP endpoint, auth, payments, DB | — | ❌ NOT RUN (no stack) |
| Full pytest suite | — | ❌ NOT RUN (pytest/deps absent) — **likely red, see T-1** |

---

## 3. Worst-case scenario analysis (from code, not runtime)

| Scenario | Expected | Likely actual | Status |
|---|---|---|---|
| 100× traffic spike | Shed load, hold limits | Limits in-memory → N×/reset; AI calls hold DB sessions (AP-SEC-012 only partially mitigated) | ⚠️ Weak until Redis + queue |
| Attacker forges a token | Rejected | Rejected (AP-SEC-001) — **if** secrets are set non-default | ✅ (config-dependent) |
| Anonymous reads respondent PII | 401/403 | Blocked (AP-SEC-003) | ✅ |
| Forged payment webhook | 400 | Blocked **if** `RAZORPAY_WEBHOOK_SECRET` set; else 503 fail-closed | ✅ |
| Malicious AI idea | Rejected w/ friendly msg | Caught for common cases; bypassable (T-2); guardrail backstop | ⚠️ Partial |
| Malicious file upload | Rejected | Type+magic+size+executable-block all enforced | ✅ |
| SSRF via link | Blocked | Direct private IPs blocked; DNS-rebinding gap (T-3) | ⚠️ Partial |
| Zip/decompression bomb (xlsx) | Bounded | `openpyxl read_only` + row caps help, but a crafted bomb could still spike memory | ⚠️ Unverified |
| DB down | 503, no crash | `/health` 503; per-request 500s; no app crash | ✅ |
| Missing env vars | Fail-closed | DB/SECRET_KEY fail; others fail-closed; OTP/webhook 503 | ✅ |
| Concurrent edits / plan-limit race | Locked | Last-write-wins; feature-gate TOCTOU (AP-SEC-025 deferred) | ⚠️ Open |
| Two users hit AI simultaneously ×30 | Stays up | Pool exhaustion bounded by 90s AI deadline but not eliminated | ⚠️ Partial |

---

## 4. SWOT Analysis

### Strengths
- **Security posture transformed**: the original critical holes (forgeable auth, open PII endpoints, payment manipulation, IDOR, secret/PII logging) are closed in code with `file:line`-traceable fixes and audit logging.
- **Defense-in-depth added**: security headers, signed file URLs, content moderation + AI safety guardrail, SSRF-guarded extraction, magic-byte validation, non-root container, dependency scanning.
- **Real engineering assets**: a 24-file test suite already exists; Alembic migrations; CDK IaC; OIDC CI; multi-provider AI failover with circuit breaker.
- **UX/trust features**: centralized friendly error/notification system; mandatory extraction-verification step that reduces AI hallucination and cost.
- **Documentation**: full audit, remediation roadmap, backlog, manual setup, and this test report.

### Weaknesses
- **Unverified**: the security branch has not run against a real stack; the test suite is **likely red** from the contract changes and was not updated (T-1). This is the single biggest gap.
- **Best-effort controls**: rate limiting / OTP lockout / circuit breaker are in-memory until Redis is provisioned (T-4).
- **Moderation & SSRF are bypassable** at the edges (T-2, T-3).
- **Residual debt deferred**: optimistic locking (concurrency), soft-delete/recovery, queue-based offload of heavy AI/Whisper, full `python-jose` replacement.
- **Operational unknowns**: RDS PITR/backup retention, observability dashboards, and load/perf behavior are unconfirmed (Cannot verify from code).

### Opportunities
- Update `conftest` + tests to the new contracts and add a regression test per AP-SEC fix → turns the suite into a durable safety net and unblocks launch.
- Provision Redis/Sentry/CAPTCHA/Cognito MFA → flips the "code-ready" controls to "active" and lifts the security score to its ceiling.
- Add OpenAI Moderation API as a second moderation pass and IP-pinning for SSRF → near-eliminates T-2/T-3.
- Queue heavy work (AI gen, Whisper) → unlocks horizontal scale and removes DB-pool risk.

### Threats
- **Launching before tests are green** risks shipping a regression in auth/payments/responses that static analysis didn't catch.
- **Cost-abuse** of AI endpoints remains real until per-tenant budgets + working rate limits are live.
- **Reputation/compliance**: respondent PII handling and payment flows are now defensible, but an unrun migration or a broken deploy could cause an outage on day one.
- **Supply chain**: newly added parser/OCR deps widen the attack surface; Dependabot/scanning is configured but unproven against the new set.

---

## 5. Go-live gate (do these, in order)

1. **Update `conftest.py` + the affected tests** to the new security contracts; run the full suite until green; add a regression test per AP-SEC fix. *(blocks launch)*
2. `pip install -r backend/requirements.txt` in a clean env; run `alembic upgrade head` on a staging DB; confirm app boots. *(blocks launch)*
3. Provision **Redis** (rate limits/OTP/breaker) and set all required secrets/env (`SECRET_KEY`, `SUPER_ADMIN_EMAILS`, `OTP_JWT_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `FRONTEND_URL`, `ENVIRONMENT=production`). *(blocks launch)*
4. **Rotate** the leaked OpenAI keys (AP-SEC-006). *(blocks launch)*
5. Manual staging walkthrough of: login/MFA, survey CRUD + publish, respondent flow, payments verify + webhook, file/link extraction + verification UI, AI generation + moderation. *(blocks launch)*
6. Harden SSRF (IP pinning) and add OpenAI Moderation second pass. *(pre-scale)*
7. Optimistic locking, soft-delete, queue offload, load test. *(pre-scale)*

**Bottom line:** the application is **far** more secure and feature-complete than at the start, but it is **not** launch-ready until the test suite is updated and green, the migration/deps are verified on a real stack, Redis + secrets are provisioned, and the leaked keys are rotated. Treat the current branch as "ready for staging hardening," not "ready for paying customers."
