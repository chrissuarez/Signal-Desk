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

export const triggerIngestion = async () => {
    const res = await fetch(`${API_BASE_URL}/ingest`);
    if (!res.ok) throw new Error('Failed to trigger ingestion');
    return res.json();
};
