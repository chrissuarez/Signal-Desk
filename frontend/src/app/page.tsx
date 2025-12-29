'use client';

import { useEffect, useState } from 'react';
import { fetchOpportunities, triggerIngestion, submitFeedback } from '@/lib/api';
import { Opportunity } from '../types';

export default function Dashboard() {
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await fetchOpportunities();
      setOpportunities(data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleIngest = async () => {
    await triggerIngestion();
    loadData();
  };

  const handleFeedback = async (id: number, action: string) => {
    await submitFeedback(id, action);
    loadData();
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <header className="flex justify-between items-center mb-8 border-b border-gray-800 pb-4">
        <div>
          <h1 className="text-3xl font-bold text-blue-400">Signal Desk</h1>
          <p className="text-gray-400">Opportunity Agent Dashboard</p>
        </div>
        <div className="space-x-4">
          <button
            onClick={handleIngest}
            className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded font-medium transition"
          >
            Fetch New Ops
          </button>
          <a
            href="http://localhost:4000/api/auth/google/login"
            className="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded font-medium transition inline-block"
          >
            Connect Gmail
          </a>
        </div>
      </header>

      <main>
        {loading ? (
          <div className="text-center py-20">Loading opportunities...</div>
        ) : opportunities.length === 0 ? (
          <div className="text-center py-20 text-gray-500">No opportunities found yet. Connect Gmail and fetch some alerts!</div>
        ) : (
          <div className="grid gap-6">
            {opportunities.map((opp) => (
              <div key={opp.id} className="bg-gray-800 border border-gray-700 rounded-lg p-6 shadow-lg hover:border-gray-600 transition">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h2 className="text-xl font-bold text-white">{opp.title}</h2>
                    <p className="text-blue-300 font-medium">{opp.company}</p>
                  </div>
                  <div className="flex flex-col items-end">
                    <span className={`px-3 py-1 rounded-full text-sm font-bold ${opp.fitScore >= 80 ? 'bg-green-600' : opp.fitScore >= 60 ? 'bg-yellow-600' : 'bg-gray-600'
                      }`}>
                      Score: {opp.fitScore}
                    </span>
                    <span className="text-xs text-gray-500 mt-1 uppercase tracking-wider">{opp.status}</span>
                  </div>
                </div>

                <div className="mb-4">
                  <h3 className="text-sm font-bold text-gray-400 uppercase mb-2">Why it fits:</h3>
                  <ul className="list-disc list-inside text-gray-300 text-sm">
                    {opp.reasons?.map((r, i) => <li key={i}>{r}</li>)}
                  </ul>
                </div>

                {opp.concerns && opp.concerns.length > 0 && (
                  <div className="mb-4">
                    <h3 className="text-sm font-bold text-red-400/80 uppercase mb-2">Concerns:</h3>
                    <ul className="list-disc list-inside text-gray-400 text-sm">
                      {opp.concerns?.map((c, i) => <li key={i}>{c}</li>)}
                    </ul>
                  </div>
                )}

                <div className="flex justify-between items-center mt-6 pt-4 border-t border-gray-700">
                  <div className="text-xs text-gray-500">
                    Source: {opp.source} | Received: {new Date(opp.receivedAt).toLocaleDateString()}
                  </div>
                  <div className="space-x-3">
                    <button
                      onClick={() => handleFeedback(opp.id, 'LIKE')}
                      className="text-gray-400 hover:text-green-400 p-2 rounded-full hover:bg-gray-700 transition"
                      title="Keep this"
                    >
                      👍
                    </button>
                    <button
                      onClick={() => handleFeedback(opp.id, 'DISLIKE')}
                      className="text-gray-400 hover:text-red-400 p-2 rounded-full hover:bg-gray-700 transition"
                      title="Ignore this"
                    >
                      👎
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
