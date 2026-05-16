# GitHub Issues — Production Readiness

Copy each section below as a separate GitHub issue.

---

## Issue 1

**Title:** Restrict CORS to allowed origins — currently open to all

**Labels:** `security`, `critical`

**Body:**
The FastAPI app currently has `allow_origins=["*"]` which allows any domain to make credentialed requests to the API.

**File:** `backend/app/main.py`

**Risk:** Cross-origin attacks; any website can call the API on behalf of a logged-in user.

**Fix:**
Replace the wildcard with explicit production origins:
```python
allow_origins=[
    "https://yourdomain.com",
    "https://www.yourdomain.com",
],
```

---

## Issue 2

**Title:** Health check endpoint does not verify database connectivity

**Labels:** `bug`, `infrastructure`, `critical`

**Body:**
The `/health` endpoint always returns `{"status": "ok"}` regardless of whether the database is reachable. ECS uses this endpoint to determine container health, so a DB outage will go undetected and ECS will continue routing traffic to an unhealthy container.

**File:** `backend/app/main.py`

**Fix:**
Update `/health` to run a lightweight DB query:
```python
@app.get("/health")
def health(db: Session = Depends(get_db)):
    try:
        db.execute(text("SELECT 1"))
    except Exception:
        raise HTTPException(status_code=503, detail="Database unavailable")
    return {"status": "ok"}
```

---

## Issue 3

**Title:** Add structured logging and error tracking

**Labels:** `observability`, `critical`

**Body:**
The application has no structured logging. Exceptions are either silently caught or printed to stdout with no context. In production this makes debugging nearly impossible.

**What's needed:**
- Add Python `logging` with JSON formatting (e.g. `python-json-logger`) to the backend
- Log request method, path, status code, and duration for every request via middleware
- Log all unhandled exceptions with stack traces
- Integrate an error tracking service (Sentry recommended) for both backend and frontend

**Frontend:** `ErrorBoundary.jsx` currently only calls `console.error` — errors should also be reported to an error tracking service.

---

## Issue 4

**Title:** Replace manual schema patches with Alembic migrations

**Labels:** `database`, `high`

**Body:**
Database schema is managed via SQLAlchemy `create_all()` and a manual `update_db_schema.py` script that adds columns imperatively. This approach is fragile — there is no migration history, no rollback capability, and schema drift is hard to detect.

**Affected files:**
- `backend/init_db.py`
- `backend/update_db_schema.py`

**Fix:**
Set up Alembic for versioned migrations:
1. `pip install alembic`
2. `alembic init alembic`
3. Convert existing schema to an initial migration
4. Replace `create_all()` calls with `alembic upgrade head` in `entrypoint.sh`

---

## Issue 5

**Title:** Server-side token invalidation and logout

**Labels:** `security`, `high`

**Body:**
Currently `signOut()` only clears the token from `localStorage`. The JWT remains valid on the server until it naturally expires. A stolen token cannot be revoked.

**Affected files:**
- `frontend/src/hooks/useAuth.js` — `signOut()`
- `backend/routes/auth.py` — no logout endpoint exists

**Fix:**
- Add a token denylist (Redis or DB table) on the backend
- Create a `POST /auth/logout` endpoint that adds the token's `jti` claim to the denylist
- Update the `signOut()` function to call this endpoint before clearing localStorage
- Implement refresh token rotation — invalidate the old refresh token when a new one is issued

---

## Issue 6

**Title:** Increase minimum password strength requirements

**Labels:** `security`, `high`

**Body:**
The password minimum length is set to 6 characters with no complexity requirements, which is below modern security standards.

**File:** `backend/schemas/auth.py`

**Fix:**
- Set `min_length=12`
- Add a validator that requires at least one uppercase letter, one number, and one special character
- Update frontend registration/password-reset forms to reflect the new requirements and provide live feedback

---

## Issue 7

**Title:** Add test suite and linting to CI/CD pipeline before deploy

**Labels:** `ci-cd`, `high`

**Body:**
Both GitHub Actions workflows (`deploy-backend.yml`, `deploy-frontend.yml`) go straight from code checkout to Docker build and ECS deploy with no automated checks. A broken commit can reach production.

**Fix — backend workflow:**
Add before the build step:
```yaml
- name: Run linter
  run: cd backend && pip install ruff && ruff check .

- name: Run tests
  run: cd backend && pip install pytest && pytest
```

**Fix — frontend workflow:**
```yaml
- name: Install dependencies
  run: cd frontend && npm ci

- name: Run linter
  run: cd frontend && npm run lint

- name: Run tests
  run: cd frontend && npm run test -- --run
```

---

## Issue 8

**Title:** Rate limiting missing on several endpoints

**Labels:** `security`, `medium`

**Body:**
Rate limiting is applied to some endpoints (auth, survey creation) but is missing from others that are vulnerable to abuse.

**Endpoints missing rate limits:**
- `POST /public/send-email` — no limit; can be used to send unlimited emails
- All `/tenants` endpoints
- All `/users` endpoints (except invite)
- AI generation endpoints (`/ai/`)
- Analytics endpoints (`/dashboard/`)

**Fix:**
Add `@limiter.limit("X/minute")` decorators using the existing `slowapi` limiter already configured in `core/rate_limiter.py`.

---

## Issue 9

**Title:** Remove duplicate email service — standardise on Resend

**Labels:** `cleanup`, `medium`

**Body:**
There are two email implementations:
- `backend/services/email_service.py` — uses Gmail SMTP with username/password
- `backend/routes/public.py` — uses the Resend API

The Resend API is the correct production approach (already wired up and secrets are in SSM). The Gmail SMTP service is a legacy implementation that adds confusion and a security risk (plain credentials in env vars).

**Fix:**
- Delete `backend/services/email_service.py`
- Remove `EMAIL_USER` and `EMAIL_PASS` from `.env.example` and SSM parameters
- Update any remaining callers to use Resend

---

## Issue 10

**Title:** Add Content-Security-Policy header to Nginx

**Labels:** `security`, `medium`

**Body:**
The Nginx config has good baseline security headers (`X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`) but is missing a `Content-Security-Policy` (CSP) header, which is the primary defence against XSS attacks.

**File:** `frontend/nginx.conf`

**Fix:**
Add to the `server` block:
```nginx
add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https://your-api-domain.com;" always;
```
Adjust `connect-src` to your actual API domain.

---

## Issue 11

**Title:** Raise error if DATABASE_URL env var is missing instead of using hardcoded fallback

**Labels:** `bug`, `medium`

**Body:**
`database.py` falls back to a hardcoded local connection string if `DATABASE_URL` is not set:

```python
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:root@localhost:5432/nexpulse")
```

If the env var is accidentally missing in production, the app will silently attempt to connect to a non-existent local database rather than failing fast with a clear error.

**File:** `backend/db/database.py`

**Fix:**
```python
DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise ValueError("DATABASE_URL environment variable is required")
```

---

## Issue 12

**Title:** Entrypoint database wait loop has no retry limit

**Labels:** `infrastructure`, `medium`

**Body:**
`entrypoint.sh` loops indefinitely waiting for the database to become available. If the DB is permanently unavailable (misconfiguration, wrong credentials), the container will hang forever and ECS will never mark it as failed.

**File:** `backend/entrypoint.sh`

**Fix:**
Add a maximum retry count:
```bash
MAX_RETRIES=30
RETRY=0
while ! python -c "import psycopg2; psycopg2.connect('$DATABASE_URL')" 2>/dev/null; do
  RETRY=$((RETRY+1))
  if [ "$RETRY" -ge "$MAX_RETRIES" ]; then
    echo "Database not available after $MAX_RETRIES attempts. Exiting."
    exit 1
  fi
  echo "Waiting for database... ($RETRY/$MAX_RETRIES)"
  sleep 2
done
```
