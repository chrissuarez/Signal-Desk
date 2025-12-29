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
    // TODO: Record feedback in feedback table and update opportunity status
    try {
        const statusMap: Record<string, any> = {
            'LIKE': 'SAVED',
            'DISLIKE': 'DISMISSED',
            'APPLIED': 'APPLIED',
        };

        if (statusMap[action]) {
            await db.update(opportunities)
                .set({ status: statusMap[action] })
                .where(eq(opportunities.id, parseInt(id)));
        }

        res.json({ message: 'Feedback received' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to submit feedback' });
    }
});

export default router;
