import { google } from 'googleapis';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../../../.env') });

const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];

export const getOAuthClient = () => {
    return new google.auth.OAuth2(
        process.env.GMAIL_CLIENT_ID,
        process.env.GMAIL_CLIENT_SECRET,
        process.env.GMAIL_REDIRECT_URI
    );
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
