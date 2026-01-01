import { listMessages, getMessageContent } from './gmailIngestion.js';
import { parseEmailBody, classifyOpportunity } from '../engine/parser.js';
import { calculateFitScore } from '../engine/scoring.js';
import { sendImmediateAlert } from './notificationService.js';
import { analyzeOpportunityWithAI } from './aiService.js';
import { db } from '../db/index.js';
import { opportunities, settings } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';

export const runIngestion = async (options: { force?: boolean, limit?: number } = {}) => {
    const { force = false, limit = 50 } = options;
    console.log(`Starting ingestion run (Force: ${force}, Limit: ${limit})...`);

    try {
        const messages = await listMessages('Job Alerts', Math.ceil(limit / 50));
        const messagesToProcess = messages.slice(0, limit);
        if (messages.length === 0) {
            console.log('No messages found to process. Check your GMAIL_LABEL or if emails are arriving.');
        } else {
            console.log(`Found ${messages.length} messages. Processing up to ${limit}.`);
        }

        for (const msg of messagesToProcess) {
            if (!msg.id) continue;

            // Check for deduplication
            const existing = await db.query.opportunities.findFirst({
                where: eq(opportunities.canonicalUrl, `gmail://${msg.id}`),
            });

            if (existing && !force) {
                console.log(`Message ${msg.id} already processed. Skipping.`);
                continue;
            }

            const content = (await getMessageContent(msg.id)) as any;
            const body = content.fullBody || content.snippet || '';
            const subject = content.payload?.headers?.find((h: any) => h.name === 'Subject')?.value || 'No Subject';
            const from = content.payload?.headers?.find((h: any) => h.name === 'From')?.value || 'Unknown';

            let analysis;
            if (process.env.GEMINI_API_KEY) {
                console.log(`Analyzing message ${msg.id} with AI (Length: ${body.length})...`);
                analysis = await analyzeOpportunityWithAI(body);
            } else {
                // Fallback to basic heuristics
                const type = classifyOpportunity(body);
                const parsed = parseEmailBody(body);
                analysis = {
                    type,
                    title: parsed.title === 'Unknown Position' ? subject : parsed.title,
                    company: parsed.company,
                    description: body,
                    reasons: [],
                    concerns: ['AI analysis skipped (no API key)']
                };
            }

            if (analysis.type === 'NOISE') {
                console.log(`Message ${msg.id} classified as NOISE. Skipping.`);
                continue;
            }

            // Fetch preferences
            const prefsRecord = await db.query.settings.findFirst({
                where: eq(settings.key, 'user_preferences')
            });
            const preferences = (prefsRecord?.value as any) || {
                keywords: ['Software Engineer', 'AI', 'Fullstack', 'TypeScript'],
                locations: ['Remote', 'London'],
            };

            const fit = calculateFitScore({
                title: analysis.title,
                description: body,
                preferences,
            });

            const inserted = await db.insert(opportunities).values({
                type: analysis.type,
                source: 'EMAIL',
                origin: from,
                receivedAt: new Date(parseInt(content.internalDate || Date.now().toString())),
                canonicalUrl: `gmail://${msg.id}`,
                title: analysis.title,
                company: analysis.company,
                description: analysis.description,
                sourceUrl: analysis.sourceUrl || null,
                fitScore: fit.score,
                reasons: [...analysis.reasons, ...fit.reasons],
                concerns: [...analysis.concerns, ...fit.concerns],
                status: 'NEW',
            }).onConflictDoUpdate({
                target: opportunities.canonicalUrl,
                set: {
                    title: analysis.title,
                    company: analysis.company,
                    description: analysis.description,
                    sourceUrl: analysis.sourceUrl || null,
                    fitScore: fit.score,
                    reasons: [...analysis.reasons, ...fit.reasons],
                    concerns: [...analysis.concerns, ...fit.concerns],
                    updatedAt: new Date(),
                }
            }).returning();

            if (fit.score >= 80 && inserted[0]) {
                await sendImmediateAlert(inserted[0]);
            }

            console.log(`Ingested ${analysis.title} at ${analysis.company} (Score: ${fit.score})`);
        }

        console.log('Ingestion run complete.');
    } catch (error) {
        console.error('Error during ingestion run:', error);
    }
};
