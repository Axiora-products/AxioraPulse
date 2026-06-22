# AxioraPulse — Security & Production-Readiness Documentation

> **Status:** 🔴 **NOT production-ready.** Multiple confirmed, unauthenticated, remotely-exploitable account-takeover and data-exposure paths exist. Do not onboard paying customers until all **P0** items are closed and **P1** items are scheduled.

This folder is the single source of truth for the security, abuse-resistance, and availability posture of AxioraPulse. It was produced from a full-codebase audit (backend FastAPI, React/Vite frontend, AWS CDK infra, CI/CD) on **2026-06-22**.

## Documents

| # | Document | Audience | Purpose |
|---|----------|----------|---------|
| 1 | [01-AUDIT-REPORT.md](./01-AUDIT-REPORT.md) | Eng + Security | Every finding with evidence (`file:line`), exploit, fix, acceptance criteria, and a safe staging test. |
| 2 | [02-REMEDIATION-ROADMAP.md](./02-REMEDIATION-ROADMAP.md) | CTO / Leads | Time-boxed plan: 24h / 3-day / 7-day / pre-launch / pre-scale. |
| 3 | [03-ENGINEERING-BACKLOG.md](./03-ENGINEERING-BACKLOG.md) | Developers | Ready-to-assign tickets: story, acceptance criteria, files, approach. |
| 4 | [04-MANUAL-SETUP-GUIDE.md](./04-MANUAL-SETUP-GUIDE.md) | DevOps / You | Everything you must do **by hand**: rotate secrets, provision Redis, fix env/secrets, upgrade dependencies, wire integrations. |
| 5 | [05-VERIFICATION-CHECKLIST.md](./05-VERIFICATION-CHECKLIST.md) | QA / Security | Go/no-go launch gate — one checkbox per Critical/High. |

## Scoring snapshot

| Dimension | Score /100 |
|---|---|
| Overall production readiness | 22 |
| Security | 18 |
| Availability / resilience | 35 |
| Data protection | 25 |

## The 6 things that make this dangerous

1. **Authentication itself is forgeable** — a default HS256 fallback secret + hardcoded super-admin email mean anyone with the public source can mint a super-admin token. (`AP-SEC-001`, `AP-SEC-002`)
2. **The highest-value data has no auth** — the entire `/responses/*` API and file downloads are open to the internet. (`AP-SEC-003`, `AP-SEC-007`)
3. **Payments can be manipulated** — the webhook isn't signature-verified and `/verify` trusts the client's plan. (`AP-SEC-004`, `AP-SEC-005`)
4. **Live API keys are leaked** — an OpenAI key is in git history and another in the working tree. (`AP-SEC-006`)
5. **AI spend is uncapped and partly anonymous** — an unauthenticated endpoint runs LLM calls on your bill. (`AP-SEC-008`)
6. **The safety nets are off** — rate limiting is non-functional in production, and there is no monitoring, audit log, or error tracking. (`AP-SEC-009`, `AP-SEC-027`)

## How to use this set

1. Read the **Executive Summary** in [01-AUDIT-REPORT.md](./01-AUDIT-REPORT.md).
2. Do the **24-hour block** in [02-REMEDIATION-ROADMAP.md](./02-REMEDIATION-ROADMAP.md) — these are launch blockers.
3. In parallel, complete the **manual prerequisites** in [04-MANUAL-SETUP-GUIDE.md](./04-MANUAL-SETUP-GUIDE.md) (secret rotation, Redis, Secrets Manager). Code fixes depend on these.
4. Track work via [03-ENGINEERING-BACKLOG.md](./03-ENGINEERING-BACKLOG.md).
5. Gate the launch with [05-VERIFICATION-CHECKLIST.md](./05-VERIFICATION-CHECKLIST.md).

## Evidence confidence

- **Confirmed** = read directly in the current tree, quoted with `file:line`.
- **Cannot verify** = not determinable from code (e.g. RDS backup retention, prod env values, frontend bundle sourcemaps). These are called out explicitly — do not assume safe.
- Dependency *version existence* is partially limited by tooling knowledge cutoff vs. the current date; those items say "verify against live registry" and must be confirmed with `pip-audit` / `npm audit`.
