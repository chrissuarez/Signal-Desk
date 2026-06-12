import type { Opportunity } from '../types.js';
import { db } from '../db/index.js';
import { opportunities, feedback } from '../db/schema.js';
import { desc, eq, ne, or, isNull, sql } from 'drizzle-orm';
import { Router } from 'express';

const router = Router();

router.get('/', async (req, res) => {
    try {
        // ADR-0005 (#13): route on the system's recommendedAction — hide SUPPRESS rows
        // from the default view (kept, never deleted) and float ALERT rows to the top.
        // ADR-0001 (#4): the Strategic Score is now the ranking authority — order by it
        // (not the Fit Score), with un-scored rows last, then recency as the tiebreak.
        // (Null/legacy rows are treated as not-suppressed.)
        const items = await db.query.opportunities.findMany({
            where: or(isNull(opportunities.recommendedAction), ne(opportunities.recommendedAction, 'SUPPRESS')),
            orderBy: [
                desc(sql`${opportunities.recommendedAction} = 'ALERT'`),
                sql`${opportunities.strategicScore} DESC NULLS LAST`,
                desc(opportunities.receivedAt),
            ],
        });
        console.log(`Fetched ${items.length} opportunities for display.`);
        res.json(items);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch opportunities' });
    }
});

router.post('/:id/feedback', async (req, res) => {
    const { id } = req.params;
    const { action } = req.body;

    try {
        const opportunityId = parseInt(id);

        // 1. Record the feedback event
        await db.insert(feedback).values({
            opportunityId,
            action: action as any,
        });

        // 2. Update the opportunity status
        const statusMap: Record<string, any> = {
            'LIKE': 'SAVED',
            'DISLIKE': 'DISMISSED',
            'APPLIED': 'APPLIED',
        };

        if (statusMap[action]) {
            await db.update(opportunities)
                .set({ status: statusMap[action] })
                .where(eq(opportunities.id, opportunityId));
        }

        res.json({ message: 'Feedback recorded and status updated' });
    } catch (error) {
        console.error('Feedback error:', error);
        res.status(500).json({ error: 'Failed to submit feedback' });
    }
});

export default router;
