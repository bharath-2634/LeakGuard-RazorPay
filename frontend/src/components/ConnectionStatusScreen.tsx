import React, { useEffect } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, ShieldCheck } from 'lucide-react';

interface ConnectionStatusScreenProps {
  status: 'loading' | 'success' | 'failure';
  message: string;
  onContinue?: () => void;
  onRetry?: () => void;
}

export const ConnectionStatusScreen: React.FC<ConnectionStatusScreenProps> = ({
  status,
  message,
  onContinue,
  onRetry,
}) => {
  useEffect(() => {
    if (status !== 'success') return;
    const timer = window.setTimeout(() => onContinue?.(), 2800);
    return () => window.clearTimeout(timer);
  }, [status, onContinue]);
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#071427] px-6">
      <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-[#0d1d36]/90 p-10 text-center shadow-2xl shadow-sky-950/50">
        {status === 'loading' && (
          <>
            <Loader2 size={48} className="mx-auto animate-spin text-sky-400" />
            <h2 className="mt-6 text-2xl font-bold text-white">Connecting merchant store</h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-400">
              Encrypting Razorpay credentials and registering your store with the LeakGuard platform.
              Please wait while we confirm the connection.
            </p>
            <div className="mt-8 space-y-2 text-left text-xs text-slate-400">
              <p className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-sky-400" /> Validating merchant payload
              </p>
              <p className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-sky-400" /> Securing keys with AES-256-GCM
              </p>
              <p className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-sky-400" /> Waiting for platform response
              </p>
            </div>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400">
              <CheckCircle2 size={36} />
            </div>
            <h2 className="mt-6 text-2xl font-bold text-white">Store connected successfully</h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-400">{message}</p>
            <button
              type="button"
              onClick={onContinue}
              className="mt-8 inline-flex items-center gap-2 rounded-full bg-sky-500 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-sky-500/30 hover:bg-sky-400"
            >
              <ShieldCheck size={16} /> Continue to KT Guide
            </button>
          </>
        )}

        {status === 'failure' && (
          <>
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-500/15 text-red-400">
              <AlertTriangle size={36} />
            </div>
            <h2 className="mt-6 text-2xl font-bold text-white">Connection failed</h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-400">{message}</p>
            <button
              type="button"
              onClick={onRetry}
              className="mt-8 inline-flex items-center gap-2 rounded-full border border-white/20 px-6 py-2.5 text-sm font-semibold text-white hover:bg-white/10"
            >
              <RefreshCw size={16} /> Back to merchant setup
            </button>
          </>
        )}
      </div>
    </div>
  );
};
