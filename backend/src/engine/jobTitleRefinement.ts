/**
 * Utility for normalizing job titles into high-level roles.
 * Reduces noise in the dashboard by consolidating similar roles.
 */

const JOB_TITLE_CONSOLIDATION_MAP: Record<string, string> = {
    // SEO
    "local seo manager": "SEO Manager",
    "senior seo manager": "SEO Manager",
    "seo": "SEO Manager",

    // Performance
    "head of performance media": "Head of Performance",
    "head of performance marketing": "Head of Performance",

    // Digital Marketing
    "digital marketing manager (3221)": "Digital Marketing Manager",
    "digital marketing manager - owned channels apple pay emeia": "Digital Marketing Manager",

    // Ops
    "ops manager": "Operations Manager",
    "operations manager – healthcare recruitment": "Operations Manager",
    "fulfillment front line manager": "Operations Manager",
    "customer operations director": "Operations Director",
    "director of operations": "Operations Director",
    "director of operations (pre-opening)": "Operations Director",
    "hub operations director": "Operations Director",

    // Customer Success
    "senior customer success manager": "Customer Success Manager",
    "senior customer success manager - defence (sc cleared) - remote within uk": "Customer Success Manager",
    "client success manager": "Customer Success Manager",
    "global head of customer success": "Head of Customer Success",
    "head of customer success (remote from united kingdom)": "Head of Customer Success",

    // Recruitment / Talent
    "director, recruitment - emea": "Recruitment Director",
    "founding talent partner": "Talent Partner",
    "head of hr": "HR Director",
    "head of global talent acquisition": "Head of Talent Acquisition",

    // Digital
    "head of digital growth": "Head of Digital",
    "head of digital development": "Head of Digital",

    // Ecommerce
    "amazon e-commerce manager": "Ecommerce Manager",
    "senior manager ecommerce": "Ecommerce Manager",
};

/**
 * Normalizes a job title by applying predefined mappings and cleaning up noise.
 */
export function normalizeJobTitle(title: string | null): string {
    if (!title) return "Unknown Role";

    let normalized = title.trim();

    // 1. Remove common noise pattern (Parentheses, brackets, etc.)
    normalized = normalized.replace(/\s*\(.*\)\s*/g, '');
    normalized = normalized.replace(/\s*\[.*\]\s*/g, '');

    // 2. Remove trailing locations or contract types if obvious
    normalized = normalized.split(' - ')[0] || ''; // Take everything before first dash
    normalized = normalized.split(' | ')[0] || ''; // Take everything before first pipe

    // 3. Lowercase for mapping lookup
    const lookupKey = normalized.toLowerCase();

    // 4. Try exact map match
    if (JOB_TITLE_CONSOLIDATION_MAP[lookupKey]) {
        return JOB_TITLE_CONSOLIDATION_MAP[lookupKey];
    }

    // 5. Seniority normalization (if not already mapped)
    // We want to keep some level of seniority but consolidate the "Senior X Manager" into "X Manager" 
    // IF the user indicated that's what they want (like with SEO Manager).
    // However, for "Director", they might want to keep it.

    const seniorityPrefixes = [
        /^senior\s+/i,
        /^junior\s+/i,
        /^lead\s+/i,
        /^head of\s+/i,
        /^director of\s+/i,
        /^associate\s+/i,
        /^principal\s+/i
    ];

    // If it's a "Senior X Manager", let's see if "X Manager" exists in the map or if we should just strip it
    for (const prefix of seniorityPrefixes) {
        if (prefix.test(normalized)) {
            const stripped = normalized.replace(prefix, '').trim();
            // If the user's examples suggested stripping seniority, we apply it more broadly
            // For SEO Manager, they specifically said "Senior SEO Manager -> SEO Manager"
            // Let's apply this to "Manager" roles primarily.
            if (normalized.toLowerCase().includes('manager')) {
                return stripped;
            }
        }
    }

    return normalized;
}
