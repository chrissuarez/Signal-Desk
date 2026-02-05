import { db } from '../db/index.js';
import { opportunities } from '../db/schema.js';
import { normalizeJobTitle } from '../engine/jobTitleRefinement.js';
import { eq } from 'drizzle-orm';

async function cleanup() {
    console.log('Starting job title cleanup...');

    const allOpps = await db.query.opportunities.findMany();
    console.log(`Found ${allOpps.length} opportunities to process.`);

    let updatedCount = 0;

    for (const opp of allOpps) {
        const newTitle = normalizeJobTitle(opp.title);
        if (newTitle !== opp.title) {
            console.log(`Updating: "${opp.title}" -> "${newTitle}"`);
            await db.update(opportunities)
                .set({ title: newTitle, updatedAt: new Date() })
                .where(eq(opportunities.id, opp.id));
            updatedCount++;
        }
    }

    console.log(`Cleanup complete. Updated ${updatedCount} job titles.`);
    process.exit(0);
}

cleanup().catch(err => {
    console.error('Cleanup failed:', err);
    process.exit(1);
});
