import React from 'react';

interface LandingHeaderProps {
  onIntegrate: () => void;
}

export const LandingHeader: React.FC<LandingHeaderProps> = ({ onIntegrate }) => {
  return (
    <header className="absolute inset-x-0 top-0 z-30 px-6 py-5 lg:px-10">
      <div className="mx-auto flex max-w-7xl items-center justify-between">
        <button
          type="button"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="text-lg font-semibold tracking-tight text-white"
        >
          LeakGuard
        </button>

        <nav className="hidden items-center gap-8 text-sm font-medium text-white/90 md:flex">
          <a href="#merchant-setup" className="transition-colors hover:text-white">
            Platform
          </a>
          <a href="#merchant-setup" className="transition-colors hover:text-white">
            Features
          </a>
          <a href="#merchant-setup" className="transition-colors hover:text-white">
            Pricing
          </a>
          <a href="#merchant-setup" className="transition-colors hover:text-white">
            Docs
          </a>
        </nav>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onIntegrate}
            className="hidden rounded-full border border-white/70 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-white/10 sm:inline-flex"
          >
            Sign in
          </button>
          <button
            type="button"
            onClick={onIntegrate}
            className="rounded-full bg-[#4ea3ff] px-4 py-1.5 text-sm font-semibold text-white shadow-lg shadow-sky-500/30 transition-transform hover:scale-[1.02] hover:bg-[#3d96f7]"
          >
            Request Demo
          </button>
        </div>
      </div>
    </header>
  );
};
