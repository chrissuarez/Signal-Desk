You are an agentic software engineering team building a production quality “Opportunity Agent” that finds high-fit job postings and business opportunities for a single user using forwarded job-alert emails and selected web sources. Prioritise security, privacy, deduplication, and low false positives.

## Key decision (updated)

Primary real inbox: Outlook (Microsoft 365 or Outlook.com).
Primary ingestion inbox for the agent: Gmail. The user will forward relevant job-alert emails from Outlook into Gmail. Therefore, do NOT build Microsoft Graph ingestion in v1.

Optional v2: Add Outlook ingestion using Microsoft Graph with delegated OAuth if needed later.

References (use as guidance, do not scrape):

* Gmail API messages list:
  [https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/list](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/list)
* Gmail API auth scopes (use least privilege, prefer gmail.readonly):
  [https://developers.google.com/workspace/gmail/api/auth/scopes](https://developers.google.com/workspace/gmail/api/auth/scopes)
* (Optional v2) Microsoft Graph auth and delta query:
  [https://learn.microsoft.com/en-us/graph/auth-v2-user](https://learn.microsoft.com/en-us/graph/auth-v2-user)
  [https://learn.microsoft.com/en-us/graph/api/message-delta?view=graph-rest-1.0](https://learn.microsoft.com/en-us/graph/api/message-delta?view=graph-rest-1.0)
  [https://learn.microsoft.com/en-us/graph/delta-query-overview](https://learn.microsoft.com/en-us/graph/delta-query-overview)

## Mission

Build an app that:

1. Reads my forwarded job-alert emails in Gmail to detect job postings and business opportunities.
2. Optionally searches selected web sources that are permitted (RSS feeds and company career pages I provide).
3. Extracts structured data from each opportunity.
4. Scores each opportunity against my profile and preferences.
5. Sends me only high-fit opportunities immediately, plus a daily digest for medium-fit.
6. Learns from my feedback (thumbs up, thumbs down, ignore company, ignore sender).

## Non goals (v1)

* Do not auto-apply to jobs.
* Do not scrape sources that prohibit automated access. Prefer RSS, APIs, and email alerts.
* Do not require paid services for MVP.
* Do not ingest the full Outlook mailbox in v1.

## Assumptions and constraints

* Single user system (me), not multi-tenant for v1.
* Email connector must support Gmail using OAuth.
* Use OAuth authorisation code flow. Never store passwords.
* Store everything locally in Postgres via Docker Compose.
* Run locally on Windows or macOS with Docker.
* Keep secrets out of logs, out of git, and out of generated artefacts.

## Email ingestion requirements (updated)

### Gmail connector (primary and only in v1)

* Implement OAuth using gmail.readonly only.
* Support label selection (default label: “Job Alerts”).
* Support plus-addressing source attribution, for example messages sent to user+linkedin@... are tagged as source=linkedin.
* Ingest incrementally using historyId where feasible, otherwise maintain a durable cursor (last processed message id and internalDate).
* Deduplicate as needed.
* Fetch message bodies safely (prefer text, sanitise HTML).
* Extract links and detect job postings in the body.
* Handle attachments: if PDF attachments exist, extract text locally and include it in parsing.

### Forwarding assumption

* The user forwards relevant job-alert emails from Outlook to Gmail. Treat Gmail as the canonical ingestion inbox.
* The system should provide a short setup guide suggesting:

  * Create a Gmail label “Job Alerts”.
  * Create Gmail filters to apply the label to forwarded messages.
  * Use plus addressing per job site to trace sources.

## Web ingestion (v1 minimal)

* RSS feeds for job searches if provided.
* A list of career page URLs the user provides, monitored daily with lightweight fetching.
* Respect robots.txt, add timeouts and rate limits.
* Normalise into the same Opportunity object.

## Output and deliverables

Create a repo with:

* Backend API (TypeScript Node.js preferred, Python acceptable if justified).
* Simple dashboard (Next.js preferred) for reviewing items, changing preferences, giving feedback.
* Worker process for scheduled ingestion and scoring.
* Docker Compose for Postgres plus services.
* Database migrations.
* An .env.example file and a setup guide (Gmail OAuth, label setup, forwarding guidance).
* Unit tests for parsers, scoring, and dedupe.
* Integration smoke test: one ingestion run produces scored results.

## Core entities

Opportunity:

* id, type (JOB or BUSINESS)
* source (EMAIL | RSS | WEB), origin (sender or domain), received_at, canonical_url
* title, company, location, country, remote_status, salary_text, employment_type, description, requirements, closing_date
* fit_score 0–100, confidence (LOW | MEDIUM | HIGH)
* reasons (top 5), concerns (top 3), tags, recommended_action (ALERT | DIGEST | STORE)
* status (NEW | SENT | SAVED | DISMISSED | APPLIED)

Feedback:

* opportunity_id, action (LIKE, DISLIKE, IGNORE_COMPANY, IGNORE_SENDER, MORE_LIKE_THIS, LESS_LIKE_THIS, APPLIED, SAVED), timestamp, optional notes

## Core features

1. Ingestion (Gmail label-based, forwarded from Outlook)
2. Classification (JOB | BUSINESS | NOISE)
3. Field extraction (robust, with fallbacks)
4. Transparent scorecard with editable weights
5. Deduplication across sources
6. Notifications: immediate alert (score >= 80, confidence not LOW) and daily digest at 07:30 Europe/London for scores 60–79
7. Feedback learning (blocklists, light weight adjustments, audit trail)
8. Dashboard (local auth for v1)

## Guidance for setting up job alerts (include in the app docs)

Provide recommended job alert sources and a suggested strategy to reduce noise.

* Encourage 6–10 narrow alerts rather than one broad alert.
* Support a “source” dimension using plus-addressed emails.
* Suggest common alert sources and that they can be configured to send to the Gmail plus-address.
  Examples of sources to support in tagging:
* LinkedIn, Indeed, CV-Library, Totaljobs, CWJobs, Guardian Jobs
* Remote-first boards such as We Work Remotely and Remotive
* Contract/freelance sources such as Upwork and similar

## Security and safety

* Never print tokens, raw email bodies, or secrets to logs.
* Sanitise HTML before display.
* Timeouts, rate limits, and retries on Gmail calls.
* All terminal execution requires explicit user approval.

## Implementation plan (updated)

1. Repo scaffold, Docker Compose, Postgres schema and migrations.
2. Gmail connector with OAuth and incremental sync (label-based).
3. Parser, classifier, scorecard with tests.
4. Dedupe, storage, dashboard list view.
5. Notifications and digest scheduler.
6. Feedback actions wired end to end.
7. Add web ingestion (RSS + career page list) behind feature flags.
8. (Optional v2) Add Outlook Microsoft Graph ingestion if user later wants it.

## Acceptance criteria

* `docker compose up` runs DB, API, worker, dashboard.
* Gmail OAuth works end to end.
* I can select a label, ingest, and see scored opportunities.
* Alerts and digest include feedback links that work.
* Dedupe prevents repeat alerts for the same role.

## Before building, ask me one gating question then proceed with sensible defaults

Ask:
“Do you want the MVP to be email-only first (Gmail label ingestion), or should we include RSS feeds and career-page monitoring in v1?”
If I do not answer, default to email-only MVP, and scaffold web ingestion behind a feature flag.
