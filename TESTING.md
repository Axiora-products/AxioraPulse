# AxioraPulse — Testing Strategy

## 1. Unit Tests

Test individual functions and components in isolation, no DB or network calls.

### Backend (pytest)

| What | Examples |
|---|---|
| Utility functions | `hash_password`, `verify_password` in `auth_utils.py` |
| Schema validation | Pydantic models reject bad input (invalid email, missing fields) |
| Role logic | `_require_manager` raises 403 for `viewer` role |
| Token helpers | Invite token generation is URL-safe, 32+ chars |
| Countdown / date logic | `get_time_left` returns zeros when past launch date |

```bash
# Run
pytest backend/tests/unit/
```

### Frontend (Vitest + React Testing Library)

| What | Examples |
|---|---|
| Auth store | `signOut` clears user/profile/tenant from Zustand state |
| `getTimeLeft()` | Returns correct days/hours/minutes/seconds |
| Form validation | Password < 8 chars shows error before API call |
| Role permission map | `manage_tenant` includes `admin` and `super_admin` |
| Utility helpers | Slug generation from tenant name (`tenantName → tenant-name`) |

```bash
cd frontend && npm run test
```

---

## 2. Integration Tests

Test that two or more real layers work together — real DB, real Cognito sandbox, mocked email.

### Backend API (pytest + httpx + test DB)

| Route | Test cases |
|---|---|
| `POST /auth/sync` | Creates user profile on first sync; updates on repeat |
| `GET /auth/me` | Returns correct user + profile + tenant |
| `POST /users/invite` | Creates `invited` user; sends email; blocks duplicate active user |
| `PATCH /users/accept-invite` | Sets password, flips `account_status` to `active`, creates Cognito user |
| `GET /users/invite-info/:token` | Returns email + tenant_name; 404 for expired token |
| `POST /surveys/` | Creates survey scoped to caller's tenant |
| `GET /s/:slug` | Returns survey publicly without auth header |
| `POST /public/waitlist` | Stores email; deduplicates |
| Rate limiter | `POST /users/invite` blocked after 3 calls/minute |

Fixtures: spin up a test PostgreSQL (Docker or SQLite fallback), seed a tenant + super_admin user, mock `send_email` so no real emails fire.

```bash
pytest backend/tests/integration/ --cov=backend
```

---

## 3. End-to-End Tests (E2E)

Simulate real user journeys in a browser against a running stack (staging environment).

Tool: **Playwright**

### Critical paths

| Journey | Steps |
|---|---|
| **Team invite flow** | Admin invites user → email arrives → user clicks link → sets name + password → lands on `/dashboard` |
| **Survey creation** | Login → New survey → Add questions → Publish → Copy link |
| **Survey response** | Open `/s/:slug` without login → Fill form → Submit → See thank-you |
| **Coming soon gate** | Visit `/login` → redirected to `/coming-soon` → back button → landing page (not loop) |
| **Accept invite mobile** | Open invite link on 375px viewport → form renders → submit succeeds |
| **Sign out** | Click avatar → Sign out → redirected to `/login` → session cleared |

```bash
cd frontend && npx playwright test
```

---

## 4. API Contract Tests

Ensure the frontend and backend agree on request/response shapes. Useful before any backend schema change.

- Use **Schemathesis** (auto-generates test cases from OpenAPI spec at `/docs`)
- Catches: missing fields, wrong types, unexpected 500s, unhandled edge cases

```bash
schemathesis run http://localhost:8000/openapi.json --checks all
```

---

## 5. Authentication & Security Tests

| Test | What to verify |
|---|---|
| Expired JWT | `GET /auth/me` with old token returns 401, not 500 |
| Wrong tenant | User A cannot read User B's surveys (tenant isolation) |
| Role escalation | `viewer` cannot call `POST /users/invite` (gets 403) |
| Invite token reuse | Token is nulled after `accept-invite`; second use returns 404 |
| CORS | Requests from `evil.com` are rejected by CORS middleware |
| Rate limiting | `POST /users/invite` blocked at 4th call within 60s |
| SQL injection | `GET /surveys?slug='; DROP TABLE surveys;--` handled safely |
| XSS | Survey question text with `<script>` is escaped in response view |

---

## 6. Email Tests

| Scenario | Expected |
|---|---|
| Valid invite sent | SES `send_email` called with correct `to`, `subject`, `html` |
| SES sandbox restriction | Email to unverified address raises `ClientError`; route handles gracefully |
| SES `ClientError` | Exception message surfaces SES error detail, not a raw 500 |
| Waitlist email | Confirmation email lands in inbox with correct content |

Use `pytest-mock` to stub `boto3` SES client in `email_service.py` — no real emails or AWS credentials needed in CI.

---

## 7. Performance Tests

Run against staging, not production.

| Scenario | Tool | Target |
|---|---|---|
| 100 concurrent survey responses | k6 / Locust | p95 < 500 ms |
| Dashboard load (N+1 query check) | k6 + CloudWatch | Single DB round-trip per request |
| Invite list with 200 members | k6 | < 300 ms |

Flag any endpoint that triggers more than 3 DB queries (N+1 — tracked in issue #16).

---

## 8. Accessibility Tests (a11y)

| Tool | What it checks |
|---|---|
| `axe-core` (via Playwright) | Missing alt text, insufficient colour contrast, unlabelled inputs |
| Keyboard navigation | Tab through survey form, accept-invite form — all reachable without mouse |
| Screen reader smoke | VoiceOver / NVDA can read survey questions and submit button |

---

## 9. CI Pipeline (GitHub Actions)

Add to `.github/workflows/`:

```
On every PR to main:
  ├── backend: pytest (unit + integration) + coverage > 70%
  ├── frontend: vitest + eslint
  ├── frontend: Playwright E2E (headless, against Docker stack)
  └── schemathesis: OpenAPI contract check

On merge to main:
  └── All above + deploy to staging → smoke test
```

Tracked in issue **#15** (Add tests and linting to CI/CD pipelines).

---

## 10. Manual Smoke Tests (pre-deploy checklist)

Run these by hand before every production deploy:

- [ ] Landing page loads, countdown ticks
- [ ] Sign In / Get Started → `/coming-soon`
- [ ] Back button from `/coming-soon` → landing page (no loop)
- [ ] Invite link email received → accept invite → login works
- [ ] Survey creation → publish → public response URL opens without auth
- [ ] Settings → domain update saves correctly for `admin` role
- [ ] Mobile (375px): accept-invite form renders, no blank page

---

## Priority Order

| Priority | Type | Why |
|---|---|---|
| 1 | Integration (API) | Core business logic; catches regressions in routes |
| 2 | E2E (invite + survey flows) | Most user-facing, highest impact if broken |
| 3 | Security (auth, role, CORS) | SaaS multi-tenant — tenant isolation is critical |
| 4 | Unit | Fast feedback loop during development |
| 5 | Performance | Needed before scaling beyond beta |
| 6 | a11y | Good to have; required if targeting enterprise |
