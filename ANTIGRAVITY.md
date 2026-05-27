# AxioraPulse — ANTIGRAVITY.md

Project context and conventions for Antigravity developer sessions.

---

## 🚀 Project Overview

**AxioraPulse** is a SaaS survey platform:
* **Backend**: FastAPI + SQLAlchemy + PostgreSQL (deployed on AWS ECS Fargate)
* **Frontend**: React + Vite + Zustand + TailwindCSS (deployed on AWS ECS Fargate behind Nginx)
* **Infrastructure**: AWS ECS Fargate, ECR, SSM Parameter Store, CloudWatch
* **CI/CD**: GitHub Actions — triggers staging builds on pushes to `release/**` and production builds on push to `main`

---

## 🔄 Git & Commit Conventions

* **Branch Naming**: `feature/<name>` or `fix/<name>`
* **Commit Style**: `feat: <message> #<issue>` or `fix: <message> #<issue>`
* **Author**: Use the name configured in your local git config (`user.name`)
* **Pull Request Workflow**: Merges directly into `develop` are protected; changes must be submitted via Pull Requests.

---

## 🏗️ Architecture & Key Files

```
Browser → CloudFront/ALB → Nginx (Frontend ECS) → FastAPI (Backend ECS) → PostgreSQL (RDS)
```

| File / Folder | Purpose |
|---|---|
| [backend/app/main.py](file:///Users/roopsaisurampudi/projects/AxioraPulse/backend/app/main.py) | FastAPI app entry point, CORS, routers |
| [backend/db/models.py](file:///Users/roopsaisurampudi/projects/AxioraPulse/backend/db/models.py) | SQLAlchemy ORM models |
| [backend/db/database.py](file:///Users/roopsaisurampudi/projects/AxioraPulse/backend/db/database.py) | Engine, session, Base |
| [backend/alembic/](file:///Users/roopsaisurampudi/projects/AxioraPulse/backend/alembic/) | Alembic migrations |
| [backend/entrypoint.sh](file:///Users/roopsaisurampudi/projects/AxioraPulse/backend/entrypoint.sh) | Container startup — runs database checks and migrations |
| [backend/dependencies.py](file:///Users/roopsaisurampudi/projects/AxioraPulse/backend/dependencies.py) | Auth dependency (`get_current_user`) |
| [backend/routes/](file:///Users/roopsaisurampudi/projects/AxioraPulse/backend/routes/) | Backend API routes |
| [frontend/src/App.jsx](file:///Users/roopsaisurampudi/projects/AxioraPulse/frontend/src/App.jsx) | React Router config |
| [frontend/src/api/axios.js](file:///Users/roopsaisurampudi/projects/AxioraPulse/frontend/src/api/axios.js) | Axios instance + interceptors |
| [frontend/src/hooks/useAuth.js](file:///Users/roopsaisurampudi/projects/AxioraPulse/frontend/src/hooks/useAuth.js) | Zustand auth store |
| [frontend/nginx.conf](file:///Users/roopsaisurampudi/projects/AxioraPulse/frontend/nginx.conf) | Nginx config for SPA routing |
| [run-local.sh](file:///Users/roopsaisurampudi/projects/AxioraPulse/run-local.sh) | Container orchestrator for local development |

---

## 🎨 Design System

No new design tokens should be created — use the existing system variables:

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
* `Playfair Display` — display headings
* `Syne` — UI labels, buttons
* `Fraunces` — body text (default)

---

## 💡 Important Known Decisions

1. **Alembic replaces init_db.py**: `entrypoint.sh` runs `alembic upgrade head`. All schema changes must be added as new Alembic migration files.
2. **Alembic Auto-Recovery**: If migrations fail locally on branch switching due to missing revisions, the entrypoint will automatically run `alembic stamp head` as a recovery mechanism.
3. **axios.js 401 interceptor**: Skips redirect for `/auth/me` requests so users with expired tokens can still access public survey routes.
4. **VITE_API_BASE_URL**: Must be set as a GitHub secret for production.
5. **Public Survey Routes**: `/s/:slug` and `/embed/:slug` stay outside `ProtectedRoute`.

---

## 🛠️ Development Commands

```bash
# Local development startup
./run-local.sh

# Rebuild containers
./run-local.sh --rebuild

# Stop local container stack
./run-local.sh --down
```
