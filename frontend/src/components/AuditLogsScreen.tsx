import React, { useState, useEffect } from 'react';
import {
  FileText,
  Search,
  RefreshCw,
  Clock,
  User,
  Cpu,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Code
} from 'lucide-react';

interface AuditLogsScreenProps {
  platformUrl: string;
  merchantId: string;
  initialRiskEventId?: string;
}

export const AuditLogsScreen: React.FC<AuditLogsScreenProps> = ({
  platformUrl,
  merchantId,
  initialRiskEventId,
}) => {
  const [loading, setLoading] = useState(false);
  const [audits, setAudits] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState(initialRiskEventId || '');
  const [actorFilter, setActorFilter] = useState<string>('ALL');
  const [componentFilter, setComponentFilter] = useState<string>('ALL');
  const [expandedAuditId, setExpandedAuditId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fetchAudits = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      let url = `${platformUrl}/v1/audits?merchantId=${encodeURIComponent(merchantId)}`;
      if (searchQuery.trim().startsWith('risk_') || searchQuery.trim().length > 20) {
        url = `${platformUrl}/v1/recoveries/${encodeURIComponent(searchQuery.trim())}/audit`;
      }

      const res = await fetch(url, {
        headers: { 'x-merchant-id': merchantId },
      });

      if (res.ok) {
        const data = await res.json();
        setAudits(data.audits || data.auditTimeline || []);
      } else {
        const errData = await res.json();
        setErrorMsg(errData.error || 'Failed to load audit logs');
      }
    } catch (err: any) {
      setErrorMsg(`Connection error to platform: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAudits();
  }, [platformUrl, merchantId]);

  const filteredAudits = audits.filter((a) => {
    const matchesSearch =
      a.riskEventId?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.paymentAttemptId?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.eventType?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.reason?.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;
    if (actorFilter !== 'ALL' && a.actor !== actorFilter) return false;
    if (componentFilter !== 'ALL' && a.component !== componentFilter) return false;

    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="glass-panel p-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
            <FileText size={20} />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">Immutable Recovery Audit Log Explorer</h2>
            <p className="text-xs text-slate-400">
              Complete append-only audit trail of system decisions, policy evaluations, and merchant controls
            </p>
          </div>
        </div>

        <button
          onClick={fetchAudits}
          disabled={loading}
          className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-indigo-600/30 hover:bg-indigo-500 transition-all disabled:opacity-50"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          {loading ? 'Fetching Audits...' : 'Refresh Logs'}
        </button>
      </div>

      {errorMsg && (
        <div className="flex items-center gap-3 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
          <AlertTriangle size={18} className="shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Filter & Search Controls */}
      <div className="glass-panel p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3 flex-1 min-w-[280px]">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Filter by Risk Event ID, Event Type, Reason..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-black/40 pl-9 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
            />
          </div>

          <button
            onClick={fetchAudits}
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-300 hover:bg-white/10"
          >
            Search
          </button>
        </div>

        {/* Dropdowns */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-400 font-medium">Actor:</span>
            <select
              value={actorFilter}
              onChange={(e) => setActorFilter(e.target.value)}
              className="rounded-xl border border-white/10 bg-black/50 px-3 py-1.5 text-xs text-white focus:border-indigo-500 focus:outline-none"
            >
              <option value="ALL">All Actors</option>
              <option value="SYSTEM">SYSTEM</option>
              <option value="MERCHANT">MERCHANT</option>
              <option value="PROVIDER">PROVIDER</option>
            </select>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-400 font-medium">Component:</span>
            <select
              value={componentFilter}
              onChange={(e) => setComponentFilter(e.target.value)}
              className="rounded-xl border border-white/10 bg-black/50 px-3 py-1.5 text-xs text-white focus:border-indigo-500 focus:outline-none"
            >
              <option value="ALL">All Components</option>
              <option value="CONTROL">CONTROL</option>
              <option value="EXECUTION">EXECUTION</option>
              <option value="OUTCOME">OUTCOME</option>
              <option value="POLICY">POLICY</option>
            </select>
          </div>
        </div>
      </div>

      {/* Audit Log Timeline Table */}
      <div className="glass-panel p-6">
        {filteredAudits.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <FileText size={32} className="mx-auto mb-2 opacity-50" />
            <p className="text-sm font-medium">No audit log records found.</p>
            <p className="text-xs text-slate-500 mt-1">Try clearing filters or running recovery workflows in the sandbox.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredAudits.map((audit) => {
              const isExpanded = expandedAuditId === audit.id;
              const isMerchantActor = audit.actor === 'MERCHANT';

              return (
                <div
                  key={audit.id}
                  className={`rounded-xl border transition-all ${
                    isMerchantActor
                      ? 'border-red-500/30 bg-red-950/20'
                      : 'border-white/10 bg-black/30 hover:border-white/20'
                  }`}
                >
                  <div
                    onClick={() => setExpandedAuditId(isExpanded ? null : audit.id)}
                    className="p-4 flex items-center justify-between gap-4 cursor-pointer"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                        isMerchantActor
                          ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                          : 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30'
                      }`}>
                        {isMerchantActor ? <User size={16} /> : <Cpu size={16} />}
                      </div>

                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold text-white">{audit.eventType}</span>
                          <span className="rounded-md bg-white/10 px-2 py-0.5 text-[10px] text-slate-300 font-semibold uppercase">
                            {audit.component}
                          </span>
                          <span className={`rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase ${
                            audit.actor === 'MERCHANT' ? 'bg-red-500/20 text-red-300' : 'bg-blue-500/20 text-blue-300'
                          }`}>
                            {audit.actor}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5 font-sans">{audit.reason || audit.action}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 text-xs">
                      <div className="text-right">
                        <span className="font-mono text-[11px] text-slate-400 block">
                          Risk: {audit.riskEventId?.substring(0, 14)}...
                        </span>
                        <span className="text-[10px] text-slate-500 flex items-center justify-end gap-1">
                          <Clock size={10} /> {new Date(audit.createdAt).toLocaleString()}
                        </span>
                      </div>
                      {isExpanded ? <ChevronDown size={16} className="text-slate-400" /> : <ChevronRight size={16} className="text-slate-400" />}
                    </div>
                  </div>

                  {/* Expanded Details & Metadata */}
                  {isExpanded && (
                    <div className="border-t border-white/10 p-4 bg-black/60 rounded-b-xl space-y-3">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                        <div>
                          <span className="text-slate-500 block">Audit ID</span>
                          <span className="font-mono text-white text-[11px]">{audit.id}</span>
                        </div>
                        <div>
                          <span className="text-slate-500 block">Payment Attempt ID</span>
                          <span className="font-mono text-white text-[11px]">{audit.paymentAttemptId}</span>
                        </div>
                        <div>
                          <span className="text-slate-500 block">Correlation ID</span>
                          <span className="font-mono text-indigo-300 text-[11px]">{audit.correlationId || 'N/A'}</span>
                        </div>
                        <div>
                          <span className="text-slate-500 block">Status</span>
                          <span className="font-bold text-white text-[11px]">{audit.status}</span>
                        </div>
                      </div>

                      {audit.snapshot && (
                        <div>
                          <div className="flex items-center gap-1 text-[11px] font-semibold text-slate-400 mb-1">
                            <Code size={12} /> Audit Event Snapshot Payload:
                          </div>
                          <pre className="font-mono text-[10px] bg-slate-950 p-3 rounded-lg border border-white/10 text-emerald-400 overflow-x-auto">
                            {JSON.stringify(audit.snapshot, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
