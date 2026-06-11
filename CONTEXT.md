# Signal Desk

Signal Desk ingests job-alert and opportunity emails, extracts individual opportunities, and scores them so Chris can find roles that compound his credibility toward a future **agency delivery-visibility / resourcing-insights consultancy** — not merely roles that match his SEO background.

## Language

**Opportunity**:
A single job or business opportunity extracted from an ingested source (email/RSS/web). The atomic unit the app scores and displays.
_Avoid_: Job, listing, posting, lead (use "Opportunity" for the stored record).

**Strategic Score**:
The primary 0–100 number that ranks Opportunities and drives alerting. As of ADR-0001 it — not Fit Score — is the ranking and alerting authority. It is **computed** (see ADR-0003) as a configurable weighted sum of six LLM-judged Component Scores minus two risk-driven penalties; it is not emitted directly by the LLM.
_Avoid_: strategicFitScore (that's the field name; "Strategic Score" is the concept).

**Component Score**:
One of the six 0–100 dimensions the LLM judges for an Opportunity, which the code aggregates into the Strategic Score: Consultancy alignment (30), Delivery/resource visibility (20), Commercial proximity (15), Buyer-environment fit (15), Seniority/scope (10), Practical fit (10). Weights are configurable.
_Avoid_: sub-score, dimension.

**Practical Fit**:
The Component Score (weight 10) covering location/salary practicality. It is fed by the demoted Fit Score rather than judged afresh by the LLM — giving the legacy keyword engine a bounded, honest job.
_Avoid_: logistics score.

**Fit Score**:
The legacy 0–100 deterministic keyword/industry/location score (`calculateFitScore`). No longer ranks or fires alerts; its only remaining role is to feed the Practical Fit Component Score.
_Avoid_: fitScore-as-ranking, "the score".

**Recommended Action**:
The system's computed routing decision for an Opportunity: ALERT, DIGEST, STORE, or SUPPRESS. Derived deterministically from the reconciled Strategic Category + Strategic Score + risk flags. Distinct from Status, which is the user's own lifecycle action. For the MVP, ALERT means "surface at the top of the dashboard" (notification sending is deferred); SUPPRESS means "persisted but hidden from default views" — never deleted.
_Avoid_: recommendation, alert level (ALERT is one value of Recommended Action, not the field).

**Status**:
The lifecycle state of an Opportunity (NEW, SENT, SAVED, DISMISSED, APPLIED). NEW/SAVED/DISMISSED/APPLIED are user actions set via the UI; SENT is a system marker meaning "a notification was dispatched" and is dormant in the MVP (notifications deferred). Ingestion no longer writes Status to encode routing decisions — that now lives in Recommended Action.
_Avoid_: state (use "Status"); action (use "Recommended Action" for the system routing decision).

**Strategic Pre-filter**:
The cheap deterministic Pass-1 gate that decides which Opportunities are worth a deep scrape + full Strategic Analysis (Pass 2). It passes any Opportunity whose extracted title/snippet hits a Tier-1/Tier-2 strategic keyword or a target role-family title, unless a hard-exclude Guardrail trips. Tuned for high recall. The legacy Fit Score plays no part in this gate.
_Avoid_: fit gate, score threshold (the pre-filter is keyword-presence, not a score).

**Pass 1 / Pass 2**:
The two stages of ingestion. **Pass 1** (cheap): extract fields, run the Strategic Pre-filter. **Pass 2** (expensive): deep-scrape the full job description, then run the full Strategic Analysis on it. Only Opportunities that clear the Pre-filter reach Pass 2.
_Avoid_: tier 3 (the old name for the deep-scrape step).

**Analysis Depth**:
Whether an Opportunity's Strategic Analysis was judged from the full deep-scraped job description (**DEEP**, via Pass 2) or from a thin snippet (**SHALLOW** — legacy rows backfilled from stored text, *or* a pre-filtered role whose Pass-2 scrape failed). Strategic analysis always runs on best-available text via one code path; Depth records which text it got. A distinct axis from the existing `confidence` field (which is the AI's field-extraction confidence). The UI flags SHALLOW rows as lower-confidence.
_Avoid_: confidence (that's a separate existing field), quality.

**Strategic Analysis**:
The full structured judgment attached to an Opportunity: the Strategic Category, the component sub-scores, risk levels, narrative interpretation, reasons, concerns, and screening questions. Produced by the LLM (Gemini), subject to Guardrails. See ADR-0002.
_Avoid_: scorecard, classification (those are parts of it).

**Guardrail**:
A deterministic, non-negotiable rule that can override the LLM's Strategic Analysis — e.g. an excluded industry, or an unambiguous resource-admin signal — by capping the Strategic Score or forcing a Strategic Category. Guardrails veto; they do not score. Guardrail *inputs* (excluded industries, penalty keywords, Tier-1 boost keywords) live in the configurable `settings`/`preferences`; the LLM prompt and category definitions are hardcoded in the codebase.
_Avoid_: fallback (the fallback is the separate failure-path behaviour), filter.

**Strategic Category**:
The single enum label classifying *what kind* of role an Opportunity is (STRATEGIC_FIT, USEFUL_BRIDGE, SEO_COMFORT_ZONE, RESOURCE_ADMIN_TRAP, GENERIC_OPS_UNCLEAR, REJECT). The LLM proposes it, then deterministic reconciliation enforces coherence with the Strategic Score by fixed precedence: (1) `resourceAdminTrapRisk = HIGH` forces RESOURCE_ADMIN_TRAP; (2) `seoComfortZoneRisk = HIGH` without strong ops signals forces SEO_COMFORT_ZONE; (3) otherwise the LLM's category stands but is clamped to the score — STRATEGIC_FIT requires score ≥ 70, else it is demoted. Category encodes the *kind*; Strategic Score encodes *how good*.
_Avoid_: type, classification, role family ("role family" is the brief's grouping of target titles, a different concept).
