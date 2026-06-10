# Strategic Score is a weighted sum of six LLM-judged components, not a direct LLM number

The brief defined two non-matching dimension sets (a `StrategicFitAnalysis` component list and a weights table) that could not actually compute its own headline number — `seniority/scope` and `location/salary` had weights but no component, and `escapeOldBox` was a component with no weight that double-counted the SEO penalty. We reconciled them into one canonical model: the headline **Strategic Score = a configurable weighted sum of six LLM-judged Component Scores minus two risk-driven penalties**.

| Component (LLM-judged 0–100) | Weight |
|---|---:|
| Consultancy alignment | 30 |
| Delivery / resource visibility | 20 |
| Commercial proximity | 15 |
| Buyer-environment fit | 15 |
| Seniority / scope | 10 |
| Practical fit (location/salary) | 10 |
| SEO comfort-zone penalty (from `seoComfortZoneRisk`) | up to −20 |
| Resource-admin trap penalty (from `resourceAdminTrapRisk`) | up to −30 |

The code aggregates; the LLM only judges components. Two deliberate, surprising choices: **`escapeOldBox` is dropped as a stored score** (folded into the SEO penalty to avoid double-counting the same SEO signal twice), and the **demoted Fit Score is repurposed as the Practical-fit input** rather than orphaned or deleted. We chose a computed headline over a direct holistic LLM number so rankings are auditable ("which component dragged this down?"), reproducible given fixed components, and tunable via configurable weights — matching how Chris already tunes industry weights. The cost: a weighted sum of possibly-correlated components can be less coherent than a single holistic judgment, and the weight vector is now a thing that must be maintained.
