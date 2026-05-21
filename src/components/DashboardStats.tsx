import React from 'react';
import { ShieldCheck, ShieldAlert, Clock, Layers } from 'lucide-react';
import { WatchlistItem } from '../types';

interface DashboardStatsProps {
  watchlist: WatchlistItem[];
  onTabChange: (tab: 'single' | 'bulk' | 'watchlist' | 'telegram') => void;
}

export default function DashboardStats({ watchlist, onTabChange }: DashboardStatsProps) {
  const total = watchlist.length;
  
  // Available means user saved it with 'Unregistered/Available' tag
  // Expiring soon is days remaining <= 30 and > 0
  // Pending delete means isPendingDelete is true

  const availableCount = watchlist.filter(item => !item.expiryDate).length;
  const expiringSoonCount = watchlist.filter(item => item.isExpiringSoon).length;
  const pendingDeleteCount = watchlist.filter(item => item.isPendingDelete).length;

  const stats = [
    {
      id: "stats_total",
      label: "Monitored Domains",
      value: total,
      desc: "Saved in your active watchlist",
      icon: Layers,
      colorClass: "bg-indigo-50 text-indigo-600 border-indigo-100",
      targetTab: "watchlist" as const,
    },
    {
      id: "stats_available",
      label: "Available/Idle",
      value: availableCount,
      desc: "Domains without active registration",
      icon: ShieldCheck,
      colorClass: "bg-emerald-50 text-emerald-600 border-emerald-100",
      targetTab: "watchlist" as const,
    },
    {
      id: "stats_expiring",
      label: "Expiring Soon",
      value: expiringSoonCount,
      desc: "Within the next 30 days",
      icon: Clock,
      colorClass: expiringSoonCount > 0 
        ? "bg-amber-50 text-amber-600 border-amber-100 animate-pulse font-semibold" 
        : "bg-slate-50 text-slate-600 border-slate-100",
      targetTab: "watchlist" as const,
    },
    {
      id: "stats_delete",
      label: "Pending Delete",
      value: pendingDeleteCount,
      desc: "In redemption/deletion status",
      icon: ShieldAlert,
      colorClass: pendingDeleteCount > 0 
        ? "bg-rose-50 text-rose-600 border-rose-100 font-semibold" 
        : "bg-slate-50 text-slate-600 border-slate-100",
      targetTab: "watchlist" as const,
    }
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {stats.map((stat) => {
        const Icon = stat.icon;
        return (
          <button
            key={stat.id}
            id={stat.id}
            onClick={() => onTabChange(stat.targetTab)}
            className={`flex flex-col text-left p-5 rounded-xl border border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/80 transition-all duration-200 group cursor-pointer shadow-sm`}
          >
            <div className="flex items-center justify-between w-full mb-3">
              <span className="text-xs font-semibold text-slate-400 tracking-wider uppercase">
                {stat.label}
              </span>
              <div className={`p-2 rounded-lg border ${stat.colorClass} transition-all`}>
                <Icon className="w-4 h-4" />
              </div>
            </div>
            
            <div className="flex items-baseline gap-1.5">
              <span className="text-3xl font-display font-semibold text-slate-900 tracking-tight">
                {stat.value}
              </span>
            </div>
            
            <p className="text-xs text-slate-500 mt-2 line-clamp-1">
              {stat.desc}
            </p>
          </button>
        );
      })}
    </div>
  );
}
