import React, { useState } from 'react';

export const BetaAlertModal: React.FC = () => {
  const [isOpen, setIsOpen] = useState(true);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-md bg-surface-light dark:bg-surface-dark border border-primary/30 rounded-3xl p-6 md:p-8 shadow-2xl space-y-6 text-text-main dark:text-white">
        <div className="flex items-center gap-3">
          <div className="size-12 rounded-2xl bg-primary/20 text-primary flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-2xl">science</span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full bg-primary text-black text-[9px] font-black uppercase tracking-widest">
                Open Beta
              </span>
              <span className="text-[10px] text-text-muted font-bold">v3.2</span>
            </div>
            <h3 className="text-xl font-black uppercase tracking-tight mt-1">Culinary Creator Studio</h3>
          </div>
        </div>

        <div className="space-y-3 text-sm text-text-muted leading-relaxed font-medium">
          <p>
            Welcome to the <strong className="text-primary font-bold">Open Beta Phase</strong>! The platform is actively being polished, updated, and refined.
          </p>
          <p>
            You can test all R&D features, create recipes, generate molecular flavor pairings, run food cost sheets, and explore subscription tiers or redeem beta invitation codes.
          </p>
        </div>

        <div className="pt-2">
          <button
            onClick={() => setIsOpen(false)}
            className="w-full py-3.5 bg-primary text-black font-black text-xs uppercase tracking-widest rounded-xl shadow-lg shadow-primary/25 hover:bg-primary-hover hover:scale-[1.01] active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]">check</span>
            Entendido / Got it
          </button>
        </div>
      </div>
    </div>
  );
};
