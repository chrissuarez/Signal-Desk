import cron from 'node-cron';
import { runIngestion } from '../services/ingestionService.js';
import { db } from '../db/index.js';
import { opportunities } from '../db/schema.js';
import { and, gte, lt, eq } from 'drizzle-orm';
import { sendDailyDigest } from '../services/notificationService.js';

export const initWorker = () => {
    console.log('Initializing background worker...');

    // Run every 30 minutes
    cron.schedule('*/30 * * * *', async () => {
        console.log('Running scheduled ingestion...');
        await runIngestion();
    });

    // Daily digest at 7:30 AM
    cron.schedule('30 7 * * *', async () => {
        console.log('Generating daily digest...');

        // Fetch opportunities with score between 60 and 79 that are NEW
        const digestItems = await db.query.opportunities.findMany({
            where: and(
                gte(opportunities.fitScore, 60),
                lt(opportunities.fitScore, 80),
                eq(opportunities.status, 'NEW')
            ),
        });

        if (digestItems.length > 0) {
            await sendDailyDigest(digestItems);
        }
    });

    console.log('Background worker initialized.');
};
