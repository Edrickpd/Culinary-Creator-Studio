import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAppContext } from '../AppContext';
import { PlanTier } from '../types';
import { supabase } from '../supabaseClient';
import { PLAN_CONFIGS, normalizeTier, isLanguageAllowed } from '../services/planLimits';

export const Settings = () => {
  const { t, user, theme, language, setLanguage, currency, setCurrency, toggleTheme, updateUser, refreshProfile, isLoggedIn, logout } = useAppContext();
  const location = useLocation();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'profile' | 'subscription' | 'preferences'>('profile');
  const [isSaving, setIsSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [stripeLoading, setStripeLoading] = useState<string | null>(null);
  const [promoInput, setPromoInput] = useState('');
  const [promoLoading, setPromoLoading] = useState(false);
  const [promoMessage, setPromoMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [formData, setFormData] = useState({
    fullName: user?.fullName || '',
    chefName: user?.chefName || '',
    bio: user?.bio || '',
    avatarUrl: user?.avatarUrl || ''
  });

  // Handle tab and stripe status from query param
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const tab = params.get('tab');
    if (tab === 'profile' || tab === 'subscription' || tab === 'preferences') {
      setActiveTab(tab as any);
    }

    const checkoutPlan = params.get('checkout');
    if (checkoutPlan && (checkoutPlan === 'prime' || checkoutPlan === 'platinum_prime')) {
      handleStripeCheckout(checkoutPlan as any);
    }

    const status = params.get('status');
    if (status === 'success') {
      const plan = params.get('plan') || 'prime';
      setPromoMessage({
        type: 'success',
        text: `Stripe Checkout completed successfully! Welcome to the ${plan === 'platinum_prime' ? 'Platinum Prime' : 'Prime'} plan.`
      });
      refreshProfile();
    } else if (status === 'cancelled') {
      setPromoMessage({
        type: 'error',
        text: 'Stripe Checkout was cancelled. No charges were made.'
      });
    }
  }, [location]);

  // Sync with global state whenever user changes
  useEffect(() => {
    if (user) {
      setFormData({
        fullName: user.fullName || '',
        chefName: user.chefName || '',
        bio: user.bio || '',
        avatarUrl: user.avatarUrl || ''
      });
    }
  }, [user]);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    setUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}/${Date.now()}.${fileExt}`;
      const filePath = `avatars/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('dish-images')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('dish-images')
        .getPublicUrl(filePath);

      await updateUser({ ...formData, avatarUrl: publicUrl });
    } catch (error: any) {
      alert("Error uploading avatar: " + (error.message || error));
    } finally {
      setUploading(false);
    }
  };

  const handleSaveProfile = async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      await updateUser(formData);
      alert(t('settings.saveChanges'));
    } catch (e: any) {
      alert("Error saving profile: " + (e.message || e));
    } finally {
      setIsSaving(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  // Stripe Checkout Flow
  const handleStripeCheckout = async (plan: 'prime' | 'platinum_prime') => {
    setStripeLoading(plan);
    setPromoMessage(null);
    try {
      const response = await fetch('/api/stripe/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan,
          userId: user?.id,
          userEmail: user?.email,
          returnUrl: window.location.href
        })
      });

      const data = await response.json();
      if (!response.ok) {
        if (data.error === 'STRIPE_NOT_CONFIGURED') {
          setPromoMessage({
            type: 'error',
            text: 'Stripe API key is not configured in this environment yet. You can test full functionality by redeeming a Beta Promo Code (e.g. BETAPLATINUM3M or CHEFPRIME).'
          });
          return;
        }
        throw new Error(data.message || data.error || 'Failed to initiate Stripe Checkout');
      }

      if (data.url) {
        window.location.href = data.url;
      }
    } catch (err: any) {
      setPromoMessage({
        type: 'error',
        text: err.message || 'Error communicating with Stripe server.'
      });
    } finally {
      setStripeLoading(null);
    }
  };

  // Stripe Customer Portal
  const handleStripePortal = async () => {
    if (!user?.stripeCustomerId) {
      alert("No active Stripe customer account linked. Upgrade via Checkout or redeem a Beta promo code.");
      return;
    }
    try {
      const res = await fetch('/api/stripe/create-portal-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: user.stripeCustomerId,
          returnUrl: window.location.href
        })
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (e: any) {
      alert("Error opening Stripe customer portal: " + e.message);
    }
  };

  // Redeem Promo Code (No Credit Card)
  const handleRedeemPromo = async () => {
    if (!promoInput.trim() || !user) return;
    setPromoLoading(true);
    setPromoMessage(null);

    try {
      const codeClean = promoInput.trim().toUpperCase();
      
      const { data: promo, error: promoErr } = await supabase
        .from('promo_codes')
        .select('*')
        .eq('code', codeClean)
        .single();

      if (promoErr || !promo) {
        setPromoMessage({ type: 'error', text: t('subscription.promoError') || 'Invalid promotional code.' });
        setPromoLoading(false);
        return;
      }

      if (!promo.is_active) {
        setPromoMessage({ type: 'error', text: 'This promotional code is currently inactive.' });
        setPromoLoading(false);
        return;
      }

      if (promo.max_uses > 0 && promo.current_uses >= promo.max_uses) {
        setPromoMessage({ type: 'error', text: 'This code has reached its maximum redemptions limit.' });
        setPromoLoading(false);
        return;
      }

      const durationMonths = promo.duration_months || 3;
      const renewalDate = new Date();
      renewalDate.setMonth(renewalDate.getMonth() + durationMonths);

      const targetTier = promo.tier === 'platinum_prime' ? PlanTier.PLATINUM_PRIME : PlanTier.PRIME;

      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          tier: targetTier,
          subscription_status: 'active',
          subscription_renewal: renewalDate.toISOString()
        })
        .eq('id', user.id);

      if (updateError) throw updateError;

      // Increment count
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
        });

      await refreshProfile();
      setPromoInput('');
      setPromoMessage({
        type: 'success',
        text: `Promo code applied successfully! Activated ${targetTier === PlanTier.PLATINUM_PRIME ? 'Platinum Prime' : 'Prime'} for ${durationMonths} months.`
      });
    } catch (e: any) {
      setPromoMessage({ type: 'error', text: e.message || 'Failed to redeem promotional code.' });
    } finally {
      setPromoLoading(false);
    }
  };

  const languages = [
    { code: 'en', name: 'English', tierNeeded: PlanTier.FREE },
    { code: 'es', name: 'Español', tierNeeded: PlanTier.PRIME },
    { code: 'ca', name: 'Català', tierNeeded: PlanTier.PRIME },
    { code: 'fr', name: 'Français', tierNeeded: PlanTier.PLATINUM_PRIME },
    { code: 'ja', name: '日本語', tierNeeded: PlanTier.PLATINUM_PRIME },
    { code: 'it', name: 'Italiano', tierNeeded: PlanTier.PLATINUM_PRIME },
    { code: 'pt', name: 'Português', tierNeeded: PlanTier.PLATINUM_PRIME },
    { code: 'zh', name: '中文', tierNeeded: PlanTier.PLATINUM_PRIME },
    { code: 'de', name: 'Deutsch', tierNeeded: PlanTier.PLATINUM_PRIME }
  ];

  const currentTier = normalizeTier(user?.tier);
  const planConfig = PLAN_CONFIGS[currentTier];

  if (!isLoggedIn) {
    return (
      <div className="flex flex-col items-center justify-center h-full space-y-4 p-8 text-center">
        <span className="material-symbols-outlined text-6xl text-text-muted">lock</span>
        <h2 className="text-xl font-black uppercase tracking-tight">{t('auth.loginTitle')}</h2>
        <p className="text-text-muted">Please log in to access settings and subscription management.</p>
      </div>
    );
  }

  const getTabLabel = (tab: string) => {
    if (tab === 'profile') return t('settings.publicProfile');
    if (tab === 'preferences') return t('settings.preferences');
    if (tab === 'subscription') return t('settings.subscription');
    return tab;
  };

  return (
    <div className="p-4 md:p-8 lg:p-12 animate-fade-in max-w-5xl mx-auto space-y-10">
      <header className="space-y-2">
        <div className="flex items-center gap-3">
          <h1 className="text-4xl md:text-5xl font-black uppercase tracking-tight">{t('settings.settings')}</h1>
          <span className="px-3 py-1 bg-primary/20 text-primary rounded-full text-xs font-black uppercase tracking-widest">
            {planConfig.badge}
          </span>
        </div>
        <p className="text-text-muted text-lg">{t('settings.manage')}</p>
      </header>

      {/* Tabs */}
      <div className="flex gap-4 border-b border-gray-100 dark:border-gray-800 overflow-x-auto">
        {(['profile', 'preferences', 'subscription'] as const).map(tab => (
          <button 
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`pb-4 px-2 text-xs font-black uppercase tracking-widest relative transition-all whitespace-nowrap ${
              activeTab === tab ? 'text-primary' : 'text-text-muted hover:text-text-main'
            }`}
          >
            {getTabLabel(tab)}
            {activeTab === tab && <div className="absolute bottom-0 left-0 right-0 h-1 bg-primary rounded-t-full"></div>}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-10">
        {/* Profile Tab */}
        {activeTab === 'profile' && (
          <div className="space-y-16 animate-fade-in">
            <section className="space-y-8">
              <div className="flex flex-col md:flex-row gap-10 items-start">
                <div className="size-40 rounded-3xl bg-gray-100 dark:bg-white/5 flex flex-col items-center justify-center border-2 border-dashed border-gray-200 dark:border-gray-700 hover:border-primary transition-all cursor-pointer group shrink-0 relative overflow-hidden">
                  {formData.avatarUrl ? (
                    <img src={formData.avatarUrl} className="size-full object-cover" alt="Avatar" />
                  ) : (
                    <span className="material-symbols-outlined text-4xl text-gray-300 group-hover:text-primary">upload</span>
                  )}
                  {uploading && (
                    <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                      <span className="material-symbols-outlined animate-spin text-white">sync</span>
                    </div>
                  )}
                  <input type="file" accept="image/*" onChange={handleAvatarUpload} className="absolute inset-0 opacity-0 cursor-pointer" />
                  <div className="absolute inset-x-0 bottom-0 bg-black/40 py-1 text-white text-[9px] font-black uppercase text-center opacity-0 group-hover:opacity-100">Change Photo</div>
                </div>
                
                <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
                  <div className="flex flex-col gap-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-text-muted">{t('auth.fullName')}</label>
                    <input 
                      className="w-full h-12 bg-gray-50 dark:bg-white/5 border border-gray-100 dark:border-gray-800 rounded-xl px-4 text-sm font-bold focus:ring-1 focus:ring-primary outline-none" 
                      value={formData.fullName}
                      onChange={e => setFormData({...formData, fullName: e.target.value})}
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-text-muted">Chef Name</label>
                    <input 
                      className="w-full h-12 bg-gray-50 dark:bg-white/5 border border-gray-100 dark:border-gray-800 rounded-xl px-4 text-sm font-bold focus:ring-1 focus:ring-primary outline-none" 
                      value={formData.chefName}
                      onChange={e => setFormData({...formData, chefName: e.target.value})}
                    />
                  </div>
                  <div className="flex flex-col gap-2 md:col-span-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-text-muted">Bio</label>
                    <textarea 
                      className="w-full bg-gray-50 dark:bg-white/5 border border-gray-100 dark:border-gray-800 rounded-xl px-4 py-3 text-sm font-bold min-h-[120px] focus:ring-1 focus:ring-primary outline-none" 
                      value={formData.bio}
                      onChange={e => setFormData({...formData, bio: e.target.value})}
                    />
                  </div>

                  <div className="md:col-span-2 pt-2">
                    <button 
                      onClick={handleLogout}
                      className="flex items-center gap-2 text-xs font-black uppercase text-red-500 hover:text-red-600 transition-colors"
                    >
                      <span className="material-symbols-outlined text-[20px]">logout</span>
                      Log Out
                    </button>
                  </div>
                </div>
              </div>
              
              <div className="flex justify-end gap-4 pt-4 border-t border-gray-100 dark:border-gray-800">
                <button 
                  onClick={() => setFormData({ fullName: user.fullName, chefName: user.chefName, bio: user.bio, avatarUrl: user.avatarUrl })}
                  className="px-8 py-3 rounded-xl text-xs font-black uppercase text-text-muted hover:bg-gray-100 dark:hover:bg-white/5 transition-colors"
                >
                  {t('settings.discard')}
                </button>
                <button 
                  onClick={handleSaveProfile}
                  disabled={isSaving}
                  className="px-10 py-3 rounded-xl bg-primary text-black text-xs font-black uppercase tracking-widest shadow-lg shadow-primary/20 hover:scale-[1.02] transition-transform disabled:opacity-50"
                >
                  {isSaving ? t('settings.saveChanges') + '...' : t('settings.saveChanges')}
                </button>
              </div>
            </section>
          </div>
        )}

        {/* Preferences Tab */}
        {activeTab === 'preferences' && (
          <section className="space-y-12 animate-fade-in">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
              <div className="space-y-4">
                <label className="text-sm font-black uppercase tracking-widest text-text-muted flex items-center gap-2">
                  <span className="material-symbols-outlined text-[20px]">palette</span> {t('settings.theme')}
                </label>
                <div className="flex items-center gap-4 bg-gray-100 dark:bg-white/5 p-2 rounded-2xl w-fit">
                   <button 
                    onClick={() => theme === 'dark' && toggleTheme()}
                    className={`flex items-center gap-2 px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${theme === 'light' ? 'bg-white shadow-sm text-primary' : 'text-text-muted'}`}
                   >
                     <span className="material-symbols-outlined text-[18px]">light_mode</span> {t('settings.light')}
                   </button>
                   <button 
                    onClick={() => theme === 'light' && toggleTheme()}
                    className={`flex items-center gap-2 px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${theme === 'dark' ? 'bg-surface-dark shadow-sm text-primary' : 'text-text-muted'}`}
                   >
                     <span className="material-symbols-outlined text-[18px]">dark_mode</span> {t('settings.dark')}
                   </button>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between max-w-xs">
                  <label className="text-sm font-black uppercase tracking-widest text-text-muted flex items-center gap-2">
                    <span className="material-symbols-outlined text-[20px]">language</span> {t('settings.language')}
                  </label>
                  <span className="text-[9px] font-black text-primary uppercase">
                    {currentTier === PlanTier.FREE ? 'English only (Free)' : currentTier === PlanTier.PRIME ? 'EN, CA, ES (Prime)' : '9 Languages (Platinum)'}
                  </span>
                </div>
                <div className="relative max-w-xs">
                  <select 
                    className="w-full h-12 bg-gray-50 dark:bg-surface-dark border-none rounded-xl px-4 text-sm font-bold uppercase tracking-widest text-text-main dark:text-white focus:ring-1 focus:ring-primary appearance-none cursor-pointer"
                    value={language}
                    onChange={(e) => {
                      const selectedLang = e.target.value;
                      if (!isLanguageAllowed(user?.tier, selectedLang)) {
                        alert(`Language is locked on your current plan (${planConfig.badge}). Upgrade to unlock.`);
                        return;
                      }
                      setLanguage(selectedLang);
                    }}
                  >
                    {languages.map(lang => {
                      const isAllowed = isLanguageAllowed(user?.tier, lang.code);
                      return (
                        <option 
                          key={lang.code} 
                          value={lang.code} 
                          disabled={!isAllowed}
                          className="bg-white dark:bg-surface-dark text-black dark:text-white"
                        >
                          {lang.name} {!isAllowed ? '🔒 (Upgrade required)' : ''}
                        </option>
                      );
                    })}
                  </select>
                  <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-text-muted">expand_more</span>
                </div>
              </div>

              <div className="space-y-4">
                <label className="text-sm font-black uppercase tracking-widest text-text-muted flex items-center gap-2">
                  <span className="material-symbols-outlined text-[20px]">payments</span> {t('settings.currency')}
                </label>
                <div className="relative max-w-xs">
                  <select 
                    className="w-full h-12 bg-gray-50 dark:bg-surface-dark border-none rounded-xl px-4 text-sm font-bold uppercase tracking-widest text-text-main dark:text-white focus:ring-1 focus:ring-primary appearance-none cursor-pointer"
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                  >
                    <option value="€" className="bg-white dark:bg-surface-dark text-black dark:text-white">EUR (€) - Euro</option>
                    <option value="$" className="bg-white dark:bg-surface-dark text-black dark:text-white">USD ($) - US Dollar</option>
                    <option value="£" className="bg-white dark:bg-surface-dark text-black dark:text-white">GBP (£) - British Pound</option>
                    <option value="¥" className="bg-white dark:bg-surface-dark text-black dark:text-white">JPY (¥) - Japanese Yen</option>
                    <option value="MXN$" className="bg-white dark:bg-surface-dark text-black dark:text-white">MXN ($) - Peso Mexicano</option>
                    <option value="CAD$" className="bg-white dark:bg-surface-dark text-black dark:text-white">CAD ($) - Canadian Dollar</option>
                    <option value="CHF" className="bg-white dark:bg-surface-dark text-black dark:text-white">CHF - Swiss Franc</option>
                    <option value="R$" className="bg-white dark:bg-surface-dark text-black dark:text-white">BRL (R$) - Real Brasileiro</option>
                  </select>
                  <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-text-muted">expand_more</span>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Subscription Tab */}
        {activeTab === 'subscription' && (
          <section className="space-y-10 animate-fade-in">
            {promoMessage && (
              <div className={`p-4 rounded-2xl border flex items-center gap-3 ${
                promoMessage.type === 'success'
                  ? 'bg-green-500/10 border-green-500/20 text-green-600 dark:text-green-400'
                  : 'bg-red-500/10 border-red-500/20 text-red-500'
              }`}>
                <span className="material-symbols-outlined">
                  {promoMessage.type === 'success' ? 'check_circle' : 'error'}
                </span>
                <p className="text-xs font-bold leading-relaxed">{promoMessage.text}</p>
              </div>
            )}

            {/* Current Subscription Card */}
            <div className="bg-white dark:bg-surface-dark border border-gray-100 dark:border-gray-800 rounded-3xl p-8 shadow-sm space-y-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="space-y-1">
                  <span className="text-[10px] font-black uppercase tracking-widest text-text-muted">{t('subscription.current')}</span>
                  <h3 className="text-3xl font-black uppercase text-primary">{planConfig.badge}</h3>
                  <p className="text-xs text-text-muted font-bold">{planConfig.priceFormatted}</p>
                </div>
                <div className="flex flex-col md:items-end">
                  <span className="text-[10px] font-black uppercase tracking-widest text-text-muted">{t('subscription.renewal')}</span>
                  <span className="text-sm font-black">
                    {user?.subscriptionRenewal ? new Date(user.subscriptionRenewal).toLocaleDateString() : 'Active Free Tier'}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-6 border-t border-gray-50 dark:border-gray-800">
                <div className="space-y-4">
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-text-muted">Active Plan Limits & Capabilities</h4>
                  <ul className="space-y-2 text-xs font-bold">
                    <li className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-primary text-[18px]">check_circle</span>
                      Recipes: {planConfig.limits.recipes === Infinity ? 'Unlimited' : `${planConfig.limits.recipes} max`}
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-primary text-[18px]">check_circle</span>
                      Food Costs: {planConfig.limits.foodCosts === Infinity ? 'Unlimited' : `${planConfig.limits.foodCosts} max`}
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-primary text-[18px]">check_circle</span>
                      Pairing Analyses: {planConfig.limits.quickAnalysesPerMonth === Infinity ? 'Unlimited' : planConfig.limits.quickAnalysesPerMonth === 0 ? 'Locked (Free)' : '10 Quick / 10 Deep per month'}
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-primary text-[18px]">check_circle</span>
                      Price Tracker & Clipboard: {planConfig.features.priceTrackerAllowed ? 'Full Access' : 'Locked (Free)'}
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-primary text-[18px]">check_circle</span>
                      Supported Languages: {planConfig.features.allowedLanguages.length === 9 ? 'All 9 Languages' : planConfig.features.allowedLanguages.join(', ').toUpperCase()}
                    </li>
                  </ul>
                </div>

                <div className="space-y-4">
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-text-muted">Subscription Actions</h4>
                  <div className="flex flex-col gap-3">
                    {currentTier !== PlanTier.PLATINUM_PRIME && (
                      <button
                        onClick={() => handleStripeCheckout('platinum_prime')}
                        disabled={!!stripeLoading}
                        className="w-full py-3.5 bg-primary text-black rounded-xl text-xs font-black uppercase tracking-widest hover:scale-[1.02] shadow-lg shadow-primary/25 transition-all flex items-center justify-center gap-2"
                      >
                        <span className="material-symbols-outlined text-[18px]">bolt</span>
                        {stripeLoading === 'platinum_prime' ? 'Connecting Stripe...' : 'Upgrade to Platinum Prime (25€)'}
                      </button>
                    )}

                    {currentTier === PlanTier.FREE && (
                      <button
                        onClick={() => handleStripeCheckout('prime')}
                        disabled={!!stripeLoading}
                        className="w-full py-3.5 bg-black dark:bg-white text-white dark:text-black rounded-xl text-xs font-black uppercase tracking-widest hover:opacity-90 transition-all flex items-center justify-center gap-2"
                      >
                        <span className="material-symbols-outlined text-[18px]">workspace_premium</span>
                        {stripeLoading === 'prime' ? 'Connecting Stripe...' : 'Upgrade to Prime (9€)'}
                      </button>
                    )}

                    {user?.stripeCustomerId && (
                      <button
                        onClick={handleStripePortal}
                        className="w-full py-3 border border-gray-200 dark:border-gray-700 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
                      >
                        Manage in Stripe Customer Portal
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Redeem Beta Promo Code Box */}
            <div className="bg-gradient-to-br from-primary/10 via-transparent to-transparent border border-primary/20 rounded-3xl p-8 space-y-4">
              <div className="flex items-center gap-3">
                <div className="size-10 rounded-xl bg-primary text-black flex items-center justify-center font-black">
                  <span className="material-symbols-outlined">card_giftcard</span>
                </div>
                <div>
                  <h4 className="text-base font-black uppercase tracking-tight">Redeem Beta Invitation Code</h4>
                  <p className="text-xs text-text-muted">Activate Prime or Platinum Prime for 3+ months with zero credit card required.</p>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <input
                  type="text"
                  placeholder="e.g. BETAPLATINUM3M or CHEFPRIME"
                  value={promoInput}
                  onChange={(e) => setPromoInput(e.target.value.toUpperCase())}
                  className="flex-1 h-12 px-4 rounded-xl bg-white dark:bg-surface-dark border border-gray-200 dark:border-gray-700 text-xs font-black uppercase tracking-widest outline-none focus:border-primary"
                />
                <button
                  onClick={handleRedeemPromo}
                  disabled={promoLoading || !promoInput.trim()}
                  className="px-6 h-12 bg-primary text-black rounded-xl text-xs font-black uppercase tracking-widest hover:bg-primary-hover disabled:opacity-50 transition-all shrink-0 shadow-lg shadow-primary/20"
                >
                  {promoLoading ? 'Validating...' : 'Apply Code'}
                </button>
              </div>
            </div>

            {/* Plan Cards Comparison */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Free */}
              <div className={`p-6 rounded-3xl border ${currentTier === PlanTier.FREE ? 'border-primary bg-primary/5' : 'border-gray-100 dark:border-gray-800 bg-white dark:bg-surface-dark'} space-y-4 flex flex-col justify-between`}>
                <div className="space-y-3">
                  <span className="text-[10px] font-black uppercase tracking-widest text-text-muted">Basic Tier</span>
                  <h3 className="text-xl font-black uppercase">Free</h3>
                  <p className="text-2xl font-black text-text-main dark:text-white">0€ <span className="text-xs text-text-muted font-normal">/ month</span></p>
                  <ul className="text-xs text-text-muted space-y-2 font-bold pt-2">
                    <li>✓ 5 saved recipes</li>
                    <li>✓ 5 food cost sheets</li>
                    <li>✓ Full community access</li>
                    <li>✗ Pairing analysis locked</li>
                    <li>✗ Price tracker locked</li>
                    <li>✓ English interface</li>
                  </ul>
                </div>
                {currentTier === PlanTier.FREE ? (
                  <span className="text-center py-2 text-xs font-black text-primary uppercase">Current Plan</span>
                ) : (
                  <button 
                    onClick={() => {
                      if (window.confirm("Switch to Free plan at the end of current cycle?")) {
                        supabase.from('profiles').update({ tier: 'free' }).eq('id', user.id).then(() => refreshProfile());
                      }
                    }}
                    className="w-full py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl text-xs font-black uppercase hover:bg-gray-100 dark:hover:bg-white/5"
                  >
                    Downgrade
                  </button>
                )}
              </div>

              {/* Prime */}
              <div className={`p-6 rounded-3xl border ${currentTier === PlanTier.PRIME ? 'border-primary bg-primary/5' : 'border-gray-100 dark:border-gray-800 bg-white dark:bg-surface-dark'} space-y-4 flex flex-col justify-between`}>
                <div className="space-y-3">
                  <span className="text-[10px] font-black uppercase tracking-widest text-text-muted">Pro Chef</span>
                  <h3 className="text-xl font-black uppercase">Prime</h3>
                  <p className="text-2xl font-black text-primary">9€ <span className="text-xs text-text-muted font-normal">/ month</span></p>
                  <ul className="text-xs text-text-muted space-y-2 font-bold pt-2">
                    <li>✓ 30 saved recipes & food costs</li>
                    <li>✓ 10 quick / 10 deep pairings / mo</li>
                    <li>✓ Global Market Price Tracker</li>
                    <li>✓ Full clipboard integration</li>
                    <li>✓ English, Catalan & Spanish</li>
                  </ul>
                </div>
                {currentTier === PlanTier.PRIME ? (
                  <span className="text-center py-2 text-xs font-black text-primary uppercase">Current Plan</span>
                ) : (
                  <button
                    onClick={() => handleStripeCheckout('prime')}
                    className="w-full py-2.5 bg-black dark:bg-white text-white dark:text-black rounded-xl text-xs font-black uppercase hover:opacity-90 shadow"
                  >
                    Get Prime (9€)
                  </button>
                )}
              </div>

              {/* Platinum Prime */}
              <div className={`p-6 rounded-3xl border-2 ${currentTier === PlanTier.PLATINUM_PRIME ? 'border-primary bg-primary/10' : 'border-primary/50 bg-white dark:bg-surface-dark'} space-y-4 flex flex-col justify-between relative`}>
                <span className="absolute -top-3 right-6 bg-primary text-black text-[9px] font-black uppercase px-3 py-0.5 rounded-full tracking-wider shadow">
                  Executive Suite
                </span>
                <div className="space-y-3">
                  <span className="text-[10px] font-black uppercase tracking-widest text-primary">R&D Mastery</span>
                  <h3 className="text-xl font-black uppercase">Platinum Prime</h3>
                  <p className="text-2xl font-black text-primary">25€ <span className="text-xs text-text-muted font-normal">/ month</span></p>
                  <ul className="text-xs text-text-muted space-y-2 font-bold pt-2">
                    <li>✓ Unlimited Recipes & Food Costs</li>
                    <li>✓ Unlimited Molecular Pairings</li>
                    <li>✓ Full Price Tracker + Intelligence</li>
                    <li>✓ Sub-recipes & Batch Scaler</li>
                    <li>✓ All 9 Global Languages</li>
                  </ul>
                </div>
                {currentTier === PlanTier.PLATINUM_PRIME ? (
                  <span className="text-center py-2 text-xs font-black text-primary uppercase">Current Plan</span>
                ) : (
                  <button
                    onClick={() => handleStripeCheckout('platinum_prime')}
                    className="w-full py-2.5 bg-primary text-black rounded-xl text-xs font-black uppercase hover:scale-[1.02] shadow-lg shadow-primary/25"
                  >
                    Get Platinum (25€)
                  </button>
                )}
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
};
