export type OpportunityType = 'JOB' | 'BUSINESS' | 'NOISE';
export type SourceType = 'EMAIL' | 'RSS' | 'WEB';
export type ConfidenceType = 'LOW' | 'MEDIUM' | 'HIGH';
export type OpportunityStatus = 'NEW' | 'SENT' | 'SAVED' | 'DISMISSED' | 'APPLIED';

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
    location: string | null;
    fitScore: number;
    confidence: ConfidenceType;
    reasons: string[] | null;
    concerns: string[] | null;
    status: OpportunityStatus;
}
