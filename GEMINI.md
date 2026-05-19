# AxioraPulse — GEMINI.md

Project context for Gemini CLI sessions.

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
- **Author:** Always `your user-id` — never use Gemini as author or co-author
- **Never push directly to main** unless explicitly told to. (Note: This rule is overridden by the current directive to push to main and develop).

### Workflow
- One branch per issue/feature
- User reviews and merges to main themselves
- Always pull latest main before creating a new branch

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
| `backend/alembic/` | Alembic migrations |
| `backend/entrypoint.sh` | Container startup — runs `alembic upgrade head` then uvicorn |
| `backend/dependencies.py` | Auth dependency (`get_current_user`) |
| `backend/routes/` | All API route files |
| `frontend/src/App.jsx` | React Router config |
| `frontend/src/api/axios.js` | Axios instance + interceptors |
| `frontend/src/hooks/useAuth.js` | Zustand auth store |
| `frontend/nginx.conf` | Nginx config for SPA routing |
| `frontend/ecs-task-def.json` | Frontend ECS task definition |
| `backend/ecs-task-def.json` | Backend ECS task definition |

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
--np-theme: light | dark /* stored in localStorage */
```

### Fonts
- `Playfair Display` — display headings
- `Syne` — UI labels, buttons
- `Fraunces` — body text (default)

---

## Important Known Issues / Decisions

1. **Alembic replaces init_db.py** — `entrypoint.sh` now runs `alembic upgrade head`. Add all schema changes as new Alembic migration files.
2. **axios.js 401 interceptor** — Skips redirect for `/auth/me` requests so users with expired tokens can still access public survey routes (`/s/:slug`).
3. **VITE_API_BASE_URL** — Must be set as a GitHub secret for production.
4. **Survey routes are public** — `/s/:slug` and `/embed/:slug` stay outside `<ProtectedRoute>`.
5. **ECS task definition secrets** — Pulled from AWS SSM at runtime.
6. **No Supabase** — Backend is FastAPI + PostgreSQL.

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
```
