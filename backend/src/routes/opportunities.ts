import type { Opportunity } from '../types.js';
import { db } from '../db/index.js';
import { opportunities } from '../db/schema.js';
import { desc, eq } from 'drizzle-orm';
import { Router } from 'express';

const router = Router();

router.get('/', async (req, res) => {
    try {
        const items = await db.query.opportunities.findMany({
            orderBy: [desc(opportunities.receivedAt)],
        });
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
