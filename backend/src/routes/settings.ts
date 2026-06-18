import { Router } from 'express';
import { db } from '../db/index.js';
import { settings } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { validatePreferences } from '../services/ingestion/preferences.js';

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
        let value = req.body;
        console.log(`Updating setting [${key}] with body:`, JSON.stringify(value));

        // The write boundary for typed keys (#16): the dashboard and ingestion share one
        // Preferences schema, so a `user_preferences` write that diverges is rejected here
        // (fail loud) rather than stored to silently degrade to defaults on the next read.
        // Untyped keys (gmail_tokens, strategic_guardrails) are opaque blobs — pass through.
        if (key === 'user_preferences') {
            const parsed = validatePreferences(value);
            if (!parsed.ok) {
                console.warn(`Rejected invalid user_preferences write:`, parsed.error);
                return res.status(400).json({ error: 'Invalid user_preferences', details: parsed.error });
            }
            value = parsed.value; // persist only the normalized, contracted shape
        }

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
