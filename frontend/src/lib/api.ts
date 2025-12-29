export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

export const fetchOpportunities = async () => {
    const res = await fetch(`${API_BASE_URL}/opportunities`);
    if (!res.ok) throw new Error('Failed to fetch opportunities');
    return res.json();
};

export const submitFeedback = async (id: number, action: string) => {
    const res = await fetch(`${API_BASE_URL}/opportunities/${id}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
    });
    if (!res.ok) throw new Error('Failed to submit feedback');
    return res.json();
};

export async function fetchSettings(key: string) {
    const response = await fetch(`${API_BASE_URL}/settings/${key}`);
    if (!response.ok) throw new Error(`Failed to fetch settings for ${key}`);
    return response.json();
}

export async function updateSettings(key: string, value: any) {
    const response = await fetch(`${API_BASE_URL}/settings/${key}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(value),
    });
    if (!response.ok) throw new Error(`Failed to update settings for ${key}`);
    return response.json();
}

export const triggerIngestion = async () => {
    const res = await fetch(`${API_BASE_URL}/ingest`);
    if (!res.ok) throw new Error('Failed to trigger ingestion');
    return res.json();
};
