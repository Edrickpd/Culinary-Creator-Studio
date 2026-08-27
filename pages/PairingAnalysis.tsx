import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { gemini } from '../services/geminiService';
import { PairingAnalysis as IPairingAnalysis, PlanTier } from '../types';
import { supabase } from '../supabaseClient';
import { useAppContext } from '../AppContext';
import { PlanUpgradeModal } from '../components/PlanUpgradeModal';
import { normalizeTier } from '../services/planLimits';

interface SavedPairing {
  id: string;
  name: string;
  ingredients: string[];
  analysis: IPairingAnalysis;
  created_at: string;
}

const LANGUAGES = [
  { code: 'English', label: 'English' },
  { code: 'Spanish', label: 'Español' },
  { code: 'Catalan', label: 'Català' },
  { code: 'German', label: 'Deutsch' },
  { code: 'Italian', label: 'Italiano' },
  { code: 'French', label: 'Français' },
  { code: 'Portuguese', label: 'Português' },
  { code: 'Japanese', label: '日本語' },
  { code: 'Mandarin', label: '中文 (Mandarin)' },
];

export const PairingAnalysis = () => {
  const { t, user, isLoggedIn, refreshProfile } = useAppContext();
  const [searchParams] = useSearchParams();
  
  // --- CORE STATE ---
  const [ingredients, setIngredients] = useState<string[]>(['Strawberries', 'Basil']);
  const [newIng, setNewIng] = useState('');
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState<IPairingAnalysis | null>(null);
  const [audioLoading, setAudioLoading] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState('English');

  // --- SUPABASE & UI STATE ---
  const [savedPairings, setSavedPairings] = useState<SavedPairing[]>([]);
  const [showMyPairingsModal, setShowMyPairingsModal] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [pairingIdToDelete, setPairingIdToDelete] = useState<string | null>(null);
  const [pairingName, setPairingName] = useState('');
  const [pairingSearchTerm, setPairingSearchTerm] = useState('');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  const currentTier = normalizeTier(user?.tier);
  const isFreePlan = currentTier === PlanTier.FREE;
  const isPrimePlan = currentTier === PlanTier.PRIME;
  const isPlatinumPrime = currentTier === PlanTier.PLATINUM_PRIME;

  const quickCount = user?.quickAnalysesCount || 0;
  const deepCount = user?.deepAnalysesCount || 0;

  // --- FETCH FROM SUPABASE ---
  const fetchSavedPairings = async () => {
    if (!isLoggedIn || !user) return;
    try {
      const { data, error } = await supabase
        .from('pairings')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      if (data) {
        setSavedPairings(data.map(p => ({
          id: p.id,
          name: p.title || p.ingredients.join(' + '),
          ingredients: p.ingredients,
          analysis: p.analysis,
          created_at: p.created_at
        })));
      }
    } catch (error) {
      console.error("Error fetching pairings:", error);
    }
  };

  useEffect(() => {
    if (isLoggedIn) {
      fetchSavedPairings();
      
      const pId = searchParams.get('id');
      if (pId) {
        fetchSpecificPairing(pId);
      }
    }
  }, [isLoggedIn, user, searchParams]);

  const fetchSpecificPairing = async (id: string) => {
    const { data, error } = await supabase.from('pairings').select('*').eq('id', id).single();
    if (data && !error) {
      handleLoadPairing({
        id: data.id,
        name: data.title || data.ingredients.join(' + '),
        ingredients: data.ingredients,
        analysis: data.analysis,
        created_at: data.created_at
      });
    }
  };

  // --- TOAST HELPER ---
  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // --- HANDLERS ---
  const addIngredient = () => {
    const trimmed = newIng.trim();
    if (trimmed && !ingredients.includes(trimmed)) {
      setIngredients([...ingredients, trimmed]);
      setNewIng('');
    }
  };

  const removeIngredient = (ing: string) => {
    setIngredients(ingredients.filter(i => i !== ing));
  };

  const runAnalysis = async (isDeep: boolean = false) => {
    if (isFreePlan) {
      setShowUpgradeModal(true);
      return;
    }

    if (isPrimePlan) {
      if (!isDeep && quickCount >= 10) {
        showToast("You have reached your limit of 10 Quick Analyses for this month on Prime plan.", "error");
        setShowUpgradeModal(true);
        return;
      }
      if (isDeep && deepCount >= 10) {
        showToast("You have reached your limit of 10 Deep Analyses for this month on Prime plan.", "error");
        setShowUpgradeModal(true);
        return;
      }
    }

    if (ingredients.length < 2) {
      showToast("Select at least 2 ingredients", "info");
      return;
    }

    setLoading(true);
    setAnalysis(null); 
    try {
      const result = await gemini.analyzePairing(ingredients, { language: selectedLanguage, isDeep });
      setAnalysis(result);
      showToast(`Analysis complete in ${selectedLanguage}`, "success");

      // Increment usage count if on Prime plan
      if (user && isPrimePlan) {
        const updateField = isDeep ? 'deep_analyses_count' : 'quick_analyses_count';
        const newCount = (isDeep ? deepCount : quickCount) + 1;
        await supabase.from('profiles').update({ [updateField]: newCount }).eq('id', user.id);
        await refreshProfile();
      }
    } catch (e) {
      showToast("Failed to analyze. Check connection.", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleSpeak = async () => {
    if (!analysis) return;
    setAudioLoading(true);
    try {
      const buffer = await gemini.speak(analysis.detailedExplanation);
      if (buffer) {
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const source = audioCtx.createBufferSource();
        source.buffer = buffer;
        source.connect(audioCtx.destination);
        source.start();
      }
    } finally {
      setAudioLoading(false);
    }
  };

  const handleSavePairing = async () => {
    if (!analysis || !user || !isLoggedIn) {
      if (!isLoggedIn) showToast("Log in to save results", "error");
      return;
    }
    
    const title = pairingName.trim() || ingredients.join(' + ');
    
    setLoading(true);
    try {
      const payload = {
        user_id: user.id,
        title: title,
        ingredients: Array.from(ingredients),
        analysis: JSON.parse(JSON.stringify(analysis))
      };

      const { error } = await supabase
        .from('pairings')
        .insert([payload]);

      if (error) throw error;

      showToast(`Pairing "${title}" saved successfully!`);
      setShowSaveModal(false);
      setPairingName('');
      await fetchSavedPairings();
    } catch (error: any) {
      showToast(error.message || "Failed to save pairing", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleClearForm = () => {
    setIngredients([]);
    setAnalysis(null);
    setNewIng('');
    setLoading(false);
    showToast("Workspace cleaned", "info");
  };

  const openDeleteConfirm = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setPairingIdToDelete(id);
    setShowDeleteConfirm(true);
  };

  const confirmDeletion = async () => {
    if (!pairingIdToDelete) return;
    try {
      const { error } = await supabase
        .from('pairings')
        .delete()
        .eq('id', pairingIdToDelete);

      if (error) throw error;

      showToast("Pairing analysis deleted successfully");
      setShowDeleteConfirm(false);
      setPairingIdToDelete(null);
      await fetchSavedPairings();
    } catch (e: any) {
      showToast("Failed to delete analysis", "error");
    }
  };

  const handleLoadPairing = (p: SavedPairing) => {
    setIngredients(p.ingredients);
    setAnalysis(p.analysis);
    setShowMyPairingsModal(false);
    showToast(`Loaded "${p.name}"`);
  };

  const filteredSavedPairings = savedPairings.filter(p => 
    p.name.toLowerCase().includes(pairingSearchTerm.toLowerCase()) ||
    p.ingredients.some(i => i.toLowerCase().includes(pairingSearchTerm.toLowerCase()))
  );

  // If user is on Free plan, show locked state banner with CTA
  if (isFreePlan) {
    return (
      <div className="p-4 md:p-8 lg:p-12 animate-fade-in max-w-5xl mx-auto space-y-8">
        <PlanUpgradeModal
          isOpen={showUpgradeModal}
          onClose={() => setShowUpgradeModal(false)}
          title="Unlock Pairing Analysis"
          description="Molecular flavor compatibility analysis is available for Prime (9€) and Platinum Prime (25€) plans, or via beta promotional codes."
          requiredTier={PlanTier.PRIME}
        />

        <header className="space-y-2">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl md:text-5xl font-black uppercase tracking-tight">Flavor & Pairing Analysis</h1>
            <span className="px-3 py-1 bg-amber-500/10 text-amber-500 rounded-full text-xs font-black uppercase tracking-widest flex items-center gap-1">
              <span className="material-symbols-outlined text-sm">lock</span> Prime & Platinum
            </span>
          </div>
          <p className="text-text-muted text-lg">Molecular compatibility and aromatic synergy powered by AI.</p>
        </header>

        <div className="bg-white dark:bg-surface-dark border border-gray-200 dark:border-gray-800 rounded-3xl p-8 md:p-12 shadow-xl text-center space-y-6 max-w-2xl mx-auto">
          <div className="size-20 rounded-3xl bg-primary/10 text-primary flex items-center justify-center mx-auto shadow-inner">
            <span className="material-symbols-outlined text-4xl">science</span>
          </div>
          <div className="space-y-2">
            <h3 className="text-2xl font-black uppercase tracking-tight">Molecular Pairing Intelligence</h3>
            <p className="text-sm text-text-muted leading-relaxed font-medium">
              Access AI-driven flavor chemistry matrices, aromatic overlap indicators, physicochemical compounds, and culinary synergy scores.
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-gray-50 dark:bg-white/5 border border-gray-100 dark:border-gray-800 text-left text-xs font-bold space-y-2 max-w-md mx-auto">
            <div className="flex items-center justify-between text-text-muted">
              <span>Prime (9€/mo):</span>
              <span className="text-primary font-black">10 Quick & 10 Deep Analyses / mo</span>
            </div>
            <div className="flex items-center justify-between text-text-muted">
              <span>Platinum Prime (25€/mo):</span>
              <span className="text-primary font-black">Unlimited Molecular Analyses</span>
            </div>
          </div>

          <div className="pt-4 flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={() => setShowUpgradeModal(true)}
              className="px-8 py-3.5 bg-primary text-black rounded-xl text-xs font-black uppercase tracking-widest hover:bg-primary-hover shadow-lg shadow-primary/25 transition-all"
            >
              Unlock with Prime or Promo Code
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 lg:p-12 animate-fade-in relative min-h-screen">
      <PlanUpgradeModal
        isOpen={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
        title="Upgrade Flavor Intelligence"
        description="You have reached the monthly limit for your current plan. Upgrade to Platinum Prime for unlimited analyses or enter a beta promotional code."
        requiredTier={PlanTier.PLATINUM_PRIME}
      />

      {/* TOAST NOTIFICATION */}
      {toast && (
        <div className={`fixed bottom-8 left-1/2 -translate-x-1/2 z-[500] px-6 py-3 rounded-xl shadow-2xl font-black uppercase tracking-widest text-xs flex items-center gap-3 animate-fade-in ${
          toast.type === 'success' ? 'bg-green-600 text-white' : 
          toast.type === 'error' ? 'bg-red-600 text-white' : 'bg-gray-800 text-white'
        }`}>
          <span className="material-symbols-outlined text-[18px]">
            {toast.type === 'success' ? 'check_circle' : toast.type === 'error' ? 'error' : 'info'}
          </span>
          {toast.message}
        </div>
      )}

      <div className="max-w-6xl mx-auto space-y-8">
        <header className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-3">
              <h1 className="text-3xl md:text-5xl font-black tracking-tight uppercase leading-none">
                {t('pairingAnalysis.title') || "Flavor Analysis"}
              </h1>
              {isPrimePlan && (
                <div className="flex gap-2">
                  <span className="px-2.5 py-1 rounded-full bg-primary/20 text-primary text-[10px] font-black uppercase">
                    Quick: {quickCount}/10
                  </span>
                  <span className="px-2.5 py-1 rounded-full bg-black/40 text-text-muted text-[10px] font-black uppercase">
                    Deep: {deepCount}/10
                  </span>
                </div>
              )}
              {isPlatinumPrime && (
                <span className="px-3 py-1 rounded-full bg-primary text-black text-[10px] font-black uppercase tracking-wider">
                  Unlimited
                </span>
              )}
            </div>
            <p className="text-text-muted text-lg">
              {t('pairingAnalysis.subtitle') || "Molecular compatibility discovered by Gemini AI."}
            </p>
          </div>
          
          <div className="flex flex-wrap gap-3 items-center lg:justify-end">
            <button 
              onClick={() => {
                fetchSavedPairings();
                setShowMyPairingsModal(true);
              }}
              className="h-11 px-4 rounded-xl bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-200 font-bold text-xs uppercase tracking-widest flex items-center gap-2 hover:bg-gray-300 dark:hover:bg-gray-700 transition-all shadow-sm"
            >
              <span className="material-symbols-outlined text-[18px]">folder_special</span>
              My Library
            </button>
            <button 
              onClick={() => setShowSaveModal(true)}
              disabled={!analysis || loading}
              className="h-11 px-5 rounded-xl bg-primary text-black font-black text-xs uppercase tracking-widest flex items-center gap-2 hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-primary/20"
            >
              <span className="material-symbols-outlined text-[18px]">cloud_upload</span>
              Save to Cloud
            </button>
            <button 
              onClick={handleClearForm}
              className="h-11 px-4 rounded-xl border border-red-500/50 bg-red-500/5 text-red-500 font-bold text-xs uppercase tracking-widest flex items-center gap-2 hover:bg-red-500 hover:text-white transition-all shadow-sm"
            >
              <span className="material-symbols-outlined text-[18px]">mop</span>
              Clean
            </button>
          </div>
        </header>

        <div className="bg-surface-light dark:bg-surface-dark rounded-3xl border border-gray-200 dark:border-gray-800 p-6 md:p-8 shadow-sm">
          <label className="text-xs font-black text-text-muted uppercase tracking-widest mb-4 block">
            Selected Ingredients
          </label>
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 p-3 bg-background-light dark:bg-black/20 border border-gray-200 dark:border-gray-700 rounded-2xl flex gap-2 flex-wrap items-center min-h-[60px]">
              {ingredients.map(ing => (
                <span key={ing} className="bg-white dark:bg-surface-dark border border-gray-200 dark:border-gray-600 px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-2 shadow-sm animate-fade-in">
                  {ing} 
                  <button onClick={() => removeIngredient(ing)} className="hover:text-red-500 transition-colors">
                    <span className="material-symbols-outlined text-[16px]">close</span>
                  </button>
                </span>
              ))}
              <input 
                value={newIng}
                onChange={(e) => setNewIng(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addIngredient()}
                placeholder="Type ingredient and press Enter..." 
                className="bg-transparent border-none focus:ring-0 text-sm flex-1 min-w-[200px] outline-none dark:text-white"
              />
            </div>
            
            <div className="flex flex-col gap-3 min-w-[220px]">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-black uppercase text-text-muted">
                  Target Language
                </label>
                <select 
                  value={selectedLanguage}
                  onChange={(e) => setSelectedLanguage(e.target.value)}
                  className="w-full bg-gray-50 dark:bg-black/20 border-none rounded-xl text-xs font-bold py-2.5 px-3 focus:ring-1 focus:ring-primary dark:text-white"
                >
                  {LANGUAGES.map(l => (
                    <option key={l.code} value={l.code} className="bg-white dark:bg-surface-dark">{l.label}</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2">
                <button 
                  onClick={() => runAnalysis(false)}
                  disabled={loading || ingredients.length < 2}
                  className="flex-1 bg-primary hover:bg-primary-hover disabled:opacity-50 text-black font-black py-3 px-4 rounded-xl shadow-lg shadow-primary/20 transition-all flex items-center gap-2 justify-center uppercase text-xs tracking-wider"
                >
                  {loading ? <span className="material-symbols-outlined animate-spin text-sm">sync</span> : <span className="material-symbols-outlined text-sm">science</span>}
                  Quick Analysis
                </button>
                <button 
                  onClick={() => runAnalysis(true)}
                  disabled={loading || ingredients.length < 2}
                  className="flex-1 bg-black text-white hover:bg-gray-900 disabled:opacity-50 font-black py-3 px-4 rounded-xl shadow-lg transition-all flex items-center gap-2 justify-center uppercase text-xs tracking-wider border border-white/10"
                >
                  {loading ? <span className="material-symbols-outlined animate-spin text-sm">sync</span> : <span className="material-symbols-outlined text-primary text-sm">psychology</span>}
                  Deep Analysis
                </button>
              </div>
            </div>
          </div>
        </div>

        {analysis && !loading && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-fade-in">
            {/* Matrix Card */}
            <div className="bg-surface-light dark:bg-surface-dark rounded-3xl border border-gray-200 dark:border-gray-800 p-8 shadow-lg flex flex-col items-center">
              <h3 className="text-xs font-black text-text-muted uppercase tracking-widest mb-8">
                Compatibility Matrix
              </h3>
              
              <div className="relative size-48 flex items-center justify-center mb-8">
                <svg className="size-full -rotate-90" viewBox="0 0 36 36">
                  <path className="text-gray-100 dark:text-gray-800" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" strokeWidth="2.5"></path>
                  <path 
                    className={`transition-all duration-1000 ease-out ${analysis.compatibilityScore > 70 ? 'text-primary' : analysis.compatibilityScore > 40 ? 'text-amber-500' : 'text-red-500'}`}
                    style={{ strokeDasharray: `${analysis.compatibilityScore}, 100` }}
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" 
                    fill="none" 
                    stroke="currentColor" 
                    strokeWidth="2.5" 
                    strokeLinecap="round"
                  ></path>
                </svg>
                <div className="absolute flex flex-col items-center">
                  <span className="font-black text-5xl tracking-tighter dark:text-white">{analysis.compatibilityScore}%</span>
                  <span className={`text-[10px] font-black uppercase tracking-widest px-3 py-0.5 rounded-full mt-2 shadow-sm ${
                    analysis.compatibilityScore > 70 ? 'bg-green-100 text-green-700' : 
                    analysis.compatibilityScore > 40 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'
                  }`}>
                    {analysis.compatibilityScore > 70 ? 'Superior' : analysis.compatibilityScore > 40 ? 'Good' : 'Bold Choice'}
                  </span>
                </div>
              </div>

              <div className="w-full space-y-4 pt-6 border-t border-gray-100 dark:border-gray-800 text-xs">
                <div className="flex justify-between">
                  <span className="text-text-muted uppercase font-bold">Complexity</span>
                  <span className="font-black dark:text-white">{analysis.complexity || 'Intermediate'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-muted uppercase font-bold">Intensity</span>
                  <span className="font-black dark:text-white">{analysis.intensity || 'High'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-muted uppercase font-bold">Ratio</span>
                  <span className="font-black text-primary">{analysis.recommendedRatio || '1:1'}</span>
                </div>
              </div>
            </div>

            {/* Detailed Report */}
            <div className="lg:col-span-2 space-y-6">
              <div className="bg-surface-light dark:bg-surface-dark rounded-3xl border border-gray-200 dark:border-gray-800 p-8 shadow-lg space-y-6">
                <div className="flex justify-between items-start">
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-widest text-primary">Molecular Breakdown</span>
                    <h2 className="text-2xl font-black uppercase tracking-tight dark:text-white mt-1">Flavor Chemistry</h2>
                  </div>
                  <button
                    onClick={handleSpeak}
                    disabled={audioLoading}
                    className="p-3 rounded-2xl bg-gray-100 dark:bg-white/5 hover:bg-primary hover:text-black transition-all"
                  >
                    <span className={`material-symbols-outlined ${audioLoading ? 'animate-spin' : ''}`}>
                      {audioLoading ? 'sync' : 'volume_up'}
                    </span>
                  </button>
                </div>

                <p className="text-sm leading-relaxed text-text-main dark:text-gray-200 font-medium">
                  {analysis.detailedExplanation}
                </p>

                {analysis.flavorProfile && analysis.flavorProfile.length > 0 && (
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-text-muted">Aromatic Notes</label>
                    <div className="flex flex-wrap gap-2">
                      {analysis.flavorProfile.map((note, idx) => (
                        <span key={idx} className="px-3 py-1 bg-primary/10 border border-primary/20 rounded-full text-xs font-bold text-primary">
                          {note}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Suggestions */}
              {analysis.suggestedDishes && analysis.suggestedDishes.length > 0 && (
                <div className="bg-surface-light dark:bg-surface-dark rounded-3xl border border-gray-200 dark:border-gray-800 p-6 shadow-sm space-y-4">
                  <h3 className="text-xs font-black uppercase tracking-widest text-text-muted">Suggested Culinary Applications</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {analysis.suggestedDishes.map((dish, i) => (
                      <div key={i} className="p-4 rounded-2xl bg-gray-50 dark:bg-white/5 border border-gray-100 dark:border-gray-800 flex items-center justify-between">
                        <span className="font-bold text-xs uppercase dark:text-white">{dish.name}</span>
                        <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-primary/20 text-primary">
                          {dish.difficulty}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* MY PAIRINGS MODAL */}
      {showMyPairingsModal && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/80 backdrop-blur-md" onClick={() => setShowMyPairingsModal(false)}></div>
          <div className="relative w-full max-w-2xl bg-white dark:bg-surface-dark rounded-3xl shadow-2xl overflow-hidden animate-fade-in border border-gray-200 dark:border-gray-700 flex flex-col max-h-[85vh]">
            <header className="p-6 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center">
              <div>
                <h2 className="text-xl font-black uppercase tracking-tight">My Saved Pairings</h2>
                <p className="text-xs text-text-muted">Select an analysis to reload it onto your canvas.</p>
              </div>
              <button onClick={() => setShowMyPairingsModal(false)} className="material-symbols-outlined text-text-muted">
                close
              </button>
            </header>

            <div className="p-4 border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-black/20">
              <input
                type="text"
                placeholder="Search saved analyses..."
                value={pairingSearchTerm}
                onChange={(e) => setPairingSearchTerm(e.target.value)}
                className="w-full h-10 px-4 rounded-xl bg-white dark:bg-surface-dark border border-gray-200 dark:border-gray-700 text-xs font-bold outline-none focus:border-primary"
              />
            </div>

            <div className="p-6 overflow-y-auto space-y-3 flex-1">
              {filteredSavedPairings.map(p => (
                <div
                  key={p.id}
                  onClick={() => handleLoadPairing(p)}
                  className="p-4 rounded-2xl bg-gray-50 dark:bg-white/5 border border-gray-100 dark:border-gray-800 hover:border-primary cursor-pointer transition-all flex items-center justify-between group"
                >
                  <div className="space-y-1">
                    <h4 className="font-black text-sm uppercase dark:text-white group-hover:text-primary transition-colors">{p.name}</h4>
                    <p className="text-xs text-text-muted">{p.ingredients.join(', ')}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="px-2.5 py-1 rounded-full bg-primary/10 text-primary font-black text-xs">
                      {p.analysis.compatibilityScore}%
                    </span>
                    <button
                      onClick={(e) => openDeleteConfirm(p.id, e)}
                      className="text-text-muted hover:text-red-500 transition-colors p-1"
                    >
                      <span className="material-symbols-outlined text-lg">delete</span>
                    </button>
                  </div>
                </div>
              ))}
              {filteredSavedPairings.length === 0 && (
                <div className="py-12 text-center text-text-muted text-xs font-bold uppercase">
                  No saved pairings found.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* SAVE MODAL */}
      {showSaveModal && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/80 backdrop-blur-md" onClick={() => setShowSaveModal(false)}></div>
          <div className="relative w-full max-w-md bg-white dark:bg-surface-dark rounded-3xl p-6 md:p-8 shadow-2xl space-y-6 border border-gray-100 dark:border-gray-800">
            <h3 className="text-xl font-black uppercase">Save Analysis to Cloud</h3>
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase text-text-muted">Pairing Name</label>
              <input
                type="text"
                placeholder={ingredients.join(' + ')}
                value={pairingName}
                onChange={(e) => setPairingName(e.target.value)}
                className="w-full h-12 px-4 rounded-xl bg-gray-50 dark:bg-black/20 border border-gray-200 dark:border-gray-700 text-sm font-bold outline-none focus:border-primary"
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowSaveModal(false)}
                className="flex-1 py-3 bg-gray-100 dark:bg-white/5 rounded-xl text-xs font-black uppercase"
              >
                Cancel
              </button>
              <button
                onClick={handleSavePairing}
                disabled={loading}
                className="flex-1 py-3 bg-primary text-black rounded-xl text-xs font-black uppercase hover:bg-primary-hover shadow-lg shadow-primary/20"
              >
                {loading ? 'Saving...' : 'Save to Cloud'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DELETE CONFIRM */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-[600] flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/80 backdrop-blur-md" onClick={() => setShowDeleteConfirm(false)}></div>
          <div className="relative w-full max-w-sm bg-white dark:bg-surface-dark rounded-3xl p-6 text-center space-y-4 border border-red-500/20 shadow-2xl">
            <div className="size-14 rounded-2xl bg-red-500/10 text-red-500 flex items-center justify-center mx-auto">
              <span className="material-symbols-outlined text-3xl">warning</span>
            </div>
            <h3 className="text-lg font-black uppercase">Delete Pairing?</h3>
            <p className="text-xs text-text-muted">This analysis will be permanently deleted from your cloud account.</p>
            <div className="flex gap-3 pt-2">
              <button onClick={() => setShowDeleteConfirm(false)} className="flex-1 py-2.5 bg-gray-100 dark:bg-white/5 rounded-xl text-xs font-bold">Keep</button>
              <button onClick={confirmDeletion} className="flex-1 py-2.5 bg-red-500 text-white rounded-xl text-xs font-black uppercase">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
