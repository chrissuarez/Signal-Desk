import type { StrategicCategory, RiskLevel } from './engine/strategicVocabulary.js';

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
    title: string;
    company: string | null;
    location: string | null;
    fitScore: number;
    confidence: ConfidenceType;
    reasons: string[] | null;
    concerns: string[] | null;
    strategicCategory: StrategicCategory | null;
    // The headline Strategic Score (#4, ADR-0001): the computed weighted sum of the six
    // Component Scores minus the two risk penalties. The ranking authority — GET
    // /opportunities orders by it. Null until an Opportunity has been scored.
    strategicScore: number | null;
    // Strategic Analysis fields (#3). Null until an Opportunity has been analysed; the
    // six Component Scores, two risk flags, narrative + array fields. practicalFit is the
    // demoted Fit Score, the rest are LLM-judged. The Strategic Score above aggregates them.
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
    status: OpportunityStatus;
}
