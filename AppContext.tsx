
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { UserProfile, PlanTier, ClipboardItem, PriceEntry } from './types';
import { translations } from './locales';
import { supabase } from './supabaseClient';

interface AppContextType {
  user: UserProfile | null;
  isLoggedIn: boolean;
  theme: 'light' | 'dark';
  language: string;
  currency: string;
  t: (key: string) => string;
  setLanguage: (lang: string) => void;
  setCurrency: (curr: string) => void;
  toggleTheme: () => void;
  login: (userData: UserProfile) => void;
  logout: () => void;
  updateUser: (data: Partial<UserProfile>) => Promise<void>;
  refreshProfile: () => Promise<void>;
  clipboard: ClipboardItem[];
  setClipboard: React.Dispatch<React.SetStateAction<ClipboardItem[]>>;
  toggleClipboardItem: (entry: PriceEntry, qty?: number) => void;
  updateClipboardQuantity: (id: string, qty: number) => void;
  removeFromClipboard: (id: string) => void;
  duplicateClipboardItem: (id: string) => void;
  clearClipboard: () => void;
  isClipboardExpanded: boolean;
  setIsClipboardExpanded: React.Dispatch<React.SetStateAction<boolean>>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>(
    (localStorage.getItem('theme') as 'light' | 'dark') || 'light'
  );
  const [language, setLanguageState] = useState(
    localStorage.getItem('language') || 'en'
  );
  const [currency, setCurrencyState] = useState(
    localStorage.getItem('currency') || '€'
  );
  const [isClipboardExpanded, setIsClipboardExpanded] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('ccs_clipboard_expanded');
      return saved !== null ? JSON.parse(saved) : true;
    } catch {
      return true;
    }
  });

  const [clipboard, setClipboard] = useState<ClipboardItem[]>(() => {
    try {
      const saved = localStorage.getItem('ccs_clipboard');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('ccs_clipboard_expanded', JSON.stringify(isClipboardExpanded));
    } catch (e) {
      console.error('Failed to save clipboard expanded state', e);
    }
  }, [isClipboardExpanded]);

  useEffect(() => {
    try {
      localStorage.setItem('ccs_clipboard', JSON.stringify(clipboard));
    } catch (e) {
      console.error('Failed to save clipboard to localStorage', e);
    }
  }, [clipboard]);

  const toggleClipboardItem = (entry: PriceEntry, qty: number = 1) => {
    setClipboard(prev => {
      const exists = prev.find(item => item.id === entry.id);
      if (exists) {
        return prev.filter(item => item.id !== entry.id);
      } else {
        return [...prev, { ...entry, quantity: qty > 0 ? qty : 1 }];
      }
    });
  };

  const updateClipboardQuantity = (id: string, qty: number) => {
    setClipboard(prev =>
      prev.map(item =>
        item.id === id ? { ...item, quantity: Math.max(0.01, qty) } : item
      )
    );
  };

  const removeFromClipboard = (id: string) => {
    setClipboard(prev => prev.filter(i => i.id !== id));
  };

  const duplicateClipboardItem = (id: string) => {
    setClipboard(prev => {
      const item = prev.find(i => i.id === id);
      if (!item) return prev;
      const dup: ClipboardItem = {
        ...item,
        id: `dup_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        name: item.name
      };
      return [...prev, dup];
    });
  };

  const clearClipboard = () => {
    setClipboard([]);
  };

  const fetchProfileData = useCallback(async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();
      
      if (error) throw error;
      return data;
    } catch (e) {
      console.error("Profile fetch failed:", e);
      return null;
    }
  }, []);

  const createMissingProfile = useCallback(async (userId: string, meta: any, email: string) => {
    try {
      const payload = {
        id: userId,
        username: meta?.username || email.split('@')[0] || 'chef_' + userId.substring(0, 5),
        full_name: meta?.full_name || 'Chef',
        chef_name: meta?.chef_name || 'Chef Studio',
        tier: meta?.tier || 'free'
      };
      
      const { data, error } = await supabase
        .from('profiles')
        .upsert(payload, { onConflict: 'id' })
        .select()
        .maybeSingle();
        
      if (error) throw error;
      return data;
    } catch (e) {
      console.error("Auto-creation failed:", e);
      return null;
    }
  }, []);

  const syncUserFromSession = useCallback(async (session: any) => {
    if (session?.user) {
      setIsLoggedIn(true);
      const meta = session.user.user_metadata;
      
      const tempUserData: UserProfile = {
        id: session.user.id,
        email: session.user.email || '',
        username: meta?.username || session.user.email?.split('@')[0],
        fullName: meta?.full_name || 'Chef',
        chefName: meta?.chef_name || 'Chef Studio',
        bio: meta?.bio || '',
        avatarUrl: meta?.avatar_url || '',
        tier: (meta?.tier as PlanTier) || PlanTier.FREE,
        isVerified: !!session.user.confirmed_at,
        autoRenew: true
      };
      setUser(tempUserData);

      try {
        let profile = await fetchProfileData(session.user.id);
        if (!profile) {
          profile = await createMissingProfile(session.user.id, meta, session.user.email || '');
        }

        if (profile) {
          setUser({
            ...tempUserData,
            username: profile.username || tempUserData.username,
            fullName: profile.full_name || tempUserData.fullName,
            chefName: profile.chef_name || tempUserData.chefName,
            bio: profile.bio || tempUserData.bio,
            avatarUrl: profile.avatar_url || tempUserData.avatarUrl,
            tier: (profile.tier as PlanTier) || tempUserData.tier,
            subscriptionRenewal: profile.subscription_renewal,
            subscriptionStatus: profile.subscription_status,
            stripeCustomerId: profile.stripe_customer_id,
            quickAnalysesCount: profile.quick_analyses_count || 0,
            deepAnalysesCount: profile.deep_analyses_count || 0
          });
        }
      } catch (e) {
        console.warn("Sync warning: Using metadata defaults.");
      }
    } else {
      setUser(null);
      setIsLoggedIn(false);
    }
  }, [fetchProfileData, createMissingProfile]);

  useEffect(() => {
    // Correct v2 way to get session
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) syncUserFromSession(session);
    };
    checkSession();

    // Correct v2 subscription handling
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        syncUserFromSession(session);
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
        setIsLoggedIn(false);
      }
    });

    applyTheme(theme);
    return () => subscription.unsubscribe();
  }, [syncUserFromSession, theme]);

  const applyTheme = (t: 'light' | 'dark') => {
    if (t === 'dark') {
      document.documentElement.classList.add('dark');
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      document.documentElement.setAttribute('data-theme', 'light');
    }
  };

  const toggleTheme = () => {
    const next = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    localStorage.setItem('theme', next);
    applyTheme(next);
  };

  const setLanguage = (lang: string) => {
    setLanguageState(lang);
    localStorage.setItem('language', lang);
  };

  const setCurrency = (curr: string) => {
    setCurrencyState(curr);
    localStorage.setItem('currency', curr);
  };

  const login = (userData: UserProfile) => {
    setUser(userData);
    setIsLoggedIn(true);
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setIsLoggedIn(false);
  };

  const refreshProfile = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      await syncUserFromSession(session);
    }
  };

  const updateUser = async (data: Partial<UserProfile>) => {
    if (!user) return;

    try {
      const dbPayload: any = {
        updated_at: new Date().toISOString()
      };
      if (data.fullName !== undefined) dbPayload.full_name = data.fullName;
      if (data.chefName !== undefined) dbPayload.chef_name = data.chefName;
      if (data.bio !== undefined) dbPayload.bio = data.bio;
      if (data.avatarUrl !== undefined) dbPayload.avatar_url = data.avatarUrl;

      const { error: dbError } = await supabase
        .from('profiles')
        .update(dbPayload)
        .eq('id', user.id);
      
      if (dbError) throw dbError;

      // Correct v2 method: updateUser instead of update
      const { error: authError } = await supabase.auth.updateUser({
        data: {
          full_name: data.fullName ?? user.fullName,
          chef_name: data.chefName ?? user.chefName,
          avatar_url: data.avatarUrl ?? user.avatarUrl,
          bio: data.bio ?? user.bio
        }
      });

      if (authError) {
        console.warn("Metadata sync warning:", authError.message);
      }

      setUser(prev => prev ? {
        ...prev,
        fullName: data.fullName ?? prev.fullName,
        chefName: data.chefName ?? prev.chefName,
        bio: data.bio ?? prev.bio,
        avatarUrl: data.avatarUrl ?? prev.avatarUrl
      } : null);

    } catch (error) {
      console.error("Critical update error:", error);
      throw error;
    }
  };

  const t = (key: string): string => {
    const keys = key.split('.');
    
    // 1. Try requested language
    let result: any = translations[language];
    let found = true;
    for (const k of keys) {
      if (!result || result[k] === undefined) {
        found = false;
        break;
      }
      result = result[k];
    }
    if (found && typeof result === 'string') return result;

    // 2. Fallback to English
    let fallback: any = translations['en'];
    found = true;
    for (const k of keys) {
      if (!fallback || fallback[k] === undefined) {
        found = false;
        break;
      }
      fallback = fallback[k];
    }
    if (found && typeof fallback === 'string') return fallback;

    // 3. Fallback to key itself
    return key;
  };

  return (
    <AppContext.Provider value={{ 
      user, isLoggedIn, theme, language, currency, t, 
      setLanguage, setCurrency, toggleTheme, login, logout, updateUser, refreshProfile,
      clipboard, setClipboard, toggleClipboardItem, updateClipboardQuantity,
      removeFromClipboard, duplicateClipboardItem, clearClipboard,
      isClipboardExpanded, setIsClipboardExpanded
    }}>
      {children}
    </AppContext.Provider>
  );
};

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useAppContext must be used within AppProvider');
  return context;
};
