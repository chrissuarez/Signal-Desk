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
  industry: string;
  location: string;
  remoteStatus: string;
  description: string;
  sourceUrl?: string;
  reasons: string[];
  concerns: string[];
}

export const analyzeOpportunityWithAI = async (text: string): Promise<AIAnalysisResult[]> => {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not set');
  }

  const prompt = `
    Analyze the following email content and extract ALL specific job opportunities or business opportunities (tenders/contracts). 
    If the email is a digest, job alert, or listing, extract EVERY distinct role or opportunity mentioned.
    If no opportunities are found, return a single entry with type "NOISE".

    For each JOB or BUSINESS opportunity:
    1. Extract the title, company, industry, and precise location.
    2. Determine Remote Status (Remote, Hybrid, or On-site) based on text clues.
    3. Extract the direct link (URL) to the position if available in the text.
    4. Provide a list of reasons why it qualifies and any concerns.
    
    Return the result EXACTLY as a JSON array of objects:
    [
      {
        "type": "JOB" | "BUSINESS" | "NOISE",
        "title": "Extracted Title",
        "company": "Extracted Company",
        "industry": "Broad industry category (e.g., Marketing, Manufacturing, Medical, IT, Hospitality)",
        "location": "City, Country (if known)",
        "remoteStatus": "Remote" | "Hybrid" | "On-site",
        "description": "Brief summarized description (max 100 words).",
        "sourceUrl": "Direct URL if found, otherwise null",
        "reasons": ["reason 1", "reason 2"],
        "concerns": ["concern 1", "concern 2"]
      }
    ]
    
    Email Content:
    ${text}
  `;

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const textResponse = response.text();
    const jsonStr = textResponse.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(jsonStr);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch (error) {
    console.error('AI Analysis failed:', error);
    return [{
      type: 'NOISE',
      title: 'Unknown',
      company: 'Unknown',
      industry: 'Unknown',
      location: 'Unknown',
      remoteStatus: 'Unknown',
      description: text,
      reasons: [],
      concerns: ['AI Analysis failed']
    }];
  }
};
