# Signal Desk

Signal Desk ingests your job-alert and opportunity emails, extracts each individual
**Opportunity**, and scores it with a **Strategic Score (0–100)** so you can quickly find
the roles that compound toward your goals — not just the ones that match old keywords.

It is a self-hosted app: a Postgres database, a backend (Express API + background worker),
and a web dashboard (Next.js). You connect your Gmail, it reads a labelled inbox, runs each
email through a two-pass AI analysis, and ranks the results.

> **The concepts** (Strategic Score, Recommended Action, Categories, Pass 1/2, Guardrails)
> are defined in [`CONTEXT.md`](./CONTEXT.md). The key decisions behind them are in
> [`docs/adr/`](./docs/adr/). Read those if you want to understand *why* a row is scored or
> routed the way it is.

---

## What you need first

- **Docker** (for Postgres) — or your own Postgres 15.
- **Node.js 20+** and **npm**.
- A **Google Cloud OAuth client** (Gmail read access) — Client ID + Secret.
- A **Google Gemini API key** (the AI that does the analysis).

---

## Setup

### 1. Configure environment

Copy the example file and fill in your secrets:

```bash
cp .env.example .env
```

| Variable | What it is |
|---|---|
| `DATABASE_URL` | Postgres connection string (the default works with the bundled Docker DB). |
| `GMAIL_CLIENT_ID` / `GMAIL_CLIENT_SECRET` | From your Google Cloud OAuth client. |
| `GMAIL_REDIRECT_URI` | Must match the redirect URI registered in Google Cloud. Default: `http://localhost:4000/api/auth/google/callback`. |
| `GMAIL_LABEL` | The Gmail label Signal Desk reads from. Default: `Job Alerts`. **Create this label in Gmail and filter your job alerts into it.** |
| `GEMINI_API_KEY` | Your Google Gemini API key. |
| `PORT` | Backend port. Default `4000`. |
| `FRONTEND_URL` | Where the dashboard runs. Default `http://localhost:3000`. |

### 2. Start the database

```bash
docker compose up -d
```

This also starts **pgAdmin** at <http://localhost:5050> (login `admin@signaldesk.com` / `admin`)
if you want to inspect the database.

### 3. Start the backend

```bash
cd backend
npm install
npm run db:push     # create the database tables
npm run dev         # starts the API + background worker on http://localhost:4000
```

### 4. Start the dashboard

```bash
cd frontend
npm install
npm run dev         # http://localhost:3000
```

---

## Using the app

1. **Connect Gmail.** On first run, authorise Signal Desk to read your Gmail by visiting
   <http://localhost:4000/api/auth/google/login> (this kicks off the Google OAuth consent flow).
2. **Label your emails.** Make sure your job-alert emails land under the `Job Alerts` Gmail
   label (or whatever you set `GMAIL_LABEL` to). Signal Desk only reads that label.
3. **Fetch new opportunities.** Open the dashboard at <http://localhost:3000> and click
   **Fetch New Ops** (the ingest button). It pulls new emails, extracts Opportunities, and
   scores them. The backend also syncs **automatically every 30 minutes** on its own.
4. **Browse the ranked list.** Opportunities are sorted by Strategic Score, with `ALERT`
   rows floated to the top. Each card shows its category, score, reasons, and concerns.

### The dashboard tabs

| Tab | Shows |
|---|---|
| **Everything** | The default ranked view (suppressed traps/rejects are hidden). |
| **🎯 Strategic Fit** | The strongest matches — roles that advance your goal. |
| **🤝 Useful Bridge** | Roles that don't perfectly fit but build useful credibility. |
| **🔍 Needs Review** | Ambiguous or digest-routed rows worth a manual look. |
| **⚠️ Traps / Rejects** | The rows the system suppressed — surfaced here so you can audit them. |
| **⭐ Liked** | Everything you've saved with 👍 (kept even if the system suppressed it). |
| **🎛️ Controls** | Your preferences and the reprocess controls. |

### Acting on opportunities

- **👍 Like / 👎 Dislike** on each card record your feedback and update its status.
  Liking a suppressed trap keeps it visible in **Liked** — your judgment outranks the system's.

### Tuning the results (Controls tab)

- Edit your **Target Keywords**, **Preferred Locations**, and other preferences, then **Save**.
  New syncs use the updated rules.
- **Reprocess** re-runs the analysis on the *N* most recent opportunities (use this after
  changing preferences, or to pick up scoring improvements on rows you've already ingested).

---

## How it works (in brief)

Each email goes through **two passes** (see [ADR-0004](./docs/adr/0004-strategic-prefilter-gates-deep-analysis.md)):

1. **Pass 1 (cheap):** extract the opportunity's fields and run a keyword **Strategic
   Pre-filter**. Only opportunities that look strategically relevant continue.
2. **Pass 2 (expensive):** deep-scrape the full job description and run the full **Strategic
   Analysis** — six AI-judged component scores aggregated into the **Strategic Score**, plus
   a **Strategic Category** and a **Recommended Action** (ALERT / DIGEST / STORE / SUPPRESS).
   Deterministic **Guardrails** can veto the AI (e.g. cap the score for an excluded industry).

A **Cost Gate** skips work that's already been done, so re-syncing doesn't re-spend on the
AI. Nothing is ever deleted — suppressed rows are hidden, not removed.

---

## Useful commands

```bash
# Backend (run from backend/)
npm test                  # run the test suite (Vitest)
npm run db:studio         # browse the database in Drizzle Studio
npm run db:generate       # generate a new migration after a schema change
npm run backfill:shallow  # backfill legacy rows with a shallow strategic analysis
npm run build             # compile to dist/ for production
npm start                 # run the compiled backend

# Frontend (run from frontend/)
npm run build             # production build
npm start                 # run the production build
npm run lint              # lint
```

---

## Maintaining this README

This README is the front door for running and using the app. **Keep it current**: when a
change adds or alters a setup step, an environment variable, a dashboard feature, or a
command, update the relevant section here in the same change. Concept and decision docs live
in [`CONTEXT.md`](./CONTEXT.md) and [`docs/adr/`](./docs/adr/) — link to them rather than
duplicating them.
