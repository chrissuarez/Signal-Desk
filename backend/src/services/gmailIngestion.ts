import { google } from 'googleapis';
import { db } from '../db/index.js';
import { settings, opportunities } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { getOAuthClient } from './gmailAuth.js';

export const getGmailService = async () => {
    const gmailTokensSetting = await db.query.settings.findFirst({
        where: eq(settings.key, 'gmail_tokens'),
    });

    if (!gmailTokensSetting) {
        throw new Error('Gmail tokens not found. Please authenticate first.');
    }

    const auth = getOAuthClient();
    auth.setCredentials(gmailTokensSetting.value as any);

    return google.gmail({ version: 'v1', auth });
};

export const listMessages = async (labelName: string = 'Job Alerts') => {
    const gmail = await getGmailService();

    // Find label ID
    const labelsRes = await gmail.users.labels.list({ userId: 'me' });
    const label = labelsRes.data.labels?.find(l => l.name === labelName);

    if (!label) {
        console.warn(`Label "${labelName}" not found.`);
        return [];
    }

    const res = await gmail.users.messages.list({
        userId: 'me',
        labelIds: [label.id!],
        maxResults: 50,
    });

    return res.data.messages || [];
};

export const getMessageContent = async (messageId: string) => {
    const gmail = await getGmailService();
    const res = await gmail.users.messages.get({
        userId: 'me',
        id: messageId,
        format: 'full',
    });

    return res.data;
};
