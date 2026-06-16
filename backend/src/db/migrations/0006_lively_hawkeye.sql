CREATE TABLE "digest_extractions" (
	"message_id" text PRIMARY KEY NOT NULL,
	"extracted_at" timestamp DEFAULT now() NOT NULL
);
