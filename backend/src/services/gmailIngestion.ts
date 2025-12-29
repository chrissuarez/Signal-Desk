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

export const listMessages = async (labelName: string = 'Job Alerts', maxPages: number = 5) => {
    const gmail = await getGmailService();

    // Find label ID
    const labelsRes = await gmail.users.labels.list({ userId: 'me' });
    const label = labelsRes.data.labels?.find(l => l.name === labelName);

    if (!label) {
        console.warn(`Label "${labelName}" not found.`);
        return [];
    }

    let allMessages: any[] = [];
    let pageToken: string | undefined = undefined;
    let pageCount = 0;

    // Fetch messages iteratively to handle potential downtime gaps
    do {
        const params: any = {
            userId: 'me',
            labelIds: [label.id!],
            maxResults: 50,
        };
        if (pageToken) params.pageToken = pageToken;

        const res = await gmail.users.messages.list(params);

        if (res.data.messages) {
            allMessages = [...allMessages, ...res.data.messages];
        }

        pageToken = res.data.nextPageToken || undefined;
        pageCount++;

        // Safety break if we haven't found existing messages and have too many pages
        // In a perfect system, we'd check against the DB inside this loop, 
        // but it's cleaner to fetch a batch and then process.
    } while (pageToken && pageCount < maxPages);

    return allMessages;
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
