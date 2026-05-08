# Nexora Survey

A beautiful, multi-tenant SaaS survey platform built with React, Supabase, and Tailwind CSS.

## Features

- **Multi-Tenant Architecture** — Complete data isolation between organizations using Supabase Row Level Security
- **Role-Based Access Control** — Super Admin, Admin, Manager, Creator, Viewer with granular permissions
- **Beautiful Survey Builder** — Drag-and-drop style question builder with 11 question types
- **Auto-Save Responses** — Saves every 2-3 answers automatically; respondents can resume from where they left off
- **Real-Time Analytics** — Charts, completion rates, response trends, CSV export
- **Unique Survey Links** — Every survey gets a shareable `/s/{slug}` URL
- **Survey Expiry & Resume** — Auto-expire surveys; Admins/Managers can resume with new expiry dates
- **Team Management** — Invite members, assign roles, deactivate users
- **Within-Tenant Sharing** — Share survey analytics within your organization only (never cross-tenant)
- **Polished UX** — Custom design system with DM Serif Display + Plus Jakarta Sans, glass morphism cards, smooth animations

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Vite, Tailwind CSS 3 |
| State | Zustand |
| Backend | Supabase (PostgreSQL + Auth + RLS) |
| Charts | Chart.js + react-chartjs-2 |
| Hosting | Netlify (+ serverless functions) |
| Routing | React Router v6 |

## Project Structure

```
nexora-pulse/
├── netlify/functions/         # Serverless API functions
│   ├── register-tenant.js     # New org registration
│   └── invite-user.js         # User invitation
├── public/
│   └── favicon.svg
├── src/
│   ├── components/
│   │   ├── DashboardLayout.jsx   # Sidebar + layout shell
│   │   └── ProtectedRoute.jsx    # Auth guard
│   ├── hooks/
│   │   └── useAuth.js            # Auth store (Zustand)
│   ├── lib/
│   │   ├── constants.js          # Roles, permissions, helpers
│   │   └── supabase.js           # Supabase client
│   ├── pages/
│   │   ├── Dashboard.jsx         # Overview with stats
│   │   ├── Landing.jsx           # Public landing page
│   │   ├── Login.jsx             # Sign in
│   │   ├── Register.jsx          # New organization signup
│   │   ├── Settings.jsx          # Profile & org settings
│   │   ├── SurveyAnalytics.jsx   # Charts & response data
│   │   ├── SurveyCreate.jsx      # Survey builder
│   │   ├── SurveyEdit.jsx        # Edit existing survey
│   │   ├── SurveyList.jsx        # All surveys with filters
│   │   ├── SurveyRespond.jsx     # Public survey form (auto-save)
│   │   └── TeamManagement.jsx    # User management
│   ├── styles/
│   │   └── index.css             # Tailwind + custom styles
│   ├── App.jsx                   # Router configuration
│   └── main.jsx                  # Entry point
├── supabase/
│   └── schema.sql                # Complete database schema with RLS
├── index.html
├── package.json
├── tailwind.config.js
├── vite.config.js
├── netlify.toml
└── .env.example
```

## Setup Guide

### 1. Supabase Setup

1. Go to [supabase.com](https://supabase.com) → **New Project**
2. Open **SQL Editor** → paste and run `supabase/schema.sql`
3. Go to **Authentication** → **Settings** → Enable email sign-ups
4. Copy from **Project Settings → API**:
   - `Project URL` → `VITE_SUPABASE_URL`
   - `anon public key` → `VITE_SUPABASE_ANON_KEY`
   - `service_role key` → `SUPABASE_SERVICE_ROLE_KEY`

### 2. Local Development

```bash
# Clone the repo
git clone https://github.com/axiora-core-tech/nexora-pulse.git
cd nexora-pulse

# Install dependencies
npm install

# Copy environment file
cp .env.example .env
# Edit .env with your Supabase credentials

# Start development server
npm run dev
```

For Netlify functions locally, install Netlify CLI:

```bash
npm i -g netlify-cli
netlify dev
```

### 3. Deploy to Netlify

1. Push to GitHub
2. Go to [Netlify Dashboard](https://app.netlify.com) → **Add new site → Import from GitHub**
3. Select your repo; build settings auto-detected from `netlify.toml`
4. Add **Environment Variables** in Site Settings:

| Variable | Value |
|----------|-------|
| `VITE_SUPABASE_URL` | Your Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Your Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Your Supabase service role key |
| `VITE_APP_URL` | Your Netlify site URL |

5. **Deploy!**

### 4. First Admin User

1. Go to your deployed site → **Register** → Create your organization
2. The first user is automatically assigned the **Admin** role
3. Start creating surveys!

## Roles & Permissions

| Permission | Super Admin | Admin | Manager | Creator | Viewer |
|-----------|:-----------:|:-----:|:-------:|:-------:|:------:|
| Create surveys | ✅ | ✅ | ✅ | ✅ | ❌ |
| Edit any survey | ✅ | ✅ | ❌ | ❌ | ❌ |
| Edit own survey | ✅ | ✅ | ✅ | ✅ | ❌ |
| Delete surveys | ✅ | ✅ | ❌ | ❌ | ❌ |
| View analytics | ✅ | ✅ | ✅ | ✅* | ❌ |
| Resume expired | ✅ | ✅ | ✅ | ❌ | ❌ |
| Manage team | ✅ | ✅ | ❌ | ❌ | ❌ |
| Org settings | ✅ | ❌ | ❌ | ❌ | ❌ |

*Creators can view analytics for their own surveys

## Multi-Tenancy & Security

- **Row Level Security (RLS)** on every table ensures tenant isolation
- Helper functions `get_user_tenant_id()` and `get_user_role()` enforce access at the database level
- Survey responses use separate `tenant_id` set via trigger — no client manipulation possible
- Share permissions are strictly within-tenant; the database prevents cross-tenant sharing
- Service role key is **never** exposed to the client — only used in Netlify functions

## Auto-Save Feature

When respondents fill out a survey:
1. A `session_token` is stored in `sessionStorage`
2. Every 2 answered questions trigger an auto-save (configurable per survey)
3. A 5-second debounce timer saves on inactivity
4. If the browser closes, respondents can resume from where they left off
5. The survey header shows a "Saved" indicator

## Survey Lifecycle

```
Draft → Active → Paused → Active → Expired → Resumed (Active) → Closed
```

- **Draft**: Only visible in dashboard, not accessible via public link
- **Active**: Accepting responses via unique link
- **Paused**: Link shows "not accepting responses"
- **Expired**: Auto-triggered when `expires_at` passes; Admin/Manager can resume with new date
- **Closed**: Permanently closed

## License

Proprietary — Axiora Core Tech
