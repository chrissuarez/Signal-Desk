/**
 * Simplified industry refinement utility.
 * The AI service now enforces strict taxonomy at ingestion, so extensive normalization maps are no longer needed.
 */

// Keep a minimal map for legacy data display or fallback.
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
    return LEGACY_NORMALIZATION_MAP[industry.toLowerCase()] || industry;
}

export function getRefinedIndustryList(opportunities: { industry: string | null }[]): string[] {
    const allRefined = opportunities.flatMap(opp =>
        splitIndustries(opp.industry).map(normalizeIndustry)
    );
    return Array.from(new Set(allRefined)).sort();
}

export function opportunityHasRefinedIndustry(industryStr: string | null, refinedIndustry: string): boolean {
    if (!industryStr) return false;
    return splitIndustries(industryStr)
        .map(normalizeIndustry)
        .includes(refinedIndustry);
}
