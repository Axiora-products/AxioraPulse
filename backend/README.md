# NexoraPulse Backend

FastAPI + PostgreSQL + SQLAlchemy backend for the NexoraPulse survey platform.

## Prerequisites
- Python 3.11+
- PostgreSQL running locally

## Quick Start

### 1. Create the PostgreSQL database
```sql
CREATE DATABASE nexpulse;
```

### 2. Configure environment
```bash
# Copy the example env file
copy .env.example .env
# Edit .env and set your DATABASE_URL and SECRET_KEY
```

### 3. Create & activate a virtual environment
```bash
python -m venv venv
venv\Scripts\activate      # Windows
# source venv/bin/activate  # macOS/Linux
```

### 4. Install dependencies
```bash
pip install -r requirements.txt
```

### 5. Run the server
```bash
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

The API will be available at **http://127.0.0.1:8000**
Interactive docs: **http://127.0.0.1:8000/docs**

## Project Structure

```
backend/
├── app/
│   └── main.py          ← FastAPI app, CORS, router registration
├── db/
│   ├── database.py      ← SQLAlchemy engine + session factory
│   └── models.py        ← All ORM models (Tenant, UserProfile, Survey, …)
├── routes/
│   ├── auth.py          ← POST /auth/register, /auth/login, GET /auth/me
│   ├── users.py         ← /users/* (invite, role, status, delete)
│   ├── tenants.py       ← PATCH /tenants/me
│   ├── surveys.py       ← /surveys/* full CRUD + questions
│   ├── responses.py     ← /responses/* (create, auto-save, submit)
│   ├── feedback.py      ← /feedback/*
│   ├── dashboard.py     ← /dashboard/stats, /dashboard/recent
│   └── utils.py         ← /utils/slug/check
├── schemas.py           ← All Pydantic v2 request/response models
├── auth_utils.py                ← JWT encode/decode, password hashing
├── dependencies.py      ← get_db, get_current_user FastAPI dependencies
├── .env                 ← Local environment config (not committed)
├── .env.example         ← Template
└── requirements.txt
```

## API Overview

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | /auth/register | — | Create org + super_admin |
| POST | /auth/login | — | Login, returns JWT |
| GET | /auth/me | ✓ | Current user + tenant |
| PATCH | /auth/me/profile | ✓ | Update name |
| PATCH | /auth/me/password | ✓ | Change password |
| GET | /users/ | ✓ | List team members |
| POST | /users/invite | ✓ | Invite user |
| PATCH | /users/{id}/role | ✓ | Change role |
| DELETE | /users/{id} | ✓ | Delete user |
| GET | /tenants/me | ✓ | Get org settings |
| PATCH | /tenants/me | ✓ | Update org settings |
| GET | /surveys/ | ✓ | List surveys |
| POST | /surveys/ | ✓ | Create survey |
| GET | /surveys/{id} | ✓ | Get survey |
| PATCH | /surveys/{id} | ✓ | Update survey |
| DELETE | /surveys/{id} | ✓ | Delete survey |
| GET | /surveys/slug/{slug} | — | Public: fetch by slug |
| PUT | /surveys/{id}/questions | ✓ | Bulk replace questions |
| POST | /surveys/{id}/duplicate | ✓ | Duplicate survey |
| POST | /responses/ | — | Start response session |
| POST | /responses/{id}/answers | — | Auto-save answers |
| POST | /responses/{id}/submit | — | Submit response |
| POST | /feedback/ | — | Submit post-survey feedback |
| GET | /dashboard/stats | ✓ | Summary counts |
| GET | /dashboard/recent | ✓ | Last 6 surveys |
| GET | /utils/slug/check | — | Check slug availability |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| DATABASE_URL | postgresql://postgres:password@localhost:5432/nexpulse | PostgreSQL connection string |
| SECRET_KEY | (required) | JWT signing key — change in production |
| ALGORITHM | HS256 | JWT algorithm |
| ACCESS_TOKEN_EXPIRE_MINUTES | 1440 | Token lifetime (24 hours) |
