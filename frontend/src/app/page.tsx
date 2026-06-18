'use client';

import { useEffect, useRef, useState } from 'react';
import { fetchOpportunities, triggerIngestion, submitFeedback, fetchSettings, updatePreferences, API_BASE_URL, type Preferences } from '@/lib/api';
import { Opportunity, StrategicCategory, RiskLevel } from '../types';
import { getRefinedIndustryList } from '@/lib/industryUtils';

// Strategic Category badge presentation (#2). Category encodes *what kind* of role this
// is; colour reflects strategic value (green good → red off-target → grey unclear).
const CATEGORY_BADGE: Record<StrategicCategory, { label: string; className: string }> = {
  STRATEGIC_FIT: { label: 'Strategic Fit', className: 'bg-green-900/40 text-green-300 border-green-700/50' },
  USEFUL_BRIDGE: { label: 'Useful Bridge', className: 'bg-blue-900/40 text-blue-300 border-blue-700/50' },
  SEO_COMFORT_ZONE: { label: 'SEO Comfort Zone', className: 'bg-amber-900/40 text-amber-300 border-amber-700/50' },
  RESOURCE_ADMIN_TRAP: { label: 'Resource/Admin Trap', className: 'bg-red-900/40 text-red-300 border-red-700/50' },
  GENERIC_OPS_UNCLEAR: { label: 'Generic / Unclear', className: 'bg-gray-700 text-gray-300 border-gray-600' },
  REJECT: { label: 'Reject', className: 'bg-red-950/50 text-red-400 border-red-800/50' },
};

// Risk-flag chip colour by severity — LOW is muted, MEDIUM amber, HIGH red (#5).
const RISK_CLASS: Record<RiskLevel, string> = {
  LOW: 'bg-gray-700/60 text-gray-400 border-gray-600',
  MEDIUM: 'bg-amber-900/40 text-amber-300 border-amber-700/50',
  HIGH: 'bg-red-900/40 text-red-300 border-red-700/50',
};

// The strategic filter tabs (#8). Each tab is a server-side `?category=`/`?action=` slice;
// ALL is the default view (SUPPRESS hidden). Needs Review gathers the ambiguous category
// *and* digest-routed rows (OR), and Traps/Rejects deliberately reveals the otherwise-
// hidden trap/reject rows alongside the visible SEO-comfort-zone ones for audit.
const STRATEGIC_TABS = ['ALL', 'STRATEGIC_FIT', 'USEFUL_BRIDGE', 'NEEDS_REVIEW', 'TRAPS_REJECTS'] as const;
type StrategicTab = (typeof STRATEGIC_TABS)[number];
type Tab = StrategicTab | 'SAVED' | 'CONFIG';

const TAB_FILTER: Record<StrategicTab, { category?: string; action?: string }> = {
  ALL: {},
  STRATEGIC_FIT: { category: 'STRATEGIC_FIT' },
  USEFUL_BRIDGE: { category: 'USEFUL_BRIDGE' },
  NEEDS_REVIEW: { category: 'GENERIC_OPS_UNCLEAR', action: 'DIGEST' },
  TRAPS_REJECTS: { category: 'RESOURCE_ADMIN_TRAP,REJECT,SEO_COMFORT_ZONE' },
};

const TAB_META: { id: Tab; label: string }[] = [
  { id: 'ALL', label: 'Everything' },
  { id: 'STRATEGIC_FIT', label: '🎯 Strategic Fit' },
  { id: 'USEFUL_BRIDGE', label: '🤝 Useful Bridge' },
  { id: 'NEEDS_REVIEW', label: '🔍 Needs Review' },
  { id: 'TRAPS_REJECTS', label: '⚠️ Traps / Rejects' },
  { id: 'SAVED', label: '⭐ Liked' },
  { id: 'CONFIG', label: '🎛️ Controls' },
];

const isStrategicTab = (tab: Tab): tab is StrategicTab => (STRATEGIC_TABS as readonly string[]).includes(tab);

// Reverse the URL query params back to a tab so a shared/reloaded `?category=…` link lands
// on the right tab. Matches the exact strings each strategic tab emits; anything else → ALL.
const tabFromSearch = (search: string): Tab => {
  const p = new URLSearchParams(search);
  const category = p.get('category') ?? '';
  const action = p.get('action') ?? '';
  if (!category && !action) return 'ALL';
  for (const id of STRATEGIC_TABS) {
    const f = TAB_FILTER[id];
    if ((f.category ?? '') === category && (f.action ?? '') === action) return id;
  }
  return 'ALL';
};

export default function Dashboard() {
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [prefs, setPrefs] = useState<Preferences>({
    keywords: [],
    locations: [],
    industryWeights: {},
    locationWeights: {}
  });
  const [isSaving, setIsSaving] = useState(false);
  const [keywordInput, setKeywordInput] = useState('');
  const [locationInput, setLocationInput] = useState('');
  const [activeTab, setActiveTab] = useState<Tab>('ALL');
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const [gmailStatus, setGmailStatus] = useState<{ connected: boolean, error?: string | null }>({ connected: false });
  // Gate the first opportunity fetch until the tab has been adopted from the URL (below), so
  // a deep-linked ?category= load never fires a throwaway unfiltered request first.
  const [hydrated, setHydrated] = useState(false);
  // Monotonic request token: only the most recently *started* load may write state, so a
  // slower earlier response (deep-link mount, or rapid tab switches) can never clobber a
  // newer one. (The fix for the #26 stale-response race.)
  const loadSeq = useRef(0);

  // The server-side slice for the current tab. SAVED/CONFIG ride the default (empty) view;
  // SAVED narrows it client-side by status below.
  const serverFilter = isStrategicTab(activeTab) ? TAB_FILTER[activeTab] : {};
  const categoryParam = serverFilter.category ?? '';
  const actionParam = serverFilter.action ?? '';

  const loadOpportunities = async (filter: { category?: string; action?: string }) => {
    const seq = ++loadSeq.current;
    setLoading(true);
    try {
      const data = await fetchOpportunities(filter);
      if (seq === loadSeq.current) setOpportunities(data); // drop superseded responses
    } catch (error) {
      console.error(error);
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  };

  const loadSettings = async () => {
    try {
      const [prefsData, gmailData] = await Promise.all([
        fetchSettings('user_preferences'),
        fetchSettings('gmail_tokens'),
      ]);
      setPrefs({
        keywords: prefsData.keywords || [],
        locations: prefsData.locations || [],
        industryWeights: prefsData.industryWeights || {},
        locationWeights: prefsData.locationWeights || {},
      });
      setKeywordInput((prefsData.keywords || []).join(', '));
      setLocationInput((prefsData.locations || []).join(', '));
      setGmailStatus({
        connected: !!gmailData.access_token && !gmailData.authError,
        error: gmailData.authError,
      });
    } catch (error) {
      console.error(error);
    }
  };

  // On mount: adopt any tab encoded in the URL (before the first fetch can run), load
  // settings once, and release the fetch gate. Batched, so the filter-effect below first
  // runs with the URL-derived tab already in place — never the transient ALL default.
  useEffect(() => {
    setActiveTab(tabFromSearch(window.location.search));
    setHydrated(true);
    loadSettings();
  }, []);

  // The opportunity list is purely a function of the active filter: reflect it in the URL
  // and (re)fetch whenever it changes. SAVED/CONFIG collapse to the empty filter, so this
  // does not refetch when only the client-side view changes. Held until `hydrated` so a
  // deep-linked filter does not first fire (and render) an unfiltered request.
  useEffect(() => {
    if (!hydrated) return;
    const p = new URLSearchParams();
    if (categoryParam) p.set('category', categoryParam);
    if (actionParam) p.set('action', actionParam);
    const qs = p.toString();
    window.history.replaceState(null, '', qs ? `?${qs}` : window.location.pathname);
    loadOpportunities({ category: categoryParam || undefined, action: actionParam || undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, categoryParam, actionParam]);

  const refreshOpportunities = () =>
    loadOpportunities({ category: categoryParam || undefined, action: actionParam || undefined });

  const [reprocessCount, setReprocessCount] = useState(1);

  const handleIngest = async () => {
    await triggerIngestion();
    refreshOpportunities();
  };

  const handleReprocess = async () => {
    setLoading(true);
    try {
      await triggerIngestion(true, reprocessCount);
      refreshOpportunities();
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleFeedback = async (id: number, action: string) => {
    await submitFeedback(id, action);
    refreshOpportunities();
  };

  const toggleExpanded = (id: number) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleSavePrefs = async () => {
    setIsSaving(true);
    try {
      const updatedPrefs: Preferences = {
        keywords: keywordInput.split(',').map(s => s.trim()).filter(Boolean),
        locations: locationInput.split(',').map(s => s.trim()).filter(Boolean),
        industryWeights: prefs.industryWeights,
        locationWeights: prefs.locationWeights,
      };
      await updatePreferences(updatedPrefs);
      setPrefs(updatedPrefs);
      alert('Preferences saved! New ingestions will use these rules.');
    } catch (error) {
      console.error('Failed to save preferences:', error);
      alert('Failed to save preferences. See console for details.');
    } finally {
      setIsSaving(false);
    }
  };

  // SAVED is the only tab that narrows the fetched list client-side; the strategic tabs are
  // already sliced by the server, and ALL shows everything returned.
  const visibleOpportunities = activeTab === 'SAVED'
    ? opportunities.filter(o => o.status === 'SAVED' || o.status === 'APPLIED')
    : opportunities;

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <header className="flex justify-between items-center mb-8 border-b border-gray-800 pb-4">
        <div>
          <h1 className="text-3xl font-bold text-blue-400">Signal Desk</h1>
          <p className="text-gray-400">Opportunity Agent Dashboard</p>
        </div>
        <div className="flex items-center space-x-4">
          {!gmailStatus.connected && (
            <span className="flex items-center text-xs font-bold text-red-500 bg-red-900/20 border border-red-900/30 px-3 py-1 rounded">
              <span className="mr-2">⚠️</span>
              {gmailStatus.error ? 'Connection Revoked' : 'Gmail Not Connected'}
            </span>
          )}
          {gmailStatus.connected && (
            <span className="flex items-center text-xs font-bold text-green-500 bg-green-900/20 border border-green-900/30 px-3 py-1 rounded">
              <span className="mr-2">✅</span> Connection Active
            </span>
          )}
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
            className={`${!gmailStatus.connected ? 'bg-red-600 hover:bg-red-700' : 'bg-gray-700 hover:bg-gray-600'} px-4 py-2 rounded font-medium transition inline-block`}
          >
            {gmailStatus.error ? 'Reconnect Gmail' : 'Connect Gmail'}
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

        <div className="flex flex-wrap gap-2 mb-6">
          {TAB_META.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`px-4 py-2 rounded-lg text-sm font-bold transition ${activeTab === id
                ? 'bg-blue-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                }`}
            >
              {label}
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
                {getRefinedIndustryList(opportunities).map(ind => (
                  <div key={ind} className="flex items-center justify-between bg-gray-900/50 p-3 rounded border border-gray-800">
                    <span className="text-sm font-medium">{ind}</span>
                    <div className="flex items-center space-x-4">
                      <input
                        type="range"
                        min="-100"
                        max="50"
                        step="10"
                        value={prefs.industryWeights[ind] || 0}
                        onChange={(e) => {
                          const val = parseInt(e.target.value);
                          setPrefs(prev => ({
                            ...prev,
                            industryWeights: { ...prev.industryWeights, [ind]: val }
                          }));
                        }}
                        className="w-32 accent-blue-500"
                      />
                      <span className={`text-xs font-bold w-12 text-center ${(prefs.industryWeights[ind] || 0) <= -100 ? 'text-red-500' :
                        (prefs.industryWeights[ind] || 0) > 0 ? 'text-green-500' : 'text-gray-500'
                        }`}>
                        {(prefs.industryWeights[ind] || 0) <= -100 ? 'EXCLUDE' : (prefs.industryWeights[ind] || 0)}
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
        ) : visibleOpportunities.length === 0 ? (
          <div className="text-center py-20 bg-gray-800/20 border border-dashed border-gray-700 rounded-xl">
            <div className="text-4xl mb-4">🔍</div>
            <div className="text-gray-400">
              {activeTab === 'ALL'
                ? 'No opportunities found yet.'
                : 'Nothing in this view.'}
            </div>
            <p className="text-sm text-gray-500 mt-2">
              {activeTab === 'ALL'
                ? 'Connect Gmail and click "Fetch New Ops" to start scanning.'
                : 'Try another tab — this filter has no matching roles right now.'}
            </p>
          </div>
        ) : (
          <div className="grid gap-4">
            {visibleOpportunities.map((opp) => {
              const isOpen = expanded.has(opp.id);
              // Prefer the strategic reasons/concerns (#3); fall back to the fit-level ones
              // on legacy rows that were never strategically analysed.
              const reasons = (opp.strategicReasons && opp.strategicReasons.length > 0) ? opp.strategicReasons : opp.reasons;
              const concerns = (opp.strategicConcerns && opp.strategicConcerns.length > 0) ? opp.strategicConcerns : opp.concerns;
              const questions = opp.recommendedScreeningQuestions ?? [];
              // The compact one-liner: the agent's read of the real role, else the top reason.
              const summary = opp.realRoleInterpretation || reasons?.[0] || null;
              const hasDetail = (reasons?.length ?? 0) > 0 || (concerns?.length ?? 0) > 0 || questions.length > 0;

              return (
                <div key={opp.id} className="bg-gray-800 border border-gray-700 rounded-lg p-5 shadow-lg hover:border-gray-600 transition">
                  <div className="flex justify-between items-start gap-4">
                    <div className="min-w-0">
                      {opp.sourceUrl ? (
                        <a
                          href={opp.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-lg font-bold text-blue-400 hover:text-blue-300 underline underline-offset-4 transition"
                        >
                          {opp.title}
                        </a>
                      ) : (
                        <h2 className="text-lg font-bold text-white">{opp.title}</h2>
                      )}
                      {opp.company && <span className="text-blue-300 font-medium"> · {opp.company}</span>}
                      <div className="flex flex-wrap gap-2 mt-2">
                        {opp.strategicCategory && (
                          <span className={`text-xs font-bold px-2 py-0.5 rounded border ${CATEGORY_BADGE[opp.strategicCategory].className}`}>
                            🎯 {CATEGORY_BADGE[opp.strategicCategory].label}
                          </span>
                        )}
                        {opp.analysisDepth === 'SHALLOW' && (
                          <span
                            className="text-xs font-bold px-2 py-0.5 rounded border bg-amber-950/40 text-amber-400/90 border-amber-800/50"
                            title="Judged on the email snippet only, not the full job description — treat as lower confidence."
                          >
                            ⚠️ SHALLOW · lower confidence
                          </span>
                        )}
                        {opp.industry && <span className="text-xs bg-gray-700 text-gray-300 px-2 py-0.5 rounded border border-gray-600">🏢 {opp.industry}</span>}
                        {opp.location && <span className="text-xs bg-gray-700 text-gray-300 px-2 py-0.5 rounded border border-gray-600">📍 {opp.location}</span>}
                        {opp.remoteStatus && <span className="text-xs bg-gray-700 text-gray-300 px-2 py-0.5 rounded border border-gray-600">☁️ {opp.remoteStatus}</span>}
                      </div>
                    </div>
                    <div className="flex flex-col items-end shrink-0">
                      {/* Strategic Score (#4) is the headline ranking authority; the Fit
                          Score is demoted to a secondary line. Un-scored rows show a dash. */}
                      {opp.strategicScore !== null ? (
                        <span className={`px-3 py-1 rounded-full text-sm font-bold ${opp.strategicScore >= 80 ? 'bg-green-600' : opp.strategicScore >= 60 ? 'bg-yellow-600' : 'bg-gray-600'
                          }`}>
                          Strategic: {opp.strategicScore}
                        </span>
                      ) : (
                        <span className="px-3 py-1 rounded-full text-sm font-bold bg-gray-700 text-gray-400">
                          Strategic: —
                        </span>
                      )}
                      <span className="text-xs text-gray-500 mt-1">Fit: {opp.fitScore}</span>
                      <span className="text-xs text-gray-500 mt-1 uppercase tracking-wider">{opp.status}</span>
                    </div>
                  </div>

                  {/* Both risk levels (#5), always visible on the compact card. */}
                  <div className="flex flex-wrap gap-2 mt-3">
                    {opp.resourceAdminTrapRisk && (
                      <span className={`text-xs px-2 py-0.5 rounded border ${RISK_CLASS[opp.resourceAdminTrapRisk]}`}>
                        Trap risk: {opp.resourceAdminTrapRisk}
                      </span>
                    )}
                    {opp.seoComfortZoneRisk && (
                      <span className={`text-xs px-2 py-0.5 rounded border ${RISK_CLASS[opp.seoComfortZoneRisk]}`}>
                        SEO risk: {opp.seoComfortZoneRisk}
                      </span>
                    )}
                  </div>

                  {summary && (
                    <p className="text-sm text-gray-300 mt-3 italic">
                      &ldquo;{summary}&rdquo;
                    </p>
                  )}

                  {hasDetail && (
                    <button
                      onClick={() => toggleExpanded(opp.id)}
                      className="text-xs font-bold text-blue-400/90 hover:text-blue-300 transition mt-3"
                    >
                      {isOpen ? '▾ Hide detail' : '▸ Show reasons, concerns, questions'}
                    </button>
                  )}

                  {isOpen && (
                    <div className="mt-4 space-y-4 border-t border-gray-700/70 pt-4">
                      {reasons && reasons.length > 0 && (
                        <div>
                          <h3 className="text-xs font-bold text-green-400/80 uppercase mb-1">Why it&apos;s strategic</h3>
                          <ul className="list-disc list-inside text-gray-300 text-sm space-y-0.5">
                            {reasons.map((r, i) => <li key={i}>{r}</li>)}
                          </ul>
                        </div>
                      )}
                      {concerns && concerns.length > 0 && (
                        <div>
                          <h3 className="text-xs font-bold text-red-400/80 uppercase mb-1">Concerns</h3>
                          <ul className="list-disc list-inside text-gray-400 text-sm space-y-0.5">
                            {concerns.map((c, i) => <li key={i}>{c}</li>)}
                          </ul>
                        </div>
                      )}
                      {questions.length > 0 && (
                        <div>
                          <h3 className="text-xs font-bold text-blue-400/80 uppercase mb-1">Screening questions to ask</h3>
                          <ul className="list-disc list-inside text-gray-300 text-sm space-y-0.5">
                            {questions.map((q, i) => <li key={i}>{q}</li>)}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="flex justify-between items-center mt-4 pt-3 border-t border-gray-700">
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
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
