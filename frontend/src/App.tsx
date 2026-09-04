import { useState } from 'react';
import { Header, type TabType } from './components/Header';
import { LiveRecoveryDashboard } from './components/LiveRecoveryDashboard';
import { AuditLogsScreen } from './components/AuditLogsScreen';
import { MerchantConnectCard } from './components/MerchantConnectCard';
import { DeveloperKTDocs } from './components/DeveloperKTDocs';
import { InteractiveSandbox } from './components/InteractiveSandbox';

export function App() {
  const [activeTab, setActiveTab] = useState<TabType>('dashboard');
  const [isConnected, setIsConnected] = useState(true);
  const [selectedAuditRiskEventId, setSelectedAuditRiskEventId] = useState<string | undefined>(undefined);

  const [merchantConfig, setMerchantConfig] = useState({
    merchantId: 'm_shopexpress_9f82a',
    merchantName: 'ShopExpress E-Commerce',
    storeDomain: 'shopexpress.com',
    razorpayKeyId: 'rzp_test_TWEQTS4vaQiKvB',
    razorpayKeySecret: 'JwG1G4hB3xIpuPuwa1bJG9mL',
    marginRate: 0.20,
    categoryTags: [
      { name: 'electrical', marginal_rate: '20%', numeric_rate: 0.20 },
      { name: 'home_appliances', marginal_rate: '15%', numeric_rate: 0.15 },
    ],
  });

  const platformUrl = import.meta.env.VITE_PLATFORM_URL || 'https://leakguard-razorpay-production.up.railway.app';

  const handleSelectAuditRiskEvent = (riskEventId: string) => {
    setSelectedAuditRiskEventId(riskEventId);
    setActiveTab('audit');
  };

  return (
    <div className="min-h-screen pb-16">
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        isConnected={isConnected}
      />

      <main className="px-6">
        {activeTab === 'dashboard' && (
          <LiveRecoveryDashboard
            platformUrl={platformUrl}
            merchantId={merchantConfig.merchantId}
            onSelectAuditRiskEvent={handleSelectAuditRiskEvent}
          />
        )}

        {activeTab === 'audit' && (
          <AuditLogsScreen
            platformUrl={platformUrl}
            merchantId={merchantConfig.merchantId}
            initialRiskEventId={selectedAuditRiskEventId}
          />
        )}

        {activeTab === 'connect' && (
          <MerchantConnectCard
            merchantConfig={merchantConfig}
            setMerchantConfig={setMerchantConfig}
            isConnected={isConnected}
            setIsConnected={setIsConnected}
            platformUrl={platformUrl}
          />
        )}

        {activeTab === 'sandbox' && (
          <InteractiveSandbox
            platformUrl={platformUrl}
            merchantId={merchantConfig.merchantId}
          />
        )}

        {activeTab === 'kt-docs' && (
          <DeveloperKTDocs
            platformUrl={platformUrl}
            merchantId={merchantConfig.merchantId}
          />
        )}
      </main>
    </div>
  );
}

export default App;
