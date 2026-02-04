/**
 * Shared industry normalization logic for the backend.
 * Mirroring the logic from frontend/src/lib/industryUtils.ts
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

export function splitIndustries(industryStr: string | null): string[] {
    if (!industryStr) return [];
    return industryStr
        .split(/[,/]| & /)
        .map(s => s.trim())
        .filter(Boolean);
}

export function normalizeIndustry(industry: string): string {
    const lower = industry.toLowerCase();
    return INDUSTRY_CONSOLIDATION_MAP[lower] || industry;
}
