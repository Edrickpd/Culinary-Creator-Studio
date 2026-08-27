import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { PrepStep, ChefNote, Attachment, IngredientSubdivision, ChefNoteType } from '../types';
import { supabase } from '../supabaseClient';
import { useAppContext } from '../AppContext';

const NOTE_COLORS: Record<ChefNoteType, string> = {
  tip: 'bg-blue-500',
  suggestion: 'bg-green-500',
  alternative: 'bg-amber-500',
  substitute: 'bg-purple-500',
  variation: 'bg-gray-500'
};

const NOTE_HEX: Record<ChefNoteType, string> = {
  tip: '#3b82f6',
  suggestion: '#22c55e',
  alternative: '#f59e0b',
  substitute: '#a855f7',
  variation: '#6b7280'
};

const getInitialCreateDishDraft = () => {
  try {
    const raw = sessionStorage.getItem('ccs_active_create_dish_draft');
    if (raw) return JSON.parse(raw);
  } catch (_) {}
  return null;
};

export const CreateDish = () => {
  const { t, user, isLoggedIn } = useAppContext();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const initialDraft = useMemo(() => getInitialCreateDishDraft(), []);

  const [activeTab, setActiveTab] = useState<string>(() => initialDraft?.activeTab ?? 'info');
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<string | null>(() => initialDraft?.lastSaved ?? null);
  const [showToast, setShowToast] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const [isShared, setIsShared] = useState<boolean>(() => !!initialDraft?.isShared);

  // IDs and Modals
  const [currentRecipeId, setCurrentRecipeId] = useState<string | null>(() => initialDraft?.currentRecipeId ?? null);
  const [showMyRecipes, setShowMyRecipes] = useState(false);
  const [userRecipes, setUserRecipes] = useState<any[]>([]);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);

  // Form State
  const [title, setTitle] = useState<string>(() => initialDraft?.title ?? '');
  const [difficulty, setDifficulty] = useState<string>(() => initialDraft?.difficulty ?? 'Beginner');
  const [prepTime, setPrepTime] = useState<number>(() => Number(initialDraft?.prepTime) || 45);
  const [prepTimeUnit, setPrepTimeUnit] = useState<'mins' | 'hours'>(() => initialDraft?.prepTimeUnit ?? 'mins');
  const [servings, setServings] = useState<number>(() => Number(initialDraft?.servings) || 4);
  const [description, setDescription] = useState<string>(() => initialDraft?.description ?? '');
  const [subdivisions, setSubdivisions] = useState<IngredientSubdivision[]>(() => Array.isArray(initialDraft?.subdivisions) ? initialDraft.subdivisions : [
    { id: 'sub-1', title: 'Main Ingredients', items: [{ id: 'ing-1', name: '', quantity: '', unit: 'kg' }] }
  ]);
  const [steps, setSteps] = useState<string[]>(() => Array.isArray(initialDraft?.steps) ? initialDraft.steps : ['']);
  const [images, setImages] = useState<string[]>(() => Array.isArray(initialDraft?.images) ? initialDraft.images : []);
  const [notes, setNotes] = useState<ChefNote[]>(() => Array.isArray(initialDraft?.notes) ? initialDraft.notes : []);
  const [newNoteContent, setNewNoteContent] = useState('');
  const [newNoteType, setNewNoteType] = useState<ChefNoteType>('tip');
  const [attachments, setAttachments] = useState<Attachment[]>(() => Array.isArray(initialDraft?.attachments) ? initialDraft.attachments : []);
  
  // Attachments Picker State
  const [showAttachmentPicker, setShowAttachmentPicker] = useState<'pairing' | 'foodCost' | null>(null);
  const [userPairings, setUserPairings] = useState<any[]>([]);
  const [userFoodCosts, setUserFoodCosts] = useState<any[]>([]);
  const [attachmentSearchTerm, setAttachmentSearchTerm] = useState('');
  const [loadingAttachments, setLoadingAttachments] = useState(false);

  const lastLoadedRecipeIdRef = useRef<string | null>(initialDraft?.currentRecipeId ?? null);

  // Trigger toast
  const triggerToast = (msg: string) => {
    setToastMsg(msg);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 2500);
  };

  // Fetch initial data & load from URL if query param is set
  useEffect(() => {
    if (isLoggedIn && user) {
      fetchUserRecipes();
      fetchPairings();
      fetchFoodCosts();
      
      const recipeId = searchParams.get('id');
      if (recipeId && recipeId !== lastLoadedRecipeIdRef.current) {
        lastLoadedRecipeIdRef.current = recipeId;
        fetchSpecificRecipe(recipeId);
      }
    }
  }, [isLoggedIn, user, searchParams]);

  // Sync ongoing canvas state to session storage
  useEffect(() => {
    try {
      const stateToPersist = {
        currentRecipeId,
        title,
        difficulty,
        prepTime,
        prepTimeUnit,
        servings,
        description,
        subdivisions,
        steps,
        images,
        notes,
        attachments,
        activeTab,
        isShared,
        lastSaved
      };
      sessionStorage.setItem('ccs_active_create_dish_draft', JSON.stringify(stateToPersist));
    } catch (_) {}
  }, [currentRecipeId, title, difficulty, prepTime, prepTimeUnit, servings, description, subdivisions, steps, images, notes, attachments, activeTab, isShared, lastSaved]);

  useEffect(() => {
    if (currentRecipeId && user) {
      checkSharedStatus(currentRecipeId);
    } else {
      setIsShared(false);
    }
  }, [currentRecipeId, user]);

  const checkSharedStatus = async (id: string) => {
    try {
      const { data } = await supabase.from('social_posts').select('id').eq('recipe_id', id).maybeSingle();
      setIsShared(!!data);
    } catch (_) {
      setIsShared(false);
    }
  };

  const fetchSpecificRecipe = async (id: string) => {
    if (!user) return;
    try {
      const { data, error } = await supabase.from('recipes').select('*').eq('id', id).eq('user_id', user.id).single();
      if (data && !error) {
        loadRecipe(data);
      }
    } catch (e) {
      console.error('Error loading specific recipe:', e);
    }
  };

  const fetchUserRecipes = async () => {
    if (!user) return;
    try {
      const { data } = await supabase.from('recipes').select('*').eq('user_id', user.id).order('updated_at', { ascending: false });
      if (data) setUserRecipes(data);
    } catch (e) {
      console.error('Error fetching recipes:', e);
    }
  };

  const fetchPairings = async () => {
    if (!user) return;
    setLoadingAttachments(true);
    try {
      const { data, error } = await supabase.from('pairings').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
      if (!error && data) {
        setUserPairings(data);
      } else {
        const res = await supabase.from('pairings').select('*').eq('user_id', user.id);
        if (res.data) setUserPairings(res.data);
      }
    } catch (e) {
      console.error('Error fetching pairings:', e);
    } finally {
      setLoadingAttachments(false);
    }
  };

  const fetchFoodCosts = async () => {
    if (!user) return;
    setLoadingAttachments(true);
    try {
      const { data, error } = await supabase.from('food_costs').select('*').eq('user_id', user.id).order('updated_at', { ascending: false });
      if (!error && data) {
        setUserFoodCosts(data);
      } else {
        const res = await supabase.from('food_costs').select('*').eq('user_id', user.id);
        if (res.data) setUserFoodCosts(res.data);
      }
    } catch (e) {
      console.error('Error fetching food costs:', e);
    } finally {
      setLoadingAttachments(false);
    }
  };

  const handleNewRecipe = () => {
    try {
      sessionStorage.removeItem('ccs_active_create_dish_draft');
      window.history.replaceState(null, '', '/create-dish');
    } catch (_) {}
    lastLoadedRecipeIdRef.current = null;
    setCurrentRecipeId(null);
    setTitle('');
    setDifficulty('Beginner');
    setPrepTime(45);
    setPrepTimeUnit('mins');
    setServings(4);
    setDescription('');
    setSubdivisions([{ id: 'sub-1', title: 'Main Ingredients', items: [{ id: 'ing-1', name: '', quantity: '', unit: 'kg' }] }]);
    setSteps(['']);
    setImages([]);
    setNotes([]);
    setAttachments([]);
    setLastSaved(null);
    setIsShared(false);
    setActiveTab('info');
    triggerToast(t('createDish.newCanvas') || 'New canvas ready');
  };

  const loadRecipe = (recipe: any) => {
    lastLoadedRecipeIdRef.current = recipe.id;
    setCurrentRecipeId(recipe.id);
    setTitle(recipe.title || recipe.name || '');
    setDifficulty(recipe.difficulty || 'Beginner');
    setDescription(recipe.description || '');
    setServings(recipe.servings || 4);
    const totalMins = recipe.prep_time || 0;
    if (totalMins >= 60 && totalMins % 60 === 0) {
      setPrepTime(totalMins / 60);
      setPrepTimeUnit('hours');
    } else {
      setPrepTime(totalMins);
      setPrepTimeUnit('mins');
    }
    const loadedSubs = recipe.ingredients || [{ id: 'sub-1', title: 'Main Ingredients', items: [] }];
    const loadedSteps = recipe.prep_steps || [''];
    const loadedImages = recipe.images || [];
    const loadedNotes = recipe.chef_notes || [];
    const loadedAttachments = recipe.attachments || [];

    setSubdivisions(loadedSubs);
    setSteps(loadedSteps);
    setImages(loadedImages);
    setNotes(loadedNotes);
    setAttachments(loadedAttachments);
    setShowMyRecipes(false);
    const savedTime = new Date(recipe.updated_at || Date.now()).toLocaleTimeString();
    setLastSaved(savedTime);

    try {
      sessionStorage.setItem('ccs_active_create_dish_draft', JSON.stringify({
        currentRecipeId: recipe.id,
        title: recipe.title || recipe.name || '',
        difficulty: recipe.difficulty || 'Beginner',
        prepTime: totalMins,
        prepTimeUnit: 'mins',
        servings: recipe.servings || 4,
        description: recipe.description || '',
        subdivisions: loadedSubs,
        steps: loadedSteps,
        images: loadedImages,
        notes: loadedNotes,
        attachments: loadedAttachments,
        activeTab: 'info',
        isShared: false,
        lastSaved: savedTime
      }));
    } catch (_) {}

    triggerToast(`${t('common.loaded') || 'Loaded'}: ${recipe.title || recipe.name}`);
  };

  const handleManualSave = async () => {
    if (!isLoggedIn || !user) {
      triggerToast("Please sign in to save to Cloud.");
      return;
    }
    if (!title.trim()) {
      triggerToast(t('createDish.namePlaceholder') || "Please enter a masterpiece name.");
      return;
    }

    setSaving(true);
    try {
      const payload: any = {
        title: title.trim(),
        name: title.trim(),
        description,
        difficulty,
        prep_time: prepTimeUnit === 'hours' ? prepTime * 60 : prepTime,
        servings,
        ingredients: subdivisions,
        prep_steps: steps,
        images,
        chef_notes: notes,
        attachments: attachments,
        is_draft: true,
        user_id: user.id,
        updated_at: new Date().toISOString()
      };

      let result;
      if (currentRecipeId) {
        result = await supabase.from('recipes').update(payload).eq('id', currentRecipeId).eq('user_id', user.id).select().single();
      } else {
        result = await supabase.from('recipes').insert([payload]).select().single();
      }

      if (result.error) throw result.error;
      if (result.data) {
        setCurrentRecipeId(result.data.id);
        lastLoadedRecipeIdRef.current = result.data.id;
        const formattedTime = new Date().toLocaleTimeString();
        setLastSaved(formattedTime);
        triggerToast(`${t('createDish.cloudSaved') || 'Cloud saved'} (${formattedTime})`);
        fetchUserRecipes();
      }
    } catch (error: any) {
      triggerToast("Save failed: " + error.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleShare = async () => {
    if (!isLoggedIn || !user || !currentRecipeId) return;
    setSaving(true);
    try {
      if (isShared) {
        await supabase.from('social_posts').delete().match({ recipe_id: currentRecipeId, user_id: user.id });
        setIsShared(false);
        triggerToast(t('createDish.stopSharing') || 'Masterpiece is now Private');
      } else {
        await handleManualSave();
        await supabase.from('social_posts').insert({
          user_id: user.id,
          recipe_id: currentRecipeId,
          title: title,
          description: description,
          image_url: images[0] || 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&q=80&w=1600',
          difficulty: difficulty
        });
        setIsShared(true);
        triggerToast(t('createDish.share') || 'Masterpiece Shared with Community!');
      }
    } catch (err: any) {
      triggerToast("Action failed: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const deleteRecipe = async (id: string) => {
    setSaving(true);
    try {
      await supabase.from('social_posts').delete().eq('recipe_id', id);
      await supabase.from('shared_items').delete().eq('item_id', id);
      await supabase.from('recipes').delete().eq('id', id).eq('user_id', user?.id);
      setUserRecipes(prev => prev.filter(r => r.id !== id));
      if (currentRecipeId === id) handleNewRecipe();
      setShowDeleteConfirm(null);
      triggerToast(t('createDish.recipesModal.destroyTitle') || 'Recipe deleted');
    } catch (err: any) { 
      triggerToast("Delete failed: " + err.message); 
    } finally { 
      setSaving(false); 
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setSaving(true);
    try {
      const filePath = `avatars/${user.id}/${Date.now()}_${file.name}`;
      const { error: uploadError } = await supabase.storage.from('dish-images').upload(filePath, file);
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage.from('dish-images').getPublicUrl(filePath);
      setImages(prev => [...prev, publicUrl]);
      triggerToast('Photo uploaded');
    } catch (err: any) { 
      triggerToast("Upload error: " + err.message); 
    } finally { 
      setSaving(false); 
    }
  };

  const addSubdivision = () => setSubdivisions([...subdivisions, { id: `sub-${Date.now()}`, title: 'New Component', items: [{ id: `ing-${Date.now()}`, name: '', quantity: '', unit: 'kg' }] }]);
  const addIngredientToSub = (subId: string) => setSubdivisions(subdivisions.map(s => s.id === subId ? { ...s, items: [...s.items, { id: `ing-${Date.now()}`, name: '', quantity: '', unit: 'kg' }] } : s));
  const updateIngredient = (subId: string, ingId: string, updates: any) => setSubdivisions(subdivisions.map(s => s.id === subId ? { ...s, items: s.items.map(i => i.id === ingId ? { ...i, ...updates } : i) } : s));
  const removeIngredient = (subId: string, ingId: string) => setSubdivisions(subdivisions.map(s => s.id === subId ? { ...s, items: s.items.filter(i => i.id !== ingId) } : s));
  const addStep = () => setSteps([...steps, '']);
  const updateStep = (idx: number, val: string) => { const ns = [...steps]; ns[idx] = val; setSteps(ns); };
  const removeStep = (idx: number) => setSteps(steps.filter((_, i) => i !== idx));
  const addNote = () => { if (!newNoteContent.trim()) return; setNotes([...notes, { id: `note-${Date.now()}`, type: newNoteType, content: newNoteContent }]); setNewNoteContent(''); };
  const removeNote = (id: string) => setNotes(notes.filter(n => n.id !== id));

  // Robust Attachment Handlers
  const attachPairing = (p: any) => {
    if (attachments.find(a => a.itemId === p.id)) {
      triggerToast("Pairing is already attached");
      return;
    }
    const name = p.name || p.title || (Array.isArray(p.ingredients) ? p.ingredients.join(' + ') : 'Flavor Pairing');
    const compatibilityScore = Number(p.analysis?.compatibilityScore ?? p.compatibility_score ?? 85);
    const ingredientsList = Array.isArray(p.ingredients) ? p.ingredients : [];

    setAttachments(prev => [...prev, {
      id: `att-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      type: 'pairing',
      itemId: p.id,
      itemName: name,
      itemData: {
        compatibilityScore,
        ingredients: ingredientsList,
        updatedAt: p.updated_at || p.created_at
      },
      attachedAt: new Date().toISOString()
    }]);
    setShowAttachmentPicker(null);
    triggerToast(`Attached "${name}"`);
  };

  const attachFoodCost = (f: any) => {
    if (attachments.find(a => a.itemId === f.id)) {
      triggerToast("Food Cost is already attached");
      return;
    }
    const name = f.recipe_name || f.name || f.title || f.data?.recipeName || f.ingredients?.recipeName || 'Cost Sheet';
    const costPerServing = Number(f.cost_per_serving ?? f.data?.totals?.costPerServing ?? f.ingredients?.totals?.costPerServing ?? 0);
    const totalCost = Number(f.total_cost ?? f.data?.totals?.combinedTotalCost ?? f.ingredients?.totals?.combinedTotalCost ?? 0);
    const portions = Number(f.servings ?? f.data?.servings ?? f.ingredients?.servings ?? 4);
    const currency = f.data?.currency ?? f.ingredients?.currency ?? '€';
    const template = f.template || 'ADVANCED';

    setAttachments(prev => [...prev, {
      id: `att-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      type: 'foodCost',
      itemId: f.id,
      itemName: name,
      itemData: {
        template,
        costPerServing,
        totalCost,
        portions,
        currency,
        updatedAt: f.updated_at || f.created_at
      },
      attachedAt: new Date().toISOString()
    }]);
    setShowAttachmentPicker(null);
    triggerToast(`Attached "${name}"`);
  };

  // Filtered Attachments List for Modal
  const filteredPairings = useMemo(() => {
    if (!attachmentSearchTerm.trim()) return userPairings;
    const term = attachmentSearchTerm.toLowerCase();
    return userPairings.filter(p => {
      const name = (p.name || p.title || '').toLowerCase();
      const ingMatch = Array.isArray(p.ingredients) && p.ingredients.some((i: string) => i.toLowerCase().includes(term));
      return name.includes(term) || ingMatch;
    });
  }, [userPairings, attachmentSearchTerm]);

  const filteredFoodCosts = useMemo(() => {
    if (!attachmentSearchTerm.trim()) return userFoodCosts;
    const term = attachmentSearchTerm.toLowerCase();
    return userFoodCosts.filter(f => {
      const name = (f.recipe_name || f.name || f.title || f.data?.recipeName || '').toLowerCase();
      return name.includes(term);
    });
  }, [userFoodCosts, attachmentSearchTerm]);

  return (
    <div className="h-full flex flex-col bg-background-light dark:bg-background-dark relative font-sans overflow-hidden text-text-main dark:text-white">
      {/* Top Header */}
      <header className="p-4 md:p-6 border-b border-gray-200 dark:border-gray-800 flex flex-col md:flex-row items-center justify-between gap-4 sticky top-0 bg-white/90 dark:bg-background-dark/90 backdrop-blur-md z-30">
        <div className="flex flex-col gap-1 w-full md:w-auto">
          <input 
            className="text-lg md:text-2xl font-black uppercase tracking-tight bg-transparent border-none focus:ring-0 p-0 w-full md:w-[400px] placeholder:text-gray-400 dark:text-white outline-none" 
            value={title} 
            onChange={(e) => setTitle(e.target.value)} 
            placeholder={t('createDish.namePlaceholder') || "Name masterpiece..."} 
          />
          {lastSaved && (
            <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-gray-100 dark:bg-white/5 text-[9px] font-black uppercase tracking-widest text-text-muted w-fit">
              <span className={`size-1.5 rounded-full ${saving ? 'bg-amber-500 animate-pulse' : 'bg-green-500'}`}></span>
              {saving ? t('createDish.syncing') || 'Syncing...' : `${t('createDish.cloudSaved') || 'CLOUD SAVED'} ${lastSaved}`}
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-2 w-full md:w-auto justify-center md:justify-end">
          <button 
            onClick={() => { fetchUserRecipes(); setShowMyRecipes(true); }} 
            className="flex-1 md:flex-none px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-xs font-black uppercase tracking-wider hover:bg-gray-100 dark:hover:bg-white/5 transition-all flex items-center justify-center gap-2"
          >
            <span className="material-symbols-outlined text-[18px]">folder_special</span> 
            <span>{t('createDish.recipes') || 'Recipes'}</span>
          </button>

          <button 
            onClick={toggleShare} 
            disabled={saving || !currentRecipeId} 
            className={`flex-1 md:flex-none px-4 py-2.5 rounded-xl border-2 text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2 disabled:opacity-40 ${
              isShared 
                ? 'border-amber-500 text-amber-500 hover:bg-amber-500 hover:text-white' 
                : 'border-primary text-primary hover:bg-primary hover:text-black'
            }`}
          >
            <span className="material-symbols-outlined text-[18px]">{isShared ? 'public_off' : 'public'}</span>
            <span>{isShared ? (t('createDish.stopSharing') || 'Stop Sharing') : (t('createDish.share') || 'Share')}</span>
          </button>

          <button 
            onClick={handleManualSave} 
            disabled={saving} 
            className="flex-1 md:flex-none px-5 py-2.5 rounded-xl bg-primary text-black text-xs font-black uppercase tracking-wider shadow-sm hover:brightness-105 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-[18px]">cloud_upload</span> 
            <span>{currentRecipeId ? (t('createDish.update') || 'Update') : (t('createDish.save') || 'Save')}</span>
          </button>

          <button 
            onClick={handleNewRecipe} 
            title={t('createDish.newCanvas') || "New Canvas"} 
            className="size-11 rounded-xl bg-black dark:bg-white dark:text-black text-white flex items-center justify-center hover:scale-105 transition-transform"
          >
            <span className="material-symbols-outlined">add</span>
          </button>
        </div>
      </header>

      {/* Main Workspace Layout */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* Navigation Sidebar / Mobile Tab bar */}
        <aside className="w-full md:w-64 border-b md:border-b-0 md:border-r border-gray-200 dark:border-gray-800 p-2 md:p-6 flex flex-row md:flex-col gap-2 shrink-0 bg-gray-50/50 dark:bg-black/20 overflow-x-auto no-scrollbar">
          {[
            { id: 'info', icon: 'info', label: t('createDish.tabs.info') || 'Info' },
            { id: 'ingredients', icon: 'restaurant', label: t('createDish.tabs.ingredients') || 'Ingredients' },
            { id: 'steps', icon: 'list', label: t('createDish.tabs.steps') || 'Steps' },
            { id: 'picture', icon: 'photo', label: t('createDish.tabs.picture') || 'Picture' },
            { id: 'notes', icon: 'note', label: t('createDish.tabs.notes') || 'Notes' },
            { id: 'attachments', icon: 'attachment', label: `${t('createDish.tabs.attachments') || 'Attachments'} (${attachments.length})` }
          ].map(tab => (
            <button 
              key={tab.id} 
              onClick={() => setActiveTab(tab.id)} 
              className={`flex items-center gap-3 px-4 py-2.5 md:py-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all whitespace-nowrap ${
                activeTab === tab.id 
                  ? 'bg-primary text-black shadow-md' 
                  : 'text-text-muted hover:bg-white dark:hover:bg-white/5'
              }`}
            >
              <span className="material-symbols-outlined text-[20px]">{tab.icon}</span> 
              <span>{tab.label}</span>
            </button>
          ))}
        </aside>

        {/* Content Pane */}
        <main className="flex-1 overflow-y-auto p-4 md:p-12 scroll-smooth">
          <div className="max-w-4xl mx-auto space-y-12 pb-24 animate-fade-in">
            
            {/* 1. INFO TAB */}
            {activeTab === 'info' && (
              <div className="space-y-8">
                <div className="flex flex-col gap-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-text-muted">
                    {t('createDish.info.description') || "Masterpiece Description"}
                  </label>
                  <textarea 
                    value={description} 
                    onChange={(e) => setDescription(e.target.value)} 
                    className="w-full bg-white dark:bg-surface-dark border border-gray-200 dark:border-gray-800 rounded-2xl p-4 md:p-6 text-sm min-h-[150px] focus:ring-1 focus:ring-primary outline-none dark:text-white placeholder:text-gray-400" 
                    placeholder={t('createDish.info.inspirationPlaceholder') || "Inspiration, culinary story & tasting notes..."} 
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="flex flex-col gap-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-text-muted">
                      {t('createDish.info.difficulty') || "Difficulty"}
                    </label>
                    <select 
                      className="bg-white dark:bg-surface-dark border border-gray-200 dark:border-gray-800 rounded-xl p-3 text-xs font-black uppercase outline-none focus:ring-1 focus:ring-primary dark:text-white" 
                      value={difficulty} 
                      onChange={e => setDifficulty(e.target.value)}
                    >
                      <option value="Beginner">{t('createDish.info.beginner') || 'Beginner'}</option>
                      <option value="Intermediate">{t('createDish.info.intermediate') || 'Intermediate'}</option>
                      <option value="Advanced">{t('createDish.info.advanced') || 'Advanced'}</option>
                    </select>
                  </div>

                  <div className="flex flex-col gap-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-text-muted">
                      {t('createDish.info.prepTime') || "Prep Time"}
                    </label>
                    <div className="flex gap-2">
                      <input 
                        type="number" 
                        min="1"
                        className="flex-1 bg-white dark:bg-surface-dark border border-gray-200 dark:border-gray-800 rounded-xl p-3 text-xs font-bold dark:text-white" 
                        value={prepTime} 
                        onChange={e => setPrepTime(parseInt(e.target.value) || 0)} 
                      />
                      <select 
                        className="bg-white dark:bg-surface-dark border border-gray-200 dark:border-gray-800 rounded-xl px-2 text-[10px] font-black uppercase dark:text-white" 
                        value={prepTimeUnit} 
                        onChange={e => setPrepTimeUnit(e.target.value as any)}
                      >
                        <option value="mins">{t('createDish.info.mins') || 'Mins'}</option>
                        <option value="hours">{t('createDish.info.hours') || 'Hours'}</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-text-muted">
                      {t('createDish.info.servings') || "Servings"}
                    </label>
                    <input 
                      type="number" 
                      min="1"
                      className="bg-white dark:bg-surface-dark border border-gray-200 dark:border-gray-800 rounded-xl p-3 text-xs font-bold dark:text-white" 
                      value={servings} 
                      onChange={e => setServings(parseInt(e.target.value) || 1)} 
                    />
                  </div>
                </div>
              </div>
            )}

            {/* 2. INGREDIENTS TAB */}
            {activeTab === 'ingredients' && (
              <div className="space-y-10">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg md:text-xl font-black uppercase tracking-tight">
                    {t('createDish.ingredients.title') || "Ingredient Mapping"}
                  </h3>
                  <button 
                    onClick={addSubdivision} 
                    className="bg-black dark:bg-white dark:text-black text-white px-3 py-2 rounded-xl text-[10px] font-black uppercase"
                  >
                    {t('createDish.ingredients.addSubdivision') || "Add Subdivision"}
                  </button>
                </div>

                <div className="space-y-12">
                  {subdivisions.map(sub => (
                    <div key={sub.id} className="bg-white dark:bg-surface-dark rounded-3xl p-5 md:p-8 border border-gray-200 dark:border-gray-800 space-y-6">
                      <div className="flex items-center gap-4">
                        <input 
                          className="text-base md:text-lg font-black uppercase tracking-widest bg-transparent border-none focus:ring-0 p-0 flex-1 dark:text-white outline-none" 
                          value={sub.title} 
                          onChange={e => setSubdivisions(subdivisions.map(s => s.id === sub.id ? { ...s, title: e.target.value } : s))} 
                          placeholder="Subdivision Title..." 
                        />
                        <button onClick={() => setSubdivisions(subdivisions.filter(s => s.id !== sub.id))} className="text-red-500 material-symbols-outlined">delete</button>
                      </div>

                      <div className="space-y-3">
                        {sub.items.map((ing) => (
                          <div key={ing.id} className="flex flex-wrap md:flex-nowrap gap-2 md:gap-3 items-center">
                            <input 
                              placeholder={t('createDish.ingredients.name') || "Name"} 
                              className="w-full md:flex-[3] h-11 bg-gray-50 dark:bg-black/20 border border-gray-200 dark:border-gray-800 rounded-xl px-4 text-sm font-bold dark:text-white outline-none" 
                              value={ing.name} 
                              onChange={e => updateIngredient(sub.id, ing.id, { name: e.target.value })} 
                            />
                            <div className="flex flex-1 gap-2 min-w-[150px]">
                              <input 
                                placeholder={t('createDish.ingredients.qty') || "Qty"} 
                                className="flex-1 h-11 bg-gray-50 dark:bg-black/20 border border-gray-200 dark:border-gray-800 rounded-xl px-4 text-sm font-bold text-center dark:text-white outline-none" 
                                value={ing.quantity} 
                                onChange={e => updateIngredient(sub.id, ing.id, { quantity: e.target.value })} 
                              />
                              <select 
                                className="flex-1 h-11 bg-gray-50 dark:bg-black/20 border border-gray-200 dark:border-gray-800 rounded-xl px-2 text-[10px] font-black uppercase dark:text-white outline-none" 
                                value={ing.unit} 
                                onChange={e => updateIngredient(sub.id, ing.id, { unit: e.target.value })}
                              >
                                <option>kg</option><option>g</option><option>L</option><option>ml</option><option>unit</option><option>tsp</option><option>tbsp</option>
                              </select>
                            </div>
                            <button onClick={() => removeIngredient(sub.id, ing.id)} className="text-gray-400 hover:text-red-500 p-2">
                              <span className="material-symbols-outlined text-[18px]">close</span>
                            </button>
                          </div>
                        ))}
                      </div>

                      <button 
                        onClick={() => addIngredientToSub(sub.id)} 
                        className="w-full py-3 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl text-[10px] font-black uppercase text-text-muted hover:border-primary hover:text-primary transition-all"
                      >
                        {t('createDish.ingredients.addIngredient') || "+ Add Ingredient"}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 3. STEPS TAB */}
            {activeTab === 'steps' && (
              <div className="space-y-8">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg md:text-xl font-black uppercase tracking-tight">
                    {t('createDish.steps.title') || "Sequence & Technique"}
                  </h3>
                  <button 
                    onClick={addStep} 
                    className="bg-black dark:bg-white dark:text-black text-white px-3 py-2 rounded-xl text-[10px] font-black uppercase"
                  >
                    {t('createDish.steps.addStep') || "Add Step"}
                  </button>
                </div>

                <div className="space-y-6">
                  {steps.map((step, idx) => (
                    <div key={idx} className="flex gap-4 md:gap-6 group">
                      <div className="size-10 md:size-12 rounded-2xl bg-primary text-black font-black flex items-center justify-center shrink-0 shadow-sm text-sm md:text-base">
                        {idx + 1}
                      </div>
                      <div className="flex-1 flex flex-col gap-2">
                        <textarea 
                          className="w-full bg-white dark:bg-surface-dark border border-gray-200 dark:border-gray-800 rounded-2xl p-4 text-sm focus:ring-1 focus:ring-primary outline-none min-h-[80px] dark:text-white" 
                          value={step} 
                          onChange={e => updateStep(idx, e.target.value)} 
                          placeholder={t('createDish.steps.processPlaceholder') || "Describe process, temperature and texture..."} 
                        />
                        <button 
                          onClick={() => removeStep(idx)} 
                          className="text-[10px] font-black uppercase text-red-500 opacity-60 md:opacity-0 group-hover:opacity-100 transition-opacity w-fit px-2"
                        >
                          {t('createDish.steps.removeStep') || "Remove Step"}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 4. PICTURE TAB */}
            {activeTab === 'picture' && (
              <div className="space-y-8">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg md:text-xl font-black uppercase tracking-tight">
                    {t('createDish.pictures.title') || "Visual Plating"}
                  </h3>
                  <span className="text-[10px] font-black uppercase text-text-muted">{images.length} / 3</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
                  {images.map((img, i) => (
                    <div key={i} className="aspect-square rounded-3xl overflow-hidden border border-gray-200 dark:border-gray-800 relative group shadow-xl">
                      <img src={img} alt="Dish plating" className="size-full object-cover transition-transform group-hover:scale-110" />
                      <button 
                        className="absolute top-2 right-2 bg-red-500 size-8 rounded-full text-white opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center shadow-lg" 
                        onClick={() => setImages(images.filter((_, idx) => idx !== i))}
                      >
                        <span className="material-symbols-outlined text-[16px]">delete</span>
                      </button>
                    </div>
                  ))}
                  {images.length < 3 && (
                    <label className="aspect-square rounded-3xl border-2 border-dashed border-gray-200 dark:border-gray-800 flex flex-col items-center justify-center cursor-pointer hover:border-primary transition-colors bg-gray-50/50 dark:bg-surface-dark gap-2">
                      <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
                      <span className="material-symbols-outlined text-4xl text-gray-400">add_a_photo</span>
                      <span className="text-xs font-black uppercase tracking-wider text-text-muted">{t('createDish.pictures.upload') || 'Upload Photo'}</span>
                    </label>
                  )}
                </div>
              </div>
            )}

            {/* 5. NOTES TAB */}
            {activeTab === 'notes' && (
              <div className="space-y-8">
                <div className="bg-white dark:bg-surface-dark p-5 md:p-8 rounded-3xl border border-gray-200 dark:border-gray-800 space-y-6">
                  <div className="flex flex-col gap-4">
                    <div className="flex flex-wrap gap-2">
                      {(['tip', 'suggestion', 'alternative', 'substitute', 'variation'] as ChefNoteType[]).map(type => (
                        <button 
                          key={type} 
                          onClick={() => setNewNoteType(type)} 
                          className={`flex-1 min-w-[80px] py-2 rounded-xl text-[10px] font-black uppercase border transition-all ${
                            newNoteType === type 
                              ? `${NOTE_COLORS[type]} text-white border-transparent shadow-md` 
                              : 'bg-transparent text-text-muted border-gray-200 dark:border-gray-800'
                          }`}
                        >
                          {type}
                        </button>
                      ))}
                    </div>
                    <textarea 
                      value={newNoteContent} 
                      onChange={e => setNewNoteContent(e.target.value)} 
                      placeholder={t('createDish.notes.placeholder') || "Note content..."} 
                      className="w-full h-24 bg-gray-50 dark:bg-black/20 border border-gray-200 dark:border-gray-800 rounded-2xl p-4 text-sm font-medium focus:ring-1 focus:ring-primary outline-none dark:text-white" 
                    />
                    <button 
                      onClick={addNote} 
                      className="bg-black dark:bg-white dark:text-black text-white py-3 rounded-2xl text-[10px] font-black uppercase shadow-sm"
                    >
                      {t('createDish.notes.addNote') || "Add Note"}
                    </button>
                  </div>

                  <div className="space-y-3 pt-6 border-t border-gray-200 dark:border-gray-800">
                    {notes.map(note => (
                      <div key={note.id} className="flex gap-4 p-4 rounded-2xl bg-gray-50 dark:bg-black/20 group animate-fade-in border-l-4" style={{ borderLeftColor: NOTE_HEX[note.type] }}>
                        <div className={`size-8 rounded-lg ${NOTE_COLORS[note.type]} text-white flex items-center justify-center shrink-0`}>
                          <span className="material-symbols-outlined text-[18px]">lightbulb</span>
                        </div>
                        <div className="flex-1">
                          <p className="text-[10px] font-black uppercase text-text-muted mb-1">{note.type}</p>
                          <p className="text-sm font-medium dark:text-gray-200">{note.content}</p>
                        </div>
                        <button 
                          onClick={() => removeNote(note.id)} 
                          className="text-gray-400 hover:text-red-500 opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <span className="material-symbols-outlined text-[18px]">delete</span>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* 6. ATTACHMENTS TAB (PAIRINGS + FOOD COSTS) */}
            {activeTab === 'attachments' && (
              <div className="space-y-8">
                <div className="space-y-1">
                  <h3 className="text-lg md:text-xl font-black uppercase tracking-tight">
                    {t('createDish.attachments.title') || "Linked Studio Intelligence"}
                  </h3>
                  <p className="text-xs text-text-muted font-medium">
                    {t('createDish.attachments.subtitle') || "Attach molecular pairing analyses and food costing calculations to this recipe canvas."}
                  </p>
                </div>

                {/* Attachment Link Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Link Molecular Pairing */}
                  <button 
                    onClick={() => { 
                      setAttachmentSearchTerm('');
                      fetchPairings(); 
                      setShowAttachmentPicker('pairing'); 
                    }} 
                    className="p-6 md:p-8 bg-white dark:bg-surface-dark border border-gray-200 dark:border-gray-800 rounded-3xl flex items-center gap-5 hover:border-blue-500 transition-all group shadow-sm text-left"
                  >
                    <div className="size-14 md:size-16 rounded-2xl bg-blue-500/10 text-blue-500 flex items-center justify-center group-hover:scale-105 transition-transform shrink-0">
                      <span className="material-symbols-outlined text-3xl md:text-4xl">science</span>
                    </div>
                    <div>
                      <span className="text-sm md:text-base font-black uppercase tracking-wider block text-text-main dark:text-white">
                        {t('createDish.attachments.linkPairing') || "Link Pairing Analysis"}
                      </span>
                      <span className="text-xs text-text-muted font-medium block mt-0.5">
                        {t('createDish.attachments.linkPairingDesc') || "Attach flavor affinity reports and synergy scores"}
                      </span>
                    </div>
                  </button>

                  {/* Link Food Cost Calculation */}
                  <button 
                    onClick={() => { 
                      setAttachmentSearchTerm('');
                      fetchFoodCosts(); 
                      setShowAttachmentPicker('foodCost'); 
                    }} 
                    className="p-6 md:p-8 bg-white dark:bg-surface-dark border border-gray-200 dark:border-gray-800 rounded-3xl flex items-center gap-5 hover:border-amber-500 transition-all group shadow-sm text-left"
                  >
                    <div className="size-14 md:size-16 rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center group-hover:scale-105 transition-transform shrink-0">
                      <span className="material-symbols-outlined text-3xl md:text-4xl">payments</span>
                    </div>
                    <div>
                      <span className="text-sm md:text-base font-black uppercase tracking-wider block text-text-main dark:text-white">
                        {t('createDish.attachments.linkFoodCost') || "Link Food Cost Sheet"}
                      </span>
                      <span className="text-xs text-text-muted font-medium block mt-0.5">
                        {t('createDish.attachments.linkFoodCostDesc') || "Attach cost per serving & sub-recipe sheets"}
                      </span>
                    </div>
                  </button>
                </div>

                {/* Currently Attached Items List */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-800 pb-2">
                    <h4 className="text-[10px] font-black uppercase tracking-widest text-text-muted">
                      {t('createDish.attachments.currentlyAttached') || "Currently Attached"} ({attachments.length})
                    </h4>
                  </div>

                  {attachments.map(att => {
                    const isFoodCost = att.type === 'foodCost';
                    return (
                      <div 
                        key={att.id} 
                        className="p-4 md:p-5 bg-white dark:bg-surface-dark border border-gray-200 dark:border-gray-800 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 group shadow-sm hover:border-primary transition-all"
                      >
                        <div className="flex items-center gap-4 flex-1 overflow-hidden">
                          <div className={`size-12 rounded-2xl flex items-center justify-center shrink-0 ${
                            isFoodCost ? 'bg-amber-500/10 text-amber-500' : 'bg-blue-500/10 text-blue-500'
                          }`}>
                            <span className="material-symbols-outlined text-[24px]">
                              {isFoodCost ? 'payments' : 'science'}
                            </span>
                          </div>

                          <div className="flex flex-col overflow-hidden">
                            <span className="text-sm font-black uppercase tracking-tight truncate text-text-main dark:text-white">
                              {att.itemName}
                            </span>
                            <div className="flex items-center gap-2 flex-wrap mt-0.5">
                              <span className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider ${
                                isFoodCost ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400' : 'bg-blue-500/15 text-blue-600 dark:text-blue-400'
                              }`}>
                                {isFoodCost ? 'Cost Sheet' : 'Flavor Pairing'}
                              </span>

                              {/* Cost Metrics */}
                              {isFoodCost && att.itemData && (
                                <>
                                  <span className="text-xs font-mono font-black text-emerald-600 dark:text-emerald-400">
                                    {att.itemData.currency || '€'}{Number(att.itemData.costPerServing || 0).toFixed(2)} / pax
                                  </span>
                                  <span className="text-[10px] text-text-muted font-mono font-bold">
                                    (Total: {att.itemData.currency || '€'}{Number(att.itemData.totalCost || 0).toFixed(2)} • {att.itemData.portions || 4} pax)
                                  </span>
                                </>
                              )}

                              {/* Pairing Metrics */}
                              {!isFoodCost && att.itemData && (
                                <span className="text-xs font-mono font-black text-blue-500">
                                  {att.itemData.compatibilityScore || 85}% {t('createDish.attachments.score') || 'Synergy Score'}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 self-end sm:self-center">
                          {/* Quick Jump / View Button */}
                          <button
                            onClick={() => {
                              if (isFoodCost) {
                                navigate(`/food-cost?id=${att.itemId}`);
                              } else {
                                navigate(`/pairing-analysis?id=${att.itemId}`);
                              }
                            }}
                            className="px-3 py-1.5 rounded-xl border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-white/5 text-[10px] font-black uppercase tracking-wider flex items-center gap-1 text-text-muted hover:text-text-main transition-colors"
                            title={isFoodCost ? "Open in Food Cost" : "Open in Pairing Analysis"}
                          >
                            <span className="material-symbols-outlined text-[14px]">open_in_new</span>
                            <span>{isFoodCost ? (t('createDish.attachments.openSheet') || 'Open Sheet') : (t('createDish.attachments.openPairing') || 'Open Pairing')}</span>
                          </button>

                          {/* Detach button */}
                          <button 
                            onClick={() => setAttachments(attachments.filter(a => a.id !== att.id))} 
                            className="size-8 rounded-lg hover:bg-red-500/10 text-gray-400 hover:text-red-500 flex items-center justify-center transition-colors"
                            title="Remove attachment"
                          >
                            <span className="material-symbols-outlined text-[18px]">close</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}

                  {attachments.length === 0 && (
                    <div className="p-10 text-center text-text-muted border-2 border-dashed border-gray-200 dark:border-gray-800 rounded-3xl text-xs font-bold uppercase tracking-wider space-y-2">
                      <span className="material-symbols-outlined text-3xl text-gray-400 block">attachment</span>
                      <p>{t('createDish.attachments.noAttachments') || "No intelligence linked yet. Click above to attach saved pairings or food costs."}</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </main>
      </div>

      {/* MY RECIPES MODAL */}
      {showMyRecipes && (
        <div className="fixed inset-0 z-[400] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={() => setShowMyRecipes(false)}></div>
          <div className="relative w-full max-w-2xl bg-white dark:bg-surface-dark rounded-3xl shadow-2xl overflow-hidden animate-fade-in border border-gray-200 dark:border-gray-800 flex flex-col max-h-[80vh]">
            <header className="p-5 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between bg-gray-50 dark:bg-white/5">
              <h3 className="text-lg font-black uppercase tracking-tight text-text-main dark:text-white">
                {t('createDish.recipesModal.title') || "My Saved Recipes"}
              </h3>
              <button onClick={() => setShowMyRecipes(false)} className="material-symbols-outlined text-gray-400 hover:text-white">close</button>
            </header>
            <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-3">
              {userRecipes.map(recipe => (
                <div key={recipe.id} className="p-4 bg-gray-50 dark:bg-black/20 rounded-2xl border border-transparent hover:border-primary transition-all flex items-center justify-between gap-4">
                  <div className="flex flex-col overflow-hidden">
                    <span className="font-black text-sm uppercase truncate text-text-main dark:text-white">{recipe.title || recipe.name}</span>
                    <span className="text-[10px] text-text-muted font-bold uppercase tracking-widest">{recipe.difficulty}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => loadRecipe(recipe)} className="size-10 rounded-lg bg-primary text-black flex items-center justify-center hover:scale-105 transition-transform" title="Load Recipe">
                      <span className="material-symbols-outlined text-[20px]">edit</span>
                    </button>
                    <button onClick={() => setShowDeleteConfirm(recipe.id)} className="size-10 rounded-lg bg-red-500 text-white flex items-center justify-center hover:scale-105 transition-transform" title="Delete Recipe">
                      <span className="material-symbols-outlined text-[20px]">delete</span>
                    </button>
                  </div>
                </div>
              ))}
              {userRecipes.length === 0 && (
                <div className="py-12 text-center text-text-muted text-xs font-bold uppercase tracking-widest">
                  {t('createDish.recipesModal.empty') || "No saved recipes found. Create your first masterpiece!"}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* DELETE RECIPE CONFIRMATION MODAL */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/90 backdrop-blur-sm" onClick={() => setShowDeleteConfirm(null)}></div>
          <div className="relative w-full max-w-sm bg-white dark:bg-surface-dark rounded-3xl shadow-2xl p-8 border border-red-500/20 text-center space-y-6 animate-fade-in">
            <div className="size-16 rounded-full bg-red-500/10 text-red-500 flex items-center justify-center mx-auto">
              <span className="material-symbols-outlined text-4xl">warning</span>
            </div>
            <div className="space-y-2">
              <h3 className="text-xl font-black uppercase text-text-main dark:text-white">
                {t('createDish.recipesModal.destroyTitle') || "Destroy Recipe?"}
              </h3>
              <p className="text-xs text-text-muted font-medium">
                {t('createDish.recipesModal.destroyDesc') || "This action is permanent and cannot be undone."}
              </p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowDeleteConfirm(null)} className="flex-1 py-3 rounded-xl bg-gray-100 dark:bg-white/5 text-[10px] font-black uppercase text-text-main dark:text-white">
                {t('common.cancel') || "Cancel"}
              </button>
              <button onClick={() => deleteRecipe(showDeleteConfirm)} className="flex-1 py-3 rounded-xl bg-red-500 text-white text-[10px] font-black uppercase">
                {t('common.delete') || "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FLOATING TOAST */}
      {showToast && (
        <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[500] bg-black text-white px-8 py-4 rounded-2xl shadow-2xl font-black uppercase tracking-widest text-[10px] animate-fade-in flex items-center gap-2 border border-primary/20">
          <span className="material-symbols-outlined text-primary">verified</span> {toastMsg}
        </div>
      )}

      {/* ATTACHMENT PICKER MODAL (PAIRINGS & FOOD COSTS) */}
      {showAttachmentPicker && (
        <div className="fixed inset-0 z-[400] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={() => setShowAttachmentPicker(null)}></div>
          <div className="relative w-full max-w-lg bg-white dark:bg-surface-dark rounded-3xl shadow-2xl overflow-hidden border border-gray-200 dark:border-gray-800 flex flex-col max-h-[80vh] animate-fade-in">
            <header className="p-5 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between bg-gray-50 dark:bg-white/5">
              <div className="flex items-center gap-3">
                <span className={`material-symbols-outlined ${showAttachmentPicker === 'foodCost' ? 'text-amber-500' : 'text-blue-500'}`}>
                  {showAttachmentPicker === 'foodCost' ? 'payments' : 'science'}
                </span>
                <h3 className="text-base font-black uppercase tracking-tight text-text-main dark:text-white">
                  {showAttachmentPicker === 'foodCost' 
                    ? (t('createDish.attachments.attachModalTitleFoodCost') || 'Attach Food Cost Calculation') 
                    : (t('createDish.attachments.attachModalTitlePairing') || 'Attach Pairing Analysis')}
                </h3>
              </div>
              <button onClick={() => setShowAttachmentPicker(null)} className="material-symbols-outlined text-gray-400 hover:text-white">close</button>
            </header>

            {/* Search filter in modal */}
            <div className="p-4 border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-black/20 flex gap-2">
              <div className="relative flex-1">
                <span className="material-symbols-outlined absolute left-3 top-2.5 text-gray-400 text-[18px]">search</span>
                <input 
                  type="text" 
                  value={attachmentSearchTerm} 
                  onChange={e => setAttachmentSearchTerm(e.target.value)}
                  placeholder={t('createDish.attachments.searchPlaceholder') || "Search saved items..."}
                  className="w-full bg-white dark:bg-surface-dark border border-gray-200 dark:border-gray-800 rounded-xl pl-9 pr-3 py-2 text-xs font-bold dark:text-white outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <button 
                onClick={() => {
                  if (showAttachmentPicker === 'foodCost') fetchFoodCosts();
                  else fetchPairings();
                }}
                className="size-9 rounded-xl border border-gray-200 dark:border-gray-700 flex items-center justify-center text-text-muted hover:text-text-main hover:bg-white dark:hover:bg-white/5 transition-colors"
                title="Refresh items"
              >
                <span className={`material-symbols-outlined text-[18px] ${loadingAttachments ? 'animate-spin' : ''}`}>refresh</span>
              </button>
            </div>

            {/* List */}
            <div className="p-4 md:p-6 overflow-y-auto space-y-3 flex-1">
              {showAttachmentPicker === 'pairing' && (
                filteredPairings.length > 0 ? (
                  filteredPairings.map(p => {
                    const name = p.name || p.title || (Array.isArray(p.ingredients) ? p.ingredients.join(' + ') : 'Flavor Pairing');
                    const score = p.analysis?.compatibilityScore ?? p.compatibility_score ?? 85;
                    const isAlreadyAttached = attachments.some(a => a.itemId === p.id);

                    return (
                      <button 
                        key={p.id} 
                        onClick={() => attachPairing(p)} 
                        disabled={isAlreadyAttached}
                        className={`w-full p-4 bg-gray-50 dark:bg-black/20 rounded-2xl flex items-center justify-between border transition-all group text-left ${
                          isAlreadyAttached 
                            ? 'opacity-40 border-transparent cursor-not-allowed' 
                            : 'border-transparent hover:border-blue-500 hover:bg-blue-50/20 dark:hover:bg-blue-500/5'
                        }`}
                      >
                        <div className="flex flex-col truncate pr-2">
                          <span className="text-xs font-black uppercase truncate group-hover:text-blue-500 transition-colors text-text-main dark:text-white">
                            {name}
                          </span>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[10px] text-blue-500 font-mono font-bold">
                              {score}% {t('createDish.attachments.score') || 'Synergy'}
                            </span>
                            {Array.isArray(p.ingredients) && p.ingredients.length > 0 && (
                              <span className="text-[9px] text-text-muted truncate">
                                • {p.ingredients.slice(0, 3).join(', ')}{p.ingredients.length > 3 ? '...' : ''}
                              </span>
                            )}
                          </div>
                        </div>
                        <span className={`material-symbols-outlined shrink-0 ${isAlreadyAttached ? 'text-gray-400' : 'text-blue-500'}`}>
                          {isAlreadyAttached ? 'check_circle' : 'add_circle'}
                        </span>
                      </button>
                    );
                  })
                ) : (
                  <div className="py-12 text-center text-text-muted text-xs font-bold uppercase tracking-wider space-y-3">
                    <span className="material-symbols-outlined text-4xl text-gray-400 block">science</span>
                    <p>{t('createDish.attachments.noSavedPairings') || "No saved pairings found. Create analyses in Pairing Analysis first."}</p>
                    <button 
                      onClick={() => {
                        setShowAttachmentPicker(null);
                        navigate('/pairing-analysis');
                      }}
                      className="px-4 py-2 bg-blue-500 text-white rounded-xl text-[10px] font-black uppercase inline-flex items-center gap-1.5"
                    >
                      <span className="material-symbols-outlined text-[14px]">add</span>
                      Go to Pairing Analysis
                    </button>
                  </div>
                )
              )}

              {showAttachmentPicker === 'foodCost' && (
                filteredFoodCosts.length > 0 ? (
                  filteredFoodCosts.map(f => {
                    const name = f.recipe_name || f.name || f.title || f.data?.recipeName || f.ingredients?.recipeName || 'Untitled Sheet';
                    const costPerPax = Number(f.cost_per_serving ?? f.data?.totals?.costPerServing ?? f.ingredients?.totals?.costPerServing ?? 0);
                    const totalCost = Number(f.total_cost ?? f.data?.totals?.combinedTotalCost ?? f.ingredients?.totals?.combinedTotalCost ?? 0);
                    const currency = f.data?.currency ?? f.ingredients?.currency ?? '€';
                    const portions = f.servings ?? f.data?.servings ?? f.ingredients?.servings ?? 4;
                    const isAlreadyAttached = attachments.some(a => a.itemId === f.id);

                    return (
                      <button 
                        key={f.id} 
                        onClick={() => attachFoodCost(f)} 
                        disabled={isAlreadyAttached}
                        className={`w-full p-4 bg-gray-50 dark:bg-black/20 rounded-2xl flex items-center justify-between border transition-all group text-left ${
                          isAlreadyAttached 
                            ? 'opacity-40 border-transparent cursor-not-allowed' 
                            : 'border-transparent hover:border-amber-500 hover:bg-amber-50/20 dark:hover:bg-amber-500/5'
                        }`}
                      >
                        <div className="flex flex-col truncate pr-2">
                          <span className="text-xs font-black uppercase truncate group-hover:text-amber-500 transition-colors text-text-main dark:text-white">
                            {name}
                          </span>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-mono font-bold">
                              {currency}{costPerPax.toFixed(2)} / pax
                            </span>
                            <span className="text-[9px] text-text-muted font-mono">
                              • Total: {currency}{totalCost.toFixed(2)} ({portions}p)
                            </span>
                          </div>
                        </div>
                        <span className={`material-symbols-outlined shrink-0 ${isAlreadyAttached ? 'text-gray-400' : 'text-amber-500'}`}>
                          {isAlreadyAttached ? 'check_circle' : 'add_circle'}
                        </span>
                      </button>
                    );
                  })
                ) : (
                  <div className="py-12 text-center text-text-muted text-xs font-bold uppercase tracking-wider space-y-3">
                    <span className="material-symbols-outlined text-4xl text-gray-400 block">payments</span>
                    <p>{t('createDish.attachments.noSavedFoodCosts') || "No saved food cost calculations found. Create sheets in Food Cost first."}</p>
                    <button 
                      onClick={() => {
                        setShowAttachmentPicker(null);
                        navigate('/food-cost');
                      }}
                      className="px-4 py-2 bg-amber-500 text-black rounded-xl text-[10px] font-black uppercase inline-flex items-center gap-1.5"
                    >
                      <span className="material-symbols-outlined text-[14px]">add</span>
                      Go to Food Cost
                    </button>
                  </div>
                )
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
