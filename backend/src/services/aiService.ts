import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../../../.env') });

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

export interface AIAnalysisResult {
    type: 'JOB' | 'BUSINESS' | 'NOISE';
    title: string;
    company: string;
    description: string;
    reasons: string[];
    concerns: string[];
}

export const analyzeOpportunityWithAI = async (text: string): Promise<AIAnalysisResult> => {
    if (!process.env.GEMINI_API_KEY) {
        throw new Error('GEMINI_API_KEY is not set');
    }

    const prompt = `
    Analyze the following email content and determine if it is a specific job opportunity, a business opportunity (tender/contract), or noise (newsletters, promotions, spam, general info).
    
    If it is a JOB or BUSINESS opportunity, extract the title and company.
    Provide a list of reasons why it qualifies and any concerns.
    
    Return the result EXACTLY in the following JSON format:
    {
      "type": "JOB" | "BUSINESS" | "NOISE",
      "title": "Extracted Title",
      "company": "Extracted Company",
      "description": "Brief summarized description (max 200 words)",
      "reasons": ["reason 1", "reason 2"],
      "concerns": ["concern 1", "concern 2"]
    }
    
    Email Content:
    ${text}
  `;

    try {
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const jsonStr = response.text().replace(/```json|```/g, '').trim();
        return JSON.parse(jsonStr) as AIAnalysisResult;
    } catch (error) {
        console.error('AI Analysis failed:', error);
        // Fallback to basic noise if AI fails
        return {
            type: 'NOISE',
            title: 'Unknown',
            company: 'Unknown',
            description: text,
            reasons: [],
            concerns: ['AI Analysis failed']
        };
    }
};
