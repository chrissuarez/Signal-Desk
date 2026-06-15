import type { Config } from 'drizzle-kit';
import dotenv from 'dotenv';
import path from 'path';

// The documented setup keeps secrets in the repo-root .env (one file, shared with the app —
// see README). drizzle-kit runs from backend/, so a bare dotenv.config() would only read
// backend/.env and miss DATABASE_URL, falling back to the Docker-internal `@db:5432` host
// that isn't resolvable from the host machine. Load the root .env first, then let a local
// backend/.env (if any) fill gaps — dotenv never overrides already-set keys, so root wins.
dotenv.config({ path: path.resolve(process.cwd(), '../.env') });
dotenv.config();

export default {
    schema: './src/db/schema.ts',
    out: './src/db/migrations',
    dialect: 'postgresql',
    dbCredentials: {
        url: process.env.DATABASE_URL || 'postgresql://signaldesk:signaldesk_pass@db:5432/signaldesk',
    },
} satisfies Config;
