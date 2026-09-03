import React, { useState, useEffect } from 'react';
import { Key, Lock, CheckCircle2, AlertTriangle, RefreshCw, ShieldAlert, Plus, X, Copy, Tag, Sparkles } from 'lucide-react';

interface CategoryMarginTag {
  name: string;
  marginal_rate: string; // e.g. "20%"
  numeric_rate: number;  // e.g. 0.20
}

interface MerchantConnectCardProps {
  merchantConfig: {
    merchantId: string;
    merchantName: string;
    storeDomain: string;
    razorpayKeyId: string;
    razorpayKeySecret: string;
    marginRate: number;
    categoryTags: CategoryMarginTag[];
  };
  setMerchantConfig: React.Dispatch<React.SetStateAction<any>>;
  isConnected: boolean;
  setIsConnected: (connected: boolean) => void;
  platformUrl: string;
}

const CATEGORY_OPTIONS = [
  { label: 'electrical', name: 'electrical' },
  { label: 'home appliances', name: 'home_appliances' },
  { label: 'food and bevarages', name: 'food_bevarages' },
  { label: 'fashion', name: 'fashion' },
  { label: 'beauty', name: 'beauty' },
  { label: 'books', name: 'books' },
  { label: 'sports', name: 'sports' },
  { label: 'other', name: 'other' },
];

export const MerchantConnectCard: React.FC<MerchantConnectCardProps> = ({
  merchantConfig,
  setMerchantConfig,
  isConnected,
  setIsConnected,
  platformUrl,
}) => {
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState(false);

  // New Category Tag Input States
  const [selectedCategory, setSelectedCategory] = useState('electrical');
  const [inputRate, setInputRate] = useState<number>(20);

  // Auto-generate Merchant ID on initial mount or when requested
  const generateMerchantId = (name: string) => {
    const slug = name.toLowerCase().replace(/[^a-z0-9]/g, '_').substring(0, 15) || 'merchant';
    const rand = Math.random().toString(36).substring(2, 7);
    return `m_${slug}_${rand}`;
  };

  useEffect(() => {
    if (!merchantConfig.merchantId) {
      const autoId = generateMerchantId(merchantConfig.merchantName || 'shopexpress');
      setMerchantConfig((prev: any) => ({ ...prev, merchantId: autoId }));
    }
  }, []);

  const handleRegenerateId = () => {
    const newId = generateMerchantId(merchantConfig.merchantName);
    setMerchantConfig((prev: any) => ({ ...prev, merchantId: newId }));
  };

  const handleCopyId = () => {
    navigator.clipboard.writeText(merchantConfig.merchantId);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setMerchantConfig((prev: any) => ({
      ...prev,
      [name]: value,
    }));
  };

  // Add Category Margin Tag
  const handleAddCategoryTag = () => {
    if (inputRate < 0 || inputRate > 100) return;
    const ratePercentage = `${inputRate}%`;
    const numericRate = inputRate / 100;

    const existingIndex = merchantConfig.categoryTags.findIndex((t) => t.name === selectedCategory);
    let updatedTags = [...merchantConfig.categoryTags];

    if (existingIndex >= 0) {
      updatedTags[existingIndex] = {
        name: selectedCategory,
        marginal_rate: ratePercentage,
        numeric_rate: numericRate,
      };
    } else {
      updatedTags.push({
        name: selectedCategory,
        marginal_rate: ratePercentage,
        numeric_rate: numericRate,
      });
    }

    setMerchantConfig((prev: any) => ({
      ...prev,
      categoryTags: updatedTags,
      marginRate: numericRate, // Sync primary rate
    }));
  };

  // Remove Category Tag
  const handleRemoveCategoryTag = (tagName: string) => {
    const updatedTags = merchantConfig.categoryTags.filter((t) => t.name !== tagName);
    setMerchantConfig((prev: any) => ({
      ...prev,
      categoryTags: updatedTags,
    }));
  };

  // State for Recovery Actions & Human Review Email
  const [allowedChannels, setAllowedChannels] = useState<string[]>(['whatsapp', 'email', 'sms', 'in-app notification']);
  const [humanReviewEmail, setHumanReviewEmail] = useState<string>('recovery@merchant.com');

  const handleChannelToggle = (channel: string) => {
    setAllowedChannels((prev) =>
      prev.includes(channel) ? prev.filter((c) => c !== channel) : [...prev, channel]
    );
  };

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    // Format category economics array with numeric marginRate
    const categoryEconomicsArray = merchantConfig.categoryTags.map((tag) => ({
      category: tag.name,
      marginRate: tag.numeric_rate,
    }));

    try {
      const response = await fetch(`${platformUrl}/v1/merchants`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: merchantConfig.merchantId,
          name: merchantConfig.merchantName,
          domain: merchantConfig.storeDomain,
          environment: 'test',
          defaultCurrency: 'INR',
          timezone: 'Asia/Kolkata',
          razorpayKeyId: merchantConfig.razorpayKeyId,
          razorpayKeySecret: merchantConfig.razorpayKeySecret,
          defaultMarginRate: merchantConfig.marginRate || 0.20,
          categoryEconomics: categoryEconomicsArray,
          recoveryConfig: {
            allowedChannels: allowedChannels,
            humanReview: {
              enabled: !!humanReviewEmail,
              email: humanReviewEmail,
            },
          },
        }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setIsConnected(true);
        setSuccessMsg(`Merchant store '${data.merchant.name}' connected successfully! Saved to Neon PostgreSQL with AES-256-GCM encryption.`);
      } else {
        setErrorMsg(data.error || 'Failed to connect merchant');
      }
    } catch (err: any) {
      setErrorMsg(`Could not connect to Platform API at ${platformUrl}: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const formattedOutputJson = merchantConfig.categoryTags.map((t) => ({
    category: t.name,
    marginRate: t.numeric_rate,
  }));

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      {/* Overview Banner */}
      <div className="glass-panel border-l-4 border-l-blue-500 p-6">
        <div className="flex items-start gap-4">
          <div className="rounded-xl bg-blue-500/15 p-3 text-blue-400">
            <Key size={24} />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">
              Connect E-Commerce Platform & Configure Economics
            </h2>
            <p className="mt-1 text-sm text-slate-400 leading-relaxed">
              Onboard your e-commerce store credentials and category-wise marginal profit rates.
              The Merchant ID is <strong>auto-generated by LeakGuard Platform</strong> and Razorpay Key Secret is encrypted with <strong>AES-256-GCM</strong>.
            </p>
          </div>
        </div>
      </div>

      {/* Main Connection Form */}
      <div className="glass-panel p-8">
        <form onSubmit={handleConnect} className="flex flex-col gap-6">
          {/* Auto-Generated Merchant ID Display Box */}
          <div className="rounded-xl border border-blue-500/20 bg-blue-950/20 p-5 backdrop-blur-md">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-blue-400 flex items-center gap-1.5">
                  <Sparkles size={14} /> Auto-Generated Merchant ID
                </label>
                <div className="mt-1 flex items-center gap-3">
                  <span className="font-mono text-lg font-bold text-white tracking-wide">
                    {merchantConfig.merchantId}
                  </span>
                  <span className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-400">
                    System Assigned
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopyId}
                  className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-300 transition-all hover:bg-white/10 hover:text-white"
                >
                  <Copy size={14} /> {copiedId ? 'Copied!' : 'Copy ID'}
                </button>
                <button
                  type="button"
                  onClick={handleRegenerateId}
                  className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-300 transition-all hover:bg-white/10 hover:text-white"
                >
                  <RefreshCw size={14} /> Regenerate
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Store Name */}
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-300">
                Store / Merchant Name
              </label>
              <input
                type="text"
                name="merchantName"
                className="w-full rounded-lg border border-white/10 bg-black/40 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                value={merchantConfig.merchantName}
                onChange={handleTextChange}
                required
              />
            </div>

            {/* E-Commerce Domain */}
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-300">
                E-Commerce Domain
              </label>
              <input
                type="text"
                name="storeDomain"
                className="w-full rounded-lg border border-white/10 bg-black/40 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                value={merchantConfig.storeDomain}
                onChange={handleTextChange}
                required
              />
            </div>

            {/* Razorpay Key ID */}
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-300">
                Razorpay Key ID (Public)
              </label>
              <input
                type="text"
                name="razorpayKeyId"
                className="w-full rounded-lg border border-white/10 bg-black/40 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                value={merchantConfig.razorpayKeyId}
                onChange={handleTextChange}
                required
              />
            </div>

            {/* Razorpay Key Secret */}
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-300">
                Razorpay Key Secret (Encrypted Server-Side)
              </label>
              <input
                type="password"
                name="razorpayKeySecret"
                className="w-full rounded-lg border border-white/10 bg-black/40 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                value={merchantConfig.razorpayKeySecret}
                onChange={handleTextChange}
                required
              />
            </div>
          </div>

          {/* DYNAMIC CATEGORY MARGINAL RATE TAG SELECTOR */}
          <div className="rounded-xl border border-white/10 bg-black/30 p-5">
            <h3 className="mb-2 text-sm font-semibold text-white flex items-center gap-2">
              <Tag size={16} className="text-indigo-400" /> Category Gross Margin Rates Tag Selector
            </h3>
            <p className="mb-4 text-xs text-slate-400">
              Select an e-commerce product category and specify its marginal rate percentage. Add as many category tags as needed.
            </p>

            <div className="flex flex-wrap items-center gap-3 mb-4">
              <select
                className="rounded-lg border border-white/10 bg-slate-900 px-3.5 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
              >
                {CATEGORY_OPTIONS.map((cat) => (
                  <option key={cat.name} value={cat.name}>
                    {cat.label}
                  </option>
                ))}
              </select>

              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  min="0"
                  max="100"
                  className="w-24 rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
                  value={inputRate}
                  onChange={(e) => setInputRate(Number(e.target.value))}
                />
                <span className="text-sm font-medium text-slate-400">%</span>
              </div>

              <button
                type="button"
                onClick={handleAddCategoryTag}
                className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-all hover:bg-indigo-500 shadow-md shadow-indigo-500/20"
              >
                <Plus size={16} /> Add Category Tag
              </button>
            </div>

            {/* Display Added Tags Badges */}
            <div className="flex flex-wrap gap-2 mb-4 min-h-[40px] items-center p-3 rounded-lg border border-white/5 bg-slate-950/40">
              {merchantConfig.categoryTags.length === 0 ? (
                <span className="text-xs text-slate-500 italic">No category tags added yet. Select a category above.</span>
              ) : (
                merchantConfig.categoryTags.map((tag) => (
                  <span
                    key={tag.name}
                    className="flex items-center gap-2 rounded-lg border border-indigo-500/30 bg-indigo-500/15 px-3 py-1.5 text-xs font-semibold text-indigo-300"
                  >
                    <span>{tag.name}</span>
                    <span className="rounded bg-indigo-900/60 px-1.5 py-0.5 text-white font-mono">{tag.marginal_rate}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveCategoryTag(tag.name)}
                      className="text-slate-400 hover:text-red-400 transition-colors ml-1"
                    >
                      <X size={14} />
                    </button>
                  </span>
                ))
              )}
            </div>

            {/* Formatted Tag JSON Output Preview */}
            {merchantConfig.categoryTags.length > 0 && (
              <div>
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                  Generated Marginal Rate Tag JSON Payload
                </label>
                <pre className="rounded-lg bg-black/60 p-3 font-mono text-xs text-emerald-400 border border-white/10 overflow-x-auto">
                  {JSON.stringify(formattedOutputJson, null, 2)}
                </pre>
              </div>
            )}
          </div>

          {/* RECOVERY ACTION CHANNELS CHECKLIST */}
          <div className="rounded-xl border border-white/10 bg-black/30 p-5">
            <h3 className="mb-2 text-sm font-semibold text-white flex items-center gap-2">
              <CheckCircle2 size={16} className="text-blue-400" /> Which all ways your customers can get the intervention actions?
            </h3>
            <p className="mb-3 text-xs text-slate-400">
              Select all authorized recovery communication channels enabled for your store.
            </p>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
              {['whatsapp', 'sms', 'email', 'in-app notification'].map((channel) => {
                const isSelected = allowedChannels.includes(channel);
                return (
                  <label
                    key={channel}
                    onClick={() => handleChannelToggle(channel)}
                    className={`flex items-center gap-2.5 rounded-lg border p-3 cursor-pointer transition-all select-none ${
                      isSelected
                        ? 'border-blue-500/50 bg-blue-500/10 text-white font-medium'
                        : 'border-white/10 bg-black/20 text-slate-400 hover:bg-white/5'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => {}}
                      className="h-4 w-4 rounded border-white/20 bg-slate-900 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="capitalize text-xs tracking-wide">{channel}</span>
                  </label>
                );
              })}
            </div>

            {/* HUMAN INTERVENTION REVIEW EMAIL */}
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-300">
                Email of your business team to check the human intervention list if needed?
              </label>
              <input
                type="email"
                className="w-full rounded-lg border border-white/10 bg-black/40 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                placeholder="recovery-team@yourbusiness.com"
                value={humanReviewEmail}
                onChange={(e) => setHumanReviewEmail(e.target.value)}
              />
            </div>
          </div>

          {/* Security Guarantee Box */}
          <div className="flex items-center gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-emerald-400">
            <Lock size={20} className="shrink-0" />
            <p className="text-xs leading-relaxed">
              <strong>Zero Secret Leakage Protection:</strong> The Razorpay Key Secret is encrypted server-side with AES-256-GCM. The Browser SDK receives only public session IDs (`pa_...`) and Key IDs.
            </p>
          </div>

          {/* Feedback Messages */}
          {errorMsg && (
            <div className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-3.5 text-sm text-red-400">
              <AlertTriangle size={18} /> {errorMsg}
            </div>
          )}

          {successMsg && (
            <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 text-sm text-emerald-400">
              <CheckCircle2 size={18} /> {successMsg}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-500/25 transition-all hover:scale-[1.02] hover:shadow-blue-500/40 disabled:opacity-50"
            >
              {loading ? <RefreshCw size={18} className="animate-spin" /> : <CheckCircle2 size={18} />}
              {isConnected ? 'Update Merchant Store' : 'Connect Store & Save SDK Keys'}
            </button>
          </div>
        </form>
      </div>

      {/* Webhook Setup Info */}
      <div className="glass-panel p-6">
        <h3 className="mb-2 flex items-center gap-2 text-base font-semibold text-amber-400">
          <ShieldAlert size={18} /> Razorpay Webhook Configuration URL
        </h3>
        <p className="mb-3 text-xs text-slate-400">
          Paste this Webhook URL into your <strong>Razorpay Dashboard &gt; Settings &gt; Webhooks</strong>:
        </p>

        <div className="rounded-lg border border-white/10 bg-black/60 p-3 font-mono text-xs text-slate-200">
          <code>{`${platformUrl}/v1/webhooks/razorpay?merchant_id=${merchantConfig.merchantId}`}</code>
        </div>
      </div>
    </div>
  );
};
