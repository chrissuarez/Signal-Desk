'use client';

import { useEffect, useState } from 'react';
import { fetchOpportunities, triggerIngestion, submitFeedback, fetchSettings, updateSettings } from '@/lib/api';
import { Opportunity } from '../types';

export default function Dashboard() {
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [prefs, setPrefs] = useState<{ keywords: string[], locations: string[] }>({ keywords: [], locations: [] });
  const [isSaving, setIsSaving] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [oppsData, prefsData] = await Promise.all([
        fetchOpportunities(),
        fetchSettings('user_preferences')
      ]);
      setOpportunities(oppsData);
      setPrefs({
        keywords: prefsData.keywords || ['Software Engineer', 'AI', 'Fullstack', 'TypeScript'],
        locations: prefsData.locations || ['Remote', 'London'],
      });
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const [reprocessCount, setReprocessCount] = useState(1);

  const handleIngest = async () => {
    await triggerIngestion();
    loadData();
  };

  const handleReprocess = async () => {
    setLoading(true);
    try {
      await triggerIngestion(true, reprocessCount);
      loadData();
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleFeedback = async (id: number, action: string) => {
    await submitFeedback(id, action);
    loadData();
  };

  const handleSavePrefs = async () => {
    setIsSaving(true);
    try {
      await updateSettings('user_preferences', prefs);
      alert('Preferences saved! New ingestions will use these rules.');
    } catch (error) {
      console.error(error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <header className="flex justify-between items-center mb-8 border-b border-gray-800 pb-4">
        <div>
          <h1 className="text-3xl font-bold text-blue-400">Signal Desk</h1>
          <p className="text-gray-400">Opportunity Agent Dashboard</p>
        </div>
        <div className="flex items-center space-x-4">
          <div className="flex items-center bg-gray-800 border border-gray-700 rounded p-1">
            <input
              type="number"
              min="1"
              max="100"
              value={reprocessCount}
              onChange={(e) => setReprocessCount(parseInt(e.target.value))}
              className="bg-transparent w-12 text-center text-sm outline-none"
            />
            <button
              onClick={handleReprocess}
              className="bg-yellow-600 hover:bg-yellow-700 px-3 py-1 rounded text-xs font-bold transition ml-1"
              title="Force re-scan existing emails"
            >
              Reprocess
            </button>
          </div>
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

      <main className="max-w-6xl mx-auto">
        <section className="bg-gray-800/50 border border-gray-700/50 rounded-xl p-6 mb-12 backdrop-blur-sm">
          <h2 className="text-lg font-bold text-gray-200 mb-4 flex items-center">
            <span className="mr-2">🎯</span> My Opportunity Preferences
          </h2>
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Target Keywords</label>
              <input
                type="text"
                placeholder="Software, AI, Product Manager..."
                className="w-full bg-gray-900 border border-gray-700 rounded px-4 py-2 text-sm focus:border-blue-500 outline-none"
                value={prefs.keywords.join(', ')}
                onChange={(e) => setPrefs({ ...prefs, keywords: e.target.value.split(',').map(s => s.trim()) })}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Preferred Locations</label>
              <input
                type="text"
                placeholder="Remote, London, New York..."
                className="w-full bg-gray-900 border border-gray-700 rounded px-4 py-2 text-sm focus:border-blue-500 outline-none"
                value={prefs.locations.join(', ')}
                onChange={(e) => setPrefs({ ...prefs, locations: e.target.value.split(',').map(s => s.trim()) })}
              />
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <button
              onClick={handleSavePrefs}
              disabled={isSaving}
              className="text-xs font-bold text-blue-400 hover:text-blue-300 transition uppercase tracking-widest disabled:opacity-50"
            >
              {isSaving ? 'Saving...' : 'Update Scopes & Preferences'}
            </button>
          </div>
        </section>

        {loading ? (
          <div className="text-center py-20">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500 mb-4"></div>
            <div className="text-gray-400">Analyzing your network...</div>
          </div>
        ) : opportunities.length === 0 ? (
          <div className="text-center py-20 bg-gray-800/20 border border-dashed border-gray-700 rounded-xl">
            <div className="text-4xl mb-4">🔍</div>
            <div className="text-gray-400">No opportunities found yet.</div>
            <p className="text-sm text-gray-500 mt-2">Connect Gmail and click "Fetch New Ops" to start scanning.</p>
          </div>
        ) : (
          <div className="grid gap-6">
            {opportunities.map((opp) => (
              <div key={opp.id} className="bg-gray-800 border border-gray-700 rounded-lg p-6 shadow-lg hover:border-gray-600 transition">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    {opp.sourceUrl ? (
                      <a
                        href={opp.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xl font-bold text-blue-400 hover:text-blue-300 underline underline-offset-4 transition"
                      >
                        {opp.title}
                      </a>
                    ) : (
                      <h2 className="text-xl font-bold text-white">{opp.title}</h2>
                    )}
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
