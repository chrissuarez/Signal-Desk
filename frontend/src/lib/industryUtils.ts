/**
 * This utility handles splitting and normalizing industry strings from opportunities.
 * Many opportunities have composite industry strings (e.g. "Marketing, Pharmaceutical").
 * We want to split these and consolidate variations (e.g. "Pharmaceuticals" vs "Pharmaceutical").
 */

const INDUSTRY_CONSOLIDATION_MAP: Record<string, string> = {
    // Healthcare & Life Sciences
    "pharmaceutical": "Healthcare & Life Sciences",
    "pharmaceuticals": "Healthcare & Life Sciences",
    "healthcare": "Healthcare & Life Sciences",
    "health care": "Healthcare & Life Sciences",
    "medical": "Healthcare & Life Sciences",
    "medical devices": "Healthcare & Life Sciences",
    "wellness": "Healthcare & Life Sciences",
    "biotech": "Healthcare & Life Sciences",
    "biotechnology": "Healthcare & Life Sciences",
    "life sciences": "Healthcare & Life Sciences",
    "hospital": "Healthcare & Life Sciences",
    "clinical": "Healthcare & Life Sciences",

    // Technology, IT & Software
    "it": "Technology & Software",
    "technology": "Technology & Software",
    "tech": "Technology & Software",
    "software": "Technology & Software",
    "it services": "Technology & Software",
    "infrastructure": "Technology & Software",
    "cloud computing": "Technology & Software",
    "engineering": "Technology & Software", // Often tech engineering
    "data analytics": "Technology & Software",
    "artificial intelligence": "Technology & Software",
    "cybersecurity": "Technology & Software",
    "saas": "Technology & Software",
    "internet": "Technology & Software",
    "telecommunications": "Technology & Software",

    // Marketing, Creative & Digital
    "marketing": "Marketing, Creative & Digital",
    "digital marketing": "Marketing, Creative & Digital",
    "digital": "Marketing, Creative & Digital",
    "communications": "Marketing, Creative & Digital",
    "advertising": "Marketing, Creative & Digital",
    "creative services": "Marketing, Creative & Digital",
    "media": "Marketing, Creative & Digital",
    "public relations": "Marketing, Creative & Digital",
    "design": "Marketing, Creative & Digital",

    // Retail & E-commerce
    "retail": "Retail & CPG",
    "e-commerce": "Retail & CPG",
    "fmcg": "Retail & CPG",
    "consumer goods": "Retail & CPG",
    "food & beverage": "Retail & CPG",
    "luxury goods": "Retail & CPG",
    "apparel": "Retail & CPG",

    // Financial Services
    "banking": "Financial Services",
    "fintech": "Financial Services",
    "financial services": "Financial Services",
    "finance": "Financial Services",
    "insurance": "Financial Services",
    "investment banking": "Financial Services",
    "accounting": "Financial Services",
    "asset management": "Financial Services",
    "wealth management": "Financial Services",

    // Government & Public Sector
    "government": "Government & Public Sector",
    "public sector": "Government & Public Sector",
    "law enforcement": "Government & Public Sector",
    "defense": "Government & Public Sector",
    "defence": "Government & Public Sector",
    "military": "Government & Public Sector",
    "civic & social organization": "Government & Public Sector",
    "non-profit": "Government & Public Sector",

    // Industrial, Manufacturing & Energy
    "manufacturing": "Industrial & Energy",
    "industrials": "Industrial & Energy",
    "industrial automation": "Industrial & Energy",
    "energy": "Industrial & Energy",
    "utilities": "Industrial & Energy",
    "oil & gas": "Industrial & Energy",
    "automotive": "Industrial & Energy",
    "aerospace": "Industrial & Energy",
    "construction": "Industrial & Energy",
    "mining": "Industrial & Energy",
    "chemicals": "Industrial & Energy",
    "logistics": "Industrial & Energy",
    "shipping": "Industrial & Energy",
    "transportation": "Industrial & Energy",
    "supply chain": "Industrial & Energy",

    // Professional Services & HR
    "consulting": "Professional Services",
    "management consulting": "Professional Services",
    "professional services": "Professional Services",
    "human resources": "Professional Services",
    "hr": "Professional Services",
    "recruitment": "Professional Services",
    "staffing": "Professional Services",
    "legal": "Professional Services",
    "business services": "Professional Services",
    "services": "Professional Services",

    // Hospitality & Real Estate
    "real estate": "Real Estate & Hospitality",
    "hospitality": "Real Estate & Hospitality",
    "leisure": "Real Estate & Hospitality",
    "travel": "Real Estate & Hospitality",
    "tourism": "Real Estate & Hospitality",
    "property management": "Real Estate & Hospitality",
    "events": "Real Estate & Hospitality",
    "event management": "Real Estate & Hospitality",

    // Education
    "education": "Education",
    "higher education": "Education",
    "e-learning": "Education",
    "research": "Education",
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
