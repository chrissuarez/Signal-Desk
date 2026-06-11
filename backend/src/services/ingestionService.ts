import { legacyScoreReconcile } from '../engine/scoreReconcile.js';
import { legacyPreFilter } from '../engine/strategicPreFilter.js';
import { legacyRoute } from '../engine/recommendedActionRouting.js';
import { sendImmediateAlert } from './notificationService.js';
import { db } from '../db/index.js';
import { opportunities, settings } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { dbPersist } from './ingestion/persist.js';
import { gmailIntake } from './ingestion/intake.js';
import { defaultExtraction } from './ingestion/extraction.js';
import { httpDeepScrape } from './ingestion/deepScrape.js';
import { aiStrategicAnalysis } from './ingestion/strategicAnalysis.js';

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

            const analysisResults = await defaultExtraction.extract(source);

            // Fetch preferences once per email digest
            const prefsRecord = await db.query.settings.findFirst({
                where: eq(settings.key, 'user_preferences')
            });
            const preferences = (prefsRecord?.value as any) || {
                keywords: ['Software Engineer', 'AI', 'Fullstack', 'TypeScript'],
                locations: ['Remote', 'London'],
            };

            for (const [i, analysis] of analysisResults.entries()) {
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

                const scored = legacyScoreReconcile({
                    title: analysis.title,
                    description: body,
                    ...(analysis.industry !== undefined ? { industry: analysis.industry } : {}),
                    ...(analysis.location !== undefined ? { location: analysis.location } : {}),
                    preferences,
                });
                // Temporary shim onto the old { score } shape; commit 11 thins this away.
                const fit = { score: scored.fitScore, reasons: scored.reasons, concerns: scored.concerns };
                const routing = legacyRoute({ fitScore: fit.score });

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
                    status: routing.status,
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

                if (routing.shouldAlert && insertedRow && insertedRow.status !== 'DISMISSED') {
                    await sendImmediateAlert(insertedRow);
                }

                // PASS 2: Deep Scrape for high-potential jobs
                if (legacyPreFilter({ fitScore: fit.score }) && analysis.sourceUrl && !existing) {
                    console.log(`Pass 2: Triggering Deep Scrape for ${analysis.title} at ${analysis.company}...`);
                    const scraped = await httpDeepScrape.scrape(analysis.sourceUrl);
                    if (scraped && scraped.description.length > 500) {
                        console.log(`Pass 2: Re-analyzing with full description (Length: ${scraped.description.length})...`);
                        const deepAnalysis = await aiStrategicAnalysis.analyze(scraped.description);
                        const finalAnalysis = deepAnalysis?.[0];
                        if (finalAnalysis && insertedRow?.id) {
                            const finalScored = legacyScoreReconcile({
                                title: finalAnalysis.title,
                                description: scraped.description,
                                industry: finalAnalysis.industry,
                                location: finalAnalysis.location,
                                preferences,
                            });
                            // Temporary shim onto the old { score } shape; commit 11 thins this away.
                            const finalFit = { score: finalScored.fitScore, reasons: finalScored.reasons, concerns: finalScored.concerns };
                            const finalRouting = legacyRoute({ fitScore: finalFit.score });

                            await dbPersist.updateById(insertedRow.id, {
                                description: scraped.description,
                                requirements: finalAnalysis.reasons.join(', '), // Using reasons as a proxy for raw requirements extract
                                fitScore: finalFit.score,
                                reasons: [...finalAnalysis.reasons, ...finalFit.reasons],
                                concerns: [...finalAnalysis.concerns, ...finalFit.concerns],
                                status: finalRouting.status,
                                updatedAt: new Date(),
                            });

                            console.log(`Pass 2 Complete: ${finalAnalysis.title} re-scored to ${finalFit.score}`);
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

