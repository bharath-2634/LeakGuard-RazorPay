import { useState } from 'react';
import { Header } from './components/Header';
import { MerchantConnectCard } from './components/MerchantConnectCard';
import { DeveloperKTDocs } from './components/DeveloperKTDocs';
import { InteractiveSandbox } from './components/InteractiveSandbox';

export function App() {
  const [activeTab, setActiveTab] = useState<'connect' | 'kt-docs' | 'sandbox'>('connect');
  const [isConnected, setIsConnected] = useState(false);

  const [merchantConfig, setMerchantConfig] = useState({
    merchantId: 'm_shopexpress_9f82a',
    merchantName: 'ShopExpress E-Commerce',
    storeDomain: 'shopexpress.com',
    razorpayKeyId: 'rzp_test_key_112233',
    razorpayKeySecret: 'rzp_test_secret_998877',
    marginRate: 0.20,
    categoryTags: [
      { name: 'electrical', marginal_rate: '20%', numeric_rate: 0.20 },
      { name: 'home_appliances', marginal_rate: '15%', numeric_rate: 0.15 },
    ],
  });

  const platformUrl = 'http://localhost:3000';

  return (
    <div className="min-h-screen pb-16">
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        isConnected={isConnected}
      />

      <main className="px-6">
        {activeTab === 'connect' && (
          <MerchantConnectCard
            merchantConfig={merchantConfig}
            setMerchantConfig={setMerchantConfig}
            isConnected={isConnected}
            setIsConnected={setIsConnected}
            platformUrl={platformUrl}
          />
        )}

        {activeTab === 'kt-docs' && (
          <DeveloperKTDocs
            platformUrl={platformUrl}
            merchantId={merchantConfig.merchantId}
          />
        )}

        {activeTab === 'sandbox' && (
          <InteractiveSandbox
            platformUrl={platformUrl}
            merchantId={merchantConfig.merchantId}
          />
        )}
      </main>
    </div>
  );
}

export default App;
