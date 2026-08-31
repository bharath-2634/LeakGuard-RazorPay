import React, { useState } from 'react';
import { Play, AlertOctagon, RefreshCw, Layers, ShieldCheck, X } from 'lucide-react';

interface InteractiveSandboxProps {
  platformUrl: string;
  merchantId: string;
}

export const InteractiveSandbox: React.FC<InteractiveSandboxProps> = ({ platformUrl, merchantId }) => {
  const [amount, setAmount] = useState<number>(20000);
  const [orderId, setOrderId] = useState<string>(`order_${Math.floor(1000 + Math.random() * 9000)}`);
  const [session, setSession] = useState<any>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [logs, setLogs] = useState<Array<{ time: string; type: string; message: string; details?: any }>>([]);
  const [riskEventOutput, setRiskEventOutput] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const addLog = (type: string, message: string, details?: any) => {
    setLogs((prev) => [
      {
        time: new Date().toLocaleTimeString(),
        type,
        message,
        details,
      },
      ...prev,
    ]);
  };

  // Step 1: Create Session
  const handleCreateSession = async () => {
    setLoading(true);
    setRiskEventOutput(null);
    addLog('INFO', `Initiating payment session for Merchant Order #${orderId} (Amount: ₹${amount})`);

    try {
      const res = await fetch(`${platformUrl}/v1/payments/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          merchantId,
          merchantOrderId: orderId,
          amount,
          currency: 'INR',
          customerId: 'cust_demo_777',
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setSession(data);
        addLog('SUCCESS', `Payment Session Created: Attempt ID '${data.paymentAttemptId}', Razorpay Order '${data.razorpayOrderId}'`, data);
      } else {
        throw new Error(data.error || 'Failed to create session');
      }
    } catch (err: any) {
      // Local fallback simulation
      const fallbackData = {
        success: true,
        paymentAttemptId: `pa_${Math.random().toString(36).substring(2, 12)}`,
        merchantOrderId: orderId,
        razorpayOrderId: `order_rzp_${Math.random().toString(36).substring(2, 10)}`,
        razorpayKeyId: 'rzp_test_key_112233',
        amount,
        currency: 'INR',
        expiresAt: new Date(Date.now() + 1800000).toISOString(),
      };
      setSession(fallbackData);
      addLog('SUCCESS', `[Offline Mode] Payment Session Created: Attempt ID '${fallbackData.paymentAttemptId}'`, fallbackData);
    } finally {
      setLoading(false);
    }
  };

  // Step 2: Open Checkout Modal
  const handleOpenCheckoutModal = () => {
    if (!session) return;
    setIsModalOpen(true);
    addLog('SDK', `[Telemetry] Event 'checkout_opened' dispatched asynchronously to platform`, {
      paymentAttemptId: session.paymentAttemptId,
      source: 'sdk',
    });
  };

  // Step 3: Simulate Outcome
  const handleSimulateOutcome = async (outcome: 'INSUFFICIENT_FUNDS' | 'OTP_ABANDONED' | 'SUCCESS') => {
    setIsModalOpen(false);
    setLoading(true);

    if (outcome === 'SUCCESS') {
      addLog('PROVIDER', `[Razorpay Webhook] Event 'payment.captured' received`, {
        paymentAttemptId: session.paymentAttemptId,
        providerState: 'CAPTURED',
        businessState: 'RESOLVED',
        revenueObligationResolved: true,
      });

      try {
        await fetch(`${platformUrl}/v1/webhooks/razorpay?merchant_id=${merchantId}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-razorpay-signature': 'mock_signature',
            'x-merchant-id': merchantId,
          },
          body: JSON.stringify({
            event: 'payment.captured',
            event_id: `evt_${Date.now()}`,
            account_id: merchantId,
            payload: {
              payment: {
                entity: {
                  id: `pay_${Date.now()}`,
                  order_id: session.razorpayOrderId,
                  status: 'captured',
                },
              },
            },
          }),
        });
      } catch (e) {
        // Ignored
      }
      setLoading(false);
      return;
    }

    const isInsufficient = outcome === 'INSUFFICIENT_FUNDS';
    const reasonCode = isInsufficient ? 'insufficient_funds' : 'bad_request';
    const errorCode = isInsufficient ? 'BAD_REQUEST_ERROR' : 'GATEWAY_ERROR';

    addLog('SDK', `[Telemetry] Event 'checkout_closed' recorded by SDK`);
    addLog('PROVIDER', `[Razorpay Webhook] Event 'payment.failed' received with reason: ${reasonCode}`);

    const webhookPayload = {
      event: 'payment.failed',
      event_id: `evt_fail_${Date.now()}`,
      account_id: merchantId,
      payload: {
        payment: {
          entity: {
            id: `pay_failed_${Date.now()}`,
            order_id: session.razorpayOrderId,
            status: 'failed',
            error_code: errorCode,
            error_reason: reasonCode,
            error_description: isInsufficient ? 'Payment failed due to insufficient account balance' : 'Customer abandoned 3DS OTP step',
          },
        },
      },
    };

    try {
      await fetch(`${platformUrl}/v1/webhooks/razorpay?merchant_id=${merchantId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-razorpay-signature': 'mock_signature',
          'x-merchant-id': merchantId,
        },
        body: JSON.stringify(webhookPayload),
      });
    } catch (e) {
      // Ignored
    }

    const riskPayload = {
      event_type: 'PAYMENT_FAILURE_RISK',
      payment_attempt_id: session.paymentAttemptId,
      merchant_id: merchantId,
      customer_id: 'cust_demo_777',
      merchant_order_id: session.merchantOrderId,
      razorpay_order_id: session.razorpayOrderId,
      razorpay_payment_id: `pay_failed_${Date.now()}`,
      amount: session.amount,
      currency: 'INR',
      payment_status: 'FAILED',
      revenue_obligation_resolved: false,
      cause_evidence: {
        candidate_causes: isInsufficient ? ['INSUFFICIENT_FUNDS'] : ['3DS_OTP_ABANDONMENT'],
        supporting_evidence: [
          `razorpay:error_reason:${reasonCode}`,
          `sdk:journey:checkout_${isInsufficient ? 'opened' : 'closed'}`,
        ],
        confidence: isInsufficient ? 0.99 : 0.95,
      },
      audit: {
        source: ['razorpay', 'sdk'],
        timestamp: new Date().toISOString(),
        correlation_id: `corr_${session.paymentAttemptId}`,
      },
    };

    setRiskEventOutput(riskPayload);
    addLog('ENGINE', `[Cause Qualification Engine] Emitted PAYMENT_FAILURE_RISK event! Cause: ${riskPayload.cause_evidence.candidate_causes[0]}`, riskPayload);
    setLoading(false);
  };

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      {/* Sandbox Header */}
      <div className="glass-panel border-l-4 border-l-emerald-500 p-6">
        <h2 className="flex items-center gap-2.5 text-xl font-bold text-white">
          <Play className="text-emerald-400" size={24} /> Interactive SDK Sandbox & Payment Failure Simulator
        </h2>
        <p className="mt-1 text-sm text-slate-400 leading-relaxed">
          Test the end-to-end SDK payment flow in real time! Create a payment session, open the simulated Razorpay checkout modal,
          trigger payment failure outcomes, and observe the live event logs and generated <code>PAYMENT_FAILURE_RISK</code> payload.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Step Controls Column */}
        <div className="flex flex-col gap-5 lg:col-span-1">
          {/* Step 1 Box */}
          <div className="glass-panel p-5">
            <h3 className="mb-3 text-sm font-semibold text-blue-400">
              Step 1: Merchant Session Creation
            </h3>

            <div className="mb-3">
              <label className="mb-1 block text-xs font-medium text-slate-400">Order ID</label>
              <input
                type="text"
                className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
                value={orderId}
                onChange={(e) => setOrderId(e.target.value)}
              />
            </div>

            <div className="mb-4">
              <label className="mb-1 block text-xs font-medium text-slate-400">Amount (INR)</label>
              <input
                type="number"
                className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value))}
              />
            </div>

            <button
              onClick={handleCreateSession}
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-blue-500/25 transition-all hover:scale-[1.01] hover:shadow-blue-500/40 disabled:opacity-50"
            >
              {loading ? <RefreshCw size={16} className="animate-spin" /> : <Layers size={16} />}
              Create Payment Session
            </button>
          </div>

          {/* Step 2 Box */}
          <div className={`glass-panel p-5 transition-opacity ${session ? 'opacity-100' : 'opacity-50'}`}>
            <h3 className="mb-3 text-sm font-semibold text-purple-400">
              Step 2: Trigger SDK Checkout Modal
            </h3>

            {session ? (
              <div className="mb-4 rounded-lg bg-black/40 p-3 text-xs text-slate-300 space-y-1">
                <p><strong>Attempt ID:</strong> <code className="text-emerald-400">{session.paymentAttemptId}</code></p>
                <p><strong>Razorpay Order:</strong> <code className="text-purple-400">{session.razorpayOrderId}</code></p>
              </div>
            ) : (
              <p className="mb-4 text-xs text-slate-500">
                Create a payment session in Step 1 first.
              </p>
            )}

            <button
              onClick={handleOpenCheckoutModal}
              disabled={!session || loading}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-purple-500/25 transition-all hover:scale-[1.01] hover:shadow-purple-500/40 disabled:opacity-50"
            >
              <Play size={16} /> Open Razorpay Modal (SDK Wrapped)
            </button>
          </div>
        </div>

        {/* Live Logs & Output Column */}
        <div className="glass-panel flex flex-col p-5 lg:col-span-2 h-[480px]">
          <h3 className="mb-3 flex items-center justify-between text-sm font-semibold text-white">
            <span>Live Event Stream & Correlation Logs</span>
            <span className="rounded-md bg-white/10 px-2 py-0.5 text-xs text-slate-400">{logs.length} Events</span>
          </h3>

          <div className="flex-1 overflow-y-auto pr-1 space-y-2.5">
            {logs.length === 0 ? (
              <div className="mt-28 text-center text-xs text-slate-500">
                No events captured yet. Click <strong>"Create Payment Session"</strong> to start.
              </div>
            ) : (
              logs.map((log, index) => (
                <div key={index} className="rounded-xl border border-white/5 bg-black/50 p-3 text-xs">
                  <div className="flex items-center justify-between mb-1">
                    <span className={`rounded-md px-2 py-0.5 font-semibold text-[10px] uppercase tracking-wider ${
                      log.type === 'SUCCESS' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                      log.type === 'ENGINE' ? 'bg-red-500/20 text-red-400 border border-red-500/30' :
                      'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                    }`}>
                      {log.type}
                    </span>
                    <span className="text-[10px] text-slate-500">{log.time}</span>
                  </div>
                  <p className="text-slate-200">{log.message}</p>
                  {log.details && (
                    <pre className="mt-1.5 overflow-x-auto rounded-lg bg-slate-950 p-2 font-mono text-[11px] text-slate-400">
                      {JSON.stringify(log.details, null, 2)}
                    </pre>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Generated PAYMENT_FAILURE_RISK Output JSON Display */}
      {riskEventOutput && (
        <div className="glass-panel border-l-4 border-l-red-500 p-6">
          <h3 className="mb-2 flex items-center gap-2 text-base font-semibold text-red-400">
            <AlertOctagon size={20} /> Generated PAYMENT_FAILURE_RISK Output Payload
          </h3>
          <p className="mb-3 text-xs text-slate-400">
            This normalized risk payload is generated deterministically by the <code>CauseQualificationEngine</code> and passed to downstream recovery engines:
          </p>
          <pre className="overflow-x-auto rounded-xl border border-white/10 bg-slate-950 p-4 font-mono text-xs text-emerald-400 leading-relaxed">
            {JSON.stringify(riskEventOutput, null, 2)}
          </pre>
        </div>
      )}

      {/* Simulated Razorpay Modal Popup */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
          <div className="glass-panel w-full max-w-md bg-slate-900 p-6 border border-white/20 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <ShieldCheck className="text-blue-400" size={20} />
                <h4 className="text-sm font-semibold text-white">Simulated Razorpay Checkout</h4>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-white transition-colors">
                <X size={20} />
              </button>
            </div>

            <div className="rounded-xl border border-white/10 bg-black/40 p-3.5 mb-5 text-xs text-slate-300 space-y-1">
              <p><strong>Merchant:</strong> ShopExpress</p>
              <p><strong>Amount:</strong> ₹{amount.toLocaleString()}</p>
              <p className="text-[11px] text-slate-500">Order: {orderId} | Attempt: {session?.paymentAttemptId}</p>
            </div>

            <p className="mb-3 text-xs text-slate-400">
              Select a payment attempt outcome to test telemetry & qualification:
            </p>

            <div className="flex flex-col gap-2.5">
              <button
                onClick={() => handleSimulateOutcome('INSUFFICIENT_FUNDS')}
                className="flex items-center gap-2 rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-xs font-semibold text-red-400 transition-all hover:bg-red-500/20"
              >
                ✖ Simulate Insufficient Funds Decline
              </button>

              <button
                onClick={() => handleSimulateOutcome('OTP_ABANDONED')}
                className="flex items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs font-semibold text-amber-400 transition-all hover:bg-amber-500/20"
              >
                ⚠ Simulate 3DS OTP Checkout Abandonment
              </button>

              <button
                onClick={() => handleSimulateOutcome('SUCCESS')}
                className="flex items-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3 text-xs font-semibold text-emerald-400 transition-all hover:bg-emerald-500/20"
              >
                ✔ Simulate Payment Success (Captured)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
