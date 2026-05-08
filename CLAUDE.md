# AxioraPulse — CLAUDE.md

Project context for Claude Code sessions. Read this fully before starting any work.

---

## Project Overview

**AxioraPulse** is a SaaS survey platform built with:
- **Backend:** FastAPI + SQLAlchemy + PostgreSQL (deployed on AWS ECS Fargate)
- **Frontend:** React + Vite + Zustand + TailwindCSS (deployed on AWS ECS Fargate behind Nginx)
- **Infrastructure:** AWS ECS Fargate, ECR, SSM Parameter Store, CloudWatch
- **CI/CD:** GitHub Actions (`deploy-backend.yml`, `deploy-frontend.yml`) — triggers on push to `main` with path filters

---

## Conventions

### Git
- **Branch naming:** `feature/<name>`, `fix/<name>`, `feature/payment-phase-N-<name>`
- **Commit style:** `feat: <short message> #<issue-number>` or `fix: <short message> #<issue-number>`
- **Author:** Always `Roopsai-axiora` — never use Claude as author or co-author
- **No session links** in commit messages
- **Never push directly to main** unless explicitly told to. Always branch → push → let the user review → merge

### Workflow
- One branch per issue/feature
- User reviews and merges to main themselves
- Always pull latest main before creating a new branch
- Always amend commit author to `Roopsai-axiora` before pushing

---

## Architecture

```
Browser → CloudFront/ALB → Nginx (Frontend ECS) → FastAPI (Backend ECS) → PostgreSQL (RDS)
```

### Key files
| File | Purpose |
|---|---|
| `backend/app/main.py` | FastAPI app entry point, CORS, routers |
| `backend/db/models.py` | SQLAlchemy ORM models |
| `backend/db/database.py` | Engine, session, Base |
| `backend/alembic/` | Alembic migrations (replaces init_db.py) |
| `backend/entrypoint.sh` | Container startup — runs `alembic upgrade head` then uvicorn |
| `backend/dependencies.py` | Auth dependency (`get_current_user`) |
| `backend/routes/` | All API route files |
| `frontend/src/App.jsx` | React Router config |
| `frontend/src/api/axios.js` | Axios instance + interceptors |
| `frontend/src/hooks/useAuth.js` | Zustand auth store |
| `frontend/nginx.conf` | Nginx config for SPA routing |
| `frontend/ecs-task-def.json` | Frontend ECS task definition |
| `backend/ecs-task-def.json` | Backend ECS task definition |

### AWS
- **Region:** ap-south-1
- **ECS Cluster:** axiora-pulse-cluster
- **ECS Services:** pulse-backend-service, pulse-frontend-service
- **ECR:** 217757579310.dkr.ecr.ap-south-1.amazonaws.com
- **Secrets in SSM:** SECRET_KEY, DATABASE_URL, OPENAI_API_KEY, GOOGLE_API_KEY, RESEND_API_KEY, EMAIL_FROM, FRONTEND_URL

---

## Design System (Frontend)

No new design tokens needed — use existing variables.

### CSS Variables
```css
--coral: #FF4500        /* primary accent */
--saffron: #FFB800      /* secondary accent */
--terracotta: #D63B1F   /* error/danger */
--cream: #FDF5E8        /* background */
--espresso: #160F08     /* primary text */
--warm-white: #FFFBF4   /* card backgrounds */
```

### Fonts
- `Playfair Display` — display headings
- `Syne` — UI labels, buttons
- `Fraunces` — body text (default)

### Theme
- Light/Dark toggle in `Settings.jsx`, persisted to `localStorage` as `np-theme`
- Applied via `data-theme` attribute on `<html>`

---

## Current State of Work

### Completed (merged to main)
- ECS deployment setup (backend + frontend)
- FastAPI backend replacing Netlify functions
- Invite team feature (#37)
- Survey URL redirect fix for users with expired tokens (`axios.js` 401 interceptor)
- Share URL fix (`VITE_FRONTEND_URL` instead of `window.location.origin`)

### In Progress
| Branch | Issue | Status |
|---|---|---|
| `fix/alembic-migrations` | #12 — Replace init_db.py with Alembic | Pushed, awaiting user review + merge |

### Open Issues (Production Readiness) — #9 to #32
| # | Title | Priority |
|---|---|---|
| #9 | Restrict CORS to allowed origins | Critical |
| #10 | Health check endpoint does not verify DB | Critical |
| #11 | Add structured logging and error tracking | Critical |
| #12 | Replace manual schema with Alembic migrations | High — in progress |
| #13 | Server-side token invalidation and logout | High |
| #14 | Increase minimum password strength | High |
| #15 | Add tests and linting to CI/CD pipelines | High |
| #16 | Fix N+1 queries (dashboard, AI, slug endpoint) | High |
| #17 | Add pagination to all list endpoints | High |
| #18 | Move email and AI to background tasks | High |
| #19 | Add database indexes on FK columns | High |
| #20 | Rate limiting missing on several endpoints | Medium |
| #21 | Remove duplicate email service (SMTP vs Resend) | Medium |
| #22 | Add CSP header to Nginx | Medium |
| #23 | Raise error on missing DATABASE_URL | Medium |
| #24 | Entrypoint DB wait loop has no retry limit | Medium |
| #25 | Connection pool too small, missing pool_recycle | Medium |
| #26 | Add Redis caching layer | Medium |
| #27 | Code splitting + remove dead Supabase dep | Medium |
| #28 | Analytics page makes 4 sequential API calls | Medium |
| #29 | Race condition on session token creation | Medium |
| #30 | Add startup validation for env vars | Medium |
| #31 | AI endpoints return raw 500 on missing key | Low |
| #32 | Feedback endpoint accepts unvalidated dict | Low |

### Planned Features (Razorpay Payment Integration) — #33 to #36
| # | Phase | Branch | Status |
|---|---|---|---|
| #33 | Phase 1 — Database (plans, subscriptions, payments, is_internal) | `feature/payment-phase-1-database` | Not started |
| #34 | Phase 2 — Backend (create-order, verify, webhook, feature gating) | `feature/payment-phase-2-backend` | Not started |
| #35 | Phase 3 — Frontend (pricing page, checkout, payment wall, billing) | `feature/payment-phase-3-frontend` | Not started |
| #36 | Phase 4 — DevOps (SSM secrets, ECS task def, staging vs prod keys) | `feature/payment-phase-4-devops` | Not started |

**Payment notes:**
- Use Razorpay (not Stripe) — Indian product
- Test cards: `4111 1111 1111 1111`, UPI: `success@razorpay`
- `rzp_test_` keys for staging, `rzp_live_` keys for production
- Add `is_internal` flag to `user_profiles` so team members bypass payment wall
- Gated features (to be finalised): max surveys, max responses, AI insights, team members
- Payment work starts AFTER issue #12 is merged

---

## Important Known Issues / Decisions

1. **Alembic replaces init_db.py** — `entrypoint.sh` now runs `alembic upgrade head`. Do not use `python init_db.py` or `python update_db_schema.py` anymore. Add all schema changes as new Alembic migration files.

2. **axios.js 401 interceptor** — Skips redirect for `/auth/me` requests so users with expired tokens can still access public survey routes (`/s/:slug`). Do not revert this.

3. **VITE_API_BASE_URL** — Must be set as a GitHub secret. Without it the frontend falls back to `http://127.0.0.1:8000` (localhost) which breaks in production.

4. **Survey routes are public** — `/s/:slug` and `/embed/:slug` in `App.jsx` must stay outside `<ProtectedRoute>`. Do not wrap them.

5. **ECS task definition secrets** — Pulled from AWS SSM at runtime. Never hardcode secrets in `ecs-task-def.json` or commit `.env` files.

6. **No Supabase** — Supabase has been fully removed. Backend is FastAPI + PostgreSQL. `@supabase/supabase-js` is still in `package.json` and should be removed (tracked in issue #27).

---

## Commands

```bash
# Local dev
docker-compose up                        # Start backend + postgres
cd frontend && npm run dev               # Start frontend

# Alembic
alembic upgrade head                     # Apply all migrations
alembic revision -m "description"        # Create new migration
alembic downgrade -1                     # Roll back one migration

# Git workflow
git checkout main && git pull origin main
git checkout -b fix/<name>
# ... make changes ...
git add <files>
git commit --author="Roopsai-axiora <roopsai-axiora@users.noreply.github.com>" -m "feat: <message> #<issue>"
git push -u origin <branch>
```
