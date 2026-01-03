import { listMessages, getMessageContent } from './gmailIngestion.js';
import { parseEmailBody, classifyOpportunity } from '../engine/parser.js';
import { calculateFitScore } from '../engine/scoring.js';
import { sendImmediateAlert } from './notificationService.js';
import { analyzeOpportunityWithAI } from './aiService.js';
import { scrapeJobDescription } from './scraperService.js';
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

            const content = (await getMessageContent(msg.id)) as any;
            const body = content.fullBody || content.snippet || '';
            const subject = content.payload?.headers?.find((h: any) => h.name === 'Subject')?.value || 'No Subject';
            const from = content.payload?.headers?.find((h: any) => h.name === 'From')?.value || 'Unknown';

            // COST OPTIMIZATION: Check if this message was already processed 
            // by looking for the first indexed job (#0)
            if (!force) {
                const alreadyProcessed = await db.query.opportunities.findFirst({
                    where: eq(opportunities.canonicalUrl, `gmail://${msg.id}#0`),
                });
                if (alreadyProcessed) {
                    console.log(`Message ${msg.id} already analyzed. Skipping AI call.`);
                    continue;
                }
            }

            let analysisResults: any[] = [];
            if (process.env.GEMINI_API_KEY) {
                console.log(`Analyzing message ${msg.id} with AI (Length: ${body.length})...`);
                analysisResults = await analyzeOpportunityWithAI(body);
            } else {
                const type = classifyOpportunity(body);
                const parsed = parseEmailBody(body);
                analysisResults = [{
                    type,
                    title: parsed.title === 'Unknown Position' ? subject : parsed.title,
                    company: parsed.company,
                    description: body,
                    reasons: [],
                    concerns: ['AI analysis skipped (no API key)']
                }];
            }

            // Fetch preferences once per email digest
            const prefsRecord = await db.query.settings.findFirst({
                where: eq(settings.key, 'user_preferences')
            });
            const preferences = (prefsRecord?.value as any) || {
                keywords: ['Software Engineer', 'AI', 'Fullstack', 'TypeScript'],
                locations: ['Remote', 'London'],
            };

            for (let i = 0; i < analysisResults.length; i++) {
                const analysis = analysisResults[i];
                if (analysis.type === 'NOISE') continue;

                const canonicalUrl = `gmail://${msg.id}#${i}`;

                // Deduplication check for this specific job in the digest
                const existing = await db.query.opportunities.findFirst({
                    where: eq(opportunities.canonicalUrl, canonicalUrl),
                });

                if (existing && !force) {
                    console.log(`Opportunity ${canonicalUrl} already processed. Skipping.`);
                    continue;
                }

                const fit = calculateFitScore({
                    title: analysis.title,
                    description: body,
                    industry: analysis.industry,
                    location: analysis.location,
                    preferences,
                });

                const inserted = await db.insert(opportunities).values({
                    type: analysis.type,
                    source: 'EMAIL',
                    origin: from,
                    receivedAt: new Date(parseInt(content.internalDate || Date.now().toString())),
                    canonicalUrl,
                    title: analysis.title,
                    company: analysis.company,
                    industry: analysis.industry,
                    location: analysis.location,
                    remoteStatus: analysis.remoteStatus,
                    description: analysis.description,
                    sourceUrl: analysis.sourceUrl || null,
                    fitScore: fit.score,
                    reasons: [...analysis.reasons, ...fit.reasons],
                    concerns: [...analysis.concerns, ...fit.concerns],
                    status: fit.score < 40 ? 'DISMISSED' : 'NEW',
                }).onConflictDoUpdate({
                    target: opportunities.canonicalUrl,
                    set: {
                        title: analysis.title,
                        company: analysis.company,
                        industry: analysis.industry,
                        location: analysis.location,
                        remoteStatus: analysis.remoteStatus,
                        description: analysis.description,
                        sourceUrl: analysis.sourceUrl || null,
                        fitScore: fit.score,
                        reasons: [...analysis.reasons, ...fit.reasons],
                        concerns: [...analysis.concerns, ...fit.concerns],
                        updatedAt: new Date(),
                    }
                }).returning();

                if (fit.score >= 80 && inserted[0] && inserted[0].status !== 'DISMISSED') {
                    await sendImmediateAlert(inserted[0]);
                }

                // TIER 3: Deep Scrape for high-potential jobs
                if (fit.score > 60 && analysis.sourceUrl && !existing) {
                    console.log(`Tier 3: Triggering Deep Scrape for ${analysis.title} at ${analysis.company}...`);
                    const scraped = await scrapeJobDescription(analysis.sourceUrl);
                    if (scraped && scraped.description.length > 500) {
                        console.log(`Tier 3: Re-analyzing with full description (Length: ${scraped.description.length})...`);
                        const deepAnalysis = await analyzeOpportunityWithAI(scraped.description);
                        const finalAnalysis = deepAnalysis?.[0];
                        if (finalAnalysis && inserted[0]?.id) {
                            const finalFit = calculateFitScore({
                                title: finalAnalysis.title,
                                description: scraped.description,
                                industry: finalAnalysis.industry,
                                location: finalAnalysis.location,
                                preferences,
                            });

                            await db.update(opportunities).set({
                                description: scraped.description,
                                requirements: finalAnalysis.reasons.join(', '), // Using reasons as a proxy for raw requirements extract
                                fitScore: finalFit.score,
                                reasons: [...finalAnalysis.reasons, ...finalFit.reasons],
                                concerns: [...finalAnalysis.concerns, ...finalFit.concerns],
                                status: finalFit.score < 40 ? 'DISMISSED' : 'NEW',
                                updatedAt: new Date(),
                            }).where(eq(opportunities.id, inserted[0].id));

                            console.log(`Tier 3 Complete: ${finalAnalysis.title} re-scored to ${finalFit.score}`);
                        }
                    }
                }

                console.log(`Ingested ${analysis.title} at ${analysis.company} (Score: ${fit.score}, Industry: ${analysis.industry}) from ${canonicalUrl}`);
            }
        }

        console.log('Ingestion run complete.');
    } catch (error) {
        console.error('Error during ingestion run:', error);
    }
};
