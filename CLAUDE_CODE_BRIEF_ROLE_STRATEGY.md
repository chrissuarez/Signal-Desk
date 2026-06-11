# Claude Code Brief: Improve Signal Desk for Strategic Role Targeting

## Context

Signal Desk is currently an opportunity/job-search assistant that ingests job-alert emails, extracts job opportunities, scores them against user preferences, and lets the user adjust keywords, locations, industry weights and exclusions.

The next iteration should make Signal Desk more strategically useful for Chris’s current career decision.

Chris is not simply looking for another SEO leadership role. He is exploring a future consultancy around **agency delivery visibility / resourcing insights**: helping agencies and professional-services businesses connect commercial demand, delivery capacity, resourcing pressure and decision-ready operating dashboards.

The app should therefore help Chris identify full-time roles that strengthen this future consultancy positioning, while avoiding roles that trap him as either:

1. a generic non-billable Senior SEO Director, or
2. a hands-on resource administrator / traffic manager.

The product goal is to evolve Signal Desk from a generic job-fit scorer into a **strategic career-opportunity filter**.

---

## Core user question

Every scored opportunity should help answer:

> Does this role make Chris more credible as a future resourcing-insights / delivery-visibility consultant?

Not merely:

> Does this job match Chris’s current SEO background?

---

## Desired role direction

The highest-fit roles are likely to sit at the intersection of:

- delivery operations
- resource planning
- capacity planning
- commercial operations
- agency/professional-services operations
- operational reporting
- business intelligence / performance insight
- workforce planning
- operating model improvement

The app should prioritise roles where Chris can own or influence the visibility layer between:

- sold work / pipeline
- delivery demand
- staffing pressure
- utilisation / capacity
- commercial performance
- leadership decision-making

---

## Target role families

### 1. Best aligned: Delivery / Resource Operations

Example titles:

- Delivery Operations Lead
- Resource Operations Lead
- Resource Planning Lead
- Capacity Planning Lead
- Workforce Planning Lead
- Agency Operations Lead
- Professional Services Operations Manager

Positive signals:

- capacity planning
- demand forecasting
- utilisation
- resource model
- delivery reporting
- operating cadence
- commercial performance
- portfolio visibility
- PSA / resourcing tooling

Risks to detect:

- purely hands-on scheduling
- chasing timesheets
- rota management
- admin-heavy resource allocation
- traffic management without strategic ownership

---

### 2. Strong alternative: Commercial / Business Operations

Example titles:

- Commercial Operations Manager
- Business Operations Manager
- Revenue Operations Manager
- Agency Operations Manager
- Commercial Planning Manager
- Growth Operations Lead

Positive signals:

- pipeline to delivery
- commercial planning
- margin
- forecasting
- capacity
- business performance reporting
- leadership dashboards
- operating model

Risks to detect:

- CRM admin only
- sales operations only
- no connection to delivery/capacity/resource planning

---

### 3. Useful bridge: Data, Insight and Performance Operations

Example titles:

- Operations Insight Lead
- Delivery Insight Manager
- Business Performance Lead
- Performance Insight Manager
- Resource Analytics Manager
- Workforce Analytics Lead
- Commercial Insight Manager

Positive signals:

- operational decision-making
- capacity
- resource planning
- delivery performance
- forecasting
- executive reporting
- data storytelling
- professional services

Risks to detect:

- generic dashboard factory
- pure SQL/reporting with no decision influence
- marketing analytics only
- web analytics only

---

### 4. Adjacent: Transformation / Operating Model

Example titles:

- Operations Transformation Manager
- Delivery Transformation Lead
- Business Transformation Manager
- Operating Model Consultant
- Process Improvement Lead
- PMO Transformation Lead

Positive signals:

- tangible delivery process improvement
- capacity/resource planning transformation
- agency, consultancy, SaaS or professional-services context
- hands-on design of reporting, process and decision cadence

Risks to detect:

- vague enterprise transformation
- governance-heavy PMO
- too abstract / not close to delivery reality

---

### 5. Lower-priority fallback: SEO / Digital with Operations Remit

Example titles:

- SEO Operations Director
- Organic Performance Operations Lead
- Digital Operations Director
- Performance Marketing Operations Lead
- SEO Strategy & Operations Lead

Only score these highly if they explicitly include:

- team capacity
- delivery model
- forecasting
- cross-functional planning
- commercial performance
- operating dashboards

Otherwise, penalise as **SEO Comfort Zone**.

---

## New classification model

Add a strategic role classification to each opportunity.

Suggested enum:

```ts
type StrategicRoleCategory =
  | 'STRATEGIC_FIT'
  | 'USEFUL_BRIDGE'
  | 'SEO_COMFORT_ZONE'
  | 'RESOURCE_ADMIN_TRAP'
  | 'GENERIC_OPS_UNCLEAR'
  | 'REJECT';
```

### Category definitions

#### STRATEGIC_FIT

A role that directly supports Chris’s future consultancy credibility.

Example:

> Delivery Operations Lead at a digital agency owning capacity planning, utilisation reporting and leadership dashboards.

#### USEFUL_BRIDGE

A role that is not perfectly aligned but gives useful experience in operations, commercial planning, insight or transformation.

Example:

> Business Operations Manager at a consultancy improving operating cadence and commercial reporting.

#### SEO_COMFORT_ZONE

A role that mainly keeps Chris positioned as an SEO/digital specialist, even if senior.

Example:

> SEO Director with limited operational, commercial or resourcing ownership.

#### RESOURCE_ADMIN_TRAP

A role that appears to be about resourcing but is actually mostly manual allocation, rota management, chasing availability, timesheets or traffic management.

Example:

> Resource Manager responsible for scheduling staff, updating availability and allocating freelancers day-to-day.

#### GENERIC_OPS_UNCLEAR

A vague operations role where strategic relevance is not obvious from the job description.

Example:

> Operations Manager with broad admin/process responsibilities but little detail on delivery, commercial or planning scope.

#### REJECT

A role with weak fit, low strategic value, poor seniority, irrelevant industry/context or strong negative signals.

---

## New scoring dimensions

Add a richer strategic scorecard alongside the existing `fitScore`.

Suggested structure:

```ts
interface StrategicFitAnalysis {
  strategicCategory: StrategicRoleCategory;
  strategicFitScore: number; // 0-100
  consultancyCredibilityScore: number; // 0-100
  commercialProximityScore: number; // 0-100
  deliveryVisibilityScore: number; // 0-100
  buyerEnvironmentFitScore: number; // 0-100
  escapeOldBoxScore: number; // 0-100
  resourceAdminTrapRisk: 'LOW' | 'MEDIUM' | 'HIGH';
  seoComfortZoneRisk: 'LOW' | 'MEDIUM' | 'HIGH';
  reasons: string[];
  concerns: string[];
  recommendedScreeningQuestions: string[];
}
```

### Dimension guidance

#### 1. Strategic fit score

How strongly does the role align with Chris’s intended direction: agency delivery visibility, resource/capacity planning, operational insight and commercial decision support?

Positive terms:

- resource planning
- capacity planning
- demand forecasting
- utilisation
- delivery operations
- agency operations
- commercial operations
- workforce planning
- operational reporting
- delivery visibility
- business intelligence
- professional services operations
- portfolio reporting
- planning cadence
- operating model

Negative terms:

- traffic manager
- rota
- scheduling
- timesheets only
- admin
- coordinator
- pure SEO
- campaign delivery
- client account management only

---

#### 2. Consultancy credibility score

Would this role help Chris later credibly say:

> I have worked directly on the operational visibility problems agencies face.

High-score signals:

- multi-team resourcing
- senior stakeholder reporting
- delivery / commercial / finance crossover
- dashboard or reporting ownership
- resource/capacity model ownership
- leadership decision support
- operating rhythm ownership

Low-score signals:

- team admin
- pure line management
- pure SEO delivery
- reporting without decision influence
- delivery execution without operating-model ownership

---

#### 3. Commercial proximity score

Does the role sit close to money and commercial outcomes?

Positive signals:

- margin
- profitability
- revenue
- pipeline
- sold work
- utilisation
- forecast
- budget
- commercial performance
- billability
- delivery margin
- financial planning

---

#### 4. Delivery visibility score

Does the role involve visibility across delivery demand, capacity, utilisation, staffing pressure or operational risk?

Positive signals:

- capacity dashboard
- delivery reporting
- resource forecast
- demand planning
- portfolio view
- utilisation analysis
- operating cadence
- leadership reporting

---

#### 5. Buyer environment fit score

Does the role sit in an environment similar to the likely future consultancy buyer?

High-fit environments:

- digital agencies
- creative agencies
- marketing agencies
- consultancies
- professional services firms
- implementation partners
- productised service businesses
- SaaS services / customer delivery teams

Lower-fit environments:

- large in-house SEO teams
- isolated marketing departments
- generic corporate analytics teams
- narrow technical BI teams
- enterprise PMO with no agency/professional-services connection

---

#### 6. Escape old box score

Does the role help Chris move away from being seen primarily as an SEO operator?

Positive title/domain terms:

- Operations
- Delivery Operations
- Resource Operations
- Commercial Operations
- Business Operations
- Workforce Planning
- Capacity Planning
- Delivery Insight
- Performance Insight
- Transformation

Negative title/domain terms:

- SEO Director
- SEO Lead
- Organic Search Manager
- Content SEO
- Technical SEO Manager
- Search Strategy Director

SEO terms should not automatically reject a role, but they should reduce the strategic score unless paired with strong operational scope.

---

## Proposed scoring weights

If maintaining a single 0-100 strategic score, weight approximately:

| Dimension | Weight |
|---|---:|
| Strategic alignment with consultancy | 30 |
| Capacity/resource/delivery visibility | 20 |
| Commercial proximity | 15 |
| Buyer/environment fit | 15 |
| Seniority/scope | 10 |
| Location/salary practical fit | 10 |
| SEO-only penalty | -20 |
| Resource-admin trap penalty | -30 |

The app should avoid ranking a role highly merely because it matches Chris’s historic SEO keywords.

---

## Keyword configuration recommendations

### Tier 1: high-weight target keywords

- delivery operations
- resource planning
- capacity planning
- resource operations
- agency operations
- commercial operations
- professional services operations
- workforce planning
- demand planning
- utilisation
- resourcing strategy
- operational reporting
- business operations
- delivery insight
- resource forecasting
- portfolio visibility
- margin
- delivery performance

### Tier 2: medium-weight adjacent keywords

- transformation
- operating model
- process improvement
- business intelligence
- performance reporting
- leadership reporting
- executive dashboards
- planning cadence
- revenue operations
- PMO
- portfolio management
- professional services automation
- workflow optimisation
- data-driven operations

### Tier 3: low-weight background leverage keywords

These should be recognised but should not dominate scoring:

- SEO
- digital marketing
- organic search
- performance marketing
- agency
- client services
- strategy director

### Negative / penalty keywords

- traffic manager
- scheduler
- coordinator
- administrator
- rota
- shift planning
- timesheets
- pure SEO delivery
- content calendar
- campaign manager
- account manager
- client services only
- hands-on execution
- junior
- assistant

Important nuance: do **not** automatically reject `Resource Manager`. Instead, classify it carefully. It should score well only if paired with strategic terms like capacity planning, forecasting, utilisation, operating model, commercial planning, leadership reporting or process improvement.

---

## AI analysis prompt requirements

Update the AI opportunity analysis prompt so that, in addition to extracting standard job fields, it also returns strategic-career analysis.

The AI should answer:

1. What is the real job underneath the title?
2. Is it strategic, operational, administrative or delivery execution?
3. What problem is the company probably hiring this role to solve?
4. Does this role strengthen Chris’s future resourcing-insights consultancy?
5. Which part of the consultancy story would it support?
6. Is there a risk this is hands-on resource admin?
7. Is there a risk this keeps Chris boxed as SEO?
8. What screening questions should Chris ask in the first call?

Suggested JSON addition:

```json
{
  "strategicCategory": "STRATEGIC_FIT | USEFUL_BRIDGE | SEO_COMFORT_ZONE | RESOURCE_ADMIN_TRAP | GENERIC_OPS_UNCLEAR | REJECT",
  "strategicFitScore": 0,
  "consultancyCredibilityScore": 0,
  "commercialProximityScore": 0,
  "deliveryVisibilityScore": 0,
  "buyerEnvironmentFitScore": 0,
  "escapeOldBoxScore": 0,
  "resourceAdminTrapRisk": "LOW | MEDIUM | HIGH",
  "seoComfortZoneRisk": "LOW | MEDIUM | HIGH",
  "realRoleInterpretation": "Short explanation of what the job actually appears to be.",
  "consultancyRelevance": "Short explanation of how this role would or would not support Chris's future consultancy positioning.",
  "strategicReasons": ["reason 1", "reason 2"],
  "strategicConcerns": ["concern 1", "concern 2"],
  "recommendedScreeningQuestions": ["question 1", "question 2", "question 3"]
}
```

---

## Suggested screening questions to generate

For promising or ambiguous roles, generate 3-5 screening questions from this set or similar:

1. What decisions would this role be expected to improve?
2. How does the business currently forecast demand against available capacity?
3. Is this role mainly responsible for allocating people to work, or improving the operating model around planning and resourcing?
4. What data or systems does the team currently use for resourcing, utilisation and delivery reporting?
5. Who are the main stakeholders — delivery, commercial, finance, operations, department heads?
6. What would success look like after six months?
7. How close is this role to margin, utilisation, pipeline or commercial planning?
8. Would this role own reporting/visibility, process improvement, or mainly day-to-day scheduling?

---

## UI requirements

Enhance the opportunity card/list view to display:

- strategic category badge
- strategic fit score
- resource admin trap risk
- SEO comfort zone risk
- top strategic reasons
- top strategic concerns
- recommended screening questions

Suggested visual treatment:

- `STRATEGIC_FIT`: green badge
- `USEFUL_BRIDGE`: blue badge
- `SEO_COMFORT_ZONE`: amber badge
- `RESOURCE_ADMIN_TRAP`: red badge
- `GENERIC_OPS_UNCLEAR`: grey badge
- `REJECT`: muted/dark badge

Add filters/tabs for:

- Strategic Fit
- Useful Bridge
- Needs Review
- Traps / Rejects

---

## Data model requirements

Add fields to the opportunity model/schema to persist strategic analysis.

Potential fields:

- `strategicCategory`
- `strategicFitScore`
- `consultancyCredibilityScore`
- `commercialProximityScore`
- `deliveryVisibilityScore`
- `buyerEnvironmentFitScore`
- `escapeOldBoxScore`
- `resourceAdminTrapRisk`
- `seoComfortZoneRisk`
- `realRoleInterpretation`
- `consultancyRelevance`
- `strategicReasons`
- `strategicConcerns`
- `recommendedScreeningQuestions`

Use JSONB where appropriate for arrays.

---

## Product behaviour

### High-priority alert

A role should be eligible for immediate alert if:

- strategic category is `STRATEGIC_FIT`, or
- strategic category is `USEFUL_BRIDGE` with high strategic fit score,
- and resource-admin trap risk is not HIGH,
- and SEO comfort-zone risk is not HIGH.

### Medium digest

Include roles that are:

- useful bridge roles,
- ambiguous but potentially relevant operations roles,
- SEO-adjacent roles with strong operations/remit signals.

### Store / low priority

Store but do not alert roles that are:

- SEO comfort zone,
- generic ops unclear,
- low strategic fit,
- high trap risk.

### Reject / suppress

Suppress or heavily demote roles that are:

- resource admin trap,
- pure scheduling / traffic management,
- pure SEO execution,
- junior/admin roles,
- client services only with no operations or commercial planning scope.

---

## Acceptance criteria

1. Existing ingestion and basic opportunity display still work.
2. Each analysed job opportunity receives a strategic category.
3. Each analysed job opportunity receives a strategic fit score and component scores.
4. The UI shows why a role is strategically useful or risky.
5. The app can distinguish between:
   - a strategic resource/delivery operations role,
   - a hands-on resource-admin trap,
   - an SEO comfort-zone role,
   - a useful bridge role.
6. The app generates first-call screening questions for promising or ambiguous roles.
7. Existing keyword/location/industry preference functionality remains available.
8. The prompt and scoring logic avoid treating SEO background as the main target identity.

---

## Implementation notes

Prioritise the smallest useful version first:

1. Extend types/schema for strategic analysis fields.
2. Update AI extraction prompt to return the new fields.
3. Add deterministic fallback scoring for obvious keyword matches/penalties.
4. Update dashboard cards to show category, score, risks, reasons and questions.
5. Add filters for strategic categories.
6. Backfill/reprocess existing opportunities.

Do not overbuild this into a general career platform. The MVP should be tightly focused on Chris’s specific career strategy: finding roles that compound his credibility in agency delivery visibility, resourcing insight and commercial operations.
