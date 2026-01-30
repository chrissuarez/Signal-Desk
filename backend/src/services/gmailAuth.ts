import { google } from 'googleapis';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../../../.env') });

const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];

export const getOAuthClient = (tokens?: any) => {
    const client = new google.auth.OAuth2(
        process.env.GMAIL_CLIENT_ID,
        process.env.GMAIL_CLIENT_SECRET,
        process.env.GMAIL_REDIRECT_URI
    );

    if (tokens) {
        client.setCredentials(tokens);
    }

    // Listen for token refreshes and save them
    client.on('tokens', async (newTokens: any) => {
        console.log('Received new tokens from Google OAuth2 client refresh');
        const { db } = await import('../db/index.js');
        const { settings } = await import('../db/schema.js');

        // Merging with existing tokens to preserve the refresh_token if not provided in the event
        const currentTokens = tokens || {};
        const updatedTokens = { ...currentTokens, ...newTokens };

        await db.insert(settings)
            .values({
                key: 'gmail_tokens',
                value: updatedTokens,
                updatedAt: new Date(),
            })
            .onConflictDoUpdate({
                target: settings.key,
                set: {
                    value: updatedTokens,
                    updatedAt: new Date(),
                },
            });
    });

    return client;
};

export const getAuthUrl = () => {
    const client = getOAuthClient();
    return client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
        prompt: 'consent',
    });
};

export const getTokensFromCode = async (code: string) => {
    const client = getOAuthClient();
    const { tokens } = await client.getToken(code);
    return tokens;
};

