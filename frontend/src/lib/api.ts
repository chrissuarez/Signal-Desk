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

export async function updateSettings(key: string, value: any) {
    const response = await fetch(`${API_BASE_URL}/settings/${key}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(value),
        credentials: 'include',
    });
    if (!response.ok) throw new Error(`Failed to update settings for ${key}`);
    return response.json();
}

export const triggerIngestion = async (force: boolean = false, limit: number = 50) => {
    const res = await fetch(`${API_BASE_URL}/ingest?force=${force}&limit=${limit}`, { credentials: 'include' });
    if (!res.ok) throw new Error('Failed to trigger ingestion');
    return res.json();
};

