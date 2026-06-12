ALTER TABLE "opportunities" ADD COLUMN "strategic_score" integer;--> statement-breakpoint
-- Backfill the headline Strategic Score (#4) for rows scored under the old Fit-only
-- routing, mirroring engine/strategicScoring exactly: a weighted average
-- (30/20/15/15/10/10) over the *judged* Component Scores — renormalised, so a null
-- component is excluded rather than counted as zero — minus the SEO (max 20) and trap
-- (max 30) penalties scaled by severity (LOW/null 0, MEDIUM ½, HIGH full), rounded and
-- clamped to 0–100. A row with no judged component at all stays NULL ("unknown", not a
-- fake 0), consistent with fresh ingestion.
UPDATE "opportunities" AS o SET "strategic_score" = b.score
FROM (
  SELECT
    id,
    CASE WHEN denom = 0 THEN NULL
         ELSE GREATEST(0, LEAST(100, ROUND(num::numeric / denom - seo_pen - trap_pen)))::int
    END AS score
  FROM (
    SELECT
      id,
      COALESCE(consultancy_alignment, 0) * 30
        + COALESCE(delivery_visibility, 0) * 20
        + COALESCE(commercial_proximity, 0) * 15
        + COALESCE(buyer_environment_fit, 0) * 15
        + COALESCE(seniority_scope, 0) * 10
        + COALESCE(practical_fit, 0) * 10 AS num,
      (consultancy_alignment IS NOT NULL)::int * 30
        + (delivery_visibility IS NOT NULL)::int * 20
        + (commercial_proximity IS NOT NULL)::int * 15
        + (buyer_environment_fit IS NOT NULL)::int * 15
        + (seniority_scope IS NOT NULL)::int * 10
        + (practical_fit IS NOT NULL)::int * 10 AS denom,
      CASE seo_comfort_zone_risk WHEN 'HIGH' THEN 20 WHEN 'MEDIUM' THEN 10 ELSE 0 END AS seo_pen,
      CASE resource_admin_trap_risk WHEN 'HIGH' THEN 30 WHEN 'MEDIUM' THEN 15 ELSE 0 END AS trap_pen
    FROM "opportunities"
  ) t
) b
WHERE o.id = b.id AND b.score IS NOT NULL;--> statement-breakpoint
-- Re-route every existing row off the Strategic Score (ADR-0001), matching how ingestion
-- now routes through the degenerate null-category adapter exactly: the live arm is the
-- null-category fallback over `strategicScore ?? 0` (score >= 80 -> ALERT, else STORE). A
-- null score is therefore treated as 0 — so an un-scored legacy row (one predating #3's
-- component columns, all null) that the old Fit routing marked ALERT is demoted to STORE
-- rather than left floating above scored rows. This flips a high-Fit/low-Strategic row
-- down to STORE and promotes a strong-Strategic row to ALERT, so the dashboard's
-- floated-ALERT + strategic_score ordering reflects Strategic Score for existing data too.
-- Only the two live actions are rewritten; any DIGEST/SUPPRESS row is left untouched.
UPDATE "opportunities"
SET "recommended_action" = CASE WHEN COALESCE("strategic_score", 0) >= 80 THEN 'ALERT' ELSE 'STORE' END
WHERE "recommended_action" IN ('ALERT', 'STORE');
