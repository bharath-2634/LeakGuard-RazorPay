import { useState } from 'react';
import { LandingHeader } from './components/LandingHeader';
import { HeroDiagram } from './components/HeroDiagram';
import { MerchantConnectCard, type ConnectResult } from './components/MerchantConnectCard';
import { ConnectionStatusScreen } from './components/ConnectionStatusScreen';
import { DeveloperKTDocs } from './components/DeveloperKTDocs';
import { DashboardSidebar, type DashboardView } from './components/DashboardSidebar';
import { LiveRecoveryDashboard } from './components/LiveRecoveryDashboard';
import { AuditLogsScreen } from './components/AuditLogsScreen';

type AppPhase = 'home' | 'connecting' | 'result' | 'kt' | 'dashboard';

const emptyMerchant = {
  merchantId: '',
  merchantName: '',
  storeDomain: '',
  razorpayKeyId: '',
  razorpayKeySecret: '',
  marginRate: 0.20,
  categoryTags: [] as { name: string; marginal_rate: string; numeric_rate: number }[],
};

export function App() {
  const [phase, setPhase] = useState<AppPhase>('home');
  const [connectStatus, setConnectStatus] = useState<'loading' | 'success' | 'failure'>('loading');
  const [connectMessage, setConnectMessage] = useState('');
  const [dashboardView, setDashboardView] = useState<DashboardView>('dashboard');
  const [isConnected, setIsConnected] = useState(false);
  const [selectedAuditRiskEventId, setSelectedAuditRiskEventId] = useState<string | undefined>(undefined);
  const [merchantConfig, setMerchantConfig] = useState(emptyMerchant);

  const platformUrl = import.meta.env.VITE_PLATFORM_URL || 'https://leakguard-razorpay-production.up.railway.app';

  const scrollToMerchantSetup = () => {
    document.getElementById('merchant-setup')?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleConnectStart = () => {
    setConnectStatus('loading');
    setConnectMessage('');
    setPhase('connecting');
  };

  const handleConnectResult = (result: ConnectResult) => {
    setConnectStatus(result.success ? 'success' : 'failure');
    setConnectMessage(result.message);
    setPhase('result');
  };

  const handleSelectAuditRiskEvent = (riskEventId: string) => {
    setSelectedAuditRiskEventId(riskEventId);
    setDashboardView('audit');
  };

  const showHome = phase === 'home' || phase === 'connecting' || phase === 'result';

  return (
    <>
      {(phase === 'connecting' || phase === 'result') && (
        <div className="fixed inset-0 z-50">
          <ConnectionStatusScreen
            status={phase === 'connecting' ? 'loading' : connectStatus}
            message={connectMessage}
            onContinue={() => setPhase('kt')}
            onRetry={() => {
              setPhase('home');
              requestAnimationFrame(() => scrollToMerchantSetup());
            }}
          />
        </div>
      )}

      {phase === 'kt' && (
        <div className="min-h-screen bg-[#071427] px-6 py-10">
          <div className="mx-auto mb-8 max-w-5xl">
            <p className="text-sm font-semibold text-sky-300">LeakGuard</p>
            <h1 className="mt-1 text-2xl font-bold text-white">Knowledge Transfer Guide</h1>
            <p className="mt-1 text-sm text-slate-400">
              Review the integration steps, then click Done to open your merchant dashboard.
            </p>
          </div>
          <DeveloperKTDocs
            platformUrl={platformUrl}
            merchantId={merchantConfig.merchantId}
            onDone={() => {
              setDashboardView('dashboard');
              setPhase('dashboard');
            }}
          />
        </div>
      )}

      {phase === 'dashboard' && (
        <div className="flex min-h-screen">
          <DashboardSidebar
            activeView={dashboardView}
            setActiveView={setDashboardView}
            isConnected={isConnected}
            merchantName={merchantConfig.merchantName}
          />
          <main className="min-h-screen flex-1 overflow-y-auto px-6 py-8">
            {dashboardView === 'dashboard' && (
              <LiveRecoveryDashboard
                platformUrl={platformUrl}
                merchantId={merchantConfig.merchantId}
                onSelectAuditRiskEvent={handleSelectAuditRiskEvent}
              />
            )}
            {dashboardView === 'profile' && (
              <MerchantConnectCard
                merchantConfig={merchantConfig}
                setMerchantConfig={setMerchantConfig}
                isConnected={isConnected}
                setIsConnected={setIsConnected}
                platformUrl={platformUrl}
                submitLabel="Update Merchant Store"
              />
            )}
            {dashboardView === 'audit' && (
              <AuditLogsScreen
                platformUrl={platformUrl}
                merchantId={merchantConfig.merchantId}
                initialRiskEventId={selectedAuditRiskEventId}
              />
            )}
          </main>
        </div>
      )}

      {showHome && (
        <div className="landing-shell">
          <section className="relative min-h-screen overflow-hidden">
            <LandingHeader onIntegrate={scrollToMerchantSetup} />

            <div className="relative mx-auto grid min-h-screen max-w-7xl items-center gap-12 px-6 pb-16 pt-28 lg:grid-cols-2 lg:px-10">
              <div>
                <div className="mb-6 inline-flex rounded-full border border-white/15 bg-white/10 px-4 py-1.5 text-xs font-medium text-white/90 backdrop-blur-sm">
                  SDK Release: Smart Churn Recovery now available
                </div>
                <h1 className="max-w-xl text-4xl font-bold leading-tight tracking-tight text-white sm:text-5xl">
                  Maximize recovered revenue with one SDK
                </h1>
                <p className="mt-5 max-w-lg text-base leading-relaxed text-white/80 sm:text-lg">
                  Stop transaction failures and recover &apos;lost&apos; payments using advanced AI with seamless RazorPay integration.
                </p>
                <button
                  type="button"
                  onClick={scrollToMerchantSetup}
                  className="mt-8 rounded-full bg-[#1d4ed8] px-7 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-900/40 transition-transform hover:scale-[1.02] hover:bg-[#1e40af]"
                >
                  Integrate SDK
                </button>
                <p className="mt-10 text-xs font-medium tracking-wide text-white/70">
                  The fastest growing businesses use LeakGuard
                </p>
                <div className="mt-4 flex flex-wrap items-center gap-6 text-sm font-semibold tracking-wide text-white/55">
                  <span>Spotify</span>
                  <span>NETFLIX</span>
                  <span>shopify</span>
                  <span>Adobe</span>
                </div>
              </div>

              <HeroDiagram />
            </div>

            <div className="absolute bottom-6 left-1/2 z-20 -translate-x-1/2">
              <a
                href="#merchant-setup"
                className="flex flex-col items-center gap-1 text-[11px] font-medium uppercase tracking-widest text-white/60 hover:text-white"
              >
                Scroll to merchant setup
                <span className="animate-bounce text-lg">↓</span>
              </a>
            </div>
          </section>

          <section id="merchant-setup" className="scroll-mt-8 px-6 py-16">
            <div className="mx-auto mb-8 max-w-4xl text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-300">Merchant setup</p>
              <h2 className="mt-2 text-3xl font-bold text-white">Connect your store</h2>
              <p className="mt-2 text-sm text-slate-400">
                Fill in your merchant details, then click Update Merchant Store to register with LeakGuard.
              </p>
            </div>
            <MerchantConnectCard
              merchantConfig={merchantConfig}
              setMerchantConfig={setMerchantConfig}
              isConnected={isConnected}
              setIsConnected={setIsConnected}
              platformUrl={platformUrl}
              onConnectStart={handleConnectStart}
              onConnectResult={handleConnectResult}
              submitLabel="Update Merchant Store"
            />
          </section>
        </div>
      )}
    </>
  );
}

export default App;
