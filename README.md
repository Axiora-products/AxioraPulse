# Axiora Pulse

[![CI/CD Pipeline](https://github.com/Axiora-products/AxioraPulse/actions/workflows/develop-validation.yml/badge.svg)](https://github.com/Axiora-products/AxioraPulse/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Python: 3.12](https://img.shields.io/badge/Python-3.12-blue.svg)](https://www.python.org/downloads/release/python-3120/)
[![Coverage: 81%](https://img.shields.io/badge/Coverage-81%25-green.svg)](https://github.com/Axiora-products/AxioraPulse)

Axiora Pulse is a premium web-based survey management and intelligence application. It enables organisations to create smart surveys, gather user responses, and leverage AI analysis to generate actionable insights and investor-readiness reports.

---

## ⚡ Quick Start

Get your local development environment running in under 5 minutes:

### 1. Prerequisites
Ensure you have the following installed on your machine:
* [Docker & Docker Compose](https://docs.docker.com/get-docker/) (or [Podman](https://podman.io/))
* Git

### 2. Launch the Stack
Run the orchestrator script from the root of the repository:

**On macOS, Linux, or Git Bash (Windows):**
```bash
./run-local.sh
```

**On Windows PowerShell:**
```powershell
.\run-local.ps1
```

This orchestrator starts the database, spins up the mock AWS environment (Floci), creates all necessary tables/schemas, seeds the local PostgreSQL DB with Cognito user credentials, and launches the frontend and backend servers.

### 3. Access Services
* **Frontend Application**: [http://localhost:5173](http://localhost:5173) (Vite server with hot reload)
* **Backend REST API**: [http://localhost:8000](http://localhost:8000)
* **Swagger API Documentation**: [http://localhost:8000/docs](http://localhost:8000/docs)
* **Local Database**: `localhost:5432` (`database: nexpulse` | `user: postgres` | `password: root`)

---

## 🛠️ Repository Layout

```text
├── .github/workflows/   # CI/CD pipelines (FastAPI pytests, docker linting)
├── backend/             # FastAPI REST service, SQLAlchemy models, database migrations
│   ├── app/             # Application entrypoint & routes
│   ├── db/              # SQLAlchemy Models & database setup
│   ├── schemas/         # Pydantic schemas (Pydantic v2)
│   ├── services/        # Business logic services (Cognito, Email, Payments)
│   └── tests/           # Pytest suite with 81% test coverage
├── frontend/            # React + Vite application
└── infra/               # Infrastructure as Code (AWS CDK in TypeScript)
```

---

## 📖 Complete Engineering Wiki

For comprehensive system documentation, architecture diagrams, and release protocols, refer to the **GitHub Wiki**:

* [1. Home / System Index](wiki/Home)
* [2. Architecture Deep Dive & Data Flow](wiki/Architecture-Deep-Dive)
* [3. Local Development Guide](wiki/Local-Development-Guide)
* [4. CI/CD & Deployment Pipelines](wiki/CI-CD-Deployment-Pipelines)
* [5. Developer Onboarding & Git Workflow](wiki/Developer-Onboarding-Handbook)
* [6. Troubleshooting & Operations Runbook](wiki/Troubleshooting-and-Runbooks)
* [7. Documentation Gap Analysis & Roadmap](wiki/Gap-Analysis-and-Roadmap)
