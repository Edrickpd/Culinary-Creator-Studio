import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '../AppContext';
import { PlanTier } from '../types';
import { PLAN_CONFIGS } from '../services/planLimits';
import { supabase } from '../supabaseClient';

interface PlanUpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description: string;
  requiredTier?: PlanTier;
}

export const PlanUpgradeModal: React.FC<PlanUpgradeModalProps> = ({
  isOpen,
  onClose,
  title,
  description,
  requiredTier = PlanTier.PRIME
}) => {
  const { t, user, refreshProfile, isLoggedIn } = useAppContext();
  const navigate = useNavigate();
  const [promoCode, setPromoCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleRedeemPromo = async () => {
    if (!promoCode.trim()) return;
    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      if (!isLoggedIn || !user) {
        setErrorMsg("Please log in to redeem a promotional code.");
        setLoading(false);
        return;
      }

      // Try calling the Supabase RPC function for redeeming promo code
      const codeClean = promoCode.trim().toUpperCase();
      const { data: promo, error: promoError } = await supabase
        .from('promo_codes')
        .select('*')
        .eq('code', codeClean)
        .single();

      if (promoError || !promo) {
        setErrorMsg("Invalid promotional code.");
        setLoading(false);
        return;
      }

      if (!promo.is_active) {
        setErrorMsg("This promotional code is inactive.");
        setLoading(false);
        return;
      }

      if (promo.max_uses > 0 && promo.current_uses >= promo.max_uses) {
        setErrorMsg("This promotional code has reached its maximum redemptions.");
        setLoading(false);
        return;
      }

      // Calculate expiration
      const durationMonths = promo.duration_months || 3;
      const renewalDate = new Date();
      renewalDate.setMonth(renewalDate.getMonth() + durationMonths);

      // Update user profile in Supabase
      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          tier: promo.tier || 'platinum_prime',
          subscription_status: 'active',
          subscription_renewal: renewalDate.toISOString()
        })
        .eq('id', user.id);

      if (updateError) throw updateError;

      // Increment promo usage
      await supabase
        .from('promo_codes')
        .update({ current_uses: (promo.current_uses || 0) + 1 })
        .eq('id', promo.id);

      // Record redemption
      await supabase
        .from('promo_redemptions')
        .insert({
          promo_id: promo.id,
          user_id: user.id,
          redeemed_at: new Date().toISOString()
        })
        .select();

      await refreshProfile();
      setSuccessMsg(`Congratulations! Promo code applied: ${promo.tier === 'platinum_prime' ? 'Platinum Prime' : 'Prime'} plan activated for ${durationMonths} months.`);
      setTimeout(() => {
        onClose();
      }, 2000);
    } catch (e: any) {
      setErrorMsg(e.message || "Failed to apply promotional code.");
    } finally {
      setLoading(false);
    }
  };

  const handleGoToStripeCheckout = (planId: PlanTier) => {
    onClose();
    navigate(`/settings?tab=subscription&checkout=${planId}`);
  };

  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={onClose}></div>
      <div className="relative w-full max-w-lg bg-white dark:bg-surface-dark rounded-3xl shadow-2xl overflow-hidden animate-fade-in border border-gray-100 dark:border-gray-800 p-6 md:p-8 space-y-6">
        
        <div className="flex justify-between items-start">
          <div className="flex items-center gap-3">
            <div className="size-12 rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center">
              <span className="material-symbols-outlined text-2xl">lock</span>
            </div>
            <div>
              <h2 className="text-xl font-black uppercase tracking-tight text-text-main dark:text-white">{title}</h2>
              <span className="text-[10px] font-black uppercase tracking-widest text-primary">Open Beta Access</span>
            </div>
          </div>
          <button onClick={onClose} className="material-symbols-outlined text-text-muted hover:text-text-main">
            close
          </button>
        </div>

        <p className="text-sm text-text-muted font-medium leading-relaxed">
          {description}
        </p>

        {/* Plan Cards comparison */}
        <div className="grid grid-cols-2 gap-3">
          <div className="p-4 rounded-2xl bg-gray-50 dark:bg-white/5 border border-gray-100 dark:border-gray-800 flex flex-col justify-between space-y-3">
            <div>
              <span className="text-[9px] font-black uppercase tracking-widest text-text-muted">Option 1</span>
              <h3 className="text-sm font-black uppercase text-text-main dark:text-white">Prime</h3>
              <p className="text-lg font-black text-primary mt-1">9€ <span className="text-[10px] text-text-muted font-normal">/ mo</span></p>
              <ul className="text-[10px] text-text-muted space-y-1 mt-2 font-bold">
                <li>• 30 recipes & food costs</li>
                <li>• 10 Quick / Deep Pairings</li>
                <li>• Full Price Tracker</li>
                <li>• 3 Languages (EN, CA, ES)</li>
              </ul>
            </div>
            <button
              onClick={() => handleGoToStripeCheckout(PlanTier.PRIME)}
              className="w-full py-2.5 bg-black dark:bg-white text-white dark:text-black rounded-xl text-[10px] font-black uppercase tracking-widest hover:opacity-90 transition-all shadow"
            >
              Get Prime
            </button>
          </div>

          <div className="p-4 rounded-2xl bg-primary/10 border-2 border-primary flex flex-col justify-between space-y-3 relative">
            <span className="absolute -top-2.5 right-3 bg-primary text-black text-[8px] font-black uppercase px-2 py-0.5 rounded-full tracking-wider shadow">
              Recommended
            </span>
            <div>
              <span className="text-[9px] font-black uppercase tracking-widest text-primary">Option 2</span>
              <h3 className="text-sm font-black uppercase text-text-main dark:text-white">Platinum Prime</h3>
              <p className="text-lg font-black text-primary mt-1">25€ <span className="text-[10px] text-text-muted font-normal">/ mo</span></p>
              <ul className="text-[10px] text-text-muted space-y-1 mt-2 font-bold">
                <li>• Unlimited Recipes & Costs</li>
                <li>• Unlimited Flavor Analyses</li>
                <li>• Global Price Tracker</li>
                <li>• All 9 Languages</li>
              </ul>
            </div>
            <button
              onClick={() => handleGoToStripeCheckout(PlanTier.PLATINUM_PRIME)}
              className="w-full py-2.5 bg-primary text-black rounded-xl text-[10px] font-black uppercase tracking-widest hover:scale-[1.02] transition-all shadow-lg shadow-primary/20"
            >
              Get Platinum
            </button>
          </div>
        </div>

        {/* Promo Code Redemption (Zero Cost - No Card Needed) */}
        <div className="p-4 rounded-2xl bg-gray-50 dark:bg-white/5 border border-gray-100 dark:border-gray-800 space-y-3">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-[18px]">card_giftcard</span>
            <h4 className="text-xs font-black uppercase tracking-widest">Have a Beta Promo Code?</h4>
          </div>
          <p className="text-[11px] text-text-muted">
            Enter your invitation code to test Platinum Prime completely free without any credit card.
          </p>

          {errorMsg && (
            <div className="p-2.5 bg-red-500/10 border border-red-500/20 rounded-xl text-red-500 text-xs font-bold flex items-center gap-2">
              <span className="material-symbols-outlined text-[16px]">error</span>
              {errorMsg}
            </div>
          )}

          {successMsg && (
            <div className="p-2.5 bg-green-500/10 border border-green-500/20 rounded-xl text-green-600 dark:text-green-400 text-xs font-bold flex items-center gap-2">
              <span className="material-symbols-outlined text-[16px]">check_circle</span>
              {successMsg}
            </div>
          )}

          <div className="flex gap-2">
            <input
              type="text"
              placeholder="e.g. BETAPLATINUM3M"
              value={promoCode}
              onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
              className="flex-1 h-10 px-3 rounded-xl bg-white dark:bg-black/20 border border-gray-200 dark:border-gray-700 text-xs font-black uppercase tracking-widest outline-none focus:border-primary"
            />
            <button
              onClick={handleRedeemPromo}
              disabled={loading || !promoCode.trim()}
              className="px-4 h-10 bg-primary text-black rounded-xl text-xs font-black uppercase tracking-widest hover:bg-primary-hover disabled:opacity-50 transition-all shrink-0"
            >
              {loading ? 'Validating...' : 'Apply Code'}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
