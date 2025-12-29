export interface ExtractedOpportunity {
    title: string;
    company: string;
    location?: string;
    description: string;
    salaryText?: string;
    employmentType?: string;
    requirements?: string[];
    canonicalUrl?: string;
}

export const parseEmailBody = (body: string): ExtractedOpportunity => {
    // Simple heuristic-based parsing for v1
    // In a real production app, this would use LLM or specific regex per source

    const lines = body.split('\n');
    let title = 'Unknown Position';
    let company = 'Unknown Company';

    // Very basic regex for demonstration
    const titleMatch = body.match(/Role:\s*(.*)/i) || body.match(/Position:\s*(.*)/i);
    const companyMatch = body.match(/Company:\s*(.*)/i) || body.match(/At:\s*(.*)/i);

    if (titleMatch?.[1]) title = titleMatch[1].trim();
    if (companyMatch?.[1]) company = companyMatch[1].trim();

    return {
        title,
        company,
        description: body, // Default to full body for now
        // Add more logic here as we see real email formats
    };
};

export const classifyOpportunity = (text: string): 'JOB' | 'BUSINESS' | 'NOISE' => {
    const jobKeywords = ['hiring', 'vacancy', 'apply', 'salary', 'recruiting', 'role'];
    const businessKeywords = ['tender', 'proposal', 'procurement', 'contract opportunity', 'bidding'];
    const noiseKeywords = ['newsletter', 'promotion', 'unrelated', 'spam'];

    const lowerText = text.toLowerCase();

    if (businessKeywords.some(kw => lowerText.includes(kw))) return 'BUSINESS';
    if (jobKeywords.some(kw => lowerText.includes(kw))) return 'JOB';
    if (noiseKeywords.some(kw => lowerText.includes(kw))) return 'NOISE';

    return 'NOISE'; // Default to noise to keep false positives low
};
