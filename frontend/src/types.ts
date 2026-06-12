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
    status: OpportunityStatus;
}
