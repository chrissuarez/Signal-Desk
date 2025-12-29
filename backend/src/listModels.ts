import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../../.env') });

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

async function list() {
    try {
        const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash-latest' }); // Just to check if we can even get a model object
        const result = await genAI.listModels();
        console.log('Available models:');
        result.models.forEach(m => console.log(m.name));
    } catch (e) {
        console.error('Failed to list models:', e);
    }
}

list();
