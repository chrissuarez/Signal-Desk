export interface ScoringInput {
    title: string;
    description: string;
    industry?: string;
    location?: string;
    preferences: {
        keywords: string[];
        locations: string[]; // Generic keywords to search for in text
        locationWeights?: Record<string, number>; // Precise location point maps
        industryWeights?: Record<string, number>; // Precise industry point maps
        minSalary?: number;
    };
}

export const calculateFitScore = (input: ScoringInput): { score: number; reasons: string[]; concerns: string[] } => {
    let score = 50; // Starting midpoint
    const reasons: string[] = [];
    const concerns: string[] = [];

    const lowerTitle = input.title.toLowerCase();
    const lowerDesc = input.description.toLowerCase();
    const lowerIndustry = (input.industry || '').toLowerCase();
    const lowerLocation = (input.location || '').toLowerCase();

    // 1. Industry Scoring (High Priority)
    if (input.industry && input.preferences.industryWeights) {
        // Direct match
        const weight = input.preferences.industryWeights[input.industry];
        if (weight !== undefined) {
            score += weight;
            if (weight > 0) reasons.push(`Preferred industry match: ${input.industry}`);
            if (weight < 0) concerns.push(`Undesirable industry: ${input.industry}`);
            if (weight <= -100) return { score: 0, reasons: [], concerns: [`Excluded industry: ${input.industry}`] };
        }
    }

    // 2. Keyword matching
    input.preferences.keywords.forEach(kw => {
        const lowerKw = kw.toLowerCase();
        if (lowerTitle.includes(lowerKw)) {
            score += 10;
            reasons.push(`Title contains preferred keyword: ${kw}`);
        } else if (lowerDesc.includes(lowerKw)) {
            score += 5;
            reasons.push(`Description contains preferred keyword: ${kw}`);
        }
    });

    // 3. Precise Location Weights
    if (input.location && input.preferences.locationWeights) {
        // Try exact match or partial (city/country)
        for (const [loc, weight] of Object.entries(input.preferences.locationWeights)) {
            if (lowerLocation.includes(loc.toLowerCase())) {
                score += weight;
                if (weight > 0) reasons.push(`Strong location match: ${loc}`);
                if (weight < 0) concerns.push(`Less desirable location: ${loc}`);
                break; // Use the first matching weight found
            }
        }
    }

    // 4. Fallback Generic Location matching (text search)
    const hasLocationMatch = input.preferences.locations.some(loc =>
        lowerDesc.includes(loc.toLowerCase()) || lowerLocation.includes(loc.toLowerCase())
    );
    if (hasLocationMatch) {
        score += 5;
        reasons.push('Location mentions match preferences');
    }

    // Cap score
    score = Math.min(100, Math.max(0, score));

    return {
        score,
        reasons: reasons.slice(0, 5),
        concerns: concerns.slice(0, 3)
    };
};
