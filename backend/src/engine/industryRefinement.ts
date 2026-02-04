/**
 * Simplified industry refinement utility.
 * The AI service now enforces strict taxonomy at ingestion, so extensive normalization maps are no longer needed.
 */

// Keep a minimal map for legacy data cleanup if needed, or fallback cases.
const LEGACY_NORMALIZATION_MAP: Record<string, string> = {
    "pharmaceuticals": "Healthcare & Life Sciences",
    "healthcare": "Healthcare & Life Sciences",
    "technology": "Technology & Software",
    "it": "Technology & Software",
    "marketing": "Marketing, Creative & Digital",
    "finance": "Financial Services",
    "retail": "Retail & CPG"
};

export function splitIndustries(industryStr: string | null): string[] {
    if (!industryStr) return [];
    return industryStr.split(/[,/]| & /).map(s => s.trim()).filter(Boolean);
}

export function normalizeIndustry(industry: string): string {
    // Pass-through if already valid, otherwise try basic normalization
    return LEGACY_NORMALIZATION_MAP[industry.toLowerCase()] || industry;
}
