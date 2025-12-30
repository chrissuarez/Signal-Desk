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
    sourceUrl?: string;
    reasons: string[];
    concerns: string[];
}

export const analyzeOpportunityWithAI = async (text: string): Promise<AIAnalysisResult> => {
    if (!process.env.GEMINI_API_KEY) {
        throw new Error('GEMINI_API_KEY is not set');
    }

    const prompt = `
    Analyze the following email content and determine if it contains specific job opportunities, business opportunities (tenders/contracts), or is just noise (newsletters, promotions, spam).
    
    NOTE: This email may be a "digest" or "job alert" listing multiple roles. In this case, identify the most significant or relevant professional role described.
    
    If it contains a JOB or BUSINESS opportunity:
    1. Extract the title and company.
    2. Extract the direct link (URL) to the position if available in the text.
    3. Provide a list of reasons why it qualifies and any concerns.
    
    Return the result EXACTLY in the following JSON format:
    {
      "type": "JOB" | "BUSINESS" | "NOISE",
      "title": "Extracted Title (or descriptive summary if multiple relevant roles)",
      "company": "Extracted Company",
      "description": "Brief summarized description (max 200 words). If multiple roles, mention the top 2-3.",
      "sourceUrl": "Direct URL to the position/job page if found, otherwise null",
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
