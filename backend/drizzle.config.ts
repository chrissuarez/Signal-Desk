import type { Config } from 'drizzle-kit';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config(); // Load from process.env primarily

export default {
    schema: './src/db/schema.ts',
    out: './src/db/migrations',
    dialect: 'postgresql',
    dbCredentials: {
        url: process.env.DATABASE_URL || 'postgresql://signaldesk:signaldesk_pass@db:5432/signaldesk',
    },
} satisfies Config;
