import React, { useState } from 'react';
import { useAppContext } from '../AppContext';
import { PlanTier } from '../types';
import { supabase } from '../supabaseClient';

interface AuthModalsProps {
  onClose?: () => void;
}

export const AuthModals: React.FC<AuthModalsProps> = ({ onClose }) => {
  const { t } = useAppContext();
  const [mode, setMode] = useState<'login' | 'signup' | 'verify' | 'payment'>('login');
  const [formData, setFormData] = useState({
    email: '', username: '', fullName: '', chefName: '', password: '', confirmPassword: '', plan: PlanTier.FREE, promoCode: ''
  });
  const [loading, setLoading] = useState(false);
  const [promoApplied, setPromoApplied] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setAuthError(null);
    
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: formData.email,
        password: formData.password,
      });
      
      if (error) {
        setAuthError(error.message);
      } else {
        // AppContext will handle the state change via onAuthStateChange
        onClose?.();
      }
    } catch (err: any) {
      setAuthError(err.message || "An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  const verifyPromo = async () => {
    if (!formData.promoCode) return;
    setLoading(true);
    setAuthError(null);
    
    try {
      const { data, error } = await supabase
        .from('promo_codes')
        .select('*')
        .eq('code', formData.promoCode.toUpperCase())
        .single();

      if (error || !data) {
        setAuthError(t('subscription.promoError'));
        return;
      }

      if (data.current_uses >= data.max_uses) {
        setAuthError(t('subscription.promoError'));
        return;
      }

      setPromoApplied(true);
      setFormData({ ...formData, plan: data.plan_to_grant as PlanTier });
      setAuthError(null);
      alert(`${t('subscription.promoSuccess')} Plan: ${data.plan_to_grant}`);
    } catch (err) {
      setAuthError(t('subscription.promoError'));
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    if (formData.password !== formData.confirmPassword) {
      setAuthError(t('auth.passwordMismatch'));
      return;
    }
    
    setLoading(true);

    try {
      if (promoApplied) {
        const { data: promo } = await supabase
          .from('promo_codes')
          .select('*')
          .eq('code', formData.promoCode.toUpperCase())
          .single();
        
        if (!promo || promo.current_uses >= promo.max_uses) {
          setAuthError(t('subscription.promoError'));
          setLoading(false);
          setPromoApplied(false);
          return;
        }
      }

      const { data, error } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: {
          data: {
            username: formData.username,
            full_name: formData.fullName,
            chef_name: formData.chefName || 'Chef ' + formData.fullName,
            tier: formData.plan
          }
        }
      });

      if (error) {
        setAuthError(error.message);
      } else if (data.user) {
        if (promoApplied) {
          await supabase.rpc('increment_promo_use', { promo_code: formData.promoCode.toUpperCase() });
        }
        
        if (!data.session) {
          setMode('verify');
        } else {
          onClose?.();
        }
      }
    } catch (err: any) {
      setAuthError(err.message || "An unexpected error occurred during signup");
    } finally {
      setLoading(false);
    }
  };

  const plans = [
    { id: PlanTier.FREE, name: t('subscription.freePlan'), price: 'Free' },
    { id: PlanTier.PLATINUM, name: t('subscription.platinum'), price: '€14.99/mo' },
    { id: PlanTier.PLATINUM_PRIME, name: t('subscription.platinum_prime'), price: '€29.99/mo' }
  ];

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={onClose}></div>
      <div className="relative w-full max-w-md bg-white dark:bg-surface-dark rounded-3xl shadow-2xl overflow-hidden animate-fade-in border border-gray-100 dark:border-gray-800">
        
        {mode === 'login' && (
          <form onSubmit={handleLogin} className="p-8 space-y-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-black uppercase tracking-tight">Login to Studio</h2>
              <button type="button" onClick={onClose} className="material-symbols-outlined text-text-muted hover:text-black dark:hover:text-white transition-colors">close</button>
            </div>

            {authError && (
              <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-3 animate-fade-in">
                <span className="material-symbols-outlined text-red-500 text-[20px]">error</span>
                <p className="text-xs font-bold text-red-500 leading-tight">{authError}</p>
              </div>
            )}

            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-text-muted ml-1">{t('auth.email')}</label>
                <input 
                  type="email" required placeholder="chef@studio.com" 
                  className="w-full h-12 px-4 rounded-xl outline-none focus:ring-1 focus:ring-primary dark:bg-black/20 border border-gray-100 dark:border-gray-800"
                  onChange={e => setFormData({...formData, email: e.target.value})}
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-text-muted ml-1">{t('auth.password')}</label>
                <input 
                  type="password" required placeholder="••••••••" 
                  className="w-full h-12 px-4 rounded-xl outline-none focus:ring-1 focus:ring-primary dark:bg-black/20 border border-gray-100 dark:border-gray-800"
                  onChange={e => setFormData({...formData, password: e.target.value})}
                />
              </div>
            </div>
            <button 
              type="submit"
              disabled={loading}
              className="w-full h-12 bg-primary text-black font-black uppercase tracking-widest rounded-xl shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50"
            >
              {loading ? 'Processing...' : t('auth.login')}
            </button>
            <div className="pt-4 text-center">
              <button type="button" onClick={() => { setMode('signup'); setAuthError(null); }} className="text-xs font-black uppercase text-primary hover:underline">{t('auth.noAccount')}</button>
            </div>
          </form>
        )}

        {mode === 'signup' && (
          <form onSubmit={handleSignup} className="p-8 space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-2">
              <button type="button" onClick={() => { setMode('login'); setAuthError(null); }} className="material-symbols-outlined text-text-muted">arrow_back</button>
              <h2 className="text-xl font-black uppercase tracking-tight">Chef Registration</h2>
              <button type="button" onClick={onClose} className="material-symbols-outlined text-text-muted">close</button>
            </div>

            {authError && (
              <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-3 animate-fade-in">
                <span className="material-symbols-outlined text-red-500 text-[20px]">error</span>
                <p className="text-xs font-bold text-red-500 leading-tight">{authError}</p>
              </div>
            )}

            <div className="space-y-3">
              <input type="email" required placeholder={t('auth.email')} className="w-full h-11 px-4 rounded-xl text-sm dark:bg-black/20 border border-gray-100 dark:border-gray-800" onChange={e => setFormData({...formData, email: e.target.value})} />
              <div className="grid grid-cols-2 gap-3">
                <input type="text" required placeholder={t('auth.username')} className="w-full h-11 px-4 rounded-xl text-sm dark:bg-black/20 border border-gray-100 dark:border-gray-800" onChange={e => setFormData({...formData, username: e.target.value})} />
                <input type="text" required placeholder={t('auth.fullName')} className="w-full h-11 px-4 rounded-xl text-sm dark:bg-black/20 border border-gray-100 dark:border-gray-800" onChange={e => setFormData({...formData, fullName: e.target.value})} />
              </div>
              <input type="password" required placeholder={t('auth.password')} className="w-full h-11 px-4 rounded-xl text-sm dark:bg-black/20 border border-gray-100 dark:border-gray-800" onChange={e => setFormData({...formData, password: e.target.value})} />
              <input type="password" required placeholder={t('auth.confirmPassword')} className="w-full h-11 px-4 rounded-xl text-sm dark:bg-black/20 border border-gray-100 dark:border-gray-800" onChange={e => setFormData({...formData, confirmPassword: e.target.value})} />
            </div>

            <div className="space-y-3 pt-2">
              <h3 className="text-[10px] font-black uppercase tracking-widest text-text-muted">{t('subscription.selectPlan')}</h3>
              <div className="space-y-2">
                {plans.map(p => (
                  <label key={p.id} className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-all ${formData.plan === p.id ? 'border-primary bg-primary/5' : 'border-gray-100 dark:border-gray-800 hover:border-primary/50'}`}>
                    <div className="flex items-center gap-3">
                      <input type="radio" name="plan" checked={formData.plan === p.id} onChange={() => { if(!promoApplied) setFormData({...formData, plan: p.id}) }} className="text-primary focus:ring-primary" disabled={promoApplied} />
                      <span className="text-xs font-black uppercase">{p.name}</span>
                    </div>
                    <span className="text-[10px] font-bold text-text-muted">{p.price}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-2 pt-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-text-muted ml-2">{t('subscription.promoCode')}</label>
              <div className="flex gap-2">
                <input 
                  type="text" 
                  placeholder="CODE" 
                  className="flex-1 h-10 px-4 rounded-xl text-xs uppercase font-black dark:bg-black/20 border border-gray-100 dark:border-gray-800" 
                  value={formData.promoCode}
                  onChange={e => setFormData({...formData, promoCode: e.target.value.toUpperCase()})}
                  disabled={promoApplied}
                />
                <button 
                  type="button" 
                  onClick={verifyPromo}
                  disabled={promoApplied || loading || !formData.promoCode}
                  className="px-4 h-10 bg-black text-white rounded-xl text-[10px] font-black uppercase disabled:opacity-30 transition-all hover:bg-gray-800"
                >
                  {promoApplied ? 'Applied' : t('subscription.applyCode')}
                </button>
              </div>
            </div>

            <button type="submit" disabled={loading} className="w-full h-12 bg-primary text-black font-black uppercase tracking-widest rounded-xl shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-95 transition-all mt-4">
              {loading ? 'Creating Account...' : t('auth.createAccount')}
            </button>
          </form>
        )}

        {mode === 'verify' && (
          <div className="p-8 space-y-8 text-center animate-fade-in">
            <span className="material-symbols-outlined text-6xl text-primary animate-bounce">mail</span>
            <div className="space-y-3">
              <h2 className="text-2xl font-black uppercase tracking-tight">Check your email</h2>
              <p className="text-sm text-text-muted font-medium">We've sent a verification link to <span className="text-black dark:text-white font-bold">{formData.email}</span>.</p>
              <p className="text-[10px] text-text-muted italic">Please confirm your email to start your culinary journey.</p>
            </div>
            <button onClick={onClose} className="w-full h-12 bg-primary text-black rounded-xl text-xs font-black uppercase tracking-widest shadow-lg shadow-primary/20 transition-all hover:scale-105">OK</button>
          </div>
        )}
      </div>
    </div>
  );
};
