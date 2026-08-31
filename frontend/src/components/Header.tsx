import React from 'react';
import { ShieldCheck, BookOpen, Key, PlayCircle, Cpu } from 'lucide-react';

interface HeaderProps {
  activeTab: 'connect' | 'kt-docs' | 'sandbox';
  setActiveTab: (tab: 'connect' | 'kt-docs' | 'sandbox') => void;
  isConnected: boolean;
}

export const Header: React.FC<HeaderProps> = ({ activeTab, setActiveTab, isConnected }) => {
  return (
    <header className="glass-panel mb-8 rounded-b-2xl px-6 py-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        {/* Logo & Title */}
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 p-2.5 shadow-lg shadow-blue-500/20">
            <ShieldCheck size={26} className="text-white" />
          </div>
          <div>
            <h1 className="bg-gradient-to-r from-white to-slate-400 bg-clip-text text-xl font-bold tracking-tight text-transparent">
              LeakGuard SDK Portal
            </h1>
            <p className="text-xs text-slate-400">
              RazorPay Revenue Risk Detection & Observability SDK
            </p>
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-black/30 p-1.5 backdrop-blur-md">
          <button
            onClick={() => setActiveTab('connect')}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
              activeTab === 'connect'
                ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/30'
                : 'text-slate-300 hover:bg-white/5 hover:text-white'
            }`}
          >
            <Key size={16} /> Merchant Setup
          </button>
          <button
            onClick={() => setActiveTab('kt-docs')}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
              activeTab === 'kt-docs'
                ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/30'
                : 'text-slate-300 hover:bg-white/5 hover:text-white'
            }`}
          >
            <BookOpen size={16} /> Developer KT Guide
          </button>
          <button
            onClick={() => setActiveTab('sandbox')}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
              activeTab === 'sandbox'
                ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/30'
                : 'text-slate-300 hover:bg-white/5 hover:text-white'
            }`}
          >
            <PlayCircle size={16} /> Live SDK Sandbox
          </button>
        </nav>

        {/* Connection Status Badge */}
        <div className="flex items-center gap-2">
          <Cpu size={18} className="text-slate-400" />
          {isConnected ? (
            <span className="flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-emerald-400">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse"></span> Connected
            </span>
          ) : (
            <span className="flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-amber-400">
              <span className="h-2 w-2 rounded-full bg-amber-400"></span> Not Connected
            </span>
          )}
        </div>
      </div>
    </header>
  );
};
