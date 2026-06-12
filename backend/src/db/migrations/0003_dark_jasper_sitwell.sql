CREATE TYPE "public"."risk_level" AS ENUM('LOW', 'MEDIUM', 'HIGH');--> statement-breakpoint
ALTER TABLE "opportunities" ADD COLUMN "consultancy_alignment" integer;--> statement-breakpoint
ALTER TABLE "opportunities" ADD COLUMN "delivery_visibility" integer;--> statement-breakpoint
ALTER TABLE "opportunities" ADD COLUMN "commercial_proximity" integer;--> statement-breakpoint
ALTER TABLE "opportunities" ADD COLUMN "buyer_environment_fit" integer;--> statement-breakpoint
ALTER TABLE "opportunities" ADD COLUMN "seniority_scope" integer;--> statement-breakpoint
ALTER TABLE "opportunities" ADD COLUMN "practical_fit" integer;--> statement-breakpoint
ALTER TABLE "opportunities" ADD COLUMN "resource_admin_trap_risk" "risk_level";--> statement-breakpoint
ALTER TABLE "opportunities" ADD COLUMN "seo_comfort_zone_risk" "risk_level";--> statement-breakpoint
ALTER TABLE "opportunities" ADD COLUMN "real_role_interpretation" text;--> statement-breakpoint
ALTER TABLE "opportunities" ADD COLUMN "consultancy_relevance" text;--> statement-breakpoint
ALTER TABLE "opportunities" ADD COLUMN "strategic_reasons" jsonb;--> statement-breakpoint
ALTER TABLE "opportunities" ADD COLUMN "strategic_concerns" jsonb;--> statement-breakpoint
ALTER TABLE "opportunities" ADD COLUMN "recommended_screening_questions" jsonb;