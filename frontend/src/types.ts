export type OpportunityType = 'JOB' | 'BUSINESS' | 'NOISE';
export type SourceType = 'EMAIL' | 'RSS' | 'WEB';
export type ConfidenceType = 'LOW' | 'MEDIUM' | 'HIGH';
export type OpportunityStatus = 'NEW' | 'SENT' | 'SAVED' | 'DISMISSED' | 'APPLIED';
export type StrategicCategory =
    | 'STRATEGIC_FIT'
    | 'USEFUL_BRIDGE'
    | 'SEO_COMFORT_ZONE'
    | 'RESOURCE_ADMIN_TRAP'
    | 'GENERIC_OPS_UNCLEAR'
    | 'REJECT';
export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';
// The system's routing decision (ADR-0005 / #13). The dashboard's strategic filter tabs
// (#8) pass `?action=` to gather rows by routing — e.g. Needs Review includes DIGEST.
export type RecommendedAction = 'ALERT' | 'DIGEST' | 'STORE' | 'SUPPRESS';
// How rich the text the Strategic Analysis judged (#6): DEEP = re-analysed on the full
// scraped job description; SHALLOW = the Pass-1 email snippet only. Null on legacy rows.
export type AnalysisDepth = 'DEEP' | 'SHALLOW';

export interface Opportunity {
    id: number;
    type: OpportunityType;
    source: SourceType;
    origin: string | null;
    receivedAt: string;
    canonicalUrl: string | null;
    sourceUrl?: string | null;
    title: string;
    company: string | null;
    industry: string | null;
    location: string | null;
    remoteStatus: string | null;
    fitScore: number;
    confidence: ConfidenceType;
    reasons: string[] | null;
    concerns: string[] | null;
    strategicCategory: StrategicCategory | null;
    // The headline Strategic Score (#4): the ranking authority the list is ordered by.
    // Null until an Opportunity has been scored.
    strategicScore: number | null;
    // Analysis depth (#6): whether the Strategic Analysis judged the full scraped job
    // description (DEEP) or only the email snippet (SHALLOW). Null on un-analysed legacy rows.
    analysisDepth: AnalysisDepth | null;
    // Strategic Analysis fields (#3), returned by GET /opportunities. Null until analysed.
    consultancyAlignment: number | null;
    deliveryVisibility: number | null;
    commercialProximity: number | null;
    buyerEnvironmentFit: number | null;
    seniorityScope: number | null;
    practicalFit: number | null;
    resourceAdminTrapRisk: RiskLevel | null;
    seoComfortZoneRisk: RiskLevel | null;
    realRoleInterpretation: string | null;
    consultancyRelevance: string | null;
    strategicReasons: string[] | null;
    strategicConcerns: string[] | null;
    recommendedScreeningQuestions: string[] | null;
    // The system's routing decision (#13). Null on un-routed legacy rows.
    recommendedAction: RecommendedAction | null;
    status: OpportunityStatus;
}
