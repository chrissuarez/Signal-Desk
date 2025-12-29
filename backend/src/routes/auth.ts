import { Router } from 'express';
import { getAuthUrl, getTokensFromCode } from '../services/gmailAuth.js';
import { db } from '../db/index.js';
import { settings } from '../db/schema.js';
import { eq } from 'drizzle-orm';

const router = Router();

router.get('/google/url', (req, res) => {
    const url = getAuthUrl();
    res.json({ url });
});

router.get('/google/login', (req, res) => {
    const url = getAuthUrl();
    res.redirect(url);
});

router.get('/google/callback', async (req, res) => {
    const { code } = req.query;
    if (!code) {
        return res.status(400).json({ error: 'Code is required' });
    }

    try {
        const tokens = await getTokensFromCode(code as string);

        // Store tokens in the settings table
        await db.insert(settings)
            .values({
                key: 'gmail_tokens',
                value: tokens,
                updatedAt: new Date(),
            })
            .onConflictDoUpdate({
                target: settings.key,
                set: {
                    value: tokens,
                    updatedAt: new Date(),
                },
            });

        // Redirect back to frontend
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
        res.redirect(`${frontendUrl}?auth=success`);
    } catch (error) {
        console.error('Error getting tokens:', error);
        res.status(500).json({ error: 'Failed to get tokens' });
    }
});

export default router;
