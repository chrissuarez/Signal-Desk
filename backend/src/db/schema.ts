import { pgTable, serial, text, integer, timestamp, boolean, jsonb, pgEnum } from 'drizzle-orm/pg-core';

export const opportunityTypeEnum = pgEnum('opportunity_type', ['JOB', 'BUSINESS', 'NOISE']);
export const sourceEnum = pgEnum('source', ['EMAIL', 'RSS', 'WEB']);
export const confidenceEnum = pgEnum('confidence', ['LOW', 'MEDIUM', 'HIGH']);
export const recommendedActionEnum = pgEnum('recommended_action', ['ALERT', 'DIGEST', 'STORE']);
export const opportunityStatusEnum = pgEnum('opportunity_status', ['NEW', 'SENT', 'SAVED', 'DISMISSED', 'APPLIED']);

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
