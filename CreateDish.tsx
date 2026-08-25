
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
  const { user, isLoggedIn } = useAppContext();
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

  // Form State (Synchronously initialized from session draft so navigation never resets work)
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
  const [showAttachmentPicker, setShowAttachmentPicker] = useState<'pairing' | 'foodCost' | null>(null);
  const [userPairings, setUserPairings] = useState<any[]>([]);
  const [userFoodCosts, setUserFoodCosts] = useState<any[]>([]);

  const lastLoadedRecipeIdRef = useRef<string | null>(initialDraft?.currentRecipeId ?? null);

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
    const { data } = await supabase.from('social_posts').select('id').eq('recipe_id', id).maybeSingle();
    setIsShared(!!data);
  };

  const fetchSpecificRecipe = async (id: string) => {
    const { data, error } = await supabase.from('recipes').select('*').eq('id', id).eq('user_id', user?.id).single();
    if (data && !error) {
      loadRecipe(data);
    }
  };

  const fetchUserRecipes = async () => {
    if (!user) return;
    const { data } = await supabase.from('recipes').select('*').eq('user_id', user.id).order('updated_at', { ascending: false });
    if (data) setUserRecipes(data);
  };

  const fetchPairings = async () => {
    if (!user) return;
    const { data } = await supabase.from('pairings').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
    if (data) setUserPairings(data);
  };

  const fetchFoodCosts = async () => {
    if (!user) return;
    const { data } = await supabase.from('food_costs').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
    if (data) setUserFoodCosts(data);
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
    setShowToast(true);
    setToastMsg('New canvas ready');
    setTimeout(() => setShowToast(false), 2000);
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

    setToastMsg(`Loaded: ${recipe.title || recipe.name}`);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 2000);
  };

  const handleManualSave = async () => {
    if (!isLoggedIn || !user) return alert("Sign in to save.");
    if (!title) return alert("Name your masterpiece.");

    setSaving(true);
    try {
      const payload: any = {
        title: title,
        name: title,
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
        setLastSaved(new Date().toLocaleTimeString());
        setToastMsg('Studio Cloud updated');
        setShowToast(true);
        setTimeout(() => setShowToast(false), 3000);
        fetchUserRecipes();
      }
    } catch (error: any) {
      alert("Save failed: " + error.message);
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
        setToastMsg('Masterpiece is now Private');
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
        setToastMsg('Masterpiece Shared with Community!');
      }
      setShowToast(true);
      setTimeout(() => setShowToast(false), 3000);
    } catch (err: any) {
      alert("Action failed: " + err.message);
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
      setToastMsg('Recipe deleted permanently');
      setShowToast(true);
      setTimeout(() => setShowToast(false), 3000);
    } catch (err: any) { alert("Delete failed: " + err.message); } finally { setSaving(false); }
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
    } catch (err: any) { alert("Upload error: " + err.message); } finally { setSaving(false); }
  };

  const addSubdivision = () => setSubdivisions([...subdivisions, { id: `sub-${Date.now()}`, title: 'New Subdivision', items: [{ id: `ing-${Date.now()}`, name: '', quantity: '', unit: 'kg' }] }]);
  const addIngredientToSub = (subId: string) => setSubdivisions(subdivisions.map(s => s.id === subId ? { ...s, items: [...s.items, { id: `ing-${Date.now()}`, name: '', quantity: '', unit: 'kg' }] } : s));
  const updateIngredient = (subId: string, ingId: string, updates: any) => setSubdivisions(subdivisions.map(s => s.id === subId ? { ...s, items: s.items.map(i => i.id === ingId ? { ...i, ...updates } : i) } : s));
  const removeIngredient = (subId: string, ingId: string) => setSubdivisions(subdivisions.map(s => s.id === subId ? { ...s, items: s.items.filter(i => i.id !== ingId) } : s));
  const addStep = () => setSteps([...steps, '']);
  const updateStep = (idx: number, val: string) => { const ns = [...steps]; ns[idx] = val; setSteps(ns); };
  const removeStep = (idx: number) => setSteps(steps.filter((_, i) => i !== idx));
  const addNote = () => { if (!newNoteContent.trim()) return; setNotes([...notes, { id: `note-${Date.now()}`, type: newNoteType, content: newNoteContent }]); setNewNoteContent(''); };
  // Fixed error on line 417: Added the missing removeNote function
  const removeNote = (id: string) => setNotes(notes.filter(n => n.id !== id));
  const attachPairing = (p: any) => {
    if (attachments.find(a => a.itemId === p.id)) return;
    setAttachments([...attachments, {
      id: `att-${Date.now()}`,
      type: 'pairing',
      itemId: p.id,
      itemName: p.title || p.ingredients.join(' + '),
      itemData: { compatibilityScore: p.analysis?.compatibilityScore },
      attachedAt: new Date().toISOString()
    }]);
    setShowAttachmentPicker(null);
  };

  const attachFoodCost = (f: any) => {
    if (attachments.find(a => a.itemId === f.id)) return;
    setAttachments([...attachments, {
      id: `att-${Date.now()}`,
      type: 'foodCost',
      itemId: f.id,
      itemName: f.recipe_name,
      itemData: { template: f.template, costPerServing: f.data?.totals?.costPerServing, totalCost: f.data?.totals?.combinedTotalCost },
      attachedAt: new Date().toISOString()
    }]);
    setShowAttachmentPicker(null);
  };

  return (
    <div className="h-full flex flex-col bg-background-light dark:bg-background-dark relative font-sans overflow-hidden">
      <header className="p-4 md:p-6 border-b border-gray-100 dark:border-gray-800 flex flex-col md:flex-row items-center justify-between gap-4 sticky top-0 bg-white/90 dark:bg-background-dark/90 backdrop-blur-md z-30">
        <div className="flex flex-col gap-1 w-full md:w-auto">
          <input className="text-lg md:text-2xl font-black uppercase tracking-tight bg-transparent border-none focus:ring-0 p-0 w-full md:w-[400px] placeholder:text-gray-300 dark:text-white outline-none" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Name masterpiece..." />
          {lastSaved && (
             <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-gray-50 dark:bg-white/5 text-[8px] font-black uppercase tracking-widest text-text-muted w-fit">
              <span className={`size-1.5 rounded-full ${saving ? 'bg-amber-500 animate-pulse' : 'bg-green-500'}`}></span>
              {saving ? 'Syncing...' : `CLOUD SAVED ${lastSaved}`}
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-2 w-full md:w-auto justify-center md:justify-end">
           <button onClick={() => { fetchUserRecipes(); setShowMyRecipes(true); }} className="flex-1 md:flex-none px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-[10px] font-black uppercase tracking-widest hover:bg-white dark:hover:bg-white/5 transition-all flex items-center justify-center gap-2">
             <span className="material-symbols-outlined text-[18px]">folder_special</span> <span className="hidden md:inline">Recipes</span>
           </button>
           <button onClick={toggleShare} disabled={saving || !currentRecipeId} className={`flex-1 md:flex-none px-4 py-2.5 rounded-xl border-2 text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${isShared ? 'border-amber-500 text-amber-500 hover:bg-amber-500 hover:text-white' : 'border-primary text-primary hover:bg-primary hover:text-black'}`}>
             <span className="material-symbols-outlined text-[18px]">{isShared ? 'public_off' : 'public'}</span>
             <span className="hidden md:inline">{isShared ? 'Stop Sharing' : 'Share'}</span>
           </button>
           <button onClick={handleManualSave} disabled={saving} className="flex-1 md:flex-none px-5 py-2.5 rounded-xl bg-primary text-black text-[10px] font-black uppercase tracking-widest shadow-lg hover:scale-105 transition-all flex items-center justify-center gap-2">
             <span className="material-symbols-outlined text-[18px]">cloud_upload</span> {currentRecipeId ? 'Update' : 'Save'}
           </button>
           <button onClick={handleNewRecipe} className="size-10 md:size-11 rounded-xl bg-black text-white flex items-center justify-center hover:scale-110 transition-transform"><span className="material-symbols-outlined">add</span></button>
        </div>
      </header>

      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        <aside className="w-full md:w-64 border-b md:border-b-0 md:border-r border-gray-100 dark:border-gray-800 p-2 md:p-6 flex flex-row md:flex-col gap-2 shrink-0 bg-gray-50/50 dark:bg-black/20 overflow-x-auto no-scrollbar">
           {[
             { id: 'info', icon: 'info', label: 'Info' },
             { id: 'ingredients', icon: 'restaurant', label: 'Ingredients' },
             { id: 'steps', icon: 'list', label: 'Steps' },
             { id: 'picture', icon: 'photo', label: 'Picture' },
             { id: 'notes', icon: 'note', label: 'Notes' },
             { id: 'attachments', icon: 'attachment', label: 'Attachments' }
           ].map(t => (
             <button key={t.id} onClick={() => setActiveTab(t.id)} className={`flex items-center gap-3 px-4 py-2.5 md:py-3 rounded-xl text-[10px] md:text-xs font-black uppercase tracking-widest transition-all whitespace-nowrap ${activeTab === t.id ? 'bg-primary text-black shadow-md' : 'text-text-muted hover:bg-white dark:hover:bg-white/5'}`}>
               <span className="material-symbols-outlined text-[20px]">{t.icon}</span> <span className="">{t.label}</span>
             </button>
           ))}
        </aside>

        <main className="flex-1 overflow-y-auto p-4 md:p-12 scroll-smooth">
          <div className="max-w-4xl mx-auto space-y-12 pb-24 animate-fade-in">
            {activeTab === 'info' && (
              <div className="space-y-8">
                <div className="flex flex-col gap-2">
                   <label className="text-[10px] font-black uppercase tracking-widest text-text-muted">Masterpiece Description</label>
                   <textarea value={description} onChange={(e) => setDescription(e.target.value)} className="w-full bg-white dark:bg-white/5 border border-gray-100 dark:border-gray-800 rounded-2xl p-4 md:p-6 text-sm min-h-[150px] focus:ring-1 focus:ring-primary outline-none dark:text-white" placeholder="Inspiration..." />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                   <div className="flex flex-col gap-2"><label className="text-[10px] font-black uppercase tracking-widest text-text-muted">Difficulty</label>
                    <select className="bg-white dark:bg-surface-dark border border-gray-100 dark:border-gray-800 rounded-xl p-3 text-xs font-black uppercase outline-none focus:ring-1 focus:ring-primary dark:text-white" value={difficulty} onChange={e => setDifficulty(e.target.value)}>
                      <option>Beginner</option><option>Intermediate</option><option>Advanced</option>
                    </select>
                   </div>
                   <div className="flex flex-col gap-2"><label className="text-[10px] font-black uppercase tracking-widest text-text-muted">Prep Time</label>
                    <div className="flex gap-2">
                      <input type="number" className="flex-1 bg-white dark:bg-white/5 border border-gray-100 dark:border-gray-800 rounded-xl p-3 text-xs font-bold dark:text-white" value={prepTime} onChange={e => setPrepTime(parseInt(e.target.value) || 0)} />
                      <select className="bg-white dark:bg-surface-dark border border-gray-100 dark:border-gray-800 rounded-xl px-2 text-[10px] font-black uppercase dark:text-white" value={prepTimeUnit} onChange={e => setPrepTimeUnit(e.target.value as any)}>
                        <option value="mins">Mins</option><option value="hours">Hours</option>
                      </select>
                    </div>
                   </div>
                   <div className="flex flex-col gap-2"><label className="text-[10px] font-black uppercase tracking-widest text-text-muted">Servings</label>
                    <input type="number" className="bg-white dark:bg-white/5 border border-gray-100 dark:border-gray-800 rounded-xl p-3 text-xs font-bold dark:text-white" value={servings} onChange={e => setServings(parseInt(e.target.value) || 1)} />
                   </div>
                </div>
              </div>
            )}
            {activeTab === 'ingredients' && (
              <div className="space-y-10">
                <div className="flex items-center justify-between"><h3 className="text-lg md:text-xl font-black uppercase tracking-tight">Ingredient Mapping</h3><button onClick={addSubdivision} className="bg-black text-white px-3 py-2 rounded-xl text-[9px] font-black uppercase">Add Subdivision</button></div>
                <div className="space-y-12">
                  {subdivisions.map(sub => (
                    <div key={sub.id} className="bg-white dark:bg-white/5 rounded-3xl p-5 md:p-8 border border-gray-100 dark:border-gray-800 space-y-6">
                      <div className="flex items-center gap-4">
                        <input className="text-base md:text-lg font-black uppercase tracking-widest bg-transparent border-none focus:ring-0 p-0 flex-1 dark:text-white outline-none" value={sub.title} onChange={e => setSubdivisions(subdivisions.map(s => s.id === sub.id ? { ...s, title: e.target.value } : s))} placeholder="Title..." />
                        <button onClick={() => setSubdivisions(subdivisions.filter(s => s.id !== sub.id))} className="text-red-500 material-symbols-outlined">delete</button>
                      </div>
                      <div className="space-y-3">
                        {sub.items.map((ing) => (
                          <div key={ing.id} className="flex flex-wrap md:flex-nowrap gap-2 md:gap-3 items-center">
                            <input placeholder="Name" className="w-full md:flex-[3] h-11 bg-gray-50 dark:bg-black/20 border-none rounded-xl px-4 text-sm font-bold dark:text-white outline-none" value={ing.name} onChange={e => updateIngredient(sub.id, ing.id, { name: e.target.value })} />
                            <div className="flex flex-1 gap-2 min-w-[150px]">
                              <input placeholder="Qty" className="flex-1 h-11 bg-gray-50 dark:bg-black/20 border-none rounded-xl px-4 text-sm font-bold text-center dark:text-white outline-none" value={ing.quantity} onChange={e => updateIngredient(sub.id, ing.id, { quantity: e.target.value })} />
                              <select className="flex-1 h-11 bg-gray-50 dark:bg-black/20 border-none rounded-xl px-2 text-[10px] font-black uppercase dark:text-white outline-none" value={ing.unit} onChange={e => updateIngredient(sub.id, ing.id, { unit: e.target.value })}>
                                <option>kg</option><option>g</option><option>L</option><option>ml</option><option>unit</option><option>tsp</option><option>tbsp</option>
                              </select>
                            </div>
                            <button onClick={() => removeIngredient(sub.id, ing.id)} className="text-gray-300 hover:text-red-500 p-2"><span className="material-symbols-outlined text-[18px]">close</span></button>
                          </div>
                        ))}
                      </div>
                      <button onClick={() => addIngredientToSub(sub.id)} className="w-full py-3 border-2 border-dashed border-gray-100 dark:border-gray-800 rounded-xl text-[9px] font-black uppercase text-text-muted hover:border-primary transition-all">+ Add Ingredient</button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {activeTab === 'steps' && (
              <div className="space-y-8">
                <div className="flex items-center justify-between"><h3 className="text-lg md:text-xl font-black uppercase tracking-tight">Sequence</h3><button onClick={addStep} className="bg-black text-white px-3 py-2 rounded-xl text-[9px] font-black uppercase">Add Step</button></div>
                <div className="space-y-6">
                  {steps.map((step, idx) => (
                    <div key={idx} className="flex gap-4 md:gap-6 group">
                      <div className="size-10 md:size-12 rounded-2xl bg-primary text-black font-black flex items-center justify-center shrink-0 shadow-lg text-sm md:text-base">{idx + 1}</div>
                      <div className="flex-1 flex flex-col gap-2">
                        <textarea className="w-full bg-white dark:bg-white/5 border border-gray-100 dark:border-gray-800 rounded-2xl p-4 text-sm focus:ring-1 focus:ring-primary outline-none min-h-[80px] dark:text-white" value={step} onChange={e => updateStep(idx, e.target.value)} placeholder="Process..." />
                        <button onClick={() => removeStep(idx)} className="text-[9px] font-black uppercase text-red-500 opacity-60 md:opacity-0 group-hover:opacity-100 transition-opacity w-fit px-2">Remove Step</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {activeTab === 'picture' && (
              <div className="space-y-8">
                <div className="flex items-center justify-between"><h3 className="text-lg md:text-xl font-black uppercase tracking-tight">Pictures</h3><span className="text-[10px] font-black uppercase text-text-muted">{images.length} / 3</span></div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
                  {images.map((img, i) => (
                    <div key={i} className="aspect-square rounded-3xl overflow-hidden border border-gray-100 dark:border-gray-800 relative group shadow-xl">
                      <img src={img} className="size-full object-cover transition-transform group-hover:scale-110" />
                      <button className="absolute top-2 right-2 bg-red-500 size-8 rounded-full text-white opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => setImages(images.filter((_, idx) => idx !== i))}><span className="material-symbols-outlined text-[16px]">delete</span></button>
                    </div>
                  ))}
                  {images.length < 3 && (
                    <label className="aspect-square rounded-3xl border-2 border-dashed border-gray-200 dark:border-gray-800 flex flex-col items-center justify-center cursor-pointer hover:border-primary transition-colors bg-gray-50/50 dark:bg-white/5">
                      <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
                      <span className="material-symbols-outlined text-5xl text-gray-200">add_a_photo</span>
                    </label>
                  )}
                </div>
              </div>
            )}
            {activeTab === 'notes' && (
              <div className="space-y-8">
                <div className="bg-white dark:bg-white/5 p-5 md:p-8 rounded-3xl border border-gray-100 dark:border-gray-800 space-y-6">
                  <div className="flex flex-col gap-4">
                    <div className="flex flex-wrap gap-2">
                      {(['tip', 'suggestion', 'alternative', 'substitute'] as ChefNoteType[]).map(t => (
                        <button key={t} onClick={() => setNewNoteType(t)} className={`flex-1 min-w-[80px] py-2 rounded-xl text-[9px] font-black uppercase border transition-all ${newNoteType === t ? `${NOTE_COLORS[t]} text-white border-transparent shadow-lg` : 'bg-transparent text-text-muted border-gray-100 dark:border-gray-800'}`}>{t}</button>
                      ))}
                    </div>
                    <textarea value={newNoteContent} onChange={e => setNewNoteContent(e.target.value)} placeholder={`Note content...`} className="w-full h-24 bg-gray-50 dark:bg-black/20 border-none rounded-2xl p-4 text-sm font-medium focus:ring-1 focus:ring-primary outline-none dark:text-white" />
                    <button onClick={addNote} className="bg-black text-white py-3 rounded-2xl text-[10px] font-black uppercase shadow-xl">Add Note</button>
                  </div>
                  <div className="space-y-3 pt-6 border-t border-gray-100 dark:border-gray-800">
                    {notes.map(note => (
                      <div key={note.id} className="flex gap-4 p-4 rounded-2xl bg-gray-50 dark:bg-black/20 group animate-fade-in border-l-4" style={{ borderLeftColor: NOTE_HEX[note.type] }}>
                        <div className={`size-8 rounded-lg ${NOTE_COLORS[note.type]} text-white flex items-center justify-center shrink-0`}><span className="material-symbols-outlined text-[18px]">lightbulb</span></div>
                        <div className="flex-1"><p className="text-[9px] font-black uppercase text-text-muted mb-1">{note.type}</p><p className="text-sm font-medium dark:text-gray-200">{note.content}</p></div>
                        <button onClick={() => removeNote(note.id)} className="text-gray-300 hover:text-red-500 opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity"><span className="material-symbols-outlined text-[18px]">delete</span></button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
            {activeTab === 'attachments' && (
              <div className="space-y-8">
                <div className="space-y-1">
                  <h3 className="text-lg md:text-xl font-black uppercase tracking-tight">Linked Studio Intelligence</h3>
                  <p className="text-xs text-text-muted font-medium">Attach molecular pairing analyses and food costing calculations to this recipe canvas.</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <button 
                    onClick={() => { fetchPairings(); setShowAttachmentPicker('pairing'); }} 
                    className="p-8 bg-white dark:bg-white/5 border border-gray-100 dark:border-gray-800 rounded-3xl flex items-center gap-6 hover:border-blue-500 transition-all group shadow-sm text-left"
                  >
                     <div className="size-16 rounded-2xl bg-blue-500/10 text-blue-500 flex items-center justify-center group-hover:scale-110 transition-transform shrink-0">
                       <span className="material-symbols-outlined text-4xl">science</span>
                     </div>
                     <div>
                       <span className="text-sm font-black uppercase tracking-wider block">Link Pairing Analysis</span>
                       <span className="text-xs text-text-muted font-medium">Attach flavor affinity reports and scores</span>
                     </div>
                  </button>

                  <button 
                    onClick={() => { fetchFoodCosts(); setShowAttachmentPicker('foodCost'); }} 
                    className="p-8 bg-white dark:bg-white/5 border border-gray-100 dark:border-gray-800 rounded-3xl flex items-center gap-6 hover:border-amber-500 transition-all group shadow-sm text-left"
                  >
                     <div className="size-16 rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center group-hover:scale-110 transition-transform shrink-0">
                       <span className="material-symbols-outlined text-4xl">payments</span>
                     </div>
                     <div>
                       <span className="text-sm font-black uppercase tracking-wider block">Link Food Cost</span>
                       <span className="text-xs text-text-muted font-medium">Attach cost per serving & sub-recipe sheets</span>
                     </div>
                  </button>
                </div>

                <div className="space-y-4">
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-text-muted border-b border-gray-100 dark:border-gray-800 pb-2">Currently Attached ({attachments.length})</h4>
                  {attachments.map(att => (
                    <div key={att.id} className="p-4 bg-white dark:bg-white/5 border border-gray-100 dark:border-gray-800 rounded-2xl flex items-center justify-between group shadow-sm hover:border-primary transition-all">
                       <div className="flex items-center gap-4">
                         <div className={`size-10 rounded-xl flex items-center justify-center ${att.type === 'foodCost' ? 'bg-amber-500/10 text-amber-500' : 'bg-blue-500/10 text-blue-500'}`}>
                           <span className="material-symbols-outlined text-[20px]">{att.type === 'foodCost' ? 'payments' : 'science'}</span>
                         </div>
                         <div className="flex flex-col">
                           <span className="text-xs font-black uppercase">{att.itemName}</span>
                           <span className="text-[9px] text-text-muted font-bold uppercase tracking-widest">{att.type === 'foodCost' ? 'Costing Calculation' : 'Molecular Pairing'}</span>
                         </div>
                       </div>
                       <button onClick={() => setAttachments(attachments.filter(a => a.id !== att.id))} className="text-gray-300 hover:text-red-500 opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity p-2">
                         <span className="material-symbols-outlined text-[18px]">close</span>
                       </button>
                    </div>
                  ))}
                  {attachments.length === 0 && (
                    <div className="p-8 text-center text-text-muted border-2 border-dashed border-gray-200 dark:border-gray-800 rounded-2xl text-xs font-bold uppercase tracking-widest">
                      No intelligence linked yet. Click above to attach saved pairings or food costs.
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
          <div className="relative w-full max-w-2xl bg-white dark:bg-surface-dark rounded-3xl shadow-2xl overflow-hidden animate-fade-in border border-gray-100 dark:border-gray-800 flex flex-col max-h-[80vh]">
            <header className="p-5 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between bg-gray-50 dark:bg-white/5"><h3 className="text-lg font-black uppercase">My Recipes</h3><button onClick={() => setShowMyRecipes(false)} className="material-symbols-outlined">close</button></header>
            <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
              {userRecipes.map(recipe => (
                <div key={recipe.id} className="p-4 bg-gray-50 dark:bg-black/20 rounded-2xl border border-transparent hover:border-primary transition-all flex items-center justify-between gap-4">
                  <div className="flex flex-col overflow-hidden"><span className="font-black text-sm uppercase truncate">{recipe.title || recipe.name}</span><span className="text-[10px] text-text-muted font-bold uppercase tracking-widest">{recipe.difficulty}</span></div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => loadRecipe(recipe)} className="size-10 rounded-lg bg-primary text-black flex items-center justify-center hover:scale-105 transition-transform"><span className="material-symbols-outlined text-[20px]">edit</span></button>
                    <button onClick={() => setShowDeleteConfirm(recipe.id)} className="size-10 rounded-lg bg-red-500 text-white flex items-center justify-center hover:scale-105 transition-transform"><span className="material-symbols-outlined text-[20px]">delete</span></button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {showDeleteConfirm && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/90 backdrop-blur-sm" onClick={() => setShowDeleteConfirm(null)}></div>
          <div className="relative w-full max-w-sm bg-white dark:bg-surface-dark rounded-3xl shadow-2xl p-8 border border-red-500/20 text-center space-y-6 animate-fade-in">
             <div className="size-16 rounded-full bg-red-500/10 text-red-500 flex items-center justify-center mx-auto"><span className="material-symbols-outlined text-4xl">warning</span></div>
             <div className="space-y-2"><h3 className="text-xl font-black uppercase">Destroy Recipe?</h3><p className="text-xs text-text-muted font-medium">This action is permanent.</p></div>
             <div className="flex gap-3"><button onClick={() => setShowDeleteConfirm(null)} className="flex-1 py-3 rounded-xl bg-gray-100 dark:bg-white/5 text-[10px] font-black uppercase">Cancel</button><button onClick={() => deleteRecipe(showDeleteConfirm)} className="flex-1 py-3 rounded-xl bg-red-500 text-white text-[10px] font-black uppercase">Delete</button></div>
          </div>
        </div>
      )}

      {showToast && (
        <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[500] bg-black text-white px-8 py-4 rounded-2xl shadow-2xl font-black uppercase tracking-widest text-[10px] animate-fade-in flex items-center gap-2 border border-primary/20">
          <span className="material-symbols-outlined text-primary">verified</span> {toastMsg}
        </div>
      )}

      {showAttachmentPicker && (
        <div className="fixed inset-0 z-[400] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={() => setShowAttachmentPicker(null)}></div>
          <div className="relative w-full max-w-md bg-white dark:bg-surface-dark rounded-3xl shadow-2xl overflow-hidden border border-gray-100 dark:border-gray-800 flex flex-col max-h-[75vh]">
             <header className="p-6 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between bg-gray-50 dark:bg-white/5">
               <div className="flex items-center gap-3">
                 <span className={`material-symbols-outlined ${showAttachmentPicker === 'foodCost' ? 'text-amber-500' : 'text-blue-500'}`}>
                   {showAttachmentPicker === 'foodCost' ? 'payments' : 'science'}
                 </span>
                 <h3 className="text-lg font-black uppercase">
                   {showAttachmentPicker === 'foodCost' ? 'Attach Food Cost' : 'Attach Pairing Analysis'}
                 </h3>
               </div>
               <button onClick={() => setShowAttachmentPicker(null)} className="material-symbols-outlined text-gray-400 hover:text-white">close</button>
             </header>
             <div className="p-6 overflow-y-auto space-y-3 flex-1">
                {showAttachmentPicker === 'pairing' && (
                  userPairings.length > 0 ? (
                    userPairings.map(p => (
                      <button key={p.id} onClick={() => attachPairing(p)} className="w-full p-4 bg-gray-50 dark:bg-black/20 rounded-2xl flex items-center justify-between hover:border-blue-500 border border-transparent transition-all group text-left">
                        <div className="flex flex-col truncate pr-2">
                          <span className="text-xs font-black uppercase truncate group-hover:text-blue-500 transition-colors">{p.title || p.ingredients.join(' + ')}</span>
                          <span className="text-[9px] text-text-muted font-bold">{p.analysis?.compatibilityScore || 0}% Synergy Score</span>
                        </div>
                        <span className="material-symbols-outlined text-blue-500 shrink-0">add_circle</span>
                      </button>
                    ))
                  ) : (
                    <div className="py-12 text-center text-text-muted text-xs font-bold uppercase tracking-widest">
                      No saved pairings found. Create analyses in Pairing Analysis first.
                    </div>
                  )
                )}

                {showAttachmentPicker === 'foodCost' && (
                  userFoodCosts.length > 0 ? (
                    userFoodCosts.map(f => (
                      <button key={f.id} onClick={() => attachFoodCost(f)} className="w-full p-4 bg-gray-50 dark:bg-black/20 rounded-2xl flex items-center justify-between hover:border-amber-500 border border-transparent transition-all group text-left">
                        <div className="flex flex-col truncate pr-2">
                          <span className="text-xs font-black uppercase truncate group-hover:text-amber-500 transition-colors">{f.recipe_name}</span>
                          <span className="text-[9px] text-text-muted font-bold uppercase">{f.template} Template</span>
                        </div>
                        <span className="material-symbols-outlined text-amber-500 shrink-0">add_circle</span>
                      </button>
                    ))
                  ) : (
                    <div className="py-12 text-center text-text-muted text-xs font-bold uppercase tracking-widest">
                      No saved food cost calculations found. Create sheets in Food Cost first.
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
