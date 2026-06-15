CREATE TYPE "public"."analysis_depth" AS ENUM('DEEP', 'SHALLOW');--> statement-breakpoint
ALTER TABLE "opportunities" ADD COLUMN "analysis_depth" "analysis_depth";