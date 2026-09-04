import React, { useState, useEffect } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ShieldAlert,
  RefreshCw,
  Search,
  DollarSign,
  TrendingUp,
  User,
  Zap,
  Info,
  ChevronRight,
  Filter
} from 'lucide-react';

interface LiveRecoveryDashboardProps {
  platformUrl: string;
  merchantId: string;
  onSelectAuditRiskEvent?: (riskEventId: string) => void;
}

export const LiveRecoveryDashboard: React.FC<LiveRecoveryDashboardProps> = ({
  platformUrl,
  merchantId,
  onSelectAuditRiskEvent,
}) => {
  const [loading, setLoading] = useState(false);
  const [stoppingRiskId, setStoppingRiskId] = useState<string | null>(null);
  const [stopReason, setStopReason] = useState('');
  const [selectedRiskIdForStop, setSelectedRiskIdForStop] = useState<string | null>(null);
  
  const [metrics, setMetrics] = useState<any>(null);
  const [recoveries, setRecoveries] = useState<any[]>([]);
  const [selectedRecoveryDetail, setSelectedRecoveryDetail] = useState<any>(null);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const fetchDashboardData = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      // 1. Fetch Metrics
      const metricsRes = await fetch(`${platformUrl}/v1/recovery-metrics?merchantId=${encodeURIComponent(merchantId)}`, {
        headers: { 'x-merchant-id': merchantId },
      });
      if (metricsRes.ok) {
        const mData = await metricsRes.json();
        setMetrics(mData.metrics);
      }

      // 2. Fetch Recoveries List
      const recoveriesRes = await fetch(`${platformUrl}/v1/recoveries?merchantId=${encodeURIComponent(merchantId)}`, {
        headers: { 'x-merchant-id': merchantId },
      });
      if (recoveriesRes.ok) {
        const rData = await recoveriesRes.json();
        setRecoveries(rData.recoveries || []);
      }
    } catch (err: any) {
      setErrorMsg(`Failed to connect to LeakGuard Platform at ${platformUrl}: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, [platformUrl, merchantId]);

  useEffect(() => {
    if (!autoRefresh) return;
    const timer = setInterval(() => {
      fetchDashboardData();
    }, 10000);
    return () => clearInterval(timer);
  }, [autoRefresh, platformUrl, merchantId]);

  const handleStopRecovery = async (riskEventId: string) => {
    setStoppingRiskId(riskEventId);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const res = await fetch(`${platformUrl}/v1/recoveries/${riskEventId}/stop`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-merchant-id': merchantId,
        },
        body: JSON.stringify({
          merchantId,
          reason: stopReason || 'Merchant emergency stop initiated from dashboard',
        }),
      });

      const data = await res.json();
      if (data.success) {
        setSuccessMsg(`Recovery workflow ${riskEventId} successfully STOPPED by merchant.`);
        setSelectedRiskIdForStop(null);
        setStopReason('');
        await fetchDashboardData();
      } else {
        setErrorMsg(data.error || 'Failed to stop recovery');
      }
    } catch (err: any) {
      setErrorMsg(`Error stopping recovery: ${err.message}`);
    } finally {
      setStoppingRiskId(null);
    }
  };

  const fetchRecoveryDetail = async (riskEventId: string) => {
    try {
      const res = await fetch(`${platformUrl}/v1/recoveries/${riskEventId}`, {
        headers: { 'x-merchant-id': merchantId },
      });
      if (res.ok) {
        const data = await res.json();
        setSelectedRecoveryDetail(data.recovery);
      }
    } catch (err: any) {
      console.error('Failed to fetch recovery detail', err);
    }
  };

  const filteredRecoveries = recoveries.filter((r) => {
    const matchesSearch =
      r.riskEventId?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.merchantOrderId?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.customer?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.customer?.email?.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;
    if (statusFilter === 'ALL') return true;
    if (statusFilter === 'STOPPED') return r.recoveryStatus === 'STOPPED';
    if (statusFilter === 'RESOLVED') return r.recoveryStatus === 'RESOLVED' || r.recoveryStatus === 'RECOVERED';
    if (statusFilter === 'ACTIVE') return r.recoveryStatus === 'PENDING' || r.recoveryStatus === 'ACTIVE';
    return true;
  });

  const activeCount = recoveries.filter(r => r.recoveryStatus === 'PENDING' || r.recoveryStatus === 'ACTIVE').length;

  return (
    <div className="space-y-6">
      {/* Top Controls & Status Notification */}
      <div className="flex flex-wrap items-center justify-between gap-4 glass-panel p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/20 text-blue-400 border border-blue-500/30">
            <Activity size={20} className="animate-pulse" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              Merchant Live Control & Observability
              {activeCount > 0 && (
                <span className="rounded-full bg-blue-500/20 px-2.5 py-0.5 text-xs font-semibold text-blue-400 border border-blue-500/30 animate-pulse">
                  {activeCount} Active Live
                </span>
              )}
            </h2>
            <p className="text-xs text-slate-400">
              Live monitoring, measured recovery economics, and merchant kill-switch control plane
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium border transition-all ${
              autoRefresh
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                : 'bg-slate-800/50 border-slate-700 text-slate-400'
            }`}
          >
            <span className={`h-2 w-2 rounded-full ${autoRefresh ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
            {autoRefresh ? 'Live Auto-Polling (10s)' : 'Polling Paused'}
          </button>

          <button
            onClick={fetchDashboardData}
            disabled={loading}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-blue-600/30 transition-all hover:bg-blue-500 disabled:opacity-50"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            {loading ? 'Refreshing...' : 'Refresh Data'}
          </button>
        </div>
      </div>

      {/* Notifications */}
      {errorMsg && (
        <div className="flex items-center gap-3 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
          <AlertTriangle size={18} className="shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {successMsg && (
        <div className="flex items-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-400">
          <CheckCircle2 size={18} className="shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Metrics Banner */}
      {metrics && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="glass-panel p-5">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-xs font-medium uppercase tracking-wider">Measured Revenue Recovered</span>
              <DollarSign size={18} className="text-emerald-400" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-extrabold text-white">
                ₹{Number(metrics.totalRecoveredRevenue || 0).toLocaleString('en-IN')}
              </span>
              <span className="text-xs text-slate-400">{metrics.currency || 'INR'}</span>
            </div>
            <p className="mt-1 text-xs text-emerald-400 flex items-center gap-1">
              <TrendingUp size={12} /> Realized on RevenueObligation
            </p>
          </div>

          <div className="glass-panel p-5">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-xs font-medium uppercase tracking-wider">Revenue at Risk</span>
              <AlertTriangle size={18} className="text-amber-400" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-extrabold text-white">
                ₹{Number(metrics.totalRevenueAtRisk || 0).toLocaleString('en-IN')}
              </span>
              <span className="text-xs text-slate-400">{metrics.currency || 'INR'}</span>
            </div>
            <p className="mt-1 text-xs text-slate-400">
              Across {metrics.riskEventsDetected || 0} risk events detected
            </p>
          </div>

          <div className="glass-panel p-5">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-xs font-medium uppercase tracking-wider">Measured Recovery Rate</span>
              <TrendingUp size={18} className="text-blue-400" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-extrabold text-white">
                {((metrics.recoveryRate || 0) * 100).toFixed(1)}%
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-400">
              {metrics.recoveredEvents || 0} of {metrics.riskEventsDetected || 0} events recovered
            </p>
          </div>

          <div className="glass-panel p-5">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-xs font-medium uppercase tracking-wider">Safety Control State</span>
              <ShieldAlert size={18} className="text-indigo-400" />
            </div>
            <div className="mt-2 flex items-center gap-3">
              <div className="text-xl font-bold text-white">
                {metrics.activeRecoveries || 0} Active
              </div>
              {metrics.stoppedRecoveries > 0 && (
                <span className="rounded-md bg-red-500/20 px-2 py-0.5 text-xs font-semibold text-red-400 border border-red-500/30">
                  {metrics.stoppedRecoveries} Stopped
                </span>
              )}
            </div>
            <p className="mt-1 text-xs text-slate-400">
              {metrics.totalInterventionAttempts || 0} Total intervention attempts
            </p>
          </div>
        </div>
      )}

      {/* Recoveries List & Control Table */}
      <div className="glass-panel p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-4">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              Live & Historical Recovery Workflows
            </h3>
            <p className="text-xs text-slate-400">
              Merchant kill-switch control panel and real-time execution monitor
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Search */}
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search Order ID, Risk ID, Customer..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-64 rounded-xl border border-white/10 bg-black/40 pl-9 pr-4 py-1.5 text-xs text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
              />
            </div>

            {/* Filter */}
            <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-black/40 p-1 text-xs">
              <Filter size={12} className="ml-2 text-slate-400" />
              {['ALL', 'ACTIVE', 'STOPPED', 'RESOLVED'].map((st) => (
                <button
                  key={st}
                  onClick={() => setStatusFilter(st)}
                  className={`rounded-lg px-2.5 py-1 font-medium transition-all ${
                    statusFilter === st
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Table */}
        {filteredRecoveries.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <Info size={32} className="mx-auto mb-2 opacity-50" />
            <p className="text-sm font-medium">No recovery workflows found matching criteria.</p>
            <p className="text-xs text-slate-500 mt-1">
              Trigger a payment failure in the Live SDK Sandbox tab to create active recovery events.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-white/10 text-slate-400">
                <tr>
                  <th className="py-3 px-4">Risk Event & Order</th>
                  <th className="py-3 px-4">Customer Details</th>
                  <th className="py-3 px-4">Amount at Risk</th>
                  <th className="py-3 px-4">Diagnosed Cause</th>
                  <th className="py-3 px-4">Current Status</th>
                  <th className="py-3 px-4">Started At</th>
                  <th className="py-3 px-4 text-right">Merchant Control</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredRecoveries.map((r) => {
                  const isStopped = r.recoveryStatus === 'STOPPED';
                  const isResolved = r.recoveryStatus === 'RESOLVED' || r.recoveryStatus === 'RECOVERED';
                  const isActive = r.recoveryStatus === 'PENDING' || r.recoveryStatus === 'ACTIVE';

                  return (
                    <tr key={r.riskEventId} className="hover:bg-white/5 transition-colors">
                      <td className="py-3 px-4">
                        <div className="font-mono font-medium text-white">{r.riskEventId?.substring(0, 16)}...</div>
                        <div className="text-[10px] text-slate-400">Order: {r.merchantOrderId}</div>
                      </td>

                      <td className="py-3 px-4">
                        {r.customer ? (
                          <div>
                            <div className="font-medium text-slate-200 flex items-center gap-1">
                              <User size={10} className="text-slate-400" /> {r.customer.name || 'Anonymous'}
                            </div>
                            <div className="text-[10px] text-slate-400">{r.customer.email || r.customer.phone || 'No contact info'}</div>
                          </div>
                        ) : (
                          <span className="text-slate-500 italic">No customer attached</span>
                        )}
                      </td>

                      <td className="py-3 px-4 font-semibold text-white">
                        ₹{Number(r.amount || 0).toLocaleString('en-IN')} <span className="text-[10px] text-slate-400">{r.currency}</span>
                      </td>

                      <td className="py-3 px-4">
                        <span className="rounded-md bg-indigo-500/10 px-2 py-0.5 font-medium text-indigo-300 border border-indigo-500/20">
                          {r.diagnosis?.cause || 'GENERIC_FAILURE'}
                        </span>
                        {r.diagnosis?.priority && (
                          <div className="text-[10px] text-slate-400 mt-0.5">Priority: {r.diagnosis.priority}</div>
                        )}
                      </td>

                      <td className="py-3 px-4">
                        {isStopped ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-red-400 border border-red-500/30">
                            <XCircle size={12} /> STOPPED
                          </span>
                        ) : isResolved ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-400 border border-emerald-500/30">
                            <CheckCircle2 size={12} /> RESOLVED
                          </span>
                        ) : isActive ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-blue-400 border border-blue-500/30 animate-pulse">
                            <Zap size={12} /> ACTIVE
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-slate-800 px-2.5 py-0.5 text-[11px] font-medium text-slate-300">
                            {r.recoveryStatus}
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-slate-400">
                        {new Date(r.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </td>

                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {isActive && (
                            <button
                              onClick={() => setSelectedRiskIdForStop(r.riskEventId)}
                              className="flex items-center gap-1 rounded-lg bg-red-600/20 border border-red-500/30 px-2.5 py-1 text-[11px] font-semibold text-red-300 hover:bg-red-600 hover:text-white transition-all shadow-sm"
                            >
                              <ShieldAlert size={12} /> Emergency Stop
                            </button>
                          )}

                          <button
                            onClick={() => {
                              fetchRecoveryDetail(r.riskEventId);
                            }}
                            className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-medium text-slate-300 hover:bg-white/10 hover:text-white transition-all"
                          >
                            Inspect <ChevronRight size={12} />
                          </button>

                          {onSelectAuditRiskEvent && (
                            <button
                              onClick={() => onSelectAuditRiskEvent(r.riskEventId)}
                              className="flex items-center gap-1 rounded-lg border border-blue-500/30 bg-blue-500/10 px-2 py-1 text-[11px] font-medium text-blue-400 hover:bg-blue-500/20 transition-all"
                              title="View Audit Timeline"
                            >
                              Audit
                            </button>
                          )}
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

      {/* Emergency Stop Confirmation Modal */}
      {selectedRiskIdForStop && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="glass-panel max-w-md w-full p-6 space-y-4 border border-red-500/30 shadow-2xl">
            <div className="flex items-center gap-3 text-red-400">
              <div className="rounded-full bg-red-500/20 p-2 border border-red-500/30">
                <ShieldAlert size={24} />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Merchant Emergency Stop</h3>
                <p className="text-xs text-slate-400">Halt live recovery workflow instantly</p>
              </div>
            </div>

            <div className="text-xs text-slate-300 space-y-2 bg-black/40 p-3 rounded-xl border border-white/5">
              <p>
                <strong className="text-white">Target Risk Event ID:</strong>{' '}
                <span className="font-mono text-blue-400">{selectedRiskIdForStop}</span>
              </p>
              <p className="text-slate-400">
                Stopping this recovery will set <code className="text-amber-300">RecoveryControl = STOPPED</code> in PostgreSQL. 
                Any pending or upcoming intervention attempts for this issue will be immediately blocked by live safety checks.
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Stop Reason / Note (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g., Customer reached out via phone support"
                value={stopReason}
                onChange={(e) => setStopReason(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-black/50 px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-red-500 focus:outline-none"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => {
                  setSelectedRiskIdForStop(null);
                  setStopReason('');
                }}
                className="rounded-lg border border-white/10 px-4 py-2 text-xs font-medium text-slate-400 hover:bg-white/5 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={() => handleStopRecovery(selectedRiskIdForStop)}
                disabled={stoppingRiskId === selectedRiskIdForStop}
                className="rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-red-600/30 hover:bg-red-500 disabled:opacity-50"
              >
                {stoppingRiskId === selectedRiskIdForStop ? 'Halting Execution...' : 'Confirm Emergency Stop'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Single Recovery Inspection Drawer / Modal */}
      {selectedRecoveryDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="glass-panel max-w-2xl w-full max-h-[85vh] overflow-y-auto p-6 space-y-6 border border-blue-500/30">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  Recovery Detail Overview
                  <span className="font-mono text-xs text-blue-400 font-normal">
                    ({selectedRecoveryDetail.riskEventId})
                  </span>
                </h3>
                <p className="text-xs text-slate-400">Order #{selectedRecoveryDetail.merchantOrderId}</p>
              </div>

              <button
                onClick={() => setSelectedRecoveryDetail(null)}
                className="rounded-lg bg-white/5 p-1.5 text-slate-400 hover:bg-white/10 hover:text-white"
              >
                ✕
              </button>
            </div>

            {/* General Info */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
              <div className="bg-black/30 p-3 rounded-xl border border-white/5">
                <span className="text-slate-400 block">Amount at Risk</span>
                <span className="text-sm font-bold text-white">
                  ₹{Number(selectedRecoveryDetail.payment?.amount || 0).toLocaleString('en-IN')}
                </span>
              </div>
              <div className="bg-black/30 p-3 rounded-xl border border-white/5">
                <span className="text-slate-400 block">Diagnosed Cause</span>
                <span className="text-sm font-bold text-indigo-300">
                  {selectedRecoveryDetail.diagnosis?.cause || 'N/A'}
                </span>
              </div>
              <div className="bg-black/30 p-3 rounded-xl border border-white/5">
                <span className="text-slate-400 block">Control Status</span>
                <span className={`text-sm font-bold ${selectedRecoveryDetail.control?.status === 'STOPPED' ? 'text-red-400' : 'text-emerald-400'}`}>
                  {selectedRecoveryDetail.control?.status || 'ACTIVE'}
                </span>
              </div>
            </div>

            {/* Attempts Timeline */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
                Intervention Execution Attempts ({selectedRecoveryDetail.attempts?.length || 0})
              </h4>
              {selectedRecoveryDetail.attempts?.length === 0 ? (
                <p className="text-xs text-slate-500 italic">No execution attempts recorded yet.</p>
              ) : (
                <div className="space-y-2">
                  {selectedRecoveryDetail.attempts.map((att: any, idx: number) => (
                    <div key={att.id || idx} className="bg-black/40 p-3 rounded-xl border border-white/5 flex items-center justify-between text-xs">
                      <div>
                        <div className="font-semibold text-white flex items-center gap-2">
                          <span>Attempt #{att.attemptNumber}</span>
                          <span className="rounded bg-blue-500/20 px-2 py-0.5 text-[10px] text-blue-300">
                            {att.interventionType}
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-400 mt-1">
                          Idempotency Key: {att.idempotencyKey}
                        </div>
                      </div>
                      <div className="text-right">
                        <span className={`font-semibold ${att.status === 'SUCCEEDED' ? 'text-emerald-400' : att.status === 'BLOCKED' ? 'text-amber-400' : 'text-red-400'}`}>
                          {att.status}
                        </span>
                        <div className="text-[10px] text-slate-500">
                          {new Date(att.createdAt).toLocaleTimeString()}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Audit Timeline */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
                Audit Timeline Logs ({selectedRecoveryDetail.auditTimeline?.length || 0})
              </h4>
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {selectedRecoveryDetail.auditTimeline?.map((log: any) => (
                  <div key={log.id} className="text-xs bg-slate-950 p-2.5 rounded-lg border border-white/5 flex items-start justify-between">
                    <div>
                      <span className="font-semibold text-indigo-300">{log.eventType}</span>
                      <p className="text-[11px] text-slate-300 mt-0.5">{log.reason || log.action}</p>
                    </div>
                    <span className="text-[10px] text-slate-500 shrink-0">
                      {new Date(log.createdAt).toLocaleTimeString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setSelectedRecoveryDetail(null)}
                className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-md hover:bg-blue-500"
              >
                Close View
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
