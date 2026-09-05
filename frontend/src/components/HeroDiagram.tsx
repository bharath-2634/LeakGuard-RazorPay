import React from 'react';
import { CreditCard, UserMinus, DollarSign, Hexagon } from 'lucide-react';

export const HeroDiagram: React.FC = () => {
  const inputs = [
    { label: 'Failed Payments', Icon: CreditCard },
    { label: 'Customer Churn', Icon: UserMinus },
    { label: 'Uncollected Revenue', Icon: DollarSign },
    { label: 'Razorpay Direct', Icon: Hexagon },
  ];

  return (
    <div className="relative mx-auto w-full max-w-xl">
      <div className="pointer-events-none absolute -inset-10 rounded-full bg-sky-400/20 blur-3xl" />

      <div className="relative grid grid-cols-4 gap-3">
        {inputs.map(({ label, Icon }) => (
          <div key={label} className="flex flex-col items-center gap-2">
            <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-white/10 bg-[#123056] text-sky-200 shadow-lg shadow-sky-900/40">
              <Icon size={22} />
            </div>
            <p className="text-center text-[10px] font-medium leading-tight text-white/80">{label}</p>
          </div>
        ))}
      </div>

      <svg className="mx-auto my-1 h-16 w-full text-sky-300/70" viewBox="0 0 400 64" fill="none" aria-hidden>
        <path d="M50 0 V20 H200 V64" stroke="currentColor" strokeWidth="1.4" />
        <path d="M150 0 V20 H200 V64" stroke="currentColor" strokeWidth="1.4" />
        <path d="M250 0 V20 H200 V64" stroke="currentColor" strokeWidth="1.4" />
        <path d="M350 0 V20 H200 V64" stroke="currentColor" strokeWidth="1.4" />
      </svg>

      <div className="relative mx-auto mb-4 w-[92%] rounded-2xl border border-sky-300/30 bg-[#0b1b33]/90 px-6 py-4 text-center shadow-[0_0_40px_rgba(56,189,248,0.25)]">
        <p className="text-sm font-semibold tracking-wide text-white">LeakGuard SDK (RazorPay Integrated)</p>
      </div>

      <svg className="mx-auto h-10 w-full text-sky-300/50" viewBox="0 0 400 40" fill="none" aria-hidden>
        <path d="M200 0 V12 H50 V40" stroke="currentColor" strokeWidth="1.2" strokeDasharray="3 3" />
        <path d="M200 0 V12 H150 V40" stroke="currentColor" strokeWidth="1.2" strokeDasharray="3 3" />
        <path d="M200 0 V12 H250 V40" stroke="currentColor" strokeWidth="1.2" strokeDasharray="3 3" />
        <path d="M200 0 V12 H350 V40" stroke="currentColor" strokeWidth="1.2" strokeDasharray="3 3" />
      </svg>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-2xl bg-white p-3 shadow-xl shadow-sky-900/30">
          <p className="text-[10px] font-semibold text-slate-500">Recovered Revenue Trend</p>
          <div className="mt-2 flex h-12 items-end gap-1">
            {[40, 55, 35, 70, 50, 85, 62].map((h, i) => (
              <div key={i} className="flex-1 rounded-t bg-sky-500" style={{ height: `${h}%` }} />
            ))}
          </div>
          <p className="mt-2 text-xs font-semibold text-slate-700">7 Targets</p>
        </div>

        <div className="rounded-2xl bg-white p-3 shadow-xl shadow-sky-900/30">
          <p className="text-[10px] font-semibold text-slate-500">Recovery Rate %</p>
          <div className="relative mx-auto mt-1 h-12 w-20 overflow-hidden">
            <div className="absolute inset-x-0 bottom-0 h-10 rounded-t-full border-8 border-slate-200 border-b-0" />
            <div className="absolute inset-x-0 bottom-0 h-10 rounded-t-full border-8 border-sky-500 border-b-0 [clip-path:inset(0_12%_0_0)]" />
          </div>
          <p className="text-center text-lg font-bold text-sky-600">90%</p>
        </div>

        <div className="rounded-2xl bg-white p-3 shadow-xl shadow-sky-900/30">
          <p className="text-[10px] font-semibold text-slate-500">Churn Rate Reduction</p>
          <svg className="mt-2 h-10 w-full" viewBox="0 0 80 32" fill="none">
            <path d="M2 24 C18 24, 22 10, 38 12 C52 14, 58 6, 78 4" stroke="#0ea5e9" strokeWidth="2.4" />
          </svg>
          <p className="text-sm font-bold text-slate-800">-1.09</p>
        </div>

        <div className="rounded-2xl bg-white p-3 shadow-xl shadow-sky-900/30">
          <p className="text-[10px] font-semibold text-slate-500">Total Active SDK Devices</p>
          <div className="mt-2 flex h-10 items-end gap-1">
            {[30, 48, 62, 44, 78, 55].map((h, i) => (
              <div key={i} className="flex-1 rounded-t bg-sky-400" style={{ height: `${h}%` }} />
            ))}
          </div>
          <p className="mt-1 text-lg font-bold text-slate-800">348</p>
        </div>
      </div>
    </div>
  );
};
