import { listMessages, getMessageContent } from './gmailIngestion.js';
import { parseEmailBody, classifyOpportunity } from '../engine/parser.js';
import { calculateFitScore } from '../engine/scoring.js';
import { sendImmediateAlert } from './notificationService.js';
import { db } from '../db/index.js';
import { opportunities, settings } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';

export const runIngestion = async () => {
    console.log('Starting ingestion run...');

    try {
        const messages = await listMessages();
        console.log(`Found ${messages.length} messages to process.`);

        for (const msg of messages) {
            if (!msg.id) continue;

            // Check for deduplication
            const existing = await db.query.opportunities.findFirst({
                where: eq(opportunities.canonicalUrl, `gmail://${msg.id}`), // Using msgId as canonicalUrl for now
            });

            if (existing) {
                console.log(`Message ${msg.id} already processed. Skipping.`);
                continue;
            }

            const content = await getMessageContent(msg.id);
            const body = content.snippet || ''; // Simplify for v1
            const subject = content.payload?.headers?.find(h => h.name === 'Subject')?.value || 'No Subject';
            const from = content.payload?.headers?.find(h => h.name === 'From')?.value || 'Unknown';

            const type = classifyOpportunity(body);
            if (type === 'NOISE') {
                console.log(`Message ${msg.id} classified as NOISE. Skipping.`);
                continue;
            }

            const parsed = parseEmailBody(body);
            const fit = calculateFitScore({
                title: parsed.title === 'Unknown Position' ? subject : parsed.title,
                description: body,
                preferences: {
                    keywords: ['Software Engineer', 'AI', 'Fullstack', 'TypeScript'], // Default preferences
                    locations: ['Remote', 'London'],
                },
            });

            const inserted = await db.insert(opportunities).values({
                type: type,
                source: 'EMAIL',
                origin: from,
                receivedAt: new Date(parseInt(content.internalDate || Date.now().toString())),
                canonicalUrl: `gmail://${msg.id}`,
                title: parsed.title === 'Unknown Position' ? subject : parsed.title,
                company: parsed.company,
                description: body,
                fitScore: fit.score,
                reasons: fit.reasons,
                concerns: fit.concerns,
                status: 'NEW',
            }).returning();

            if (fit.score >= 80 && inserted[0]) {
                await sendImmediateAlert(inserted[0]);
            }

            console.log(`Ingested ${parsed.title} at ${parsed.company} (Score: ${fit.score})`);
        }

        console.log('Ingestion run complete.');
    } catch (error) {
        console.error('Error during ingestion run:', error);
    }
};
