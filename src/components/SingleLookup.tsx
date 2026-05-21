import React, { useState } from 'react';
import { Search, Loader2, Sparkles, Check, Plus, AlertCircle, RefreshCw, Code, Globe, HelpCircle } from 'lucide-react';
import { DomainInfo, WatchlistItem } from '../types';

interface SingleLookupProps {
  onAddToWatchlist: (item: WatchlistItem) => void;
  isInWatchlist: (domain: string) => boolean;
}

export default function SingleLookup({ onAddToWatchlist, isInWatchlist }: SingleLookupProps) {
  const [domainInput, setDomainInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DomainInfo | null>(null);

  // Raw API Response Viewer state
  const [showRaw, setShowRaw] = useState(false);

  // AI analysis state
  const [aiLoading, setAiLoading] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  const handleLookup = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!domainInput.trim()) return;

    setLoading(true);
    setError(null);
    setResult(null);
    setAiAnalysis(null);
    setAiError(null);

    try {
      const response = await fetch('/api/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain: domainInput }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Server error occurred during lookup.');
      }

      const data = await response.json();
      if (data.error) {
        setError(data.error);
      } else {
        setResult(data);
      }
    } catch (err: any) {
      setError(err.message || 'Something went wrong. Please verify domain name.');
    } finally {
      setLoading(false);
    }
  };

  const handleAiAnalyze = async () => {
    if (!result) return;
    setAiLoading(true);
    setAiError(null);
    setAiAnalysis(null);

    try {
      const response = await fetch('/api/ai-analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          domain: result.domain,
          isAvailable: result.available,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to fetch AI insights. Check GEMINI_API_KEY.');
      }

      const data = await response.json();
      setAiAnalysis(data.suggestion);
    } catch (err: any) {
      setAiError(err.message || 'Could not load AI evaluation.');
    } finally {
      setAiLoading(false);
    }
  };

  const currentInWatchlist = result ? isInWatchlist(result.domain) : false;

  const addToWatchlistHandler = () => {
    if (!result) return;
    const item: WatchlistItem = {
      domain: result.domain,
      expiryDate: result.expiryDate,
      registrar: result.registrar,
      expiryDaysRemaining: result.expiryDaysRemaining,
      isExpiringSoon: result.isExpiringSoon,
      isPendingDelete: result.isPendingDelete,
      lastCheckedAt: new Date().toISOString(),
      notes: result.available ? 'Available / Unregistered' : 'Registered'
    };
    onAddToWatchlist(item);
  };

  // Quick helper to render custom AI text elegantly without markdown library
  const formatAiOutput = (text: string) => {
    return text.split('\n').map((line, index) => {
      const trimmed = line.trim();
      if (trimmed.startsWith('###')) {
        return <h4 key={index} className="text-sm font-semibold text-indigo-700 mt-3 mb-1 font-display">{trimmed.replace(/^###\s*/, '')}</h4>;
      }
      if (trimmed.startsWith('##')) {
        return <h3 key={index} className="text-base font-bold text-indigo-800 mt-4 mb-2 border-b border-indigo-100 pb-1 font-display">{trimmed.replace(/^##\s*/, '')}</h3>;
      }
      if (trimmed.startsWith('#')) {
        return <h2 key={index} className="text-lg font-bold text-indigo-950 mt-4 mb-2 font-display">{trimmed.replace(/^#\s*/, '')}</h2>;
      }
      if (trimmed.startsWith('*') || trimmed.startsWith('-')) {
        return (
          <li key={index} className="text-slate-700 text-xs ml-4 list-disc my-1 leading-relaxed">
            {trimmed.replace(/^[\*\-]\s*/, '')}
          </li>
        );
      }
      if (/^\d+\./.test(trimmed)) {
        return (
          <li key={index} className="text-slate-700 text-xs ml-4 list-decimal my-1 leading-relaxed">
            {trimmed.replace(/^\d+\.\s*/, '')}
          </li>
        );
      }
      if (!trimmed) {
        return <div key={index} className="h-2"></div>;
      }
      return <p key={index} className="text-xs text-slate-700 leading-relaxed my-1.5">{trimmed}</p>;
    });
  };

  return (
    <div id="single-lookup-panel" className="space-y-6">
      {/* Search Bar section */}
      <div className="p-6 rounded-xl border border-slate-200 bg-white shadow-sm">
        <h3 className="text-lg font-display font-semibold text-slate-900 mb-2 flex items-center gap-2">
          <Globe className="w-5 h-5 text-indigo-600" />
          Single Domain Checker
        </h3>
        <p className="text-xs text-slate-500 mb-5">
          Enter any domain (e.g. <span className="text-indigo-600 font-mono">myblog.com</span>, <span className="text-indigo-600 font-mono">portfolio.io</span>, or <span className="text-indigo-600 font-mono">coolsaas.ai</span>) to test DNS and parse WHOIS metadata immediately.
        </p>

        <form onSubmit={handleLookup} className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Enter domain name..."
              value={domainInput}
              onChange={(e) => setDomainInput(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-lg text-slate-800 text-sm placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 font-mono transition-all"
            />
          </div>
          <button
            type="submit"
            disabled={loading || !domainInput.trim()}
            className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-semibold text-sm transition-all flex items-center justify-center gap-2 disabled:opacity-55 disabled:cursor-not-allowed cursor-pointer shadow-md shadow-indigo-600/10"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-white" />
                Scanning...
              </>
            ) : (
              <>
                <Search className="w-4 h-4 text-white" />
                Analyze Domain
              </>
            )}
          </button>
        </form>

        {error && (
          <div className="mt-4 p-3.5 rounded-lg border border-rose-200 bg-rose-50 flex items-start gap-2 text-xs text-rose-800">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
            <span>{error}</span>
          </div>
        )}
      </div>

      {/* Result Display section */}
      {result && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main lookup card */}
          <div className="lg:col-span-2 p-6 rounded-xl border border-slate-200 bg-white shadow-sm space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
              <div>
                <span className="text-xs text-slate-400 font-semibold font-mono block uppercase tracking-wider">DOMAIN NAME</span>
                <h2 className="text-2xl font-display font-bold text-slate-900 tracking-tight mt-0.5">
                  {result.domain}
                </h2>
              </div>

              <div className="flex items-center gap-2">
                {result.available ? (
                  <span className="px-3.5 py-1.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-100 flex items-center gap-1.5 animate-pulse">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    Available to Register
                  </span>
                ) : (
                  <span className="px-3.5 py-1.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-100 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                    Already Registered
                  </span>
                )}

                <button
                  onClick={addToWatchlistHandler}
                  disabled={currentInWatchlist}
                  className={`p-2 rounded-lg border transition-all flex items-center gap-1.5 ${
                    currentInWatchlist
                      ? 'bg-slate-50 text-slate-400 border-slate-100 cursor-not-allowed'
                      : 'bg-indigo-50 text-indigo-700 border-indigo-100 hover:bg-indigo-100 cursor-pointer'
                  }`}
                  title={currentInWatchlist ? 'Already in Watchlist' : 'Add to monitor watchlist'}
                >
                  {currentInWatchlist ? (
                    <>
                      <Check className="w-4 h-4 text-emerald-600" />
                      <span className="text-xs hidden sm:inline font-semibold">Monitored</span>
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4" />
                      <span className="text-xs hidden sm:inline font-semibold">Watchlist</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Structured details */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div>
                  <span className="text-slate-400 text-xs font-semibold tracking-wider uppercase block">Registrar</span>
                  <p className="text-sm font-semibold text-slate-800 mt-1">
                    {result.available ? '—' : result.registrar || 'Hidden / Protected'}
                  </p>
                </div>
                <div>
                  <span className="text-slate-400 text-xs font-semibold tracking-wider uppercase block">Registration Date</span>
                  <p className="text-sm font-semibold font-mono text-slate-800 mt-1">
                    {result.available ? '—' : (result.createdDate ? new Date(result.createdDate).toLocaleDateString() : 'N/A')}
                  </p>
                </div>
                <div>
                  <span className="text-slate-400 text-xs font-semibold tracking-wider uppercase block">Expiration Date</span>
                  <p className="text-sm font-semibold font-mono text-slate-800 mt-1 flex items-center gap-2">
                    {result.available ? '—' : (result.expiryDate ? new Date(result.expiryDate).toLocaleDateString() : 'N/A')}
                    {result.isExpiringSoon && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] bg-amber-50 text-amber-700 border border-amber-100 font-bold animate-pulse">
                        EXPIRING SOON
                      </span>
                    )}
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <span className="text-slate-400 text-xs font-semibold tracking-wider uppercase block">Days Remaining</span>
                  <p className="text-sm font-semibold font-mono text-slate-800 mt-1">
                    {result.available ? '—' : (result.expiryDaysRemaining !== undefined ? `${result.expiryDaysRemaining} Days` : 'N/A')}
                  </p>
                </div>
                <div>
                  <span className="text-slate-400 text-xs font-semibold tracking-wider uppercase block">Deletability / Redemption</span>
                  <div className="mt-1">
                    {result.isPendingDelete ? (
                      <span className="px-2 py-0.5 rounded text-xs font-bold bg-rose-50 text-rose-700 border border-rose-100">
                        🚨 PENDING DELETION
                      </span>
                    ) : (
                      <span className="inline-block text-xs font-semibold text-slate-500 font-mono">
                        {result.available ? '—' : 'Safe/Normal'}
                      </span>
                    )}
                  </div>
                </div>
                <div>
                  <span className="text-slate-400 text-xs font-semibold tracking-wider uppercase block">Registry Domain Status</span>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {result.status && result.status.length > 0 ? (
                      result.status.map((st, i) => (
                        <span key={i} className="px-2 py-0.5 rounded bg-slate-50 text-[10px] text-slate-600 font-mono border border-slate-100">
                          {st.toLowerCase()}
                        </span>
                      ))
                    ) : (
                      <span className="text-slate-400 text-xs">No active flags.</span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Nameservers and DNS record detail */}
            <div className="border-t border-slate-100 pt-4 space-y-3.5">
              <div>
                <span className="text-slate-400 text-xs font-semibold font-mono block">RESOLVED NAMESERVERS (NS)</span>
                {result.nsRecords && result.nsRecords.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {result.nsRecords.slice(0, 4).map((ns, i) => (
                      <span key={i} className="px-2.5 py-1 rounded bg-slate-50 text-[11px] text-indigo-700 font-mono border border-slate-100">
                        {ns}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 mt-1">No active nameservers detected.</p>
                )}
              </div>

              {result.dnsRecords && result.dnsRecords.length > 0 && (
                <div>
                  <span className="text-slate-400 text-xs font-semibold font-mono block">IP HOST RESOLUTION</span>
                  <p className="text-xs font-mono text-slate-700 mt-1 font-semibold">{result.dnsRecords.join(', ')}</p>
                </div>
              )}
            </div>

            {/* Collapsible Raw API response viewer */}
            <div className="border-t border-slate-100 pt-4">
              <button
                onClick={() => setShowRaw(!showRaw)}
                className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-indigo-600 cursor-pointer transition-colors font-semibold"
              >
                <Code className="w-3.5 h-3.5 text-slate-400" />
                {showRaw ? 'Hide Raw API JSON Response' : 'Show Raw API JSON Response (Phase 1)'}
              </button>

              {showRaw && (
                <div className="mt-3 p-4 bg-slate-900 text-emerald-400 font-mono text-xs rounded-lg overflow-x-auto max-h-72 border border-slate-800 selection:bg-indigo-900/60 leading-relaxed">
                  <pre>{JSON.stringify(result, null, 2)}</pre>
                </div>
              )}
            </div>
          </div>

          {/* AI branding advice panel */}
          <div className="p-6 rounded-xl border border-indigo-100 bg-indigo-50/50 flex flex-col justify-between shadow-sm">
            <div>
              <div className="flex items-center justify-between border-b border-indigo-100/60 pb-3.5 mb-4">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-indigo-600" />
                  <h3 className="text-sm font-display font-semibold text-indigo-950">
                    Gemini AI Domain Analyst
                  </h3>
                </div>
                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-indigo-150 text-indigo-700 border border-indigo-200">
                  FLASH 3.5
                </span>
              </div>

              {!aiAnalysis && !aiLoading && (
                <div className="space-y-4 text-center py-6">
                  <div className="p-3 bg-indigo-100 border border-indigo-200 rounded-full w-12 h-12 flex items-center justify-center mx-auto text-indigo-600">
                    <Sparkles className="w-5 h-5" />
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-slate-800">
                      Evaluate Brand Value
                    </p>
                    <p className="text-[11px] text-slate-500 leading-relaxed px-2">
                      Let custom Gemini algorithms score this domain, detect niches, or suggest 8 premium alternatives.
                    </p>
                  </div>
                </div>
              )}

              {aiLoading && (
                <div className="flex flex-col items-center justify-center py-10 space-y-3">
                  <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
                  <p className="text-xs text-slate-500 animate-pulse font-semibold">Consulting branding engine...</p>
                </div>
              )}

              {aiError && (
                <div className="p-3.5 rounded-lg border border-rose-200 bg-rose-50 text-[11px] text-rose-800">
                  {aiError}
                </div>
              )}

              {aiAnalysis && (
                <div className="max-h-[350px] overflow-y-auto pr-1 text-slate-700 space-y-1">
                  {formatAiOutput(aiAnalysis)}
                </div>
              )}
            </div>

            {!aiLoading && (
              <button
                onClick={handleAiAnalyze}
                className="w-full mt-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-md shadow-indigo-600/10"
              >
                {aiAnalysis ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 text-white" />
                    Re-Analyze Domain
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5 text-white animate-pulse" />
                    Generate AI Evaluation
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
