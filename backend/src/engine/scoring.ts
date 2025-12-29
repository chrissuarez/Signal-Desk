export interface ScoringInput {
    title: string;
    description: string;
    preferences: {
        keywords: string[];
        locations: string[];
        minSalary?: number;
    };
}

export const calculateFitScore = (input: ScoringInput): { score: number; reasons: string[]; concerns: string[] } => {
    let score = 50; // Starting midpoint
    const reasons: string[] = [];
    const concerns: string[] = [];

    const lowerTitle = input.title.toLowerCase();
    const lowerDesc = input.description.toLowerCase();

    // Keyword matching
    input.preferences.keywords.forEach(kw => {
        if (lowerTitle.includes(kw.toLowerCase())) {
            score += 10;
            reasons.push(`Title contains preferred keyword: ${kw}`);
        } else if (lowerDesc.includes(kw.toLowerCase())) {
            score += 5;
            reasons.push(`Description contains preferred keyword: ${kw}`);
        }
    });

    // Location matching
    const hasLocationMatch = input.preferences.locations.some(loc =>
        lowerDesc.includes(loc.toLowerCase())
    );
    if (hasLocationMatch) {
        score += 10;
        reasons.push('Location matches preferences');
    } else {
        score -= 5;
        concerns.push('Location might not match preferences');
    }

    // Cap score
    score = Math.min(100, Math.max(0, score));

    return {
        score,
        reasons: reasons.slice(0, 5),
        concerns: concerns.slice(0, 3)
    };
};
