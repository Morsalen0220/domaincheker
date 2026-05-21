import React, { useState } from 'react';
import { Send, Check, AlertTriangle, ShieldCheck, HelpCircle, Loader2, Info } from 'lucide-react';
import { TelegramConfig } from '../types';

interface TelegramSettingsProps {
  config: TelegramConfig;
  onSaveConfig: (updated: TelegramConfig) => void;
  onSendTest: () => Promise<void>;
}

export default function TelegramSettings({ config, onSaveConfig, onSendTest }: TelegramSettingsProps) {
  const [token, setToken] = useState(config.token || '');
  const [chatId, setChatId] = useState(config.chatId || '');
  const [enabled, setEnabled] = useState(config.enabled || false);

  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{ type: 'idle' | 'success' | 'error'; message: string }>({ type: 'idle', message: '' });

  const handleSave = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    onSaveConfig({
      token: token.trim(),
      chatId: chatId.trim(),
      enabled,
    });
    setStatus({ type: 'success', message: 'Telegram configuration saved successfully.' });
    setTimeout(() => setStatus({ type: 'idle', message: '' }), 4000);
  };

  const handleTestNotification = async () => {
    if (!token || !chatId) {
      setStatus({ type: 'error', message: 'Token and Chat ID are strictly required before testing!' });
      return;
    }
    
    // First save the state to ensure synchronized payload on server
    onSaveConfig({ token: token.trim(), chatId: chatId.trim(), enabled });

    setLoading(true);
    setStatus({ type: 'idle', message: '' });

    try {
      const response = await fetch('/api/alert-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: token.trim(), chatId: chatId.trim() }),
      });

      const data = await response.json();
      if (response.ok && data.success) {
        setStatus({
          type: 'success',
          message: 'Notification sent successfully! Open Telegram and check your messages.'
        });
      } else {
        setStatus({
          type: 'error',
          message: data.error || 'Failed to dispatch alert message over Telegram. Verify credentials.'
        });
      }
    } catch (err: any) {
      setStatus({
        type: 'error',
        message: err.message || 'Network error communicating with server proxy.'
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div id="telegram-settings-panel" className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Form setup card */}
      <div className="lg:col-span-2 p-6 rounded-xl border border-slate-200 bg-white shadow-sm space-y-5">
        <div>
          <h3 className="text-lg font-display font-semibold text-slate-900 flex items-center gap-2">
            <Send className="w-5 h-5 text-indigo-600" />
            Telegram Alert Gateway
          </h3>
          <p className="text-xs text-slate-500 leading-relaxed mt-0.5">
            Get instant messaging alerts when monitored domains approach expiration dates or land in pending deletion states.
          </p>
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          <div className="flex items-center justify-between p-3.5 bg-indigo-50/50 rounded-lg border border-indigo-100">
            <div>
              <span className="text-xs font-semibold text-slate-800 block">Global Alerts Enabled</span>
              <span className="text-[10px] text-slate-500 leading-normal block mt-0.5">
                Check this flag to dispatch push warnings when watchlist updates run.
              </span>
            </div>
            
            <label className="relative inline-flex items-center cursor-pointer">
              <input 
                type="checkbox" 
                checked={enabled} 
                onChange={(e) => setEnabled(e.target.checked)}
                className="sr-only peer" 
              />
              <div className="w-10 h-5 bg-slate-200 rounded-full peer peer-focus:ring-2 peer-focus:ring-indigo-500/30 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-slate-400 after:border-slate-300 after:border after:rounded-full after:h-4 after:width-4 after:transition-all peer-checked:bg-indigo-600 peer-checked:after:bg-slate-100" />
            </label>
          </div>

          <div>
            <label className="text-xs font-mono font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">
              Telegram Bot HTTP API Token
            </label>
            <input
              type="text"
              placeholder="e.g. 718392104:AAEqP2uG61Z..."
              value={token}
              onChange={(e) => setToken(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-lg text-xs font-mono text-slate-800 focus:outline-none focus:border-indigo-500 transition-all placeholder:text-slate-400"
            />
          </div>

          <div>
            <label className="text-xs font-mono font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">
              Personal or Channel Chat ID
            </label>
            <input
              type="text"
              placeholder="e.g. 98214283 or -100412849310"
              value={chatId}
              onChange={(e) => setChatId(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-lg text-xs font-mono text-slate-800 focus:outline-none focus:border-indigo-500 transition-all placeholder:text-slate-400"
            />
          </div>

          <div className="flex gap-2.5 pt-2">
            <button
              type="submit"
              className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold cursor-pointer transition-all shadow-md shadow-indigo-600/10"
            >
              Save Configuration
            </button>

            <button
              type="button"
              onClick={handleTestNotification}
              disabled={loading || !token || !chatId}
              className="px-5 py-2.5 bg-white border border-slate-200 hover:border-slate-300 text-slate-700 hover:text-slate-900 rounded-lg text-xs font-bold cursor-pointer transition-all flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed min-h-[40px] shadow-sm"
            >
              {loading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-600" />
                  Testing...
                </>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5 text-slate-500" />
                  Test Push Alert
                </>
              )}
            </button>
          </div>
        </form>

        {status.type !== 'idle' && (
          <div className={`p-4 rounded-lg border text-xs leading-relaxed ${
            status.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-rose-200 bg-rose-50 text-rose-800'
          }`}>
            <span className="flex items-center gap-1.5 font-medium">
              {status.type === 'success' ? <ShieldCheck className="w-4 h-4 shrink-0 text-emerald-600" /> : <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />}
              {status.message}
            </span>
          </div>
        )}
      </div>

      {/* Guide details side help card */}
      <div className="p-6 rounded-xl border border-slate-200 bg-white shadow-sm flex flex-col justify-between">
        <div className="space-y-4">
          <h4 className="text-sm font-display font-semibold text-slate-900 flex items-center gap-1.5 border-b border-slate-100 pb-2.5">
            <Info className="w-4.5 h-4.5 text-indigo-600" />
            Telegram Instructions
          </h4>

          {/* Bilingual Benglish Setup Guide */}
          <div className="space-y-3 text-slate-600 leading-normal">
            <div>
              <p className="text-xs font-bold text-slate-800">1. Bot তৈরি করা (Create Bot)</p>
              <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                Telegram-এ <a href="https://t.me/BotFather" target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline font-semibold font-mono">@BotFather</a>-এ যান। <code className="bg-slate-50 px-1 py-0.5 border border-slate-100 rounded text-[10px] text-indigo-600 font-mono">/newbot</code> লিখে command দিন। Bot-এর নাম নির্বাচন করলে আপনাকে একটি <strong>HTTP API Token</strong> দেবে। সেটি উপরে পেস্ট করুন।
              </p>
            </div>

            <div>
              <p className="text-xs font-bold text-slate-800">2. Chat ID বের করা (Obtain Chat ID)</p>
              <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                Telegram-এ <a href="https://t.me/userinfobot" target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline font-semibold font-mono">@userinfobot</a>-এ যান এবং start করুন। এটি আপনাকে আপনার personal <strong>Chat ID</strong> দিবে। ID-টি কপি করে উপরে পেস্ট করুন।
              </p>
            </div>

            <div className="p-3 bg-indigo-50/50 rounded-lg border border-indigo-100 space-y-1">
              <span className="text-[10px] font-bold text-indigo-700 uppercase tracking-widest block font-mono">Pro SaaS Tip</span>
              <p className="text-[10px] text-slate-500 leading-relaxed">
                Want group notifications? Add your bot to any channel or group, send a message inside, and use chat ID (with a negative sign <code className="bg-slate-100 text-indigo-700 border border-indigo-100/55 rounded px-0.5 font-mono">-100...</code>) to get shared alerts.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
