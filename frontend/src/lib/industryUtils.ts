/**
 * This utility handles splitting and normalizing industry strings from opportunities.
 * Many opportunities have composite industry strings (e.g. "Marketing, Pharmaceutical").
 * We want to split these and consolidate variations (e.g. "Pharmaceuticals" vs "Pharmaceutical").
 */

const INDUSTRY_CONSOLIDATION_MAP: Record<string, string> = {
    // Pharmaceuticals & Healthcare
    "pharmaceutical": "Pharmaceuticals",
    "pharmaceuticals": "Pharmaceuticals",
    "healthcare": "Healthcare & Medical",
    "medical": "Healthcare & Medical",
    "wellness": "Healthcare & Medical",

    // Technology & IT
    "it": "Technology & IT",
    "technology": "Technology & IT",
    "infrastructure": "Technology & IT",
    "cloud computing": "Technology & IT",
    "engineering": "Technology & IT",
    "data analytics": "Technology & IT",

    // Marketing & Digital
    "marketing": "Marketing & Digital",
    "digital marketing": "Marketing & Digital",
    "digital": "Marketing & Digital",
    "communications": "Marketing & Digital",

    // Retail & E-commerce
    "retail": "Retail & E-commerce",
    "e-commerce": "Retail & E-commerce",

    // Finance
    "banking": "Financial Services",
    "fintech": "Financial Services",
    "financial services": "Financial Services",

    // Government & Public Sector
    "government": "Public Sector",
    "public sector": "Public Sector",
    "law enforcement": "Public Sector",
};

/**
 * Splits an industry string into individual parts based on common delimiters.
 */
export function splitIndustries(industryStr: string | null): string[] {
    if (!industryStr) return [];
    // Split by comma, slash, or " & "
    return industryStr
        .split(/[,/]| & /)
        .map(s => s.trim())
        .filter(Boolean);
}

/**
 * Normalizes a single industry segment to a consolidated high-level category if applicable.
 */
export function normalizeIndustry(industry: string): string {
    const lower = industry.toLowerCase();
    return INDUSTRY_CONSOLIDATION_MAP[lower] || industry;
}

/**
 * Gets a unique set of consolidated industries from a list of opportunities.
 */
export function getRefinedIndustryList(opportunities: { industry: string | null }[]): string[] {
    const allRefined = opportunities.flatMap(opp =>
        splitIndustries(opp.industry).map(normalizeIndustry)
    );
    return Array.from(new Set(allRefined)).sort();
}

/**
 * Checks if an opportunity's industry matches a refined industry category.
 */
export function opportunityHasRefinedIndustry(industryStr: string | null, refinedIndustry: string): boolean {
    if (!industryStr) return false;
    return splitIndustries(industryStr)
        .map(normalizeIndustry)
        .includes(refinedIndustry);
}
