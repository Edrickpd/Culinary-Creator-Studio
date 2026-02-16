
import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAppContext } from '../AppContext';
import { PlanTier } from '../types';
import { supabase } from '../supabaseClient';

export const Settings = () => {
  const { t, user, theme, language, setLanguage, toggleTheme, updateUser, isLoggedIn, logout } = useAppContext();
  const location = useLocation();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'profile' | 'subscription' | 'preferences'>('profile');
  const [isSaving, setIsSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  
  const [formData, setFormData] = useState({
    fullName: user?.fullName || '',
    chefName: user?.chefName || '',
    bio: user?.bio || '',
    avatarUrl: user?.avatarUrl || ''
  });

  // Handle tab from query param
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const tab = params.get('tab');
    if (tab === 'profile' || tab === 'subscription' || tab === 'preferences') {
      setActiveTab(tab as any);
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

      // Save directly to DB and metadata via the global updateUser
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

  const languages = [
    { code: 'en', name: 'English' },
    { code: 'es', name: 'Español' },
    { code: 'ca', name: 'Català' },
    { code: 'fr', name: 'Français' },
    { code: 'ja', name: '日本語' },
    { code: 'it', name: 'Italiano' },
    { code: 'pt', name: 'Português' },
    { code: 'zh', name: '中文' },
    { code: 'de', name: 'Deutsch' }
  ];

  const planInfo = {
    [PlanTier.FREE]: {
      name: t('subscription.freePlan'),
      renewal: t('subscription.never'),
      features: ['5 projects max', 'Basic features', 'Community access']
    },
    [PlanTier.PLATINUM]: {
      name: t('subscription.platinum'),
      renewal: 'Jan 15, 2026',
      features: ['50 projects', 'Unlimited recipes', 'Priority support']
    },
    [PlanTier.PLATINUM_PRIME]: {
      name: t('subscription.platinum_prime'),
      renewal: 'Jan 15, 2026',
      features: ['Unlimited projects', 'AI analysis', '24/7 support']
    }
  };

  const currentPlan = user?.tier || PlanTier.FREE;

  if (!isLoggedIn) {
    return (
      <div className="flex flex-col items-center justify-center h-full space-y-4">
        <span className="material-symbols-outlined text-6xl text-text-muted">lock</span>
        <h2 className="text-xl font-black uppercase tracking-tight">{t('auth.loginTitle')}</h2>
        <p className="text-text-muted">Please log in to access settings.</p>
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
    <div className="p-4 md:p-8 lg:p-12 animate-fade-in max-w-5xl mx-auto space-y-12">
      <header className="space-y-2">
        <h1 className="text-4xl md:text-5xl font-black uppercase tracking-tight">{t('settings.settings')}</h1>
        <p className="text-text-muted text-lg">{t('settings.manage')}</p>
      </header>

      {/* Tabs */}
      <div className="flex gap-4 border-b border-gray-100 dark:border-gray-800">
        {(['profile', 'preferences', 'subscription'] as const).map(tab => (
          <button 
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`pb-4 px-2 text-xs font-black uppercase tracking-widest relative transition-all ${
              activeTab === tab ? 'text-primary' : 'text-text-muted hover:text-text-main'
            }`}
          >
            {getTabLabel(tab)}
            {activeTab === tab && <div className="absolute bottom-0 left-0 right-0 h-1 bg-primary rounded-t-full"></div>}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-12">
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

            <section className="space-y-6 pt-12 border-t border-gray-100 dark:border-gray-800">
              <h2 className="text-xs font-black uppercase tracking-[0.2em] text-red-500 pb-2">{t('settings.dangerZone')}</h2>
              <div className="bg-red-500/5 border border-red-500/10 p-8 rounded-3xl flex flex-col md:flex-row items-center justify-between gap-6">
                <div className="space-y-1">
                  <h3 className="text-sm font-black uppercase tracking-tight text-red-500">{t('settings.deleteAccount')}</h3>
                  <p className="text-xs text-text-muted font-medium">{t('settings.deleteWarning')}</p>
                </div>
                <button 
                  onClick={() => window.confirm('Are you sure you want to permanently delete your account?') && handleLogout()}
                  className="px-8 py-3 rounded-xl border border-red-500 text-red-500 text-[10px] font-black uppercase tracking-widest hover:bg-red-500 hover:text-white transition-all shrink-0"
                >
                  Request Account Deletion
                </button>
              </div>
            </section>
          </div>
        )}

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
                <label className="text-sm font-black uppercase tracking-widest text-text-muted flex items-center gap-2">
                  <span className="material-symbols-outlined text-[20px]">language</span> {t('settings.language')}
                </label>
                <div className="relative max-w-xs">
                  <select 
                    className="w-full h-12 bg-gray-50 dark:bg-surface-dark border-none rounded-xl px-4 text-sm font-bold uppercase tracking-widest text-text-main dark:text-white focus:ring-1 focus:ring-primary appearance-none cursor-pointer"
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                  >
                    {languages.map(lang => (
                      <option key={lang.code} value={lang.code} className="bg-white dark:bg-surface-dark text-black dark:text-white">
                        {lang.name}
                      </option>
                    ))}
                  </select>
                  <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-text-muted">expand_more</span>
                </div>
              </div>
            </div>
          </section>
        )}

        {activeTab === 'subscription' && (
          <section className="space-y-10 animate-fade-in">
             <div className="bg-white dark:bg-surface-dark border border-gray-100 dark:border-gray-800 rounded-3xl p-8 shadow-sm space-y-6">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                  <div className="space-y-1">
                    <span className="text-[10px] font-black uppercase tracking-widest text-text-muted">{t('subscription.current')}</span>
                    <h3 className="text-3xl font-black uppercase text-primary">{planInfo[currentPlan].name}</h3>
                  </div>
                  <div className="flex flex-col items-end">
                    <span className="text-[10px] font-black uppercase tracking-widest text-text-muted">{t('subscription.renewal')}</span>
                    <span className="text-sm font-black">{planInfo[currentPlan].renewal}</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-6 border-t border-gray-50 dark:border-gray-800">
                  <div className="space-y-4">
                    <h4 className="text-[10px] font-black uppercase tracking-widest text-text-muted">{t('subscription.features')}</h4>
                    <ul className="space-y-3">
                      {planInfo[currentPlan].features.map(f => (
                        <li key={f} className="flex items-center gap-2 text-sm font-bold">
                          <span className="material-symbols-outlined text-green-500 text-[18px]">check_circle</span> {f}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="space-y-4">
                     <h4 className="text-[10px] font-black uppercase tracking-widest text-text-muted">Actions</h4>
                     <div className="flex flex-col gap-3">
                        <button className="w-full py-3 bg-primary text-black rounded-xl text-xs font-black uppercase tracking-widest hover:scale-[1.02] transition-transform">
                          {currentPlan === PlanTier.PLATINUM_PRIME ? 'Manage Plan' : t('subscription.upgrade')}
                        </button>
                        {currentPlan !== PlanTier.FREE && (
                          <>
                            <button className="w-full py-3 border border-gray-200 dark:border-gray-700 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-gray-50 dark:hover:bg-white/5">Update Payment Method</button>
                            <button className="w-full py-3 text-xs font-black uppercase tracking-widest text-red-500 hover:underline">Cancel Subscription</button>
                          </>
                        )}
                     </div>
                  </div>
                </div>
             </div>
          </section>
        )}
      </div>
    </div>
  );
};
