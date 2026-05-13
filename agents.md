# agents.md — Instructions for AxioraPulse

## Project Overview
AxioraPulse is a SaaS survey platform.
- **Backend:** FastAPI + SQLAlchemy + PostgreSQL (`/backend`)
- **Frontend:** React + Vite + Zustand + TailwindCSS (`/frontend`)
- **Infrastructure:** AWS ECS Fargate, ECR, SSM Parameter Store

## Conventions & Setup
- **Frontend:** `cd frontend && npm install`
- **Backend:** `cd backend && pip install -r requirements.txt`
- **Database:** Local dev uses Docker Compose. Production uses RDS.
- **Migrations:** Use Alembic. `alembic upgrade head` is run on startup via `entrypoint.sh`.

## What NOT to Touch
- `backend/alembic/versions/` — never edit existing migration files; create new ones only.
- `backend/ecs-task-def.json` and `frontend/ecs-task-def.json` — production infrastructure.
- `docker-compose.yml` and `docker-compose.prod.yml`.
- `.github/workflows/` — CI/CD pipelines.
- `frontend/nginx.conf` — SPA routing configuration.
- Any file containing secrets or API keys.

## Git & Commit Rules
- **Branch naming:** `feature/<name>` or `fix/<name>`
- **Commit style:** `feat: <message> #<issue>` or `fix: <message> #<issue>`
- **Author:** Always `roopsai-axiora <roopsai.s@axioraglobalsolutions.com>`
- **Direct Pushes:** Only allowed for `GEMINI.md` or `agents.md` updates when explicitly requested.

## Architecture Notes
- **API Routes:** Located in `backend/routes/`.
- **Frontend API:** Uses `frontend/src/api/axios.js` (note the 401 interceptor for public routes).
- **Auth:** FastAPI dependency `get_current_user` in `backend/dependencies.py`.
- **Public Routes:** `/s/:slug` and `/embed/:slug` must stay outside `ProtectedRoute`.
- **No Supabase:** The project has moved to a custom FastAPI + PostgreSQL backend.

## Design System
Use existing CSS variables and fonts:
- Colors: `--coral`, `--saffron`, `--terracotta`, `--cream`, `--espresso`, `--warm-white`.
- Fonts: `Playfair Display` (headings), `Syne` (UI/labels), `Fraunces` (body text).
- Theme: `np-theme` (light/dark) in `localStorage`.
