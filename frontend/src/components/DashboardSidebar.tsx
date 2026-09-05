import React from 'react';
import { Activity, FileText, Key, ShieldCheck } from 'lucide-react';

export type DashboardView = 'dashboard' | 'profile' | 'audit';

interface DashboardSidebarProps {
  activeView: DashboardView;
  setActiveView: (view: DashboardView) => void;
  isConnected: boolean;
  merchantName: string;
}

export const DashboardSidebar: React.FC<DashboardSidebarProps> = ({
  activeView,
  setActiveView,
  isConnected,
  merchantName,
}) => {
  const items: { id: DashboardView; label: string; Icon: typeof Activity }[] = [
    { id: 'dashboard', label: 'Live control panel', Icon: Activity },
    { id: 'profile', label: 'Update profile', Icon: Key },
    { id: 'audit', label: 'Audit Timeline', Icon: FileText },
  ];

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-white/10 bg-[#071427] px-4 py-6">
      <div className="mb-8 flex items-center gap-2 px-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-500/20 text-sky-300">
          <ShieldCheck size={18} />
        </div>
        <div>
          <p className="text-sm font-semibold text-white">LeakGuard</p>
          <p className="text-[11px] text-slate-400">{merchantName || 'Merchant portal'}</p>
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-1.5">
        {items.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setActiveView(id)}
            className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-all ${
              activeView === id
                ? 'bg-sky-500 text-white shadow-md shadow-sky-500/30'
                : 'text-slate-300 hover:bg-white/5 hover:text-white'
            }`}
          >
            <Icon size={16} />
            {label}
          </button>
        ))}
      </nav>

      <div className="mt-4 px-2">
        {isConnected ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-emerald-400">
            <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" /> Connected
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-amber-400">
            <span className="h-2 w-2 rounded-full bg-amber-400" /> Standby
          </span>
        )}
      </div>
    </aside>
  );
};
