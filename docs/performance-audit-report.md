# AxioraPulse End-to-End Performance Audit Report

This report outlines key performance bottlenecks identified across the AxioraPulse frontend, backend database queries, and database schema, alongside proposed production-grade optimizations.

---

## 1. Frontend: Massive Initial Bundle Size & Lack of Code Splitting

### Description
The entire frontend application (including heavy charting libraries like `chart.js` and `react-chartjs-2`, animation libraries like `framer-motion`, and parsing libraries like `xlsx`) is imported statically at the top of `App.jsx`. This causes the entire application to bundle into a single monolithic JavaScript file.

* **Severity**: **Critical**
* **Lighthouse Metric Impact**: Large First Contentful Paint (LCP), high Time to Interactive (TTI), and poor performance scores on low-end or mobile connections.
* **Root Cause**: Statically importing all page routes in `App.jsx` and lacking a custom manual chunking strategy in `vite.config.js`.
* **Proposed Fix**:
  1. Implement **route-based code splitting** in `App.jsx` using `React.lazy` and `<Suspense>` boundaries.
  2. Configure a custom **Vite manual chunking strategy** inside `vite.config.js` to separate third-party vendor dependencies (`react`, `framer-motion`, `chart.js`, `xlsx`) into cached standalone chunks.
* **Estimated Improvement**: 60-70% reduction in initial payload size; 50%+ faster page load times.
* **Risk Level**: **Low** (standard React and Vite practice).

---

## 2. Backend: N+1 Database Query in Dashboard (`routes/dashboard.py`)

### Description
The `/dashboard/recent` endpoint retrieves the latest 6 surveys for a tenant. For each of these 6 surveys, it makes **two sequential database queries** in a loop to count responses and questions:
```python
for sv in surveys:
    count = db.query(func.count(SurveyResponse.id)).filter(SurveyResponse.survey_id == sv.id).scalar() or 0
    q_count = db.query(func.count(SurveyQuestion.id)).filter(SurveyQuestion.survey_id == sv.id).scalar() or 0
```
This is a classic **N+1 query** pattern (making 13 database queries for just 6 surveys).

* **Severity**: **High**
* **API Latency Impact**: High dashboard endpoint latency (e.g. 150-300ms) due to sequential DB round-trips.
* **Root Cause**: Sequential loops executing scalar count queries instead of doing a joined aggregate query.
* **Proposed Fix**: Refactor the query to use an aggregate select with `outerjoin` and `group_by`, fetching the survey data, response count, and question count in a **single database query**.
* **Estimated Improvement**: 90% reduction in DB round-trips and P99 latency for the main dashboard dashboard load.
* **Risk Level**: **Low** (SQL/SQLAlchemy refactoring).

---

## 3. Database: Missing Indexes on High-Query Foreign Keys (`models.py`)

### Description
Several critical foreign keys that form the primary join and filter paths in daily operations are missing database indexes:
- `surveys.tenant_id`: Scopes all workspace surveys (lacks index).
- `surveys.created_by`: Used to fetch a user's created surveys (lacks index).
- `survey_answers.question_id`: Joins answers to question tables for analytics (lacks index).
- `survey_shares.shared_with`: Tracks survey shares for team permissions (lacks index).
- `uploaded_files.tenant_id`: Scopes uploaded file resources by tenant (lacks index).

* **Severity**: **High**
* **Database Impact**: Forces PostgreSQL to perform sequential scans (`SEQ SCAN`) on rapidly growing tables when joining or filtering by tenant or question.
* **Root Cause**: Missing `index=True` configuration on these SQLAlchemy Column definitions.
* **Proposed Fix**:
  1. Add `index=True` to the specified columns in `backend/db/models.py`.
  2. Create and run a new Alembic migration to apply the indexes in PostgreSQL.
* **Estimated Improvement**: 90-95% faster joins and index-backed lookups on tables (especially `survey_answers` and `surveys`).
* **Risk Level**: **Very Low** (standard database optimization).
