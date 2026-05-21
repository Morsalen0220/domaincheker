import React, { useState, useEffect } from 'react';
import { Globe, Layers, Bell, Activity, Laptop, Shield, Sparkles, Send, HelpCircle, FileText, Database, Check, AlertCircle, RefreshCw } from 'lucide-react';
import { WatchlistItem, TelegramConfig } from './types';
import DashboardStats from './components/DashboardStats';
import SingleLookup from './components/SingleLookup';
import BulkCheck from './components/BulkCheck';
import Watchlist from './components/Watchlist';
import TelegramSettings from './components/TelegramSettings';

export default function App() {
  const [activeTab, setActiveTab] = useState<'single' | 'bulk' | 'watchlist' | 'telegram'>('single');

  // Watchlist Local Database management with Safe Lazy Initialization
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>(() => {
    try {
      const saved = localStorage.getItem('domain_checker_watchlist');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Telegram Notifications Local Config management
  const [telegramConfig, setTelegramConfig] = useState<TelegramConfig>(() => {
    try {
      const saved = localStorage.getItem('domain_checker_telegram');
      return saved ? JSON.parse(saved) : { token: '', chatId: '', enabled: false };
    } catch {
      return { token: '', chatId: '', enabled: false };
    }
  });

  // Supabase Sync States
  const [supabaseConfig, setSupabaseConfig] = useState<{ url: string; keyMasked: string; enabled: boolean } | null>(null);
  const [supabaseTableMissing, setSupabaseTableMissing] = useState(false);
  const [supabaseSyncing, setSupabaseSyncing] = useState(false);

  // Load configuration and data from Supabase DB on startup
  const loadSupabaseData = async () => {
    try {
      const configRes = await fetch('/api/supabase/config');
      if (configRes.ok) {
        const configData = await configRes.json();
        setSupabaseConfig(configData);
        if (configData.enabled) {
          setSupabaseSyncing(true);
          const wlRes = await fetch('/api/supabase/watchlist');
          if (wlRes.ok) {
            const wlData = await wlRes.json();
            if (wlData.tableMissing) {
              setSupabaseTableMissing(true);
            } else if (Array.isArray(wlData.data)) {
              // Convert DB structure to frontend representation
              const formattedList: WatchlistItem[] = wlData.data.map((row: any) => ({
                domain: row.domain,
                expiryDate: row.expiry_date || undefined,
                registrar: row.registrar || undefined,
                expiryDaysRemaining: row.expiry_days_remaining !== null ? row.expiry_days_remaining : undefined,
                isExpiringSoon: !!row.is_expiring_soon,
                isPendingDelete: !!row.is_pending_delete,
                lastCheckedAt: row.last_checked_at || new Date().toISOString(),
                notes: row.notes || ''
              }));

              // Sync and merge local cached items with Supabase row lists
              // (Keeps the absolute union of both databases safely)
              const merged = [...formattedList];
              
              // Parse through current items to merge any offline added ones
              let hasNewUpserts = false;
              watchlist.forEach(item => {
                if (!merged.some(m => m.domain.toLowerCase() === item.domain.toLowerCase())) {
                  merged.push(item);
                  saveItemToSupabase(item);
                  hasNewUpserts = true;
                }
              });

              setWatchlist(merged);
              localStorage.setItem('domain_checker_watchlist', JSON.stringify(merged));
            }
          }
        }
      }
    } catch (err) {
      console.error('Failed to communicate with Supabase backend module:', err);
    } finally {
      setSupabaseSyncing(false);
    }
  };

  useEffect(() => {
    loadSupabaseData();
  }, []);

  const saveWatchlist = (newList: WatchlistItem[]) => {
    setWatchlist(newList);
    try {
      localStorage.setItem('domain_checker_watchlist', JSON.stringify(newList));
    } catch (err) {
      console.error('Error writing watchlist to storage:', err);
    }
  };

  const saveTelegramConfig = (newConfig: TelegramConfig) => {
    setTelegramConfig(newConfig);
    try {
      localStorage.setItem('domain_checker_telegram', JSON.stringify(newConfig));
    } catch (err) {
      console.error('Error writing telegram config to storage:', err);
    }
  };

  // Helper wrappers to stream client updates onto our connected Supabase backend table!
  const saveItemToSupabase = async (item: WatchlistItem) => {
    try {
      const res = await fetch('/api/supabase/watchlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ watchlist_item: item })
      });
      if (res.ok) {
        setSupabaseTableMissing(false);
      } else if (res.status === 404) {
        const d = await res.json().catch(() => ({}));
        if (d.tableMissing) {
          setSupabaseTableMissing(true);
        }
      }
    } catch (err) {
      console.error('Database connection timed out or is offline:', err);
    }
  };

  const deleteItemFromSupabase = async (domain: string) => {
    try {
      await fetch('/api/supabase/watchlist', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain })
      });
    } catch (err) {
      console.error('Database connection timed out or is offline:', err);
    }
  };

  // Watchlist Actions
  const handleAddToWatchlist = (item: WatchlistItem) => {
    const exists = watchlist.some(w => w.domain.toLowerCase() === item.domain.toLowerCase());
    if (!exists) {
      const newList = [item, ...watchlist];
      saveWatchlist(newList);
      saveItemToSupabase(item);
    }
  };

  const handleRemoveFromWatchlist = (domain: string) => {
    const newList = watchlist.filter(w => w.domain.toLowerCase() !== domain.toLowerCase());
    saveWatchlist(newList);
    deleteItemFromSupabase(domain);
  };

  const handleUpdateWatchlistItem = (updatedItem: WatchlistItem) => {
    const newList = watchlist.map(item => 
      item.domain.toLowerCase() === updatedItem.domain.toLowerCase() ? updatedItem : item
    );
    saveWatchlist(newList);
    saveItemToSupabase(updatedItem);
  };

  const handleIsInWatchlist = (domain: string): boolean => {
    return watchlist.some(w => w.domain.toLowerCase() === domain.toLowerCase());
  };

  // Automated notification router helper for expiring alerts on user demand
  const triggerTelegramAlert = async (domain: string, days?: number, status?: string) => {
    if (!telegramConfig.enabled || !telegramConfig.token || !telegramConfig.chatId) return;
    try {
      await fetch('/api/alert-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: telegramConfig.token,
          chatId: telegramConfig.chatId,
          domain,
          days: days !== undefined ? days : 'N/A',
          status: status || 'Warning'
        })
      });
    } catch (err) {
      console.error('Failed to dispatch background Telegram alert:', err);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] font-sans antialiased text-slate-800">
      
      {/* Top Navigation Hub Bar */}
      <header className="border-b border-slate-200 bg-white sticky top-0 z-50 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg border border-indigo-100">
              <Shield className="w-5 h-5 shrink-0" />
            </div>
            <div>
              <h1 className="text-sm sm:text-base font-display font-semibold text-slate-900 tracking-tight flex items-center gap-1.5">
                Domain Expiry & Availability Monitor
              </h1>
              <p className="text-[10px] text-slate-400 font-mono hidden sm:block">
                BULK ENGINE • PRO INTERFACE
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {supabaseConfig?.enabled && (
              <button 
                onClick={loadSupabaseData}
                className="px-2.5 py-1 text-[11px] font-semibold text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-md hover:bg-indigo-100 transition-colors flex items-center gap-1.5 cursor-pointer"
                title="Sync and read data directly from configured Supabase Instance"
              >
                <Database className={`w-3.5 h-3.5 ${supabaseSyncing ? 'animate-spin' : ''}`} />
                {supabaseSyncing ? 'Syncing...' : 'Sync Supabase'}
              </button>
            )}

            <span className="px-2.5 py-1 rounded text-[11px] font-mono font-semibold text-emerald-700 bg-emerald-50 border border-emerald-100 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
              SYSTEM ACTIVE
            </span>
          </div>
        </div>
      </header>

      {/* Primary Dashboard Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        
        {/* Statistics Overview Row */}
        <DashboardStats 
          watchlist={watchlist} 
          onTabChange={(tab) => setActiveTab(tab)} 
        />

        {/* Tab Selection Row */}
        <div className="flex items-center justify-between border-b border-slate-200 pb-px">
          <div className="flex space-x-1 sm:space-x-2 overflow-x-auto pb-px">
            <button
              onClick={() => setActiveTab('single')}
              className={`flex items-center gap-2 px-4 py-3 border-b-2 font-display text-xs sm:text-sm font-semibold transition-all cursor-pointer whitespace-nowrap min-h-[44px] ${
                activeTab === 'single'
                  ? 'border-indigo-600 text-indigo-600 bg-indigo-50/40'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <Globe className="w-4 h-4 text-indigo-500" />
              Single Analyzer
            </button>

            <button
              onClick={() => setActiveTab('bulk')}
              className={`flex items-center gap-2 px-4 py-3 border-b-2 font-display text-xs sm:text-sm font-semibold transition-all cursor-pointer whitespace-nowrap min-h-[44px] ${
                activeTab === 'bulk'
                  ? 'border-indigo-600 text-indigo-600 bg-indigo-50/40'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <Layers className="w-4 h-4 text-indigo-500" />
              Bulk Scanner (Upload)
            </button>

            <button
              onClick={() => setActiveTab('watchlist')}
              className={`flex items-center gap-2 px-4 py-3 border-b-2 font-display text-xs sm:text-sm font-semibold transition-all cursor-pointer whitespace-nowrap min-h-[44px] ${
                activeTab === 'watchlist'
                  ? 'border-indigo-600 text-indigo-600 bg-indigo-50/40'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <Activity className="w-4 h-4 text-indigo-500" />
              Watchlist Watcher ({watchlist.length})
            </button>

            <button
              onClick={() => setActiveTab('telegram')}
              className={`flex items-center gap-2 px-4 py-3 border-b-2 font-display text-xs sm:text-sm font-semibold transition-all cursor-pointer whitespace-nowrap min-h-[44px] ${
                activeTab === 'telegram'
                  ? 'border-indigo-600 text-indigo-600 bg-indigo-50/40'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <Send className="w-4 h-4 text-indigo-500" />
              Telegram Alerts
              {telegramConfig.enabled && (
                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
              )}
            </button>
          </div>
        </div>

        {/* Database notification warning for quick self-start table missing */}
        {supabaseTableMissing && (
          <div className="p-4 rounded-xl border border-amber-200 bg-amber-50 text-slate-700 space-y-3">
            <div className="flex items-start gap-2.5">
              <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-semibold text-slate-900">Supabase Table Schema Configuration Required!</h4>
                <p className="text-xs text-slate-600 mt-1">
                  We connected to your Supabase host, but the table <code className="bg-amber-100 text-amber-800 px-1 py-0.5 rounded font-mono text-[11px]">domain_watchlist</code> does not exist in your database public schema yet. 
                </p>
                <p className="text-xs text-slate-600 mt-1.5 font-bold">
                  How to fix: Open your Supabase Dashboard SQL Editor and run the query below to automatically build your table!
                </p>
              </div>
            </div>

            <div className="relative">
              <pre className="bg-slate-900 text-indigo-200 p-4 rounded-lg font-mono text-xs overflow-x-auto select-all max-h-40 leading-relaxed">
{`create table domain_watchlist (
  domain text primary key,
  expiry_date text,
  registrar text,
  expiry_days_remaining integer,
  is_expiring_soon boolean,
  is_pending_delete boolean,
  last_checked_at text,
  notes text
);`}
              </pre>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(`create table domain_watchlist (\n  domain text primary key,\n  expiry_date text,\n  registrar text,\n  expiry_days_remaining integer,\n  is_expiring_soon boolean,\n  is_pending_delete boolean,\n  last_checked_at text,\n  notes text\n);`);
                }}
                className="absolute right-3 top-3 px-2 py-1 bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-white rounded cursor-pointer transition-colors"
              >
                Copy SQL
              </button>
            </div>
          </div>
        )}

        {/* Selected Panels Routing */}
        <div className="transition-all duration-150">
          {activeTab === 'single' && (
            <SingleLookup 
              onAddToWatchlist={handleAddToWatchlist}
              isInWatchlist={handleIsInWatchlist}
            />
          )}

          {activeTab === 'bulk' && (
            <BulkCheck 
              onAddToWatchlist={handleAddToWatchlist}
              isInWatchlist={handleIsInWatchlist}
            />
          )}

          {activeTab === 'watchlist' && (
            <Watchlist 
              watchlist={watchlist}
              onRemoveFromWatchlist={handleRemoveFromWatchlist}
              onUpdateWatchlistItem={handleUpdateWatchlistItem}
              triggerTelegramAlert={triggerTelegramAlert}
              telegramEnabled={telegramConfig.enabled}
            />
          )}

          {activeTab === 'telegram' && (
            <TelegramSettings 
              config={telegramConfig}
              onSaveConfig={saveTelegramConfig}
              onSendTest={() => triggerTelegramAlert('yourcompany.com', 5, 'Alert Check Enabled!')}
            />
          )}
        </div>
      </main>

      {/* Dashboard Brand Footer */}
      <footer className="border-t border-slate-200 bg-white py-8 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center sm:text-left flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <p className="text-xs text-slate-400 font-mono uppercase tracking-wider">
              DOMAIN MONITORING ENGINE • DESIGN SUITE
            </p>
            <p className="text-[11px] text-slate-500 mt-1 max-w-sm leading-relaxed">
              Designed with server-side RDAP parsing, full-stack security gateways, and Gemini-powered smart evaluations for branding.
            </p>
          </div>
          
          <div className="flex items-center gap-4 text-[11px] text-slate-400">
            <span>Secure Database Synced</span>
            <span className="text-slate-300">•</span>
            <span>No Trackers Enabled</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
