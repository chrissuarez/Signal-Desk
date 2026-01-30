CREATE TYPE "public"."confidence" AS ENUM('LOW', 'MEDIUM', 'HIGH');--> statement-breakpoint
CREATE TYPE "public"."feedback_action" AS ENUM('LIKE', 'DISLIKE', 'IGNORE_COMPANY', 'IGNORE_SENDER', 'MORE_LIKE_THIS', 'LESS_LIKE_THIS', 'APPLIED', 'SAVED');--> statement-breakpoint
CREATE TYPE "public"."opportunity_status" AS ENUM('NEW', 'SENT', 'SAVED', 'DISMISSED', 'APPLIED');--> statement-breakpoint
CREATE TYPE "public"."opportunity_type" AS ENUM('JOB', 'BUSINESS', 'NOISE');--> statement-breakpoint
CREATE TYPE "public"."recommended_action" AS ENUM('ALERT', 'DIGEST', 'STORE');--> statement-breakpoint
CREATE TYPE "public"."source" AS ENUM('EMAIL', 'RSS', 'WEB');--> statement-breakpoint
CREATE TABLE "feedback" (
	"id" serial PRIMARY KEY NOT NULL,
	"opportunity_id" integer NOT NULL,
	"action" "feedback_action" NOT NULL,
	"timestamp" timestamp DEFAULT now() NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "opportunities" (
	"id" serial PRIMARY KEY NOT NULL,
	"type" "opportunity_type" NOT NULL,
	"source" "source" NOT NULL,
	"origin" text,
	"received_at" timestamp DEFAULT now() NOT NULL,
	"canonical_url" text,
	"source_url" text,
	"title" text NOT NULL,
	"company" text,
	"industry" text,
	"location" text,
	"country" text,
	"remote_status" text,
	"salary_text" text,
	"employment_type" text,
	"description" text,
	"requirements" text,
	"closing_date" timestamp,
	"fit_score" integer DEFAULT 0,
	"confidence" "confidence" DEFAULT 'MEDIUM',
	"reasons" jsonb,
	"concerns" jsonb,
	"tags" jsonb,
	"recommended_action" "recommended_action" DEFAULT 'STORE',
	"status" "opportunity_status" DEFAULT 'NEW',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "opportunities_canonical_url_unique" UNIQUE("canonical_url")
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE no action ON UPDATE no action;