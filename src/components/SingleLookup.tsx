import React, { useState, useEffect } from 'react';
import { 
  Search, 
  Loader2, 
  Sparkles, 
  Check, 
  Plus, 
  AlertCircle, 
  RefreshCw, 
  Code, 
  Globe, 
  X, 
  Filter, 
  ChevronRight, 
  ArrowRight,
  BookmarkCheck,
  CheckSquare,
  Square
} from 'lucide-react';
import { DomainInfo, WatchlistItem } from '../types';
import { ALL_100_EXTENSIONS, DomainExtension } from '../utils/extensions';

interface SingleLookupProps {
  onAddToWatchlist: (item: WatchlistItem) => void;
  isInWatchlist: (domain: string) => boolean;
}

const TOP_10_EXT_STRINGS = ['.com', '.net', '.org', '.io', '.ai', '.co', '.app', '.dev', '.tech', '.xyz'];

export default function SingleLookup({ onAddToWatchlist, isInWatchlist }: SingleLookupProps) {
  // Input states
  const [domainInput, setDomainInput] = useState('wordwide, brandlabs');
  const [selectedExtensions, setSelectedExtensions] = useState<string[]>(['.com', '.io', '.ai']);
  const [searchTldQuery, setSearchTldQuery] = useState('');
  const [showAllTlds, setShowAllTlds] = useState(false);

  // Status & results
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<DomainInfo[] | null>(null);
  
  // Audited (Selected result in split panel view)
  const [selectedResult, setSelectedResult] = useState<DomainInfo | null>(null);

  // Tab filter
  const [filterTab, setFilterTab] = useState<'all' | 'available' | 'registered'>('all');

  // Raw API Response Viewer state
  const [showRaw, setShowRaw] = useState(false);

  // AI analysis state
  const [aiLoading, setAiLoading] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  // Auto-reset selection if result is no longer present
  useEffect(() => {
    if (results && results.length > 0) {
      // Find currently selected if it still exists
      const exists = results.some(r => r.domain === selectedResult?.domain);
      if (!exists) {
        setSelectedResult(results[0]);
        setAiAnalysis(null);
        setAiError(null);
      }
    } else {
      setSelectedResult(null);
      setAiAnalysis(null);
      setAiError(null);
    }
  }, [results]);

  // Keep AI suggestion refreshed when selectedResult changes
  useEffect(() => {
    setAiAnalysis(null);
    setAiError(null);
  }, [selectedResult]);

  // Toggle extension helper
  const handleToggleExtension = (ext: string) => {
    if (selectedExtensions.includes(ext)) {
      setSelectedExtensions(selectedExtensions.filter(e => e !== ext));
    } else {
      setSelectedExtensions([...selectedExtensions, ext]);
    }
  };

  const selectTop10 = () => {
    setSelectedExtensions(TOP_10_EXT_STRINGS);
  };

  const selectAll100 = () => {
    setSelectedExtensions(ALL_100_EXTENSIONS.map(item => item.ext));
  };

  const clearExtensions = () => {
    setSelectedExtensions([]);
  };

  const handleLookup = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!domainInput.trim()) return;
    if (selectedExtensions.length === 0) {
      setError('Please select at least one domain extension to search.');
      return;
    }

    setLoading(true);
    setError(null);
    setResults(null);
    setSelectedResult(null);
    setAiAnalysis(null);
    setAiError(null);

    // 1. Parse base names (supports commas, spaces, semi-colons, newlines)
    const baseNames = domainInput
      .split(/[\s,;\n]+/)
      .map(name => {
        let cleaned = name.trim().toLowerCase();
        // Strip out protocol if any
        cleaned = cleaned.replace(/^(https?:\/\/)?(www\.)?/, '');
        // Strip common trailing slash or path components
        cleaned = cleaned.split('/')[0];
        // Strip any accidental extension (like .com, .xyz, etc.)
        cleaned = cleaned.replace(/\.[a-z0-9-]{2,}$/i, '');
        // Clean characters leaving only valid domain label parts
        cleaned = cleaned.replace(/[^a-z0-9-]/gi, '');
        return cleaned;
      })
      .filter(name => name.length > 0);

    if (baseNames.length === 0) {
      setError('Please type at least one valid domain base name.');
      setLoading(false);
      return;
    }

    // 2. Generate all combinations of base name + selected extensions
    const generatedDomains: string[] = [];
    baseNames.forEach(base => {
      selectedExtensions.forEach(ext => {
        // Ensure extension has dot
        const formattedExt = ext.startsWith('.') ? ext : `.${ext}`;
        generatedDomains.push(`${base}${formattedExt}`);
      });
    });

    if (generatedDomains.length === 0) {
      setError('Zero search combinations generated. Check your input.');
      setLoading(false);
      return;
    }

    try {
      const response = await fetch('/api/bulk-lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domains: generatedDomains }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Server error occurred during check.');
      }

      const data = await response.json();
      if (data.error) {
        setError(data.error);
      } else {
        const list: DomainInfo[] = data.results || [];
        setResults(list);
        if (list.length > 0) {
          // Default select the first available domain, or the first one checked
          const firstAvailable = list.find(r => r.available);
          setSelectedResult(firstAvailable || list[0]);
        }
      }
    } catch (err: any) {
      setError(err.message || 'Verification failed. Please verify configurations.');
    } finally {
      setLoading(false);
    }
  };

  const handleAiAnalyze = async () => {
    if (!selectedResult) return;
    setAiLoading(true);
    setAiError(null);
    setAiAnalysis(null);

    try {
      const response = await fetch('/api/ai-analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          domain: selectedResult.domain,
          isAvailable: selectedResult.available,
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

  const handleAddSelectedToWatchlist = (item: DomainInfo) => {
    const watchItem: WatchlistItem = {
      domain: item.domain,
      expiryDate: item.expiryDate,
      registrar: item.registrar,
      expiryDaysRemaining: item.expiryDaysRemaining,
      isExpiringSoon: item.isExpiringSoon,
      isPendingDelete: item.isPendingDelete,
      lastCheckedAt: new Date().toISOString(),
      notes: item.available ? 'Available / Unregistered' : 'Registered'
    };
    onAddToWatchlist(watchItem);
  };

  // Filtering results
  const filteredResults = results ? results.filter(r => {
    if (filterTab === 'available') return r.available;
    if (filterTab === 'registered') return !r.available;
    return true;
  }) : [];

  // TLD search results
  const filteredAllTlds = ALL_100_EXTENSIONS.filter(item => {
    const search = searchTldQuery.trim().toLowerCase();
    if (!search) return true;
    return item.ext.toLowerCase().includes(search) || item.desc.toLowerCase().includes(search);
  });

  // Calculate totals
  const totalCount = results ? results.length : 0;
  const availableCount = results ? results.filter(r => r.available).length : 0;
  const registeredCount = results ? results.filter(r => !r.available).length : 0;

  // Format HTML-like structured output from Gemini elegantly
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
      {/* Brand & Extension Input panel */}
      <div className="p-6 rounded-xl border border-slate-200 bg-white shadow-sm space-y-5">
        <div className="flex items-center gap-2">
          <Globe className="w-5 h-5 text-indigo-600" />
          <h3 className="text-lg font-display font-semibold text-slate-900">
            Multi-Extension Domain Explorer
          </h3>
        </div>
        <p className="text-xs text-slate-500">
          Type the core parts of your desired domain names (e.g., <span className="text-indigo-600 font-mono">brandlabs</span>, or multiple items separated by commas like <span className="text-indigo-600 font-mono">brand, digital, tech</span>). We will automatically check availability across all your selected extensions.
        </p>

        <form onSubmit={handleLookup} className="space-y-5">
          {/* Domain Base Name inputs */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
              Domain Base Names (Comma or white space separated, no extensions needed)
            </label>
            <div className="relative">
              <Search className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="e.g. brandname, digitalspace, cleverapp"
                value={domainInput}
                onChange={(e) => setDomainInput(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-lg text-slate-800 text-sm placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 font-mono transition-all shadow-inner"
              />
            </div>
            <p className="text-[10px] text-slate-400 mt-1.5">
              💡 You can look up multiple names simultaneously. Example: <span className="text-slate-600 font-mono">google, apple, microsoft</span>
            </p>
          </div>

          {/* Quick Popular TLD Toggles */}
          <div className="space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2">
              <span className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                Select Extensions to Check ({selectedExtensions.length} selected)
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={selectTop10}
                  className="px-2 py-1 rounded bg-slate-50 hover:bg-slate-100 text-[10px] font-bold text-indigo-600 border border-slate-200 cursor-pointer transition-colors"
                >
                  Select Top 10
                </button>
                <button
                  type="button"
                  onClick={selectAll100}
                  className="px-2 py-1 rounded bg-slate-50 hover:bg-slate-100 text-[10px] font-bold text-indigo-600 border border-slate-200 cursor-pointer transition-colors"
                >
                  Select All 100
                </button>
                <button
                  type="button"
                  onClick={clearExtensions}
                  className="px-2 py-1 rounded bg-slate-50 hover:bg-rose-50 text-[10px] font-bold text-rose-600 border border-slate-200 cursor-pointer transition-colors"
                >
                  Clear All
                </button>
              </div>
            </div>

            {/* Render Top 10 Extensions list */}
            <div className="flex flex-wrap gap-2 py-1">
              {TOP_10_EXT_STRINGS.map((ext) => {
                const isSelected = selectedExtensions.includes(ext);
                return (
                  <button
                    key={ext}
                    type="button"
                    onClick={() => handleToggleExtension(ext)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border flex items-center gap-1 cursor-pointer ${
                      isSelected
                        ? 'bg-indigo-600 border-indigo-650 text-white shadow-sm shadow-indigo-600/10'
                        : 'bg-white border-slate-200 text-slate-700 hover:border-indigo-450 hover:bg-slate-50/50'
                    }`}
                  >
                    {isSelected && <Check className="w-3.5 h-3.5" />}
                    {ext}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Searchable TLDs Panel Toggle */}
          <div className="border border-indigo-100/80 rounded-xl bg-indigo-50/15 p-4 shadow-sm transition-all duration-300 hover:shadow-md">
            <button
              type="button"
              onClick={() => setShowAllTlds(!showAllTlds)}
              className="flex flex-col sm:flex-row items-start sm:items-center justify-between w-full gap-3 text-sm font-semibold text-slate-800 hover:text-indigo-650 cursor-pointer group"
            >
              <span className="flex items-center gap-2.5 text-slate-705">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-600"></span>
                </span>
                <Globe className="w-4 h-4 text-indigo-500 group-hover:rotate-12 transition-transform" />
                <span className="font-display font-bold text-slate-700 group-hover:text-indigo-700">
                  {showAllTlds ? 'Hide Searchable Top 100 TLDs Directory' : 'Explore & Select from Top 100 TLDs Directory'}
                </span>
              </span>
              
              <span className={`px-4.5 py-2 font-mono text-xs font-bold rounded-lg transition-all duration-300 flex items-center justify-center gap-1.5 cursor-pointer shadow-md select-none transform hover:-translate-y-0.5 active:translate-y-0 ${
                showAllTlds
                  ? 'bg-slate-800 text-white shadow-slate-900/10 hover:bg-slate-900'
                  : 'bg-gradient-to-r from-indigo-600 to-indigo-700 text-white shadow-[0_0_15px_rgba(79,70,229,0.45)] hover:shadow-[0_0_20px_rgba(79,70,229,0.65)] hover:from-indigo-500 hover:to-indigo-700 border border-indigo-500 text-white animate-pulse'
              }`}>
                <span>{showAllTlds ? 'Collapse ▲' : 'Expand ▼'}</span>
              </span>
            </button>

            {showAllTlds && (
              <div className="mt-3.5 space-y-3 pt-3 border-t border-slate-200/60">
                <div className="relative">
                  <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search from 100 domains extension (e.g. startup, tech, online)..."
                    value={searchTldQuery}
                    onChange={(e) => setSearchTldQuery(e.target.value)}
                    className="w-full pl-8 pr-4 py-1.5 bg-white border border-slate-200 rounded text-slate-700 text-xs focus:outline-none focus:border-indigo-500 font-sans"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-1.5 max-h-56 overflow-y-auto pr-1">
                  {filteredAllTlds.map((item) => {
                    const isSelected = selectedExtensions.includes(item.ext);
                    return (
                      <div
                        key={item.id}
                        onClick={() => handleToggleExtension(item.ext)}
                        className={`p-2 rounded border flex items-center justify-between text-xs cursor-pointer select-none transition-colors ${
                          isSelected
                            ? 'bg-indigo-50 border-indigo-200 text-indigo-800'
                            : 'bg-white border-slate-150 text-slate-650 hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex flex-col">
                          <span className="font-bold font-mono text-slate-800">{item.ext}</span>
                          <span className="text-[9px] text-slate-400 mt-0.5">{item.desc}</span>
                        </div>
                        {isSelected ? (
                          <CheckSquare className="w-3.5 h-3.5 text-indigo-600 shrink-0 ml-1" />
                        ) : (
                          <Square className="w-3.5 h-3.5 text-slate-300 shrink-0 ml-1" />
                        )}
                      </div>
                    );
                  })}
                  {filteredAllTlds.length === 0 && (
                    <div className="col-span-full py-4 text-center text-xs text-slate-400">
                      No matching extensions found.
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={loading || selectedExtensions.length === 0}
            className="w-full py-3 bg-indigo-600 hover:bg-indigo-505 text-white rounded-lg font-semibold text-sm transition-all flex items-center justify-center gap-2 disabled:opacity-55 disabled:cursor-not-allowed cursor-pointer shadow-md shadow-indigo-600/10 hover:bg-indigo-500"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-white" />
                Scanning all {selectedExtensions.length * 2} combinations...
              </>
            ) : (
              <>
                <Search className="w-4 h-4 text-white" />
                Analyze Domain Combinations ({selectedExtensions.length} TLDs x Names)
              </>
            )}
          </button>
        </form>

        {error && (
          <div className="p-3.5 rounded-lg border border-rose-200 bg-rose-50 flex items-start gap-2 text-xs text-rose-800">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
            <span>{error}</span>
          </div>
        )}
      </div>

      {/* Aggregate Statistics overview */}
      {results && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-sm flex flex-col justify-center">
            <span className="text-slate-400 text-[10px] font-bold uppercase tracking-wider">Total Evaluated</span>
            <span className="text-xl font-bold font-display text-slate-800 mt-1">{totalCount} Domains</span>
          </div>
          <div className="p-4 rounded-xl border border-emerald-150 bg-emerald-50/20 shadow-sm flex flex-col justify-center">
            <span className="text-emerald-500 text-[10px] font-bold uppercase tracking-wider">Available (Free)</span>
            <span className="text-xl font-bold font-display text-emerald-700 mt-1 flex items-center gap-1.5">
              {availableCount} TLDs
              <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block animate-pulse" />
            </span>
          </div>
          <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-sm flex flex-col justify-center">
            <span className="text-slate-400 text-[10px] font-bold uppercase tracking-wider">Registered (Taken)</span>
            <span className="text-xl font-bold font-display text-slate-850 mt-1">{registeredCount} Taken</span>
          </div>
        </div>
      )}

      {/* Main split display: left combination cards, right deep-dive WHOIS / AI Analyst */}
      {results && results.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* LEFT: Combination list column (5 cols) */}
          <div className="lg:col-span-5 space-y-4">
            <div className="flex items-center justify-between bg-slate-50 p-2 rounded-lg border border-slate-150">
              <span className="text-xs font-semibold text-slate-650 flex items-center gap-1">
                <Filter className="w-3.5 h-3.5 text-slate-500" />
                Filter list
              </span>
              <div className="flex gap-1.5">
                <button
                  onClick={() => setFilterTab('all')}
                  className={`px-2 py-1 rounded text-[10px] font-bold transition-all cursor-pointer ${
                    filterTab === 'all'
                      ? 'bg-slate-300 text-slate-800'
                      : 'bg-white hover:bg-slate-100 text-slate-600 border border-slate-200'
                  }`}
                >
                  All ({totalCount})
                </button>
                <button
                  onClick={() => setFilterTab('available')}
                  className={`px-2 py-1 rounded text-[10px] font-bold transition-all cursor-pointer ${
                    filterTab === 'available'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-white hover:bg-emerald-50 text-emerald-600 border border-emerald-100'
                  }`}
                >
                  Free ({availableCount})
                </button>
                <button
                  onClick={() => setFilterTab('registered')}
                  className={`px-2 py-1 rounded text-[10px] font-bold transition-all cursor-pointer ${
                    filterTab === 'registered'
                      ? 'bg-slate-800 text-white'
                      : 'bg-white hover:bg-slate-100 text-slate-600 border border-slate-200'
                  }`}
                >
                  Taken ({registeredCount})
                </button>
              </div>
            </div>

            {/* List entries */}
            <div className="space-y-2.5 max-h-[500px] overflow-y-auto pr-1">
              {filteredResults.map((item) => {
                const isSelected = selectedResult?.domain === item.domain;
                const isItemInWatchlist = isInWatchlist(item.domain);

                return (
                  <div
                    key={item.domain}
                    onClick={() => setSelectedResult(item)}
                    className={`p-3.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                      isSelected
                        ? 'bg-indigo-50/70 border-indigo-450 shadow-sm ring-1 ring-indigo-400'
                        : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/40'
                    }`}
                  >
                    <div className="space-y-1 block min-w-0 pr-2">
                      <span className="font-bold text-sm tracking-tight text-slate-850 font-mono truncate block">
                        {item.domain}
                      </span>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {item.available ? (
                          <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-100 flex items-center gap-1">
                            <span className="w-1 h-1 rounded-full bg-emerald-500" />
                            Available
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-slate-100 text-slate-650 border border-slate-200">
                            Taken
                          </span>
                        )}
                        {item.expiryDaysRemaining !== undefined && item.expiryDaysRemaining <= 30 && (
                          <span className="px-1.5 py-0.5 rounded text-[8px] bg-amber-50 text-amber-700 font-bold border border-amber-100">
                            Exp {item.expiryDaysRemaining}d
                          </span>
                        )}
                        {isItemInWatchlist && (
                          <span className="text-emerald-600" title="Being tracked in watchlist">
                            <BookmarkCheck className="w-3.5 h-3.5 inline" />
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2shrink-0">
                      {item.available && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleAddSelectedToWatchlist(item);
                          }}
                          disabled={isItemInWatchlist}
                          className={`p-1.5 rounded-md border transition-all ${
                            isItemInWatchlist
                              ? 'bg-slate-50 text-slate-350 border-slate-100'
                              : 'bg-emerald-50 text-emerald-700 border-emerald-100 hover:bg-emerald-100'
                          }`}
                          title="Save to Monitor Watchlist"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      )}
                      
                      <ChevronRight className={`w-4 h-4 transition-transform ${
                        isSelected ? 'text-indigo-600 translate-x-1' : 'text-slate-350'
                      }`} />
                    </div>
                  </div>
                );
              })}

              {filteredResults.length === 0 && (
                <div className="py-12 text-center rounded-xl border border-dashed border-slate-200 bg-slate-50/50">
                  <Globe className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <p className="text-xs text-slate-500 font-semibold">No domains found matching this filter.</p>
                </div>
              )}
            </div>
          </div>

          {/* RIGHT: Selected Result Audit Panel (7 cols) */}
          <div className="lg:col-span-7 space-y-6">
            {selectedResult ? (
              <div id="deep-lookup-panel" className="grid grid-cols-1 gap-6">
                
                {/* WHOIS & Tech Specs Card */}
                <div className="p-6 rounded-xl border border-slate-200 bg-white shadow-sm space-y-5">
                  <div className="flex flex-wrap items-center justify-between gap-4 border-b border-rose-50 pb-4">
                    <div>
                      <span className="text-xs text-slate-400 font-semibold font-mono block uppercase tracking-wider">SELECTED DOMAIN AUDIT</span>
                      <h2 className="text-xl font-display font-bold text-slate-900 mt-0.5 font-mono">
                        {selectedResult.domain}
                      </h2>
                    </div>

                    <div className="flex items-center gap-2">
                      {selectedResult.available ? (
                        <span className="px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-100 flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                          Unregistered - Available
                        </span>
                      ) : (
                        <span className="px-3 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-100 flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                          Registered / Reserved
                        </span>
                      )}

                      <button
                        onClick={() => handleAddSelectedToWatchlist(selectedResult)}
                        disabled={isInWatchlist(selectedResult.domain)}
                        className={`p-2 rounded-lg border transition-all flex items-center gap-1 ${
                          isInWatchlist(selectedResult.domain)
                            ? 'bg-slate-50 text-slate-400 border-slate-150 cursor-not-allowed'
                            : 'bg-indigo-50 text-indigo-700 border-indigo-150 hover:bg-indigo-100 cursor-pointer'
                        }`}
                        title="Add to monitor watchlist"
                      >
                        {isInWatchlist(selectedResult.domain) ? (
                          <Check className="w-4 h-4 text-emerald-600" />
                        ) : (
                          <Plus className="w-4 h-4" />
                        )}
                        <span className="text-xs font-semibold">Watchlist</span>
                      </button>
                    </div>
                  </div>

                  {/* DNS & WHOIS Event Information table */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                    <div className="space-y-3">
                      <div>
                        <span className="text-slate-400 font-medium block">Registrar Vendor</span>
                        <p className="font-semibold text-slate-800 mt-0.5">
                          {selectedResult.available ? 'Not applicable' : selectedResult.registrar || 'Protected / Hidden'}
                        </p>
                      </div>
                      <div>
                        <span className="text-slate-400 font-medium block">Registration Date</span>
                        <p className="font-mono font-semibold text-slate-800 mt-0.5">
                          {selectedResult.available ? '—' : (selectedResult.createdDate ? new Date(selectedResult.createdDate).toLocaleDateString() : 'Unknown')}
                        </p>
                      </div>
                      <div>
                        <span className="text-slate-400 font-medium block">Expiry Date</span>
                        <p className="font-mono font-semibold text-slate-850 mt-0.5 flex items-center gap-1.5">
                          {selectedResult.available ? '—' : (selectedResult.expiryDate ? new Date(selectedResult.expiryDate).toLocaleDateString() : 'N/A')}
                          {selectedResult.isExpiringSoon && (
                            <span className="px-1.5 py-0.5 rounded text-[8px] bg-amber-100 text-amber-800 font-extrabold animate-pulse">
                              EXPIRING
                            </span>
                          )}
                        </p>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div>
                        <span className="text-slate-400 font-medium block">Days Left</span>
                        <p className="font-mono font-semibold text-slate-800 mt-0.5">
                          {selectedResult.available ? 'Available' : (selectedResult.expiryDaysRemaining !== undefined ? `${selectedResult.expiryDaysRemaining} Days` : 'N/A')}
                        </p>
                      </div>
                      <div>
                        <span className="text-slate-400 font-medium block">Redemption Danger Flag</span>
                        <p className="font-semibold mt-0.5">
                          {selectedResult.isPendingDelete ? (
                            <span className="px-1.5 py-0.5 rounded text-[10px] bg-rose-50 text-rose-700 font-bold border border-rose-100">
                              PENDING DELETE
                            </span>
                          ) : (
                            <span className="text-slate-500">None / Normal</span>
                          )}
                        </p>
                      </div>
                      <div>
                        <span className="text-slate-400 font-medium block">Registry Status Flags</span>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {selectedResult.status && selectedResult.status.length > 0 ? (
                            selectedResult.status.slice(0, 3).map((st, i) => (
                              <span key={i} className="px-1.5 py-0.5 rounded bg-slate-50 text-[9px] text-slate-650 font-mono border border-slate-100">
                                {st.toLowerCase()}
                              </span>
                            ))
                          ) : (
                            <span className="text-slate-400">Stable</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Nameservers (DNS Specs) */}
                  <div className="border-t border-slate-105 pt-4 space-y-3">
                    <div>
                      <span className="text-slate-400 text-[10px] font-bold block uppercase">Nameservers (NS Records)</span>
                      {selectedResult.nsRecords && selectedResult.nsRecords.length > 0 ? (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {selectedResult.nsRecords.slice(0, 3).map((ns, i) => (
                            <span key={i} className="px-2 py-0.5 text-[10px] font-mono rounded bg-indigo-50/50 border border-indigo-100/50 text-indigo-700 truncate max-w-full">
                              {ns}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="text-[11px] text-slate-400 mt-1">No Name Servers returned from DNS records</p>
                      )}
                    </div>

                    {selectedResult.dnsRecords && selectedResult.dnsRecords.length > 0 && (
                      <div>
                        <span className="text-slate-400 text-[10px] font-bold block uppercase">IP Resolution</span>
                        <p className="text-[11px] font-mono text-slate-700 mt-1 font-semibold">{selectedResult.dnsRecords.join(', ')}</p>
                      </div>
                    )}
                  </div>

                  {/* Collapsible raw schema details */}
                  <div className="border-t border-slate-100 pt-3">
                    <button
                      onClick={() => setShowRaw(!showRaw)}
                      className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-indigo-600 cursor-pointer font-semibold"
                    >
                      <Code className="w-3.5 h-3.5" />
                      {showRaw ? 'Conseal system technical data' : 'Disclose RDAP metadata raw payload'}
                    </button>
                    {showRaw && (
                      <div className="mt-3 p-4 bg-slate-900 text-emerald-400 font-mono text-[10px] rounded-lg overflow-x-auto max-h-48 border border-slate-800">
                        <pre>{JSON.stringify(selectedResult, null, 2)}</pre>
                      </div>
                    )}
                  </div>
                </div>

                {/* Smart AI Brand Diagnostics Panel on the fly */}
                <div className="p-6 rounded-xl border border-indigo-100 bg-indigo-50/40 shadow-sm flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between border-b border-indigo-100/60 pb-3 mb-4">
                      <div className="flex items-center gap-2">
                        <Sparkles className="w-5 h-5 text-indigo-600" />
                        <h3 className="text-sm font-display font-semibold text-indigo-950">
                          Smart AI Brand Diagnostics
                        </h3>
                      </div>
                      <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-indigo-105 bg-indigo-100 text-indigo-700 border border-indigo-200 uppercase font-mono">
                        Active Layer
                      </span>
                    </div>

                    {!aiAnalysis && !aiLoading && (
                      <div className="space-y-4 text-center py-6">
                        <div className="p-3 bg-indigo-100 border border-indigo-200 rounded-full w-12 h-12 flex items-center justify-center mx-auto text-indigo-600">
                          <Sparkles className="w-5 h-5" />
                        </div>
                        <div className="space-y-2">
                          <p className="text-xs font-semibold text-slate-800">
                            Evaluate Brand & Domain Value
                          </p>
                          <p className="text-[11px] text-slate-500 leading-relaxed max-w-sm mx-auto">
                            Review and evaluate this domain with our Smart AI Engine. If the domain is available, it analyzes SEO value, readability, and brand score. If registered, it suggests premium alternatives with smart extensions.
                          </p>
                        </div>
                      </div>
                    )}

                    {aiLoading && (
                      <div className="flex flex-col items-center justify-center py-10 space-y-3">
                        <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
                        <p className="text-xs text-slate-500 font-semibold animate-pulse">Smart AI is analyzing brand dynamics...</p>
                      </div>
                    )}

                    {aiError && (
                      <div className="p-3.5 rounded-lg border border-rose-200 bg-rose-50 text-[11px] text-rose-800">
                        {aiError}
                      </div>
                    )}

                    {aiAnalysis && (
                      <div className="max-h-[300px] overflow-y-auto pr-1 text-slate-700 space-y-1">
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
                          <RefreshCw className="w-3.5 h-3.5" />
                          Re-Analyze Brand
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-3.5 h-3.5 animate-pulse" />
                          Analyze {selectedResult.domain} with Smart AI 💡
                        </>
                      )}
                    </button>
                  )}
                </div>

              </div>
            ) : (
              <div className="p-12 text-center rounded-xl border border-dashed border-slate-200 bg-slate-50/50">
                <Globe className="w-12 h-12 text-slate-300 mx-auto mb-2" />
                <p className="text-sm font-semibold text-slate-500">No Domain Selected</p>
                <p className="text-xs text-slate-400 mt-1">Select any domain result from the left list to review detailed public WHOIS information, DNS server status, and smart AI diagnostics.</p>
              </div>
            )}
          </div>

        </div>
      )}
    </div>
  );
}
