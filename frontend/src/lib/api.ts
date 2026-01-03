export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

export const fetchOpportunities = async () => {
    const res = await fetch(`${API_BASE_URL}/opportunities`, { credentials: 'include' });
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
    console.log(`[API] updateSettings: Calling key=${key}`, value);
    try {
        const response = await fetch(`${API_BASE_URL}/settings/${key}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(value),
            credentials: 'include',
        });

        console.log(`[API] updateSettings: Response status=${response.status}`);

        if (!response.ok) {
            const errBody = await response.text();
            console.error('[API] updateSettings: FAILED', errBody);
            throw new Error(`Failed to update settings for ${key}: ${response.status} ${errBody}`);
        }

        return response.json();
    } catch (e: any) {
        console.error('[API] updateSettings: Runtime Error', e);
        alert(`API Error: ${e.message}`);
        throw e;
    }
}

export const triggerIngestion = async (force: boolean = false, limit: number = 50) => {
    const res = await fetch(`${API_BASE_URL}/ingest?force=${force}&limit=${limit}`, { credentials: 'include' });
    if (!res.ok) throw new Error('Failed to trigger ingestion');
    return res.json();
};
