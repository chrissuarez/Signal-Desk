import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { coerceStrategicCategory, type StrategicCategory } from '../engine/strategicVocabulary.js';
import {
  parseStrategicAnalysis,
  EMPTY_STRATEGIC_ANALYSIS,
  type StrategicAnalysis,
} from '../engine/strategicAnalysis.js';

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
  /**
   * The LLM-judged Strategic Analysis block (#3) — the five Component Scores (sans
   * practicalFit, which is the demoted Fit Score), two risk flags, narrative fields and
   * array fields. Always present (validated, never throws); fields are null/[] when the
   * LLM omitted them. No aggregation/reconciliation here — that's #4/#5.
   */
  strategicAnalysis: StrategicAnalysis;
}

/**
 * Concern stamped on the sentinel NOISE row that {@link analyzeOpportunityWithAI} returns
 * when a Gemini/parse failure is swallowed (rather than throwing). Exported so the extraction
 * seam can tell a *failed* analysis apart from a genuine all-NOISE digest — see
 * {@link isAiAnalysisFailure}.
 */
export const AI_ANALYSIS_FAILED_CONCERN = 'AI Analysis failed';

/**
 * True when `results` is the swallowed-failure sentinel (a lone NOISE row carrying
 * {@link AI_ANALYSIS_FAILED_CONCERN}) rather than a real analysis. A genuine all-NOISE digest
 * (newsletter with no roles) never carries this concern, so this stays false for it.
 */
export const isAiAnalysisFailure = (results: AIAnalysisResult[]): boolean =>
  results.length === 1 &&
  results[0]?.type === 'NOISE' &&
  (results[0]?.concerns?.includes(AI_ANALYSIS_FAILED_CONCERN) ?? false);

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

    STRATEGIC ANALYSIS:
    For each opportunity, judge how it serves someone building toward an agency
    delivery-visibility / resourcing-insights consultancy. Score each of these five
    Component Scores from 0 (none) to 100 (excellent):
    - consultancyAlignment: how directly the role compounds toward that consultancy goal.
    - deliveryVisibility: how much ownership/visibility it gives over delivery and
      resource/capacity management.
    - commercialProximity: proximity to commercial decisions, P&L, or client/account
      ownership.
    - buyerEnvironmentFit: how well it sits inside the kind of buyer environment that
      consultancy would later sell into.
    - seniorityScope: the seniority and breadth of remit.
    (Do NOT score practical/location/salary fit — that is computed separately.)
    Also judge two risks, each "LOW" | "MEDIUM" | "HIGH":
    - resourceAdminTrapRisk: risk this is low-leverage resourcing/scheduling/coordination
      admin dressed up as strategic.
    - seoComfortZoneRisk: risk this is a familiar SEO/search/content comfort-zone role
      that does not advance the strategic goal.
    And provide the narrative:
    - realRoleInterpretation: what the job actually is underneath the title.
    - consultancyRelevance: how (or whether) it builds toward the consultancy.
    - strategicReasons: reasons it is strategically valuable.
    - strategicConcerns: strategic concerns or red flags.
    - recommendedScreeningQuestions: questions to ask to verify the real role.

    For each JOB or BUSINESS opportunity:
    1. Extract the title, company, and precise location.
    2. Assign the single most relevant "industry" from the list above.
    3. Determine Remote Status (Remote, Hybrid, or On-site) based on text clues.
    4. Extract the direct link (URL) to the position if available in the text.
    5. Provide a list of reasons why it qualifies and any concerns.
    6. Assign the single best "strategicCategory" from the six values above.
    7. Produce the full STRATEGIC ANALYSIS fields described above.

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
        "strategicCategory": "One of the six Strategic Category values above",
        "consultancyAlignment": 0,
        "deliveryVisibility": 0,
        "commercialProximity": 0,
        "buyerEnvironmentFit": 0,
        "seniorityScope": 0,
        "resourceAdminTrapRisk": "LOW" | "MEDIUM" | "HIGH",
        "seoComfortZoneRisk": "LOW" | "MEDIUM" | "HIGH",
        "realRoleInterpretation": "What the role actually is underneath the title.",
        "consultancyRelevance": "How it does or doesn't build toward the consultancy.",
        "strategicReasons": ["strategic reason 1"],
        "strategicConcerns": ["strategic concern 1"],
        "recommendedScreeningQuestions": ["question 1"]
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
    // Validate the untrusted LLM output: the category against the six known labels (#2)
    // and the strategic block through the zod boundary (#3). Both degrade malformed
    // values to null/[] rather than throwing, so a bad payload can't poison a write.
    return results.map((o: any) => ({
      ...o,
      strategicCategory: coerceStrategicCategory(o?.strategicCategory),
      strategicAnalysis: parseStrategicAnalysis(o),
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
      concerns: [AI_ANALYSIS_FAILED_CONCERN],
      strategicCategory: null,
      strategicAnalysis: EMPTY_STRATEGIC_ANALYSIS
    }];
  }
};
