# agents.md — Jules Instructions for AxioraPulse

## Project Overview
AxioraPulse is a SaaS survey platform.
- **Backend:** FastAPI + SQLAlchemy + PostgreSQL (`/backend`)
- **Frontend:** React + Vite + TailwindCSS (`/frontend`)

## Setup
- Frontend dependencies: `cd /app/frontend && npm install`
- Backend dependencies: `cd /app/backend && pip install -r requirements.txt`
- No database will be available in the Jules environment — do not attempt to start or connect to PostgreSQL.

## What You May Work On
Only work on tasks explicitly described in the Jules task prompt. Do not self-assign or proactively fix things not mentioned.

## What NOT to Touch
- `backend/alembic/` — never edit migration files; create new ones only if explicitly asked
- `backend/ecs-task-def.json` and `frontend/ecs-task-def.json` — production infra, do not modify
- `docker-compose.yml` and `docker-compose.prod.yml` — do not modify
- `.github/workflows/` — CI/CD pipelines, do not modify
- `frontend/nginx.conf` — do not modify
- Any file containing secrets or API keys

## Branch & Commit Rules
- Never push directly to `main`
- Use branch naming: `feature/<name>` or `fix/<name>`
- Commit style: `feat: <message>` or `fix: <message>`

## Architecture Notes
- All API routes are in `backend/routes/`
- Frontend API calls go through `frontend/src/api/axios.js`
- Auth is handled via `backend/dependencies.py` (`get_current_user`)
- Public survey routes (`/s/:slug`, `/embed/:slug`) must remain outside `ProtectedRoute`
- Schema changes must use Alembic migrations — never edit models directly without a migration

## Design System
Use existing CSS variables only:
- `--coral: #FF4500`, `--saffron: #FFB800`, `--terracotta: #D63B1F`
- `--cream: #FDF5E8`, `--espresso: #160F08`, `--warm-white: #FFFBF4`
- Fonts: `Playfair Display` (headings), `Syne` (UI/buttons), `Fraunces` (body)
