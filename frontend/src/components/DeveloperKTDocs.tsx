import React, { useState } from 'react';
import { Copy, Check, Code, Server, Smartphone, ShieldCheck, Activity, Terminal } from 'lucide-react';

interface DeveloperKTDocsProps {
  platformUrl: string;
  merchantId: string;
  onDone?: () => void;
}

export const DeveloperKTDocs: React.FC<DeveloperKTDocsProps> = ({ platformUrl, merchantId, onDone }) => {
  const [activeKTSection, setActiveKTSection] = useState<'backend' | 'frontend' | 'webhook' | 'telemetry' | 'architecture'>('backend');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const backendCodeSnippet = `// Node.js Express / Next.js API Route (Merchant Backend)
const createPaymentSession = async (req, res) => {
  try {
    const { orderId, amount, customerId, customerName, customerEmail, customerPhone } = req.body;

    // Call LeakGuard Unified Session API with Customer Details
    // Explore platform documentation at: ${platformUrl}
    const response = await fetch('${platformUrl}/v1/payments/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        merchantId: "${merchantId}",
        merchantOrderId: orderId, // e.g. "order_1001"
        amount: amount,          // Amount in INR (e.g. 20000)
        currency: "INR",
        customer: {
          id: customerId,
          name: customerName,
          email: customerEmail,
          phone: customerPhone
        }
      })
    });

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error);
    }

    // Return public credentials ONLY to the browser
    return res.json({
      paymentAttemptId: data.paymentAttemptId, // "pa_..."
      razorpayOrderId: data.razorpayOrderId,   // "order_rzp_..."
      razorpayKeyId: data.razorpayKeyId,       // "rzp_live_..."
      amount: data.amount,
      currency: data.currency
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};`;

  const frontendCodeSnippet = `<!-- 1. Include Browser SDK Script -->
<script src="${platformUrl}/sdk/revenue-recovery-sdk.js"></script>

<script>
  // 2. Initialize SDK on page load
  const sdk = RevenueRecoverySDK.init({
    merchantId: "${merchantId}",
    telemetryEndpoint: "${platformUrl}/v1/sdk/events",
    batchIntervalMs: 1000,
    requestTimeoutMs: 1500 // Fail-open strict 1.5s SLA
  });

  // 3. Trigger Checkout Flow
  async function handlePayNowClick() {
    // Call Merchant Backend to create unified session
    const sessionRes = await fetch('/api/create-payment-session', { method: 'POST' });
    const session = await sessionRes.json();

    // Standard Razorpay Modal Options
    const razorpayOptions = {
      key: session.razorpayKeyId,
      order_id: session.razorpayOrderId,
      amount: session.amount * 100, // Amount in paise
      currency: session.currency,
      name: "ShopExpress",
      description: "Order #" + session.merchantOrderId,
      handler: function(response) {
        alert("Payment Authorized! Payment ID: " + response.razorpay_payment_id);
      }
    };

    // 4. Wrap Razorpay options with SDK fail-open boundary
    const wrappedOptions = sdk.wrapCheckout(razorpayOptions, session.paymentAttemptId);

    // 5. Open Razorpay Checkout Modal
    const rzp = new Razorpay(wrappedOptions);
    rzp.open();
  }
</script>`;

  const webhookCodeSnippet = `// Node.js Express Raw Body HMAC Webhook Verification
import crypto from 'crypto';

app.post('/webhooks/razorpay', express.raw({ type: 'application/json' }), (req, res) => {
  const signature = req.headers['x-razorpay-signature'];
  const secretKey = process.env.RAZORPAY_KEY_SECRET;

  // IMPORTANT: Use req.rawBody or raw Buffer, NOT JSON stringified body
  const expectedSignature = crypto
    .createHmac('sha256', secretKey)
    .update(req.body)
    .digest('hex');

  const isValid = signature.length === expectedSignature.length &&
    crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));

  if (!isValid) {
    // Rejection Policy: Return 401 Unauthorized immediately
    return res.status(401).json({ success: false, error: 'Invalid HMAC signature' });
  }

  // Deduplicate razorpay_event_id and process webhook event asynchronously
  res.status(200).json({ success: true });
});`;

  const telemetryCodeSnippet = `// Merchant Backend Telemetry Ingestion API (Optional Observability Log)
const reportMerchantTechnicalError = async (merchantOrderId, statusCode, errorCode) => {
  await fetch('${platformUrl}/v1/merchant-telemetry', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      merchant_id: "${merchantId}",
      merchant_order_id: merchantOrderId,
      event_type: "payment_create_failed",
      status: statusCode, // e.g. 500
      error_code: errorCode, // e.g. "DATABASE_TIMEOUT"
      severity: "ERROR",
      service: "merchant-checkout-backend"
    })
  });
};`;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      {/* Overview Banner */}
      <div className="glass-panel border-l-4 border-l-purple-500 p-6">
        <h2 className="flex items-center gap-2.5 text-xl font-bold text-white">
          <Code className="text-purple-400" size={24} /> Developer Knowledge Transfer & Integration Guide
        </h2>
        <p className="mt-1 text-sm text-slate-400 leading-relaxed">
          Comprehensive documentation and copyable code templates for developer integration.
          Learn how to connect server-side APIs, client-side browser SDKs, and HMAC webhook verification.
        </p>
      </div>

      {/* KT Section Selector Tabs */}
      <div className="flex gap-2.5 overflow-x-auto pb-1">
        <button
          onClick={() => setActiveKTSection('backend')}
          className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold transition-all ${
            activeKTSection === 'backend'
              ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/30'
              : 'border border-white/10 bg-black/30 text-slate-300 hover:bg-white/5 hover:text-white'
          }`}
        >
          <Server size={16} /> 1. Backend Session API
        </button>

        <button
          onClick={() => setActiveKTSection('frontend')}
          className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold transition-all ${
            activeKTSection === 'frontend'
              ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/30'
              : 'border border-white/10 bg-black/30 text-slate-300 hover:bg-white/5 hover:text-white'
          }`}
        >
          <Smartphone size={16} /> 2. Browser SDK Wrapper
        </button>

        <button
          onClick={() => setActiveKTSection('webhook')}
          className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold transition-all ${
            activeKTSection === 'webhook'
              ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/30'
              : 'border border-white/10 bg-black/30 text-slate-300 hover:bg-white/5 hover:text-white'
          }`}
        >
          <ShieldCheck size={16} /> 3. Raw Webhook Signature
        </button>

        <button
          onClick={() => setActiveKTSection('telemetry')}
          className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold transition-all ${
            activeKTSection === 'telemetry'
              ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/30'
              : 'border border-white/10 bg-black/30 text-slate-300 hover:bg-white/5 hover:text-white'
          }`}
        >
          <Activity size={16} /> 4. Technical Telemetry
        </button>

        <button
          onClick={() => setActiveKTSection('architecture')}
          className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold transition-all ${
            activeKTSection === 'architecture'
              ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/30'
              : 'border border-white/10 bg-black/30 text-slate-300 hover:bg-white/5 hover:text-white'
          }`}
        >
          <Terminal size={16} /> Key Invariants
        </button>
      </div>

      {/* Section Content Card */}
      <div className="glass-panel p-7">
        {activeKTSection === 'backend' && (
          <div>
            <h3 className="mb-2 text-lg font-semibold text-white">
              Step 1: Unified Payment Session API (`POST /v1/payments/session`)
            </h3>
            <p className="mb-4 text-sm text-slate-400">
              Instead of calling Razorpay directly from your merchant backend, route payment creation through LeakGuard.
              LeakGuard generates a unique <code>paymentAttemptId</code> (`pa_...`), creates the Razorpay Order server-side, and returns safe public credentials.
            </p>

            <div className="relative mb-4 rounded-xl border border-white/10 bg-slate-950 p-4 font-mono text-xs text-slate-200 overflow-x-auto">
              <button
                onClick={() => copyToClipboard(backendCodeSnippet, 'backend')}
                className="absolute top-3 right-3 flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-slate-400 hover:bg-white/10 hover:text-white transition-all"
              >
                {copiedId === 'backend' ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                {copiedId === 'backend' ? ' Copied!' : ' Copy'}
              </button>
              <pre className="m-0 leading-relaxed">{backendCodeSnippet}</pre>
            </div>

            <div className="rounded-xl border border-blue-500/20 bg-blue-500/10 p-3.5 text-xs text-blue-300">
              <strong>Operational Note:</strong> The merchant server never receives or handles raw Razorpay secrets in response. Security credentials remain 100% server-side encrypted.
            </div>
          </div>
        )}

        {activeKTSection === 'frontend' && (
          <div>
            <h3 className="mb-2 text-lg font-semibold text-white">
              Step 2: Browser SDK Integration (`RevenueRecoverySDK`)
            </h3>
            <p className="mb-4 text-sm text-slate-400">
              Add the lightweight <code>RevenueRecoverySDK</code> script to your frontend web page. Wrap standard Razorpay options using <code>sdk.wrapCheckout(options, paymentAttemptId)</code>.
            </p>

            <div className="relative mb-4 rounded-xl border border-white/10 bg-slate-950 p-4 font-mono text-xs text-slate-200 overflow-x-auto">
              <button
                onClick={() => copyToClipboard(frontendCodeSnippet, 'frontend')}
                className="absolute top-3 right-3 flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-slate-400 hover:bg-white/10 hover:text-white transition-all"
              >
                {copiedId === 'frontend' ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                {copiedId === 'frontend' ? ' Copied!' : ' Copy'}
              </button>
              <pre className="m-0 leading-relaxed">{frontendCodeSnippet}</pre>
            </div>

            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3.5 text-xs text-emerald-300">
              <strong>Fail-Open SLA Guarantee:</strong> Network calls made by the SDK time out after 1.5 seconds and errors are silently caught. The SDK will never block or interfere with the customer's checkout modal.
            </div>
          </div>
        )}

        {activeKTSection === 'webhook' && (
          <div>
            <h3 className="mb-2 text-lg font-semibold text-white">
              Step 3: Razorpay Webhook Raw Body HMAC Verification
            </h3>
            <p className="mb-4 text-sm text-slate-400">
              Razorpay webhooks must be verified using raw request body bytes (`req.rawBody` or `express.raw()`). Never stringify parsed JSON objects for HMAC verification.
            </p>

            <div className="relative mb-4 rounded-xl border border-white/10 bg-slate-950 p-4 font-mono text-xs text-slate-200 overflow-x-auto">
              <button
                onClick={() => copyToClipboard(webhookCodeSnippet, 'webhook')}
                className="absolute top-3 right-3 flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-slate-400 hover:bg-white/10 hover:text-white transition-all"
              >
                {copiedId === 'webhook' ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                {copiedId === 'webhook' ? ' Copied!' : ' Copy'}
              </button>
              <pre className="m-0 leading-relaxed">{webhookCodeSnippet}</pre>
            </div>

            <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3.5 text-xs text-red-300">
              <strong>Rejection Policy:</strong> Any webhook request with a missing or invalid HMAC signature must return <code>401 Unauthorized</code> and never return a success 200 response.
            </div>
          </div>
        )}

        {activeKTSection === 'telemetry' && (
          <div>
            <h3 className="mb-2 text-lg font-semibold text-white">
              Step 4: Merchant Backend Technical Telemetry Ingestion
            </h3>
            <p className="mb-4 text-sm text-slate-400">
              Log server-side technical failures (e.g., merchant database timeouts, internal 500 errors during checkout generation) to feed the Cause Qualification Engine.
            </p>

            <div className="relative mb-4 rounded-xl border border-white/10 bg-slate-950 p-4 font-mono text-xs text-slate-200 overflow-x-auto">
              <button
                onClick={() => copyToClipboard(telemetryCodeSnippet, 'telemetry')}
                className="absolute top-3 right-3 flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-slate-400 hover:bg-white/10 hover:text-white transition-all"
              >
                {copiedId === 'telemetry' ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                {copiedId === 'telemetry' ? ' Copied!' : ' Copy'}
              </button>
              <pre className="m-0 leading-relaxed">{telemetryCodeSnippet}</pre>
            </div>
          </div>
        )}

        {activeKTSection === 'architecture' && (
          <div>
            <h3 className="mb-3 text-lg font-semibold text-white">
              Operational Invariants & Architectural Principles
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-xl border border-white/10 bg-black/40 p-4">
                <h4 className="mb-1 text-sm font-semibold text-blue-400">1. Zero Secret Exposure</h4>
                <p className="text-xs text-slate-400">
                  Merchant Razorpay secret keys remain 100% server-side. Encrypted with AES-256-GCM at rest.
                </p>
              </div>

              <div className="rounded-xl border border-white/10 bg-black/40 p-4">
                <h4 className="mb-1 text-sm font-semibold text-emerald-400">2. Fail-Open Architecture</h4>
                <p className="text-xs text-slate-400">
                  Browser SDK network requests are non-blocking, bounded by 1.5s timeouts, and silently caught.
                </p>
              </div>

              <div className="rounded-xl border border-white/10 bg-black/40 p-4">
                <h4 className="mb-1 text-sm font-semibold text-purple-400">3. Dual-State Model</h4>
                <p className="text-xs text-slate-400">
                  Tracks Provider Lifecycle (`CREATED` → `CAPTURED`) vs Business Resolution (`UNRESOLVED` / `RESOLVED`).
                </p>
              </div>

              <div className="rounded-xl border border-white/10 bg-black/40 p-4">
                <h4 className="mb-1 text-sm font-semibold text-amber-400">4. Revenue Resolution Stop</h4>
                <p className="text-xs text-slate-400">
                  If a customer retries and payment succeeds on Attempt 2, all previous failed attempts update to `RESOLVED` (halting recovery).
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {onDone && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onDone}
            className="rounded-full bg-sky-500 px-8 py-2.5 text-sm font-semibold text-white shadow-lg shadow-sky-500/30 transition-transform hover:scale-[1.02] hover:bg-sky-400"
          >
            Done
          </button>
        </div>
      )}
    </div>
  );
};
