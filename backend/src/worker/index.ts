import cron from 'node-cron';
import { runIngestion } from '../services/ingestionService.js';
import { db } from '../db/index.js';
import { opportunities } from '../db/schema.js';
import { eq } from 'drizzle-orm';
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

        // ADR-0005 (#13): route on the system's recommendedAction, not the legacy
        // status/fitScore window. Ingestion no longer writes `status` (it defaults to
        // NEW as a user-only lifecycle field), so selecting by `status = 'NEW'` would
        // sweep in every STORE/ALERT row. The digest is exactly the DIGEST arm.
        const digestItems = await db.query.opportunities.findMany({
            where: eq(opportunities.recommendedAction, 'DIGEST'),
        });

        if (digestItems.length > 0) {
            await sendDailyDigest(digestItems);
        }
    });

    console.log('Background worker initialized.');
};
