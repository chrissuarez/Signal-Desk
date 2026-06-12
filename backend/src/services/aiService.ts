import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { coerceStrategicCategory, type StrategicCategory } from '../engine/strategicVocabulary.js';

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
  /** The six-label Strategic Category proposed by the LLM (#2); null if absent/unknown. */
  strategicCategory: StrategicCategory | null;
}

export const analyzeOpportunityWithAI = async (text: string): Promise<AIAnalysisResult[]> => {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not set');
  }

  const prompt = `
    Analyze the following email content and extract ALL specific job opportunities or business opportunities (tenders/contracts). 
    If the email is a digest, job alert, or listing, extract EVERY distinct role or opportunity mentioned.
    If no opportunities are found, return a single entry with type "NOISE".

    STRICT INDUSTRY CLASSIFICATION:
    You MUST classify each opportunity into EXACTLY ONE of the following high-level industries:
    - Healthcare & Life Sciences
    - Technology & Software
    - Financial Services
    - Retail & CPG
    - Industrial & Energy
    - Government & Public Sector
    - Professional Services
    - Real Estate & Hospitality
    - Marketing, Creative & Digital
    - Education
    - Logistics & Transportation
    - Non-Profit & Social Impact
    - Agriculture & Food
    - Legal
    - Other

    STRATEGIC CATEGORY:
    Classify each opportunity into EXACTLY ONE Strategic Category — what *kind* of role
    it is for someone building toward an agency delivery-visibility / resourcing
    consultancy:
    - STRATEGIC_FIT: directly compounds that goal (delivery leadership, PMO, delivery
      operations, resource/capacity management at a strategic level).
    - USEFUL_BRIDGE: an adjacent role that plausibly bridges toward that goal.
    - SEO_COMFORT_ZONE: an SEO / search / content role — familiar but does not advance
      the strategic goal.
    - RESOURCE_ADMIN_TRAP: resourcing/scheduling/coordination that is administrative and
      low-leverage despite sounding relevant.
    - GENERIC_OPS_UNCLEAR: generic operations, or too vague to place.
    - REJECT: clearly off-target or irrelevant.

    For each JOB or BUSINESS opportunity:
    1. Extract the title, company, and precise location.
    2. Assign the single most relevant "industry" from the list above.
    3. Determine Remote Status (Remote, Hybrid, or On-site) based on text clues.
    4. Extract the direct link (URL) to the position if available in the text.
    5. Provide a list of reasons why it qualifies and any concerns.
    6. Assign the single best "strategicCategory" from the six values above.

    Return the result EXACTLY as a JSON array of objects:
    [
      {
        "type": "JOB" | "BUSINESS" | "NOISE",
        "title": "Extracted Title",
        "company": "Extracted Company",
        "industry": "One of the valid industries listed above",
        "location": "City, Country (if known)",
        "remoteStatus": "Remote" | "Hybrid" | "On-site",
        "description": "Brief summarized description (max 100 words).",
        "sourceUrl": "Direct URL if found, otherwise null",
        "reasons": ["reason 1", "reason 2"],
        "concerns": ["concern 1", "concern 2"],
        "strategicCategory": "One of the six Strategic Category values above"
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
    const results = Array.isArray(parsed) ? parsed : [parsed];
    // Validate the untrusted LLM category against the six known labels (#2); unknown
    // or missing → null, so a bad label degrades to "uncategorised" not a write error.
    return results.map((o: any) => ({
      ...o,
      strategicCategory: coerceStrategicCategory(o?.strategicCategory),
    }));
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
      concerns: ['AI Analysis failed'],
      strategicCategory: null
    }];
  }
};
