import { Router } from 'express';
import { db } from '../db/index.js';
import { settings } from '../db/schema.js';
import { eq } from 'drizzle-orm';

const router = Router();

// Get settings by key
router.get('/:key', async (req, res) => {
    try {
        const result = await db.query.settings.findFirst({
            where: eq(settings.key, req.params.key)
        });
        res.json(result?.value || {});
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch settings' });
    }
});

// Update settings by key
router.post('/:key', async (req, res) => {
    try {
        const { key } = req.params;
        const value = req.body;
        console.log(`Updating setting [${key}] with body:`, JSON.stringify(value));

        await db.insert(settings)
            .values({ key, value })
            .onConflictDoUpdate({
                target: settings.key,
                set: { value, updatedAt: new Date() }
            });

        res.json({ success: true });
    } catch (error) {
        console.error(`Failed to update settings for ${req.params.key}:`, error);
        res.status(500).json({ error: 'Failed to update settings' });
    }
});

export default router;
