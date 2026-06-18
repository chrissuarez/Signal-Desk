export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

// The dashboard's strategic filter tabs (#8) pass `category`/`action` straight through to
// the API as `?category=`/`?action=` (comma-separated). Omitted params fall back to the
// server's default view (hides SUPPRESS); an explicit filter reveals those hidden rows.
export const fetchOpportunities = async (filter?: { category?: string; action?: string }) => {
    const params = new URLSearchParams();
    if (filter?.category) params.set('category', filter.category);
    if (filter?.action) params.set('action', filter.action);
    const qs = params.toString();
    const res = await fetch(`${API_BASE_URL}/opportunities${qs ? `?${qs}` : ''}`, { credentials: 'include' });
    if (!res.ok) throw new Error('Failed to fetch opportunities');
    return res.json();
};

export const submitFeedback = async (id: number, action: string) => {
    const res = await fetch(`${API_BASE_URL}/opportunities/${id}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
        credentials: 'include',
    });
    if (!res.ok) throw new Error('Failed to submit feedback');
    return res.json();
};

export async function fetchSettings(key: string) {
    const response = await fetch(`${API_BASE_URL}/settings/${key}`, { credentials: 'include' });
    if (!response.ok) throw new Error(`Failed to fetch settings for ${key}`);
    return response.json();
}

// The dashboard's local mirror of the backend `Preferences` contract (engine/scoring.ts).
// Build-time type only — the runtime guarantee is the backend's zod validation at the
// write boundary (#16), which rejects any divergent shape with a 4xx. We deliberately keep
// no second runtime validator here: a single source of truth that fails loud beats two that
// can skew.
export type Preferences = {
    keywords: string[];
    locations: string[];
    industryWeights: Record<string, number>;
    locationWeights: Record<string, number>;
    minSalary?: number;
};

// Typed write path for `user_preferences`. The backend revalidates and returns 400 on a
// shape mismatch, so a frontend/backend drift surfaces as a thrown error, never a silently
// corrupt stored row.
export async function updatePreferences(prefs: Preferences) {
    const response = await fetch(`${API_BASE_URL}/settings/user_preferences`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(prefs),
        credentials: 'include',
    });
    if (!response.ok) throw new Error('Failed to update preferences');
    return response.json();
}

export const triggerIngestion = async (force: boolean = false, limit: number = 50) => {
    const res = await fetch(`${API_BASE_URL}/ingest?force=${force}&limit=${limit}`, { credentials: 'include' });
    if (!res.ok) throw new Error('Failed to trigger ingestion');
    return res.json();
};

