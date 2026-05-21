import React, { useState, useRef } from 'react';
import { UploadCloud, Play, Loader2, Download, Filter, Plus, Check, Trash2, HelpCircle, Layers, FileText } from 'lucide-react';
import { DomainInfo, WatchlistItem } from '../types';

interface BulkCheckProps {
  onAddToWatchlist: (item: WatchlistItem) => void;
  isInWatchlist: (domain: string) => boolean;
}

export default function BulkCheck({ onAddToWatchlist, isInWatchlist }: BulkCheckProps) {
  const [inputText, setInputText] = useState('');
  const [scanning, setScanning] = useState(false);
  const [scannedCount, setScannedCount] = useState(0);
  const [totalToScan, setTotalToScan] = useState(0);
  const [currentScanningDomain, setCurrentScanningDomain] = useState('');
  
  const [results, setResults] = useState<DomainInfo[]>([]);
  const [filter, setFilter] = useState<'all' | 'available' | 'registered' | 'expiring'>('all');
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);

  // Parse list of domains from string text
  const parseDomains = (text: string): string[] => {
    // Regex or split by newlines, commas, spaces
    const parts = text.split(/[\n,; \t]+/);
    return parts
      .map(part => {
        let clean = part.trim().toLowerCase();
        // Remove protocols
        clean = clean.replace(/^(https?:\/\/)?(www\.)?/, '');
        clean = clean.split('/')[0];
        return clean;
      })
      .filter(domain => /^[a-z0-9]+[a-z0-9-]*(\.[a-z0-9-]+)*\.[a-z]{2,}$/i.test(domain));
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputText(e.target.value);
  };

  // CSV parsing logic through standard FileReader
  const handleFileProcess = (file: File) => {
    if (!file) return;
    
    // Check if TXT or CSV
    const reader = new FileReader();
    reader.onload = (e) => {
      const contents = e.target?.result as string;
      if (!contents) return;

      const foundDomains = parseDomains(contents);
      
      if (foundDomains.length > 0) {
        // Append or replace
        const uniqueDomains = Array.from(new Set([
          ...parseDomains(inputText),
          ...foundDomains
        ]));
        setInputText(uniqueDomains.join('\n'));
      }
    };
    reader.readAsText(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFileProcess(e.target.files[0]);
    }
  };

  // Drag and drop event handlers
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileProcess(e.dataTransfer.files[0]);
    }
  };

  // Execute Bulk Lookup scan using chunked requests to the backend API
  const handleStartScan = async () => {
    const listToScan = parseDomains(inputText);
    const uniqueList = Array.from(new Set(listToScan));

    if (uniqueList.length === 0) return;

    setScanning(true);
    setScannedCount(0);
    setTotalToScan(uniqueList.length);
    setResults([]);
    
    // Split uniqueList into batches of 10 for fine progress reporting
    const batchSize = 10;
    const accumulated: DomainInfo[] = [];

    for (let i = 0; i < uniqueList.length; i += batchSize) {
      const chunk = uniqueList.slice(i, i + batchSize);
      setCurrentScanningDomain(chunk[0] + (chunk.length > 1 ? ` & ${chunk.length - 1} more` : ''));

      try {
        const response = await fetch('/api/bulk-lookup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ domains: chunk }),
        });

        if (!response.ok) {
          throw new Error('Failed to retrieve batch results');
        }

        const data = await response.json();
        if (data.results && Array.isArray(data.results)) {
          accumulated.push(...data.results);
          setResults([...accumulated]);
          setScannedCount(prev => Math.min(prev + chunk.length, uniqueList.length));
        }
      } catch (err) {
        // Fallback placeholder error entries
        chunk.forEach(domain => {
          accumulated.push({
            domain,
            available: false,
            error: 'Server timeout or API error',
            checkedAt: new Date().toISOString()
          });
        });
        setResults([...accumulated]);
        setScannedCount(prev => Math.min(prev + chunk.length, uniqueList.length));
      }
    }

    setScanning(false);
    setCurrentScanningDomain('');
  };

  // Watchlist handlers
  const handleAddWatchlist = (result: DomainInfo) => {
    const item: WatchlistItem = {
      domain: result.domain,
      expiryDate: result.expiryDate,
      registrar: result.registrar,
      expiryDaysRemaining: result.expiryDaysRemaining,
      isExpiringSoon: result.isExpiringSoon,
      isPendingDelete: result.isPendingDelete,
      lastCheckedAt: new Date().toISOString(),
      notes: result.available ? 'Available' : 'Registered / Scanned'
    };
    onAddToWatchlist(item);
  };

  const handleBulkAddWatchlist = () => {
    // Add all filtered items that are not already in the watchlist
    const itemsToAdd = filteredResults.filter(r => !isInWatchlist(r.domain));
    itemsToAdd.forEach(result => {
      handleAddWatchlist(result);
    });
  };

  // Export results array to high-fidelity CSV download
  const handleExportCSV = () => {
    if (results.length === 0) return;

    const headers = ['Domain Name', 'Availability', 'Created Date', 'Expiry Date', 'Days Remaining', 'Registrar', 'Status', 'Checked At'];
    const rows = results.map(r => [
      r.domain,
      r.available ? 'Available' : 'Registered',
      r.createdDate ? new Date(r.createdDate).toLocaleDateString() : 'N/A',
      r.expiryDate ? new Date(r.expiryDate).toLocaleDateString() : 'N/A',
      r.expiryDaysRemaining !== undefined ? r.expiryDaysRemaining : 'N/A',
      r.registrar || 'N/A',
      r.status ? r.status.join(' | ') : 'N/A',
      new Date(r.checkedAt).toLocaleString()
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(e => e.map(val => `"${String(val).replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `domain_scan_results_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Filtering rules
  const filteredResults = results.filter(r => {
    if (filter === 'available') return r.available;
    if (filter === 'registered') return !r.available;
    if (filter === 'expiring') return r.isExpiringSoon || r.isPendingDelete;
    return true;
  });

  const progressPercent = totalToScan > 0 ? Math.round((scannedCount / totalToScan) * 100) : 0;

  return (
    <div id="bulk-lookup-panel" className="space-y-6">
      {/* Upload/Paste Slate input box */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 p-6 rounded-xl border border-slate-200 bg-white shadow-sm flex flex-col">
          <label className="text-sm font-display font-semibold text-slate-900 mb-2 flex items-center gap-2">
            <Layers className="w-4.5 h-4.5 text-indigo-600" />
            Paste Domain Target List
          </label>
          <textarea
            placeholder="Type or paste domain list here (e.g.&#10;google.com&#10;techbrand.ai, portfolio.co, shopnow.io)&#10;Supports spaces, commas, or new lines."
            value={inputText}
            onChange={handleTextChange}
            disabled={scanning}
            className="flex-1 min-h-[160px] p-4 bg-white border border-slate-200 rounded-lg text-slate-800 text-xs font-mono placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 transition-all leading-relaxed"
          />
          <div className="flex items-center justify-between mt-3.5 pt-3.5 border-t border-slate-100">
            <span className="text-xs text-slate-500 font-medium">
              Unique domains detected: <strong className="text-indigo-600 font-mono font-bold">{parseDomains(inputText).length}</strong>
            </span>
            <button
              onClick={handleStartScan}
              disabled={scanning || parseDomains(inputText).length === 0}
              className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-bold text-xs transition-all flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shadow-md shadow-indigo-600/10"
            >
              {scanning ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-white" />
                  Scanning Batch...
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 text-white" />
                  Execute Bulk Check
                </>
              )}
            </button>
          </div>
        </div>

        {/* Drag and Drop File zone */}
        <div 
          onDragEnter={handleDrag}
          onDragOver={handleDrag}
          onDragLeave={handleDrag}
          onDrop={handleDrop}
          className={`p-6 rounded-xl border-2 border-dashed flex flex-col items-center justify-center text-center transition-all min-h-[220px] ${
            dragActive 
              ? 'border-indigo-500 bg-indigo-50/50' 
              : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/50 shadow-sm'
          }`}
        >
          <div className="p-3 bg-slate-50 border border-slate-100 rounded-full text-slate-500 mb-3 hover:text-indigo-600 transition-colors">
            <UploadCloud className="w-6 h-6" />
          </div>
          <h4 className="text-xs font-bold text-slate-800">CSV or Text File Import</h4>
          <p className="text-[10px] text-slate-500 mt-2 max-w-[200px] leading-relaxed">
            Drag & drop your file here, or click to select a domain checklist.
          </p>
          <input
            id="file-upload-input"
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept=".csv,.txt"
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={scanning}
            type="button"
            className="mt-4 px-4 py-2 bg-white border border-slate-200 hover:border-slate-300 text-slate-700 hover:text-slate-900 rounded-lg text-xs font-bold transition-all cursor-pointer min-h-[40px] shadow-sm"
          >
            Select Local File
          </button>
        </div>
      </div>

      {/* Progress Monitor bar */}
      {scanning && (
        <div className="p-5 rounded-xl border border-indigo-100 bg-indigo-50/30 space-y-3.5">
          <div className="flex items-center justify-between text-xs font-medium text-slate-700">
            <span className="font-mono">
              Progress: <strong className="text-indigo-950 font-bold">{scannedCount}</strong> / {totalToScan} Domains
            </span>
            <span className="text-indigo-600 font-bold">{progressPercent}%</span>
          </div>

          <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
            <div 
              className="h-full bg-indigo-600 transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          {currentScanningDomain && (
            <p className="text-[10px] text-slate-500 font-mono animate-pulse">
              🔍 Checking registry: <span className="text-indigo-600 font-bold">{currentScanningDomain}</span>
            </p>
          )}
        </div>
      )}

      {/* Scanned Database list table */}
      {results.length > 0 && (
        <div className="p-6 rounded-xl border border-slate-200 bg-white shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
            <div>
              <h3 className="text-sm font-display font-semibold text-slate-900">
                Scanned Results Library ({filteredResults.length} / {results.length})
              </h3>
              <p className="text-[11px] text-slate-500">
                Filter or export scanned outputs immediately.
              </p>
            </div>

            <div className="flex flex-wrap gap-2 w-full sm:w-auto">
              <button
                onClick={handleBulkAddWatchlist}
                disabled={filteredResults.filter(r => !isInWatchlist(r.domain)).length === 0}
                className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-150 text-indigo-700 border border-indigo-100 rounded-lg text-xs font-semibold transition-all flex items-center gap-1 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Checked to Watchlist
              </button>

              <button
                onClick={handleExportCSV}
                className="px-3 py-1.5 bg-white border border-slate-200 hover:border-slate-300 text-slate-700 hover:text-slate-900 rounded-lg text-xs font-semibold transition-all flex items-center gap-1 cursor-pointer shadow-sm"
              >
                <Download className="w-3.5 h-3.5" />
                Export CSV
              </button>
            </div>
          </div>

          {/* Filtering buttons */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            <div className="flex items-center gap-1 text-xs text-slate-500 mr-2">
              <Filter className="w-3.5 h-3.5" />
              <span>Filter:</span>
            </div>
            
            <button
              onClick={() => setFilter('all')}
              className={`px-3 py-1 rounded-full text-xs font-semibold cursor-pointer transition-colors border ${
                filter === 'all' 
                  ? 'bg-indigo-600 text-white border-indigo-600' 
                  : 'bg-white border-slate-200 hover:border-slate-300 text-slate-600 hover:text-slate-800'
              }`}
            >
              All Results ({results.length})
            </button>
            
            <button
              onClick={() => setFilter('available')}
              className={`px-3 py-1 rounded-full text-xs font-semibold cursor-pointer transition-colors border ${
                filter === 'available' 
                  ? 'bg-emerald-600 text-white border-emerald-600' 
                  : 'bg-white border-slate-200 hover:border-slate-300 text-slate-600 hover:text-slate-800'
              }`}
            >
              Available ({results.filter(r => r.available).length})
            </button>
            
            <button
              onClick={() => setFilter('registered')}
              className={`px-3 py-1 rounded-full text-xs font-semibold cursor-pointer transition-colors border ${
                filter === 'registered' 
                  ? 'bg-slate-700 text-white border-slate-700' 
                  : 'bg-white border-slate-200 hover:border-slate-300 text-slate-600 hover:text-slate-800 border-slate-200'
              }`}
            >
              Registered ({results.filter(r => !r.available).length})
            </button>

            <button
              onClick={() => setFilter('expiring')}
              className={`px-3 py-1 rounded-full text-xs font-semibold cursor-pointer transition-colors border ${
                filter === 'expiring' 
                  ? 'bg-amber-600 text-white border-amber-600' 
                  : 'bg-white border-slate-200 hover:border-slate-300 text-slate-600 hover:text-slate-800'
              }`}
            >
              Expirations/Deletes ({results.filter(r => r.isExpiringSoon || r.isPendingDelete).length})
            </button>
          </div>

          {/* Table list Layout */}
          <div className="overflow-x-auto border border-slate-200 rounded-lg bg-white shadow-sm">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-mono">
                  <th className="p-4 font-semibold uppercase">Domain Name</th>
                  <th className="p-4 font-semibold uppercase">Availability</th>
                  <th className="p-4 font-semibold uppercase">Registrar</th>
                  <th className="p-4 font-semibold uppercase">Expiry Date</th>
                  <th className="p-4 font-semibold uppercase">Days Remaining</th>
                  <th className="p-4 font-semibold text-center uppercase">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700 font-medium">
                {filteredResults.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-slate-400 font-mono bg-slate-50/20">
                      No matching records found. Try modifying filters or adding data above!
                    </td>
                  </tr>
                ) : (
                  filteredResults.map((item, index) => {
                    const saved = isInWatchlist(item.domain);
                    return (
                      <tr key={index} className="hover:bg-slate-50/50 transition-colors">
                        {/* Domain name */}
                        <td className="p-4 font-mono font-bold text-slate-900">
                          {item.domain}
                        </td>

                        {/* Availability */}
                        <td className="p-4">
                          {item.available ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-100">
                              Available
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-100">
                              Registered
                            </span>
                          )}
                        </td>

                        {/* Registrar */}
                        <td className="p-4 text-slate-500 truncate max-w-[150px]">
                          {item.available ? '—' : item.registrar || 'Protected'}
                        </td>

                        {/* Expiry Date */}
                        <td className="p-4 font-mono text-slate-600">
                          {item.available ? '—' : (item.expiryDate ? new Date(item.expiryDate).toLocaleDateString() : 'N/A')}
                        </td>

                        {/* Days Remaining countdown */}
                        <td className="p-4">
                          {item.available ? (
                            <span className="text-slate-400">—</span>
                          ) : item.expiryDaysRemaining !== undefined ? (
                            <span className={`font-mono font-semibold ${
                              item.isExpiringSoon ? 'text-amber-600 font-bold' : 'text-slate-600'
                            }`}>
                              {item.expiryDaysRemaining} Days
                              {item.isExpiringSoon && ' (Soon)'}
                            </span>
                          ) : (
                            <span className="text-slate-400">N/A</span>
                          )}
                        </td>

                        {/* Quick Watchlist actions */}
                        <td className="p-4 text-center">
                          <button
                            onClick={() => handleAddWatchlist(item)}
                            disabled={saved}
                            className={`px-3 py-1 rounded text-[10px] border transition-all font-semibold ${
                              saved 
                                ? 'bg-slate-50 text-slate-400 border-slate-150 cursor-not-allowed'
                                : 'bg-indigo-50 text-indigo-700 border-indigo-100 hover:bg-indigo-100 cursor-pointer'
                            }`}
                          >
                            {saved ? 'Saved' : 'Add to monitor'}
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
