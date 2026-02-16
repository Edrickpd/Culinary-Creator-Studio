
import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { gemini } from '../services/geminiService';
import { PairingAnalysis as IPairingAnalysis } from '../types';
import { supabase } from '../supabaseClient';
import { useAppContext } from '../AppContext';

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
  const { user, isLoggedIn } = useAppContext();
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
    
    setLoading(true);
    try {
      const { error } = await supabase
        .from('pairings')
        .delete()
        .eq('id', pairingIdToDelete);

      if (error) throw error;
      
      setSavedPairings(prev => prev.filter(p => p.id !== pairingIdToDelete));
      showToast("Analysis deleted permanently", "info");
    } catch (error: any) {
      showToast("Error deleting: " + error.message, "error");
    } finally {
      setLoading(false);
      setShowDeleteConfirm(false);
      setPairingIdToDelete(null);
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

  return (
    <div className="p-4 md:p-8 animate-fade-in relative min-h-screen text-text-main dark:text-white">
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
            <h1 className="text-3xl md:text-5xl font-black tracking-tight uppercase leading-none">Flavor Analysis</h1>
            <p className="text-text-muted text-lg">Molecular compatibility discovered by Gemini AI.</p>
          </div>
          
          <div className="flex flex-wrap gap-3 items-center lg:justify-end">
            <button 
              onClick={() => {
                fetchSavedPairings();
                setShowMyPairingsModal(true);
              }}
              className="h-11 px-4 rounded-lg bg-gray-200 dark:bg-gray-800 text-gray-600 dark:text-gray-300 font-bold text-sm uppercase tracking-widest flex items-center gap-2 hover:bg-gray-300 dark:hover:bg-gray-700 transition-all shadow-sm"
            >
              <span className="material-symbols-outlined text-[18px]">folder_special</span>
              MY PAIRINGS
            </button>
            <button 
              onClick={() => setShowSaveModal(true)}
              disabled={!analysis || loading}
              className="h-11 px-6 rounded-lg bg-primary text-black font-bold text-sm uppercase tracking-widest flex items-center gap-2 hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-primary/20"
            >
              <span className="material-symbols-outlined text-[18px]">cloud_upload</span>
              SAVE TO CLOUD
            </button>
            <button 
              onClick={handleClearForm}
              className="h-11 px-4 rounded-lg border-2 border-red-500 bg-gray-100 dark:bg-gray-900 text-red-500 font-bold text-sm uppercase tracking-widest flex items-center gap-2 hover:bg-red-500 hover:text-white transition-all shadow-sm"
            >
              <span className="material-symbols-outlined text-[18px]">mop</span>
              CLEAN
            </button>
          </div>
        </header>

        <div className="bg-surface-light dark:bg-surface-dark rounded-2xl border border-gray-200 dark:border-gray-700 p-8 shadow-sm">
          <label className="text-xs font-black text-text-muted uppercase tracking-widest mb-4 block">Selected Ingredients</label>
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 p-3 bg-background-light dark:bg-black/20 border border-gray-200 dark:border-gray-700 rounded-xl flex gap-2 flex-wrap items-center min-h-[60px]">
              {ingredients.map(ing => (
                <span key={ing} className="bg-white dark:bg-surface-dark border border-gray-200 dark:border-gray-600 px-3 py-1.5 rounded-lg text-sm font-bold flex items-center gap-2 shadow-sm animate-fade-in">
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
            
            <div className="flex flex-col gap-3 min-w-[200px]">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-black uppercase text-text-muted">Target Language</label>
                <select 
                  value={selectedLanguage}
                  onChange={(e) => setSelectedLanguage(e.target.value)}
                  className="w-full bg-gray-50 dark:bg-black/20 border-none rounded-lg text-xs font-bold py-2 px-3 focus:ring-1 focus:ring-primary dark:text-white"
                >
                  {LANGUAGES.map(l => (
                    <option key={l.code} value={l.code} className="bg-white dark:bg-surface-dark">{l.label}</option>
                  ))}
                </select>
              </div>
              <button 
                onClick={() => runAnalysis(false)}
                disabled={loading || ingredients.length < 2}
                className="bg-primary hover:bg-primary-hover disabled:opacity-50 text-[#111815] font-black py-3 px-6 rounded-xl shadow-lg shadow-primary/20 transition-all flex items-center gap-2 justify-center uppercase text-sm tracking-widest shrink-0"
              >
                {loading ? <span className="material-symbols-outlined animate-spin">sync</span> : <span className="material-symbols-outlined">science</span>}
                {loading ? 'Analyzing...' : 'Quick Analysis'}
              </button>
              <button 
                onClick={() => runAnalysis(true)}
                disabled={loading || ingredients.length < 2}
                className="bg-black text-white hover:bg-gray-900 disabled:opacity-50 font-black py-3 px-6 rounded-xl shadow-lg transition-all flex items-center gap-2 justify-center uppercase text-sm tracking-widest shrink-0 border border-white/10"
              >
                {loading ? <span className="material-symbols-outlined animate-spin">sync</span> : <span className="material-symbols-outlined text-primary">psychology</span>}
                {loading ? 'Thinking...' : 'Deep Analysis'}
              </button>
            </div>
          </div>
        </div>

        {analysis && !loading && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-fade-in">
            {/* Matrix Card */}
            <div className="bg-surface-light dark:bg-surface-dark rounded-2xl border border-gray-200 dark:border-gray-700 p-8 shadow-lg flex flex-col items-center">
              <h3 className="text-sm font-black text-text-muted uppercase tracking-widest mb-8">Compatibility Matrix</h3>
              
              <div className="relative size-48 flex items-center justify-center mb-10">
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
                  <span className="font-black text-6xl tracking-tighter dark:text-white">{analysis.compatibilityScore}%</span>
                  <span className={`text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full mt-2 shadow-sm ${
                    analysis.compatibilityScore > 70 ? 'bg-green-100 text-green-700' : 
                    analysis.compatibilityScore > 40 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'
                  }`}>
                    {analysis.compatibilityScore > 70 ? 'Superior' : analysis.compatibilityScore > 40 ? 'Good' : 'Bold Choice'}
                  </span>
                </div>
              </div>

              {(analysis as any).complexity && (
                <div className="w-full space-y-4 pt-6 border-t border-gray-100 dark:border-gray-800">
                   <div className="flex justify-between items-center">
                      <span className="text-[10px] font-black uppercase tracking-widest text-text-muted">Complexity</span>
                      <span className="text-xs font-black uppercase text-primary">{(analysis as any).complexity}</span>
                   </div>
                   <div className="flex justify-between items-center">
                      <span className="text-[10px] font-black uppercase tracking-widest text-text-muted">Intensity</span>
                      <span className="text-xs font-black uppercase text-primary">{(analysis as any).intensity}</span>
                   </div>
                   <div className="flex flex-col gap-1 mt-2">
                      <span className="text-[10px] font-black uppercase tracking-widest text-text-muted">Weight Ratio (Recommended)</span>
                      <span className="text-xs font-mono font-black text-primary p-2 bg-primary/5 rounded-lg text-center">{(analysis as any).recommendedRatio}</span>
                   </div>
                </div>
              )}
            </div>

            {/* Results */}
            <div className="lg:col-span-2 space-y-8">
              <div className="bg-gradient-to-br from-primary/5 to-white dark:from-primary/10 dark:to-surface-dark rounded-2xl border border-primary/20 p-8 shadow-sm relative">
                <div className="flex items-center justify-between mb-6">
                   <h3 className="text-xl font-black text-text-main dark:text-white flex items-center gap-2 uppercase tracking-tight">
                    <span className="material-symbols-outlined text-primary">auto_awesome</span> 
                    Studio Intelligence ({selectedLanguage})
                  </h3>
                  <button 
                    onClick={handleSpeak}
                    disabled={audioLoading}
                    className="size-10 rounded-full bg-primary/20 text-primary flex items-center justify-center hover:bg-primary/30 transition-all disabled:opacity-50"
                  >
                    <span className={`material-symbols-outlined ${audioLoading ? 'animate-pulse' : ''}`}>volume_up</span>
                  </button>
                </div>
                <p className="text-text-main dark:text-gray-200 text-lg leading-relaxed font-medium">
                  {analysis.detailedExplanation}
                </p>
                
                {analysis.physicochemicalInfo && (
                  <div className="mt-6 p-4 bg-white/50 dark:bg-black/20 rounded-xl border border-primary/10">
                    <h4 className="text-[10px] font-black uppercase text-primary mb-2">Physicochemical Profile</h4>
                    <p className="text-sm leading-relaxed dark:text-gray-300">{analysis.physicochemicalInfo}</p>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
                  {analysis.complementaryIngredients && analysis.complementaryIngredients.length > 0 && (
                    <div className="space-y-2">
                       <h4 className="text-[10px] font-black uppercase text-primary">Flavor Extensions</h4>
                       <div className="flex flex-wrap gap-1.5">
                          {analysis.complementaryIngredients.map(i => <span key={i} className="px-2 py-0.5 bg-primary/10 text-primary text-[9px] font-black rounded uppercase border border-primary/10">{i}</span>)}
                       </div>
                    </div>
                  )}
                  {analysis.tips && analysis.tips.length > 0 && (
                    <div className="space-y-2">
                       <h4 className="text-[10px] font-black uppercase text-primary">Chef's Technique Tips</h4>
                       <ul className="text-[10px] space-y-1.5 dark:text-gray-400 font-bold">
                          {analysis.tips.map((t, idx) => <li key={idx} className="flex gap-2"><span>•</span> {t}</li>)}
                       </ul>
                    </div>
                  )}
                </div>

                <div className="mt-8 pt-8 border-t border-primary/10 flex flex-wrap gap-3">
                  {analysis.flavorProfile.map(tag => (
                    <span key={tag} className="px-4 py-1.5 rounded-full bg-white dark:bg-black/20 text-primary text-xs font-black border border-primary/30 uppercase tracking-widest shadow-sm">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>

              <div className="bg-surface-light dark:bg-surface-dark rounded-2xl border border-gray-200 dark:border-gray-700 p-8 shadow-sm">
                <h3 className="text-sm font-black text-text-muted uppercase tracking-widest mb-6">Suggested Applications</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {analysis.suggestedDishes.map((dish, idx) => (
                    <div key={idx} className="p-4 border border-gray-100 dark:border-gray-800 rounded-xl flex items-center justify-between hover:border-primary/30 transition-all">
                      <div className="flex flex-col">
                        <span className="font-black text-text-main dark:text-white uppercase">{dish.name}</span>
                        <span className="text-[10px] text-text-muted uppercase font-bold">{dish.difficulty}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* --- MODALS --- */}

      {/* SAVE MODAL */}
      {showSaveModal && (
        <div className="fixed inset-0 z-[400] flex items-start justify-center p-4 pt-16 md:pt-24 overflow-y-auto">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-md" onClick={() => setShowSaveModal(false)}></div>
          <div className="relative w-full max-w-md bg-white dark:bg-surface-dark rounded-3xl shadow-2xl overflow-hidden animate-fade-in border border-gray-100 dark:border-gray-800">
            <header className="p-8 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between bg-gray-50 dark:bg-white/5">
              <h3 className="text-2xl font-black uppercase tracking-tight dark:text-white">Save Analysis</h3>
              <button onClick={() => setShowSaveModal(false)} className="material-symbols-outlined text-text-muted hover:text-black dark:hover:text-white">close</button>
            </header>
            <div className="p-8 space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-text-muted">Pairing Name</label>
                <input 
                  value={pairingName}
                  onChange={(e) => setPairingName(e.target.value)}
                  placeholder={ingredients.join(' + ')}
                  className="w-full h-12 bg-gray-50 dark:bg-black/20 border border-gray-100 dark:border-gray-800 rounded-xl px-4 focus:ring-1 focus:ring-primary font-bold text-sm dark:text-white outline-none"
                />
              </div>
              <p className="text-xs text-text-muted font-medium">This will save the molecular analysis, flavor profile, and suggestions to your Studio Cloud library.</p>
            </div>
            <footer className="p-8 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-black/10 flex gap-4">
              <button onClick={() => setShowSaveModal(false)} className="flex-1 py-4 rounded-xl border border-gray-200 dark:border-gray-700 text-xs font-black uppercase tracking-widest hover:bg-white transition-all">Cancel</button>
              <button 
                onClick={handleSavePairing} 
                disabled={loading}
                className="flex-1 py-4 rounded-xl bg-primary text-black text-xs font-black uppercase tracking-widest shadow-lg shadow-primary/20 hover:scale-[1.02] transition-transform flex items-center justify-center gap-2"
              >
                {loading ? <span className="material-symbols-outlined animate-spin text-[18px]">sync</span> : <span className="material-symbols-outlined text-[18px]">check_circle</span>}
                Confirm Save
              </button>
            </footer>
          </div>
        </div>
      )}

      {/* MY PAIRINGS MODAL */}
      {showMyPairingsModal && (
        <div className="fixed inset-0 z-[400] flex items-start justify-center p-4 pt-16 md:pt-24 overflow-y-auto">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-md" onClick={() => setShowMyPairingsModal(false)}></div>
          <div className="relative w-full max-w-2xl bg-white dark:bg-surface-dark rounded-3xl shadow-2xl overflow-hidden animate-fade-in border border-gray-100 dark:border-gray-800 flex flex-col max-h-[85vh]">
            <header className="p-8 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between bg-gray-50 dark:bg-white/5 shrink-0">
              <div className="flex flex-col gap-1">
                <h3 className="text-2xl font-black uppercase tracking-tight dark:text-white">Saved Pairings</h3>
                <p className="text-[10px] font-black uppercase tracking-widest text-primary">{savedPairings.length} analyses synced</p>
              </div>
              <button onClick={() => setShowMyPairingsModal(false)} className="material-symbols-outlined text-text-muted hover:text-black dark:hover:text-white">close</button>
            </header>
            
            <div className="p-8 pb-4 shrink-0">
               <div className="relative">
                 <input 
                  value={pairingSearchTerm}
                  onChange={(e) => setPairingSearchTerm(e.target.value)}
                  placeholder="Search your library..."
                  className="w-full h-11 pl-11 pr-4 bg-gray-50 dark:bg-black/20 border border-gray-100 dark:border-gray-800 rounded-xl focus:ring-1 focus:ring-primary font-bold text-sm dark:text-white outline-none"
                 />
                 <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted text-[20px]">search</span>
               </div>
            </div>

            <div className="flex-1 overflow-y-auto p-8 pt-2 space-y-4">
              {filteredSavedPairings.map(p => (
                <div 
                  key={p.id} 
                  onClick={() => handleLoadPairing(p)}
                  className="p-6 bg-white dark:bg-black/20 border border-gray-100 dark:border-gray-800 rounded-2xl hover:border-primary cursor-pointer group transition-all animate-fade-in flex items-center justify-between gap-6"
                >
                   <div className="flex flex-col gap-1 overflow-hidden">
                      <span className="text-lg font-black uppercase tracking-tight truncate dark:text-white group-hover:text-primary transition-colors">{p.name}</span>
                      <div className="flex flex-wrap gap-2 mt-1">
                        {p.ingredients.map(i => <span key={i} className="text-[9px] font-black uppercase tracking-widest text-text-muted bg-gray-100 dark:bg-white/5 px-2 py-0.5 rounded-lg">{i}</span>)}
                      </div>
                      <span className="text-[9px] font-black uppercase text-text-muted mt-2 opacity-50">Analyzed: {new Date(p.created_at).toLocaleDateString()}</span>
                   </div>
                   <div className="flex items-center gap-2">
                      <div className="size-12 rounded-xl bg-primary/10 flex flex-col items-center justify-center shrink-0 border border-primary/20">
                         <span className="text-xs font-black text-primary leading-none">{p.analysis.compatibilityScore}%</span>
                      </div>
                      <button 
                        onClick={(e) => openDeleteConfirm(p.id, e)}
                        className="size-10 rounded-xl hover:bg-red-500 hover:text-white text-gray-300 transition-all flex items-center justify-center"
                      >
                        <span className="material-symbols-outlined text-[20px]">delete</span>
                      </button>
                   </div>
                </div>
              ))}
              {filteredSavedPairings.length === 0 && (
                <div className="py-12 flex flex-col items-center justify-center text-center opacity-30 gap-4 grayscale">
                   <span className="material-symbols-outlined text-6xl">cloud_off</span>
                   <p className="text-xs font-black uppercase tracking-widest">No matching pairings found.</p>
                </div>
              )}
            </div>
            
            <footer className="p-8 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-black/10 text-center shrink-0">
               <p className="text-[10px] font-black uppercase tracking-widest text-text-muted">Analyses are persistent across devices via Studio Cloud</p>
            </footer>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-[600] flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/80 backdrop-blur-md" onClick={() => setShowDeleteConfirm(false)}></div>
          <div className="relative w-full max-w-sm bg-white dark:bg-surface-dark rounded-3xl shadow-2xl overflow-hidden animate-fade-in border border-red-500/20">
             <div className="p-8 text-center space-y-4">
                <div className="size-16 rounded-full bg-red-500/10 text-red-500 flex items-center justify-center mx-auto mb-2">
                  <span className="material-symbols-outlined text-4xl">warning</span>
                </div>
                <h3 className="text-xl font-black uppercase tracking-tight">Delete Analysis?</h3>
                <p className="text-xs text-text-muted font-medium">This action is permanent and cannot be undone. This analysis will be removed from your cloud library.</p>
             </div>
             <footer className="p-6 bg-gray-50 dark:bg-white/5 flex gap-3 border-t border-gray-100 dark:border-gray-800">
                <button 
                  onClick={() => setShowDeleteConfirm(false)}
                  className="flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest bg-gray-200 dark:bg-gray-800 hover:bg-gray-300 transition-all"
                >
                  Keep It
                </button>
                <button 
                  onClick={confirmDeletion}
                  className="flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest bg-red-500 text-white shadow-lg shadow-red-500/20 hover:bg-red-600 transition-all"
                >
                  Confirm Delete
                </button>
             </footer>
          </div>
        </div>
      )}
    </div>
  );
};
