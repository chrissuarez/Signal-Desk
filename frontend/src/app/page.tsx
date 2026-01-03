'use client';

import { useEffect, useState } from 'react';
import { fetchOpportunities, triggerIngestion, submitFeedback, fetchSettings, updateSettings, API_BASE_URL } from '@/lib/api';
import { Opportunity } from '../types';

export default function Dashboard() {
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [prefs, setPrefs] = useState<{
    keywords: string[],
    locations: string[],
    industryWeights: Record<string, number>,
    locationWeights: Record<string, number>
  }>({
    keywords: [],
    locations: [],
    industryWeights: {},
    locationWeights: {}
  });
  const [isSaving, setIsSaving] = useState(false);
  const [keywordInput, setKeywordInput] = useState('');
  const [locationInput, setLocationInput] = useState('');
  const [activeTab, setActiveTab] = useState<'ALL' | 'SAVED' | 'NEW' | 'CONFIG'>('ALL');

  const loadData = async () => {
    setLoading(true);
    try {
      const [oppsData, prefsData] = await Promise.all([
        fetchOpportunities(),
        fetchSettings('user_preferences')
      ]);
      setOpportunities(oppsData);
      setPrefs({
        keywords: prefsData.keywords || [],
        locations: prefsData.locations || [],
        industryWeights: prefsData.industryWeights || {},
        locationWeights: prefsData.locationWeights || {},
      });
      setKeywordInput((prefsData.keywords || []).join(', '));
      setLocationInput((prefsData.locations || []).join(', '));
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
    console.log('handleSavePrefs clicked');
    setIsSaving(true);
    try {
      const updatedPrefs = {
        keywords: keywordInput.split(',').map(s => s.trim()).filter(Boolean),
        locations: locationInput.split(',').map(s => s.trim()).filter(Boolean),
        industryWeights: prefs.industryWeights,
        locationWeights: prefs.locationWeights,
      };
      console.log('Sending prefs:', updatedPrefs);
      await updateSettings('user_preferences', updatedPrefs);
      setPrefs(updatedPrefs);
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
            href={`${API_BASE_URL}/auth/google/login`}
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
                value={keywordInput}
                onChange={(e) => setKeywordInput(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Preferred Locations</label>
              <input
                type="text"
                placeholder="Remote, London, New York..."
                className="w-full bg-gray-900 border border-gray-700 rounded px-4 py-2 text-sm focus:border-blue-500 outline-none"
                value={locationInput}
                onChange={(e) => setLocationInput(e.target.value)}
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

        <div className="flex space-x-2 mb-6">
          {(['ALL', 'NEW', 'SAVED', 'CONFIG'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-lg text-sm font-bold transition ${activeTab === tab
                ? 'bg-blue-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                }`}
            >
              {tab === 'ALL' ? 'Everything' : tab === 'SAVED' ? 'Liked' : tab === 'NEW' ? 'New' : '🎛️ Controls'}
            </button>
          ))}
        </div>

        {activeTab === 'CONFIG' ? (
          <section className="space-y-8 animate-in fade-in slide-in-from-bottom-4 transition">
            <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
              <h3 className="text-xl font-bold mb-4 flex items-center">
                <span className="mr-2">🏢</span> Industry Weights & Exclusions
              </h3>
              <p className="text-sm text-gray-400 mb-6">Set weights for discovered industries. Use -100 to exclude entirely.</p>
              <div className="grid gap-4">
                {Array.from(new Set(opportunities.map(o => o.industry).filter(Boolean))).map(ind => (
                  <div key={ind} className="flex items-center justify-between bg-gray-900/50 p-3 rounded border border-gray-800">
                    <span className="text-sm font-medium">{ind}</span>
                    <div className="flex items-center space-x-4">
                      <input
                        type="range"
                        min="-100"
                        max="50"
                        step="10"
                        value={prefs.industryWeights[ind!] || 0}
                        onChange={(e) => {
                          const val = parseInt(e.target.value);
                          setPrefs(prev => ({
                            ...prev,
                            industryWeights: { ...prev.industryWeights, [ind!]: val }
                          }));
                        }}
                        className="w-32 accent-blue-500"
                      />
                      <span className={`text-xs font-bold w-12 text-center ${(prefs.industryWeights[ind!] || 0) <= -100 ? 'text-red-500' :
                        (prefs.industryWeights[ind!] || 0) > 0 ? 'text-green-500' : 'text-gray-500'
                        }`}>
                        {(prefs.industryWeights[ind!] || 0) <= -100 ? 'EXCLUDE' : (prefs.industryWeights[ind!] || 0)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
              <h3 className="text-xl font-bold mb-4 flex items-center">
                <span className="mr-2">📍</span> Precise Location Weights
              </h3>
              <p className="text-sm text-gray-400 mb-6">Manage weights for specific cities or regions.</p>
              <div className="grid gap-4">
                {Array.from(new Set(opportunities.map(o => o.location).filter(Boolean))).map(loc => (
                  <div key={loc} className="flex items-center justify-between bg-gray-900/50 p-3 rounded border border-gray-800">
                    <span className="text-sm font-medium">{loc}</span>
                    <div className="flex items-center space-x-4">
                      <input
                        type="range"
                        min="-50"
                        max="50"
                        step="5"
                        value={prefs.locationWeights[loc!] || 0}
                        onChange={(e) => {
                          const val = parseInt(e.target.value);
                          setPrefs(prev => ({
                            ...prev,
                            locationWeights: { ...prev.locationWeights, [loc!]: val }
                          }));
                        }}
                        className="w-32 accent-blue-500"
                      />
                      <span className={`text-xs font-bold w-8 text-center ${(prefs.locationWeights[loc!] || 0) > 0 ? 'text-green-500' :
                        (prefs.locationWeights[loc!] || 0) < 0 ? 'text-orange-500' : 'text-gray-500'
                        }`}>
                        {prefs.locationWeights[loc!] || 0}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-center">
              <button
                onClick={handleSavePrefs}
                disabled={isSaving}
                className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-full font-bold shadow-lg transition transform hover:scale-105 active:scale-95 disabled:opacity-50"
              >
                {isSaving ? 'Applying Rules...' : 'Save Configuration & Apply Rules'}
              </button>
            </div>
          </section>
        ) : loading ? (
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
            {opportunities
              .filter(opp => {
                if (activeTab === 'ALL') return true;
                if (activeTab === 'SAVED') return opp.status === 'SAVED' || opp.status === 'APPLIED';
                return opp.status === 'NEW';
              })
              .map((opp) => (
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
                      <div className="flex flex-wrap gap-2 mt-2">
                        {opp.industry && <span className="text-xs bg-gray-700 text-gray-300 px-2 py-0.5 rounded border border-gray-600">🏢 {opp.industry}</span>}
                        {opp.location && <span className="text-xs bg-gray-700 text-gray-300 px-2 py-0.5 rounded border border-gray-600">📍 {opp.location}</span>}
                        {opp.remoteStatus && <span className="text-xs bg-gray-700 text-gray-300 px-2 py-0.5 rounded border border-gray-600">☁️ {opp.remoteStatus}</span>}
                      </div>
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
