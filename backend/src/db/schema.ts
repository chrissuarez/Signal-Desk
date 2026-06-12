import { pgTable, serial, text, integer, timestamp, boolean, jsonb, pgEnum } from 'drizzle-orm/pg-core';

export const opportunityTypeEnum = pgEnum('opportunity_type', ['JOB', 'BUSINESS', 'NOISE']);
export const sourceEnum = pgEnum('source', ['EMAIL', 'RSS', 'WEB']);
export const confidenceEnum = pgEnum('confidence', ['LOW', 'MEDIUM', 'HIGH']);
export const recommendedActionEnum = pgEnum('recommended_action', ['ALERT', 'DIGEST', 'STORE', 'SUPPRESS']);
export const opportunityStatusEnum = pgEnum('opportunity_status', ['NEW', 'SENT', 'SAVED', 'DISMISSED', 'APPLIED']);
// Strategic Category (#2): the six CONTEXT.md labels for *what kind* of role this is.
// LLM-proposed and persisted raw here; deterministic reconciliation lands later (#5).
export const strategicCategoryEnum = pgEnum('strategic_category', [
  'STRATEGIC_FIT',
  'USEFUL_BRIDGE',
  'SEO_COMFORT_ZONE',
  'RESOURCE_ADMIN_TRAP',
  'GENERIC_OPS_UNCLEAR',
  'REJECT',
]);
// Risk level (#3): the LLM-judged severity of the two Strategic Analysis risk flags.
// A distinct axis from `confidence` (AI field-extraction confidence) per CONTEXT.md.
export const riskLevelEnum = pgEnum('risk_level', ['LOW', 'MEDIUM', 'HIGH']);

export const opportunities = pgTable('opportunities', {
  id: serial('id').primaryKey(),
  type: opportunityTypeEnum('type').notNull(),
  source: sourceEnum('source').notNull(),
  origin: text('origin'), // sender or domain
  receivedAt: timestamp('received_at').defaultNow().notNull(),
  canonicalUrl: text('canonical_url').unique(),
  sourceUrl: text('source_url'),

  title: text('title').notNull(),
  company: text('company'),
  industry: text('industry'),
  location: text('location'),
  country: text('country'),
  remoteStatus: text('remote_status'), // e.g., Remote, Hybrid, On-site
  salaryText: text('salary_text'),
  employmentType: text('employment_type'),
  description: text('description'),
  requirements: text('requirements'),
  closingDate: timestamp('closing_date'),

  fitScore: integer('fit_score').default(0),
  confidence: confidenceEnum('confidence').default('MEDIUM'),
  reasons: jsonb('reasons').$type<string[]>(), // top 5 reasons
  concerns: jsonb('concerns').$type<string[]>(), // top 3 concerns
  tags: jsonb('tags').$type<string[]>(),
  strategicCategory: strategicCategoryEnum('strategic_category'), // nullable; null until analysed (#2)

  // Strategic Analysis (#3): the six Component Scores (0–100), two risk flags, narrative
  // fields and array fields the LLM judges (ADR-0002/0003). All nullable — null until an
  // Opportunity has been analysed. No aggregation or ranking yet (that's #4); no
  // category reconciliation yet (that's #5). `practicalFit` is fed by the demoted Fit
  // Score rather than judged afresh by the LLM (CONTEXT.md: Practical Fit).
  consultancyAlignment: integer('consultancy_alignment'),
  deliveryVisibility: integer('delivery_visibility'),
  commercialProximity: integer('commercial_proximity'),
  buyerEnvironmentFit: integer('buyer_environment_fit'),
  seniorityScope: integer('seniority_scope'),
  practicalFit: integer('practical_fit'), // sourced from fitScore at ingest, not the LLM
  resourceAdminTrapRisk: riskLevelEnum('resource_admin_trap_risk'),
  seoComfortZoneRisk: riskLevelEnum('seo_comfort_zone_risk'),
  realRoleInterpretation: text('real_role_interpretation'),
  consultancyRelevance: text('consultancy_relevance'),
  strategicReasons: jsonb('strategic_reasons').$type<string[]>(),
  strategicConcerns: jsonb('strategic_concerns').$type<string[]>(),
  recommendedScreeningQuestions: jsonb('recommended_screening_questions').$type<string[]>(),

  recommendedAction: recommendedActionEnum('recommended_action').default('STORE'),
  status: opportunityStatusEnum('status').default('NEW'),

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const feedbackActionEnum = pgEnum('feedback_action', [
  'LIKE',
  'DISLIKE',
  'IGNORE_COMPANY',
  'IGNORE_SENDER',
  'MORE_LIKE_THIS',
  'LESS_LIKE_THIS',
  'APPLIED',
  'SAVED'
]);

export const feedback = pgTable('feedback', {
  id: serial('id').primaryKey(),
  opportunityId: integer('opportunity_id').references(() => opportunities.id).notNull(),
  action: feedbackActionEnum('action').notNull(),
  timestamp: timestamp('timestamp').defaultNow().notNull(),
  notes: text('notes'),
});

export const settings = pgTable('settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
