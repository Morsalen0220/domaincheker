import React, { useState } from 'react';
import { Calendar, Trash2, RefreshCw, Loader2, Download, ExternalLink, MessageSquare, Save, Settings, ShieldAlert, Sparkles, Globe } from 'lucide-react';
import { WatchlistItem } from '../types';

interface WatchlistProps {
  watchlist: WatchlistItem[];
  onRemoveFromWatchlist: (domain: string) => void;
  onUpdateWatchlistItem: (updatedItem: WatchlistItem) => void;
  triggerTelegramAlert: (domain: string, days?: number, status?: string) => Promise<void>;
  telegramEnabled: boolean;
}

export default function Watchlist({ 
  watchlist, 
  onRemoveFromWatchlist, 
  onUpdateWatchlistItem,
  triggerTelegramAlert,
  telegramEnabled
}: WatchlistProps) {
  const [updatingDomain, setUpdatingDomain] = useState<string | null>(null);
  const [editingNotesDomain, setEditingNotesDomain] = useState<string | null>(null);
  const [tempNotes, setTempNotes] = useState('');

  // Re-scan/Recheck domain function
  const handleRecheck = async (domain: string) => {
    setUpdatingDomain(domain);
    try {
      const response = await fetch('/api/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain }),
      });

      if (!response.ok) throw new Error('Refresh failed');
      
      const data = await response.json();
      if (!data.error) {
        // Construct updated item
        const updatedItem: WatchlistItem = {
          domain: data.domain,
          expiryDate: data.expiryDate,
          registrar: data.registrar,
          expiryDaysRemaining: data.expiryDaysRemaining,
          isExpiringSoon: data.isExpiringSoon,
          isPendingDelete: data.isPendingDelete,
          lastCheckedAt: new Date().toISOString(),
          notes: watchlist.find(item => item.domain === domain)?.notes || ''
        };
        
        onUpdateWatchlistItem(updatedItem);

        // Standard workflow trigger: If domain is expiring soon, push Telegram message immediately if enabled!
        if (telegramEnabled && updatedItem.isExpiringSoon) {
          await triggerTelegramAlert(updatedItem.domain, updatedItem.expiryDaysRemaining, 'Expiring Soon');
        } else if (telegramEnabled && updatedItem.isPendingDelete) {
          await triggerTelegramAlert(updatedItem.domain, 0, 'Pending Delete');
        }
      }
    } catch {
      // Keep old values but update check timestamp if server error
    } finally {
      setUpdatingDomain(null);
    }
  };

  // Notes editing workflow
  const startEditingNotes = (domain: string, currentNotes?: string) => {
    setEditingNotesDomain(domain);
    setTempNotes(currentNotes || '');
  };

  const saveNotes = (domain: string) => {
    const existing = watchlist.find(item => item.domain === domain);
    if (existing) {
      const updated = { ...existing, notes: tempNotes };
      onUpdateWatchlistItem(updated);
    }
    setEditingNotesDomain(null);
  };

  // Export watchlist CSV
  const handleExportCSV = () => {
    if (watchlist.length === 0) return;

    const headers = ['Domain Name', 'Registrar', 'Expiry Date', 'Days Remaining', 'Expiring Soon', 'Pending Delete', 'Comment / Notes', 'Last Checked At'];
    const rows = watchlist.map(w => [
      w.domain,
      w.registrar || 'N/A',
      w.expiryDate ? new Date(w.expiryDate).toLocaleDateString() : 'N/A',
      w.expiryDaysRemaining !== undefined ? w.expiryDaysRemaining : 'N/A',
      w.isExpiringSoon ? 'Yes' : 'No',
      w.isPendingDelete ? 'Yes' : 'No',
      w.notes || '',
      new Date(w.lastCheckedAt).toLocaleString()
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(e => e.map(val => `"${String(val).replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'monitored_domains_watchlist.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div id="watchlist-panel" className="p-6 rounded-xl border border-slate-200 bg-white shadow-sm space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
        <div>
          <h3 className="text-lg font-display font-semibold text-slate-900 flex items-center gap-2">
            <Globe className="w-5 h-5 text-indigo-600" />
            Active Expiry Watchlist
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Real-time visual monitoring of registered and unregistered domains saved with local persistence.
          </p>
        </div>

        {watchlist.length > 0 && (
          <button
            onClick={handleExportCSV}
            className="px-3.5 py-2 bg-white border border-slate-200 hover:border-slate-300 text-slate-705 hover:text-slate-900 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
          >
            <Download className="w-4 h-4 text-slate-500" />
            Backup Watchlist (CSV)
          </button>
        )}
      </div>

      {watchlist.length === 0 ? (
        <div className="py-12 text-center text-slate-500 font-mono space-y-3">
          <Calendar className="w-12 h-12 text-slate-300 mx-auto" />
          <p className="text-xs font-semibold">
            Your watchlist database is currently empty.
          </p>
          <p className="text-[10px] text-slate-400 max-w-sm mx-auto leading-relaxed">
            Go to the Single Domain Checker or Bulk Checker tabs, scan domains, and add them to this dashboard to start tracking their lifetimes.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto border border-slate-200 rounded-lg bg-white shadow-sm">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-mono">
                <th className="p-4 font-semibold uppercase">Domain Target</th>
                <th className="p-4 font-semibold uppercase">Status Marker</th>
                <th className="p-4 font-semibold uppercase">Expiry Date</th>
                <th className="p-4 font-semibold uppercase">Days Left</th>
                <th className="p-4 font-semibold uppercase">Custom Annotations / Notes</th>
                <th className="p-4 font-semibold uppercase">Last Verified</th>
                <th className="p-4 font-semibold text-center uppercase">Management</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700 font-medium">
              {watchlist.map((item) => {
                const isUpdating = updatingDomain === item.domain;
                const isEditingNotes = editingNotesDomain === item.domain;

                // Color coding for lifetime remaining
                let countdownColor = "text-slate-600";
                let statusBadge = (
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-100">
                    Active / Registered
                  </span>
                );

                if (!item.expiryDate) {
                  countdownColor = "text-emerald-600 font-bold";
                  statusBadge = (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-850 border border-emerald-200">
                      Available / Free
                    </span>
                  );
                } else if (item.isPendingDelete) {
                  countdownColor = "text-rose-600 font-bold";
                  statusBadge = (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-100">
                      Pending Deletion
                    </span>
                  );
                } else if (item.isExpiringSoon) {
                  countdownColor = "text-amber-653 font-bold";
                  statusBadge = (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-100 animate-pulse">
                      Expiring Soon
                    </span>
                  );
                } else if (item.expiryDaysRemaining !== undefined && item.expiryDaysRemaining <= 0) {
                  countdownColor = "text-rose-500 font-semibold line-through";
                  statusBadge = (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
                      Expired
                    </span>
                  );
                }

                return (
                  <tr key={item.domain} className="hover:bg-slate-50/50 transition-colors">
                    {/* Domain Anchor */}
                    <td className="p-4 font-mono font-bold text-slate-900 max-w-[170px] truncate">
                      <a 
                        href={`http://${item.domain}`} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="hover:text-indigo-600 inline-flex items-center gap-1.5 transition-colors"
                      >
                        {item.domain}
                        <ExternalLink className="w-3 h-3 text-slate-400" />
                      </a>
                    </td>

                    {/* Status Badge */}
                    <td className="p-4">
                      {statusBadge}
                    </td>

                    {/* Expiry Date */}
                    <td className="p-4 font-mono text-slate-600">
                      {item.expiryDate ? new Date(item.expiryDate).toLocaleDateString() : '—'}
                    </td>

                    {/* Days Left countdown */}
                    <td className="p-4 font-mono">
                      {item.expiryDate ? (
                        <span className={countdownColor}>
                          {item.expiryDaysRemaining !== undefined ? `${item.expiryDaysRemaining}d` : 'N/A'}
                        </span>
                      ) : (
                        <span className={countdownColor}>Available ✅</span>
                      )}
                    </td>

                    {/* Notes annotation inline form */}
                    <td className="p-4 max-w-[200px]">
                      {isEditingNotes ? (
                        <div className="flex items-center gap-1.5">
                          <input
                            type="text"
                            value={tempNotes}
                            onChange={(e) => setTempNotes(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && saveNotes(item.domain)}
                            placeholder="Add memo..."
                            className="w-full bg-white border border-slate-200 rounded px-2 py-1 text-slate-800 text-xs focus:outline-none focus:border-indigo-500 font-sans"
                            autoFocus
                          />
                          <button
                            onClick={() => saveNotes(item.domain)}
                            className="p-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white cursor-pointer"
                            title="Save custom note"
                          >
                            <Save className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <div 
                          onClick={() => startEditingNotes(item.domain, item.notes)}
                          className="text-slate-500 hover:text-slate-800 cursor-pointer italic text-xs truncate max-w-[180px] min-h-[1.5rem] flex items-center gap-1 group"
                          title="Click to edit annotation / note"
                        >
                          <MessageSquare className="w-3 h-3 text-slate-400 opacity-60 group-hover:opacity-100 transition-opacity shrink-0" />
                          <span className="truncate">{item.notes || 'Add note/memo...'}</span>
                        </div>
                      )}
                    </td>

                    {/* Checked Timestamp */}
                    <td className="p-4 text-slate-400 font-mono text-[10px]">
                      {new Date(item.lastCheckedAt).toLocaleDateString()}{' '}
                      {new Date(item.lastCheckedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </td>

                    {/* Scan/Delete Actions */}
                    <td className="p-4 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => handleRecheck(item.domain)}
                          disabled={isUpdating}
                          className="p-1.5 rounded bg-white hover:bg-slate-50 border border-slate-200 hover:border-slate-300 text-slate-500 hover:text-slate-800 transition-all cursor-pointer inline-flex items-center shadow-sm"
                          title="Refresh server lookup"
                        >
                          {isUpdating ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-600" />
                          ) : (
                            <RefreshCw className="w-3.5 h-3.5" />
                          )}
                        </button>

                        <button
                          onClick={() => onRemoveFromWatchlist(item.domain)}
                          className="p-1.5 rounded bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 transition-all cursor-pointer"
                          title="Delete from Watchlist"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
