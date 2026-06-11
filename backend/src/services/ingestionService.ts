import { parseEmailBody, classifyOpportunity } from '../engine/parser.js';
import { calculateFitScore } from '../engine/scoring.js';
import { sendImmediateAlert } from './notificationService.js';
import { analyzeOpportunityWithAI } from './aiService.js';
import { scrapeJobDescription } from './scraperService.js';
import { db } from '../db/index.js';
import { opportunities, settings } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { dbPersist } from './ingestion/persist.js';
import { gmailIntake } from './ingestion/intake.js';

export const runIngestion = async (options: { force?: boolean, limit?: number } = {}) => {
    const { force = false, limit = 50 } = options;
    console.log(`Starting ingestion run (Force: ${force}, Limit: ${limit})...`);

    try {
        const sources = await gmailIntake.fetchSources('Job Alerts', limit);

        for (const source of sources) {
            const { messageId, subject, from, body, internalDate } = source;

            // COST OPTIMIZATION: Check if this message was already processed
            // by looking for the first indexed job (#0)
            if (!force) {
                const alreadyProcessed = await db.query.opportunities.findFirst({
                    where: eq(opportunities.canonicalUrl, `gmail://${messageId}#0`),
                });
                if (alreadyProcessed) {
                    console.log(`Message ${messageId} already analyzed. Skipping AI call.`);
                    continue;
                }
            }

            let analysisResults: any[] = [];
            if (process.env.GEMINI_API_KEY) {
                console.log(`Analyzing message ${messageId} with AI (Length: ${body.length})...`);
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

                const canonicalUrl = `gmail://${messageId}#${i}`;

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

                const insertedRow = await dbPersist.upsertByCanonicalUrl({
                    type: analysis.type,
                    source: 'EMAIL',
                    origin: from,
                    receivedAt: new Date(parseInt(internalDate || Date.now().toString())),
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
                }, {
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
                });

                if (fit.score >= 80 && insertedRow && insertedRow.status !== 'DISMISSED') {
                    await sendImmediateAlert(insertedRow);
                }

                // TIER 3: Deep Scrape for high-potential jobs
                if (fit.score > 60 && analysis.sourceUrl && !existing) {
                    console.log(`Tier 3: Triggering Deep Scrape for ${analysis.title} at ${analysis.company}...`);
                    const scraped = await scrapeJobDescription(analysis.sourceUrl);
                    if (scraped && scraped.description.length > 500) {
                        console.log(`Tier 3: Re-analyzing with full description (Length: ${scraped.description.length})...`);
                        const deepAnalysis = await analyzeOpportunityWithAI(scraped.description);
                        const finalAnalysis = deepAnalysis?.[0];
                        if (finalAnalysis && insertedRow?.id) {
                            const finalFit = calculateFitScore({
                                title: finalAnalysis.title,
                                description: scraped.description,
                                industry: finalAnalysis.industry,
                                location: finalAnalysis.location,
                                preferences,
                            });

                            await dbPersist.updateById(insertedRow.id, {
                                description: scraped.description,
                                requirements: finalAnalysis.reasons.join(', '), // Using reasons as a proxy for raw requirements extract
                                fitScore: finalFit.score,
                                reasons: [...finalAnalysis.reasons, ...finalFit.reasons],
                                concerns: [...finalAnalysis.concerns, ...finalFit.concerns],
                                status: finalFit.score < 40 ? 'DISMISSED' : 'NEW',
                                updatedAt: new Date(),
                            });

                            console.log(`Tier 3 Complete: ${finalAnalysis.title} re-scored to ${finalFit.score}`);
                        }
                    }
                }

                console.log(`Ingested ${analysis.title} at ${analysis.company} (Score: ${fit.score}, Industry: ${analysis.industry}) from ${canonicalUrl}`);
            }
        }

        console.log('Ingestion run complete.');
    } catch (error: any) {
        console.error('Error during ingestion run:', error.message || error);
        if (error.response?.data) {
            console.error('Error details:', JSON.stringify(error.response.data));
        }
    }
};

