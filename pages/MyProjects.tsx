import React, { useState, useMemo, useEffect } from 'react';
import { Project } from '../types';
import { useAppContext } from '../AppContext';
import { supabase } from '../supabaseClient';
import { useNavigate } from 'react-router-dom';

type ViewState = 'LIST' | 'DETAIL' | 'ALL_RECIPES' | 'ALL_PAIRINGS' | 'ALL_COSTS' | 'SHARED_HUB';

interface SharedItemRecord {
  id: string;
  sender_id: string;
  recipient_id: string;
  item_type: 'recipe' | 'pairing' | 'food_cost' | 'project';
  item_id: string;
  permission: 'view' | 'edit';
  created_at: string;
  senderProfile?: any;
  recipientProfile?: any;
  itemDetails?: any;
}

export const MyProjects = () => {
  const { t, user, isLoggedIn } = useAppContext();
  const navigate = useNavigate();
  
  // --- CORE STATE ---
  const [view, setView] = useState<ViewState>('LIST');
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [recipes, setRecipes] = useState<any[]>([]);
  const [pairings, setPairings] = useState<any[]>([]);
  const [foodCosts, setFoodCosts] = useState<any[]>([]);
  const [sharedRecipeIds, setSharedRecipeIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // --- MODALS STATE ---
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showAddItemsModal, setShowAddItemsModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareModalTab, setShareModalTab] = useState<'SHARE_NEW' | 'SHARED_LIST'>('SHARE_NEW');
  const [sharedListSubTab, setSharedListSubTab] = useState<'SENT' | 'RECEIVED'>('RECEIVED');

  // Deletion States
  const [itemToDelete, setItemToDelete] = useState<{ type: 'project' | 'recipe' | 'pairing' | 'food_cost'; id: string; name: string } | null>(null);

  // Create Project Form
  const [newProject, setNewProject] = useState({ 
    title: '', 
    description: '', 
    color: 'orange' as Project['color'] 
  });

  // Sharing System Form
  const [shareTargetType, setShareTargetType] = useState<'recipe' | 'pairing' | 'food_cost' | 'project'>('recipe');
  const [shareTargetItemId, setShareTargetItemId] = useState<string>('');
  const [shareRecipientSearch, setShareRecipientSearch] = useState('');
  const [recipientResults, setRecipientResults] = useState<any[]>([]);
  const [selectedRecipient, setSelectedRecipient] = useState<any | null>(null);
  const [sharePermission, setSharePermission] = useState<'view' | 'edit'>('view');
  const [sharesSent, setSharesSent] = useState<SharedItemRecord[]>([]);
  const [sharesReceived, setSharesReceived] = useState<SharedItemRecord[]>([]);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  };

  // --- FETCH DATA ---
  const fetchAllData = async () => {
    if (!isLoggedIn || !user) return;
    setLoading(true);
    try {
      const [projRes, recRes, pairRes, costRes, socialRes] = await Promise.all([
        supabase.from('projects').select('*').eq('user_id', user.id).order('updated_at', { ascending: false }),
        supabase.from('recipes').select('*').eq('user_id', user.id).order('updated_at', { ascending: false }),
        supabase.from('pairings').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
        supabase.from('food_costs').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
        supabase.from('social_posts').select('recipe_id').eq('user_id', user.id)
      ]);

      if (projRes.data) setProjects(projRes.data.map(p => ({
        ...p,
        userId: p.user_id,
        createdAt: p.created_at,
        updatedAt: p.updated_at,
        recipes: [], 
        foodCosts: [],
        pairings: []
      })));
      
      if (recRes.data) setRecipes(recRes.data);
      if (pairRes.data) setPairings(pairRes.data);
      if (costRes.data) setFoodCosts(costRes.data);
      if (socialRes.data) setSharedRecipeIds(new Set(socialRes.data.map(s => s.recipe_id)));

      await fetchShares();

    } catch (e) {
      console.error("Error fetching library:", e);
    } finally {
      setLoading(false);
    }
  };

  const fetchShares = async () => {
    if (!user) return;
    try {
      const [sentRes, receivedRes] = await Promise.all([
        supabase.from('shared_items').select('*, recipient:recipient_id(id, chef_name, username, avatar_url)').eq('sender_id', user.id).order('created_at', { ascending: false }),
        supabase.from('shared_items').select('*, sender:sender_id(id, chef_name, username, avatar_url)').eq('recipient_id', user.id).order('created_at', { ascending: false })
      ]);

      if (sentRes.data) setSharesSent(sentRes.data);
      if (receivedRes.data) setSharesReceived(receivedRes.data);
    } catch (e) {
      console.error("Error fetching shares:", e);
    }
  };

  useEffect(() => {
    if (isLoggedIn && user) {
      fetchAllData();
    }
  }, [isLoggedIn, user]);

  // Search recipient chefs
  useEffect(() => {
    const searchChefs = async () => {
      if (!shareRecipientSearch.trim() || shareRecipientSearch.length < 2 || !user) {
        setRecipientResults([]);
        return;
      }
      try {
        const { data } = await supabase
          .from('profiles')
          .select('id, chef_name, username, avatar_url')
          .neq('id', user.id)
          .or(`chef_name.ilike.%${shareRecipientSearch}%,username.ilike.%${shareRecipientSearch}%`)
          .limit(8);

        setRecipientResults(data || []);
      } catch (e) {
        console.error("Search profiles error:", e);
      }
    };

    const debounceTimer = setTimeout(searchChefs, 300);
    return () => clearTimeout(debounceTimer);
  }, [shareRecipientSearch, user]);

  // --- ACTIONS ---
  const togglePublicCommunityShare = async (recipe: any, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) return;
    const isShared = sharedRecipeIds.has(recipe.id);
    
    setLoading(true);
    try {
      if (isShared) {
        await supabase.from('social_posts').delete().match({ recipe_id: recipe.id, user_id: user.id });
        showToast("Recipe is now private.");
      } else {
        await supabase.from('social_posts').insert({
          user_id: user.id,
          recipe_id: recipe.id,
          title: recipe.title || recipe.name,
          description: recipe.description,
          image_url: recipe.images?.[0] || 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&q=80&w=1600',
          difficulty: recipe.difficulty
        });
        showToast("Recipe shared with community!");
      }
      fetchAllData();
    } catch (err: any) {
      showToast("Error: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const openShareModalForItem = (type: 'recipe' | 'pairing' | 'food_cost' | 'project', itemId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setShareTargetType(type);
    setShareTargetItemId(itemId);
    setShareModalTab('SHARE_NEW');
    setShowShareModal(true);
  };

  const handleExecuteShare = async () => {
    if (!user || !selectedRecipient || !shareTargetItemId) {
      showToast("Please choose an item and select a recipient chef.");
      return;
    }

    setLoading(true);
    try {
      const payload = {
        sender_id: user.id,
        recipient_id: selectedRecipient.id,
        item_type: shareTargetType,
        item_id: shareTargetItemId,
        permission: sharePermission
      };

      const { error } = await supabase.from('shared_items').upsert(payload, { onConflict: 'sender_id,recipient_id,item_type,item_id' });
      if (error) throw error;

      showToast(`Successfully shared with Chef ${selectedRecipient.chef_name || selectedRecipient.username}!`);
      setSelectedRecipient(null);
      setShareRecipientSearch('');
      await fetchShares();
      setShareModalTab('SHARED_LIST');
      setSharedListSubTab('SENT');
    } catch (err: any) {
      showToast("Sharing failed: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRevokeShare = async (shareId: string) => {
    setLoading(true);
    try {
      const { error } = await supabase.from('shared_items').delete().eq('id', shareId);
      if (error) throw error;
      showToast("Access revoked.");
      await fetchShares();
    } catch (err: any) {
      showToast("Error revoking access: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenSharedItem = (share: SharedItemRecord) => {
    setShowShareModal(false);
    if (share.item_type === 'recipe') {
      navigate(`/create-dish?id=${share.item_id}`);
    } else if (share.item_type === 'pairing') {
      navigate(`/pairing?id=${share.item_id}`);
    } else if (share.item_type === 'food_cost') {
      navigate(`/food-cost?id=${share.item_id}`);
    } else if (share.item_type === 'project') {
      setSelectedProjectId(share.item_id);
      setView('DETAIL');
    }
  };

  const confirmDeleteItem = async () => {
    if (!itemToDelete || !user) return;
    setLoading(true);
    try {
      const { type, id } = itemToDelete;
      let error;
      if (type === 'project') {
        await supabase.from('shared_items').delete().eq('item_id', id);
        const res = await supabase.from('projects').delete().eq('id', id).eq('user_id', user.id);
        error = res.error;
        if (!error) {
          setProjects(prev => prev.filter(p => p.id !== id));
          if (selectedProjectId === id) {
            setView('LIST');
            setSelectedProjectId(null);
          }
        }
      } else if (type === 'recipe') {
        // Cascade delete from social_posts and shared_items
        await supabase.from('social_posts').delete().eq('recipe_id', id);
        await supabase.from('shared_items').delete().eq('item_id', id);
        const res = await supabase.from('recipes').delete().eq('id', id).eq('user_id', user.id);
        error = res.error;
        if (!error) setRecipes(prev => prev.filter(r => r.id !== id));
      } else if (type === 'pairing') {
        await supabase.from('shared_items').delete().eq('item_id', id);
        const res = await supabase.from('pairings').delete().eq('id', id).eq('user_id', user.id);
        error = res.error;
        if (!error) setPairings(prev => prev.filter(p => p.id !== id));
      } else if (type === 'food_cost') {
        await supabase.from('shared_items').delete().eq('item_id', id);
        const res = await supabase.from('food_costs').delete().eq('id', id).eq('user_id', user.id);
        error = res.error;
        if (!error) setFoodCosts(prev => prev.filter(f => f.id !== id));
      }

      if (error) throw error;
      showToast("Item deleted successfully.");
      setItemToDelete(null);
    } catch (err: any) {
      showToast("Delete failed: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateProject = async () => {
    if (!newProject.title.trim() || !user) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('projects')
        .insert({
          title: newProject.title.trim(),
          description: newProject.description.trim(),
          color: newProject.color,
          user_id: user.id
        })
        .select()
        .single();

      if (error) throw error;
      
      await fetchAllData();
      setShowCreateModal(false);
      setNewProject({ title: '', description: '', color: 'orange' });
      showToast("Folder created.");
      if (data) {
        setSelectedProjectId(data.id);
        setView('DETAIL');
      }
    } catch (err: any) {
      showToast("Failed to create project: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const linkItemToProject = async (type: 'recipes' | 'pairings' | 'food_costs', itemId: string) => {
    if (!selectedProjectId) return;
    try {
      const { error } = await supabase.from(type).update({ project_id: selectedProjectId }).eq('id', itemId);
      if (error) throw error;
      await fetchAllData();
      showToast("Linked to folder.");
    } catch (err: any) { showToast("Link failed: " + err.message); }
  };

  const unlinkItem = async (type: 'recipes' | 'pairings' | 'food_costs', itemId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const { error } = await supabase.from(type).update({ project_id: null }).eq('id', itemId);
      if (error) throw error;
      await fetchAllData();
      showToast("Unlinked from folder.");
    } catch (err: any) { showToast("Unlink failed: " + err.message); }
  };

  const getProjectColorClass = (color: string) => {
    const colors: Record<string, string> = {
      orange: 'bg-amber-500', blue: 'bg-blue-500', red: 'bg-red-500', 
      green: 'bg-emerald-500', purple: 'bg-purple-500', yellow: 'bg-yellow-400', cyan: 'bg-cyan-500'
    };
    return colors[color] || 'bg-amber-500';
  };

  // Helper to reliably resolve cost sheet title from columns or nested JSON
  const getFoodCostName = (cost: any): string => {
    if (!cost) return 'Untitled Cost Sheet';
    const sheetInfo = (cost.ingredients && typeof cost.ingredients === 'object' && !Array.isArray(cost.ingredients))
      ? cost.ingredients
      : (cost.data && typeof cost.data === 'object' && !Array.isArray(cost.data))
        ? cost.data
        : {};
    return cost.recipe_name || cost.name || cost.title || sheetInfo.recipeName || sheetInfo.recipe_name || sheetInfo.title || sheetInfo.name || 'Untitled Cost Sheet';
  };

  // --- FILTERED DATA ---
  const filteredProjects = useMemo(() => projects.filter(p => p.title.toLowerCase().includes(searchTerm.toLowerCase())), [projects, searchTerm]);
  const filteredRecipes = useMemo(() => recipes.filter(r => (r.title || r.name || '').toLowerCase().includes(searchTerm.toLowerCase())), [recipes, searchTerm]);
  const filteredPairings = useMemo(() => pairings.filter(p => (p.title || p.ingredients.join(' ')).toLowerCase().includes(searchTerm.toLowerCase())), [pairings, searchTerm]);
  const filteredFoodCosts = useMemo(() => foodCosts.filter(f => getFoodCostName(f).toLowerCase().includes(searchTerm.toLowerCase())), [foodCosts, searchTerm]);
  const selectedProject = useMemo(() => projects.find(p => p.id === selectedProjectId), [projects, selectedProjectId]);
  const projectRecipes = useMemo(() => recipes.filter(r => r.project_id === selectedProjectId), [recipes, selectedProjectId]);
  const projectPairings = useMemo(() => pairings.filter(p => p.project_id === selectedProjectId), [pairings, selectedProjectId]);
  const projectFoodCosts = useMemo(() => foodCosts.filter(f => f.project_id === selectedProjectId), [foodCosts, selectedProjectId]);
  const unlinkedRecipes = useMemo(() => recipes.filter(r => !r.project_id), [recipes]);
  const unlinkedPairings = useMemo(() => pairings.filter(p => !p.project_id), [pairings]);
  const unlinkedFoodCosts = useMemo(() => foodCosts.filter(f => !f.project_id), [foodCosts]);

  // Current items available for the sharing modal
  const selectableShareItems = useMemo(() => {
    if (shareTargetType === 'recipe') return recipes.map(r => ({ id: r.id, name: r.title || r.name }));
    if (shareTargetType === 'pairing') return pairings.map(p => ({ id: p.id, name: p.title || p.ingredients.join(' + ') }));
    if (shareTargetType === 'food_cost') return foodCosts.map(f => ({ id: f.id, name: getFoodCostName(f) }));
    if (shareTargetType === 'project') return projects.map(pr => ({ id: pr.id, name: pr.title }));
    return [];
  }, [shareTargetType, recipes, pairings, foodCosts, projects]);

  const SectionHeader = () => (
    <div className="space-y-6 mb-10">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-1">
          <h1 className="text-4xl md:text-5xl font-black uppercase tracking-tight text-text-main dark:text-white leading-none">
            {view === 'LIST' ? 'My Projects' : 
             view === 'ALL_RECIPES' ? 'My Recipes' : 
             view === 'ALL_PAIRINGS' ? 'My Pairings' : 
             view === 'ALL_COSTS' ? 'Food Costs' : 
             selectedProject?.title}
          </h1>
          <p className="text-text-muted text-lg font-medium">
            {view === 'LIST' ? 'Organize your professional culinary folders & projects' : 
             view === 'ALL_RECIPES' ? 'Browse and manage your recipe masterpieces' : 
             view === 'ALL_PAIRINGS' ? 'Molecular research & flavor pairing database' : 
             view === 'ALL_COSTS' ? 'Calculate professional margins & sub-recipes' : 
             selectedProject?.description || 'Folder contents'}
          </p>
        </div>
        
        <div className="flex flex-col gap-3 items-end">
          <div className="flex flex-wrap gap-2">
            <button onClick={() => { setView('ALL_RECIPES'); setSearchTerm(''); }} className={`h-11 px-5 rounded-xl flex items-center gap-2 text-[10px] font-black uppercase tracking-widest transition-all ${view === 'ALL_RECIPES' ? 'bg-primary text-black shadow-lg shadow-primary/20' : 'bg-white dark:bg-white/5 border border-gray-100 dark:border-gray-800 text-gray-500 hover:text-primary'}`}>
              <span className="material-symbols-outlined text-[18px]">restaurant</span> Recipes
            </button>
            <button onClick={() => { setView('ALL_PAIRINGS'); setSearchTerm(''); }} className={`h-11 px-5 rounded-xl flex items-center gap-2 text-[10px] font-black uppercase tracking-widest transition-all ${view === 'ALL_PAIRINGS' ? 'bg-primary text-black shadow-lg shadow-primary/20' : 'bg-white dark:bg-white/5 border border-gray-100 dark:border-gray-800 text-gray-500 hover:text-primary'}`}>
              <span className="material-symbols-outlined text-[18px]">science</span> Pairings
            </button>
            <button onClick={() => { setView('ALL_COSTS'); setSearchTerm(''); }} className={`h-11 px-5 rounded-xl flex items-center gap-2 text-[10px] font-black uppercase tracking-widest transition-all ${view === 'ALL_COSTS' ? 'bg-primary text-black shadow-lg shadow-primary/20' : 'bg-white dark:bg-white/5 border border-gray-100 dark:border-gray-800 text-gray-500 hover:text-primary'}`}>
              <span className="material-symbols-outlined text-[18px]">payments</span> Costs
            </button>
            <button onClick={() => { setShowShareModal(true); setShareModalTab('SHARED_LIST'); }} className="h-11 px-5 rounded-xl flex items-center gap-2 text-[10px] font-black uppercase tracking-widest bg-blue-500/10 text-blue-500 border border-blue-500/20 hover:bg-blue-500 hover:text-white transition-all shadow-sm">
              <span className="material-symbols-outlined text-[18px]">share</span> Shared Hub ({sharesReceived.length})
            </button>
          </div>
          
          <div className="flex flex-wrap gap-2">
            <button onClick={() => { setView('LIST'); setSearchTerm(''); }} className={`h-11 px-5 rounded-xl flex items-center gap-2 text-[10px] font-black uppercase tracking-widest transition-all ${view === 'LIST' ? 'bg-black text-white dark:bg-white dark:text-black' : 'bg-white dark:bg-white/5 border border-gray-100 dark:border-gray-800 text-gray-500'}`}>
              <span className="material-symbols-outlined text-[18px]">folder</span> Folders
            </button>
            <button onClick={() => setShowCreateModal(true)} className="h-11 px-6 rounded-xl bg-primary text-black text-[10px] font-black uppercase tracking-widest shadow-xl hover:scale-105 transition-transform flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px]">add</span> New Folder
            </button>
          </div>
        </div>
      </div>

      <div className="relative max-w-xl mt-6">
        <input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Search in your studio..." className="w-full h-12 pl-12 pr-4 bg-white dark:bg-white/5 border border-gray-200 dark:border-gray-800 rounded-2xl focus:ring-1 focus:ring-primary outline-none text-sm dark:text-white shadow-sm" />
        <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-[22px]">search</span>
      </div>
    </div>
  );

  return (
    <div className="p-4 md:p-8 lg:p-12 animate-fade-in max-w-[1600px] mx-auto min-h-screen text-text-main dark:text-white">
      {/* TOAST */}
      {toastMsg && (
        <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[600] bg-black text-white px-8 py-4 rounded-2xl shadow-2xl font-black uppercase tracking-widest text-xs animate-fade-in flex items-center gap-3 border border-primary/30">
          <span className="material-symbols-outlined text-primary">verified</span> {toastMsg}
        </div>
      )}

      {isLoggedIn ? (
        <>
          <SectionHeader />

          {/* VIEW: FOLDERS LIST */}
          {view === 'LIST' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
              {filteredProjects.map(project => (
                <div key={project.id} onClick={() => { setSelectedProjectId(project.id); setView('DETAIL'); }} className="bg-white dark:bg-surface-dark rounded-[32px] border border-gray-100 dark:border-gray-800 p-8 shadow-sm hover:shadow-2xl transition-all cursor-pointer group flex flex-col gap-6">
                  <div className="flex items-start justify-between">
                    <div className={`size-16 rounded-2xl ${getProjectColorClass(project.color)} flex items-center justify-center text-white shadow-lg`}><span className="material-symbols-outlined text-4xl">folder</span></div>
                    <div className="flex items-center gap-1">
                      <button onClick={(e) => openShareModalForItem('project', project.id, e)} className="size-10 rounded-full hover:bg-blue-50 dark:hover:bg-white/10 text-gray-400 hover:text-blue-500 transition-colors flex items-center justify-center" title="Share Folder"><span className="material-symbols-outlined text-[20px]">share</span></button>
                      <button onClick={(e) => { e.stopPropagation(); setItemToDelete({ type: 'project', id: project.id, name: project.title }); }} className="size-10 rounded-full hover:bg-red-50 dark:hover:bg-white/10 text-gray-400 hover:text-red-500 transition-colors flex items-center justify-center" title="Delete Folder"><span className="material-symbols-outlined text-[20px]">delete</span></button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-2xl font-black uppercase tracking-tight truncate group-hover:text-primary transition-colors">{project.title}</h3>
                    <p className="text-xs text-text-muted font-medium line-clamp-2">{project.description || 'Archive folder.'}</p>
                  </div>
                  <div className="pt-6 border-t border-gray-50 dark:border-gray-800 mt-auto flex items-center justify-between">
                     <span className="text-[10px] font-black uppercase text-text-muted">Updated: {new Date(project.updatedAt).toLocaleDateString()}</span>
                     <span className="material-symbols-outlined text-primary group-hover:translate-x-1 transition-transform">arrow_forward</span>
                  </div>
                </div>
              ))}
              {filteredProjects.length === 0 && (
                <div className="col-span-full py-24 text-center text-text-muted border-2 border-dashed border-gray-200 dark:border-gray-800 rounded-[32px] flex flex-col items-center gap-4">
                  <span className="material-symbols-outlined text-6xl opacity-40">folder_open</span>
                  <p className="text-sm font-black uppercase tracking-widest">No project folders found</p>
                  <button onClick={() => setShowCreateModal(true)} className="px-6 py-3 bg-primary text-black text-xs font-black uppercase tracking-widest rounded-xl shadow-lg">+ Create First Folder</button>
                </div>
              )}
            </div>
          )}

          {/* VIEW: FOLDER DETAIL */}
          {view === 'DETAIL' && (
            <div className="space-y-12 animate-fade-in">
              <div className="flex items-center justify-between">
                <button onClick={() => setView('LIST')} className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-text-muted hover:text-primary transition-colors"><span className="material-symbols-outlined text-[18px]">arrow_back</span> Back to Folders</button>
                <div className="flex items-center gap-3">
                  {selectedProjectId && (
                    <button onClick={() => openShareModalForItem('project', selectedProjectId)} className="px-5 py-2.5 rounded-xl bg-blue-500/10 text-blue-500 border border-blue-500/20 text-[10px] font-black uppercase tracking-widest flex items-center gap-2 hover:bg-blue-500 hover:text-white transition-all">
                      <span className="material-symbols-outlined text-[18px]">share</span> Share Folder
                    </button>
                  )}
                  <button onClick={() => setShowAddItemsModal(true)} className="px-6 py-2.5 rounded-xl bg-black text-white dark:bg-white dark:text-black text-[10px] font-black uppercase tracking-widest shadow-xl flex items-center gap-2">
                    <span className="material-symbols-outlined text-[18px]">add_link</span> Add / Remove Items
                  </button>
                </div>
              </div>
              
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
                {/* Recipes Column */}
                <div className="space-y-6">
                  <h2 className="text-sm font-black uppercase tracking-widest border-b border-gray-100 dark:border-gray-800 pb-4 flex items-center justify-between">Recipes <span className="bg-primary/10 text-primary px-3 py-1 rounded-full">{projectRecipes.length}</span></h2>
                  <div className="grid gap-3">
                    {projectRecipes.map(recipe => (
                      <div key={recipe.id} className="p-5 bg-white dark:bg-surface-dark border border-gray-50 dark:border-gray-800 rounded-2xl flex items-center justify-between group cursor-pointer hover:border-primary transition-all">
                        <div onClick={() => navigate(`/create-dish?id=${recipe.id}`)} className="flex flex-col flex-1 truncate pr-3"><span className="text-sm font-black uppercase group-hover:text-primary truncate">{recipe.title || recipe.name}</span><span className="text-[9px] text-text-muted font-bold uppercase">{recipe.difficulty}</span></div>
                        <div className="flex items-center gap-2">
                          <button onClick={(e) => openShareModalForItem('recipe', recipe.id, e)} className="size-8 rounded-lg text-gray-400 hover:text-blue-500 flex items-center justify-center transition-colors" title="Share with Chef"><span className="material-symbols-outlined text-[18px]">share</span></button>
                          <button onClick={(e) => togglePublicCommunityShare(recipe, e)} className={`size-8 rounded-lg flex items-center justify-center transition-all ${sharedRecipeIds.has(recipe.id) ? 'text-primary' : 'text-gray-300 hover:text-primary'}`} title={sharedRecipeIds.has(recipe.id) ? 'Public in Community' : 'Publish to Community'}>
                            <span className={`material-symbols-outlined text-[18px] ${sharedRecipeIds.has(recipe.id) ? 'filled' : ''}`}>{sharedRecipeIds.has(recipe.id) ? 'public' : 'public'}</span>
                          </button>
                          <button onClick={(e) => unlinkItem('recipes', recipe.id, e)} className="size-8 rounded-lg text-gray-300 hover:text-red-500 flex items-center justify-center transition-all" title="Unlink from folder"><span className="material-symbols-outlined text-[18px]">link_off</span></button>
                        </div>
                      </div>
                    ))}
                    {projectRecipes.length === 0 && <p className="text-xs text-text-muted italic py-6 text-center">No recipes linked to this folder.</p>}
                  </div>
                </div>

                {/* Pairings Column */}
                <div className="space-y-6">
                   <h2 className="text-sm font-black uppercase tracking-widest border-b border-gray-100 dark:border-gray-800 pb-4 flex items-center justify-between">Pairings <span className="bg-blue-500/10 text-blue-500 px-3 py-1 rounded-full">{projectPairings.length}</span></h2>
                   <div className="grid gap-3">
                    {projectPairings.map(pairing => (
                      <div key={pairing.id} className="p-5 bg-white dark:bg-surface-dark border border-gray-50 dark:border-gray-800 rounded-2xl flex items-center justify-between group cursor-pointer hover:border-primary transition-all">
                        <div onClick={() => navigate(`/pairing?id=${pairing.id}`)} className="flex flex-col flex-1 truncate pr-3"><span className="text-sm font-black uppercase group-hover:text-primary truncate">{pairing.title || pairing.ingredients.join(' + ')}</span><span className="text-[9px] text-text-muted font-bold uppercase">{pairing.analysis?.compatibilityScore || 0}% Synergy</span></div>
                        <div className="flex items-center gap-2">
                          <button onClick={(e) => openShareModalForItem('pairing', pairing.id, e)} className="size-8 rounded-lg text-gray-400 hover:text-blue-500 flex items-center justify-center transition-colors" title="Share with Chef"><span className="material-symbols-outlined text-[18px]">share</span></button>
                          <button onClick={(e) => unlinkItem('pairings', pairing.id, e)} className="size-8 rounded-lg text-gray-300 hover:text-red-500 flex items-center justify-center transition-all" title="Unlink from folder"><span className="material-symbols-outlined text-[18px]">link_off</span></button>
                        </div>
                      </div>
                    ))}
                    {projectPairings.length === 0 && <p className="text-xs text-text-muted italic py-6 text-center">No pairings linked to this folder.</p>}
                  </div>
                </div>

                {/* Costs Column */}
                <div className="space-y-6">
                   <h2 className="text-sm font-black uppercase tracking-widest border-b border-gray-100 dark:border-gray-800 pb-4 flex items-center justify-between">Costs <span className="bg-amber-500/10 text-amber-500 px-3 py-1 rounded-full">{projectFoodCosts.length}</span></h2>
                   <div className="grid gap-3">
                    {projectFoodCosts.map(cost => {
                      const sheetInfo = (cost.ingredients && typeof cost.ingredients === 'object' && !Array.isArray(cost.ingredients))
                        ? cost.ingredients
                        : (cost.data && typeof cost.data === 'object' && !Array.isArray(cost.data))
                          ? cost.data
                          : {};
                      const costName = cost.recipe_name || cost.name || cost.title || sheetInfo.recipeName || sheetInfo.recipe_name || 'Untitled Cost Sheet';
                      return (
                        <div key={cost.id} className="p-5 bg-white dark:bg-surface-dark border border-gray-100 dark:border-gray-800 rounded-2xl flex items-center justify-between group cursor-pointer hover:border-primary transition-all">
                          <div onClick={() => navigate(`/food-cost?id=${cost.id}`)} className="flex flex-col flex-1 truncate pr-3">
                            <span className="text-sm font-black uppercase group-hover:text-primary truncate">{costName}</span>
                            <span className="text-[9px] text-text-muted font-bold uppercase">{cost.template || 'ADVANCED'}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <button onClick={(e) => openShareModalForItem('food_cost', cost.id, e)} className="size-8 rounded-lg text-gray-400 hover:text-blue-500 flex items-center justify-center transition-colors" title="Share with Chef"><span className="material-symbols-outlined text-[18px]">share</span></button>
                            <button onClick={(e) => unlinkItem('food_costs', cost.id, e)} className="size-8 rounded-lg text-gray-300 hover:text-red-500 flex items-center justify-center transition-all" title="Unlink from folder"><span className="material-symbols-outlined text-[18px]">link_off</span></button>
                          </div>
                        </div>
                      );
                    })}
                    {projectFoodCosts.length === 0 && <p className="text-xs text-text-muted italic py-6 text-center">No food costs linked to this folder.</p>}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* VIEW: ALL RECIPES */}
          {view === 'ALL_RECIPES' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-fade-in">
              {filteredRecipes.map(recipe => (
                <div key={recipe.id} className="p-6 bg-white dark:bg-surface-dark border border-gray-100 dark:border-gray-800 rounded-[32px] flex items-center justify-between group shadow-sm hover:border-primary transition-all">
                  <div onClick={() => navigate(`/create-dish?id=${recipe.id}`)} className="flex items-center gap-4 cursor-pointer flex-1 truncate pr-2">
                    <div className="size-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary group-hover:scale-110 transition-transform shrink-0"><span className="material-symbols-outlined">restaurant</span></div>
                    <div className="flex flex-col truncate">
                      <span className="font-black text-sm uppercase group-hover:text-primary transition-colors truncate">{recipe.title || recipe.name}</span>
                      <span className="text-[10px] text-text-muted font-black uppercase">{recipe.difficulty}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button onClick={(e) => openShareModalForItem('recipe', recipe.id, e)} className="size-9 rounded-xl text-gray-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-white/5 flex items-center justify-center transition-colors" title="Share with Chef">
                      <span className="material-symbols-outlined text-[20px]">share</span>
                    </button>
                    <button onClick={(e) => togglePublicCommunityShare(recipe, e)} className={`size-9 rounded-xl flex items-center justify-center transition-all ${sharedRecipeIds.has(recipe.id) ? 'text-primary' : 'text-gray-400 hover:text-primary'}`} title={sharedRecipeIds.has(recipe.id) ? 'Published in Community' : 'Publish to Community'}>
                      <span className={`material-symbols-outlined text-[20px] ${sharedRecipeIds.has(recipe.id) ? 'filled' : ''}`}>{sharedRecipeIds.has(recipe.id) ? 'public' : 'public'}</span>
                    </button>
                    <button onClick={() => navigate(`/create-dish?id=${recipe.id}`)} className="size-9 rounded-xl text-gray-400 hover:text-primary flex items-center justify-center transition-colors" title="Edit Recipe">
                      <span className="material-symbols-outlined text-[20px]">edit</span>
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); setItemToDelete({ type: 'recipe', id: recipe.id, name: recipe.title || recipe.name }); }} className="size-9 rounded-xl text-gray-400 hover:text-red-500 flex items-center justify-center transition-colors" title="Delete Recipe">
                      <span className="material-symbols-outlined text-[20px]">delete</span>
                    </button>
                  </div>
                </div>
              ))}
              {filteredRecipes.length === 0 && (
                <div className="col-span-full py-24 text-center text-text-muted border-2 border-dashed border-gray-200 dark:border-gray-800 rounded-[32px]">
                  <p className="text-sm font-black uppercase tracking-widest">No recipes created yet</p>
                </div>
              )}
            </div>
          )}

          {/* VIEW: ALL PAIRINGS */}
          {view === 'ALL_PAIRINGS' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-fade-in">
              {filteredPairings.map(pairing => (
                <div key={pairing.id} className="p-6 bg-white dark:bg-surface-dark border border-gray-100 dark:border-gray-800 rounded-[32px] flex items-center justify-between group shadow-sm hover:border-primary transition-all">
                  <div onClick={() => navigate(`/pairing?id=${pairing.id}`)} className="flex items-center gap-4 cursor-pointer flex-1 truncate pr-2">
                    <div className="size-12 rounded-2xl bg-blue-500/10 flex items-center justify-center text-blue-500 group-hover:scale-110 transition-transform shrink-0"><span className="material-symbols-outlined">science</span></div>
                    <div className="flex flex-col truncate">
                      <span className="font-black text-sm uppercase group-hover:text-primary transition-colors truncate">{pairing.title || pairing.ingredients.join(' + ')}</span>
                      <span className="text-[10px] text-text-muted font-black uppercase tracking-widest">{pairing.analysis?.compatibilityScore || 0}% Score</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button onClick={(e) => openShareModalForItem('pairing', pairing.id, e)} className="size-9 rounded-xl text-gray-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-white/5 flex items-center justify-center transition-colors" title="Share with Chef">
                      <span className="material-symbols-outlined text-[20px]">share</span>
                    </button>
                    <button onClick={() => navigate(`/pairing?id=${pairing.id}`)} className="size-9 rounded-xl text-gray-400 hover:text-primary flex items-center justify-center transition-colors" title="View / Edit">
                      <span className="material-symbols-outlined text-[20px]">visibility</span>
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); setItemToDelete({ type: 'pairing', id: pairing.id, name: pairing.title || pairing.ingredients.join(' + ') }); }} className="size-9 rounded-xl text-gray-400 hover:text-red-500 flex items-center justify-center transition-colors" title="Delete Pairing">
                      <span className="material-symbols-outlined text-[20px]">delete</span>
                    </button>
                  </div>
                </div>
              ))}
              {filteredPairings.length === 0 && (
                <div className="col-span-full py-24 text-center text-text-muted border-2 border-dashed border-gray-200 dark:border-gray-800 rounded-[32px]">
                  <p className="text-sm font-black uppercase tracking-widest">No pairings created yet</p>
                </div>
              )}
            </div>
          )}
          
          {/* VIEW: ALL FOOD COSTS */}
          {view === 'ALL_COSTS' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-fade-in">
              {filteredFoodCosts.map(cost => {
                const sheetInfo = (cost.ingredients && typeof cost.ingredients === 'object' && !Array.isArray(cost.ingredients))
                  ? cost.ingredients
                  : (cost.data && typeof cost.data === 'object' && !Array.isArray(cost.data))
                    ? cost.data
                    : {};
                const costName = cost.recipe_name || cost.name || cost.title || sheetInfo.recipeName || sheetInfo.recipe_name || 'Untitled Cost Sheet';
                const portionCount = sheetInfo.servings || cost.servings || 4;
                const totalCostNum = sheetInfo.totals?.combinedTotalCost || cost.total_cost || 0;

                return (
                  <div key={cost.id} className="p-6 bg-white dark:bg-surface-dark border border-gray-100 dark:border-gray-800 rounded-[32px] flex items-center justify-between group shadow-sm hover:border-primary transition-all">
                    <div onClick={() => navigate(`/food-cost?id=${cost.id}`)} className="flex items-center gap-4 cursor-pointer flex-1 truncate pr-2">
                      <div className="size-12 rounded-2xl bg-amber-500/10 flex items-center justify-center text-amber-500 group-hover:scale-110 transition-transform shrink-0">
                        <span className="material-symbols-outlined">payments</span>
                      </div>
                      <div className="flex flex-col truncate">
                        <span className="font-black text-sm uppercase group-hover:text-primary transition-colors truncate">{costName}</span>
                        <div className="flex items-center gap-2 text-[10px] text-text-muted font-bold">
                          <span>{portionCount} portions</span>
                          {totalCostNum > 0 && <span>• €{Number(totalCostNum).toFixed(2)} total</span>}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button onClick={(e) => openShareModalForItem('food_cost', cost.id, e)} className="size-9 rounded-xl text-gray-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-white/5 flex items-center justify-center transition-colors" title="Share with Chef">
                        <span className="material-symbols-outlined text-[20px]">share</span>
                      </button>
                      <button onClick={() => navigate(`/food-cost?id=${cost.id}`)} className="size-9 rounded-xl text-gray-400 hover:text-primary flex items-center justify-center transition-colors" title="View / Edit">
                        <span className="material-symbols-outlined text-[20px]">edit</span>
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); setItemToDelete({ type: 'food_cost', id: cost.id, name: costName }); }} className="size-9 rounded-xl text-gray-400 hover:text-red-500 flex items-center justify-center transition-colors" title="Delete Cost Sheet">
                        <span className="material-symbols-outlined text-[20px]">delete</span>
                      </button>
                    </div>
                  </div>
                );
              })}
              {filteredFoodCosts.length === 0 && (
                <div className="col-span-full py-24 text-center text-text-muted border-2 border-dashed border-gray-200 dark:border-gray-800 rounded-[32px]">
                  <p className="text-sm font-black uppercase tracking-widest">No food cost sheets saved yet</p>
                </div>
              )}
            </div>
          )}
        </>
      ) : (
        <div className="py-32 text-center">
          <h2 className="text-3xl font-black uppercase tracking-tight">Access Restricted</h2>
          <p className="text-text-muted mt-4">Please log in to manage your studio library.</p>
        </div>
      )}

      {/* SHARE MODAL */}
      {showShareModal && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={() => setShowShareModal(false)}></div>
          <div className="relative w-full max-w-2xl bg-white dark:bg-surface-dark rounded-[36px] shadow-2xl overflow-hidden animate-fade-in border border-gray-100 dark:border-gray-800 flex flex-col max-h-[85vh]">
            <header className="p-6 md:p-8 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between bg-gray-50 dark:bg-white/5">
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-blue-500 text-3xl">share</span>
                <div>
                  <h3 className="text-xl md:text-2xl font-black uppercase tracking-tight">Studio Collaboration Hub</h3>
                  <p className="text-xs text-text-muted font-medium">Share intelligence securely with fellow chefs</p>
                </div>
              </div>
              <button onClick={() => setShowShareModal(false)} className="material-symbols-outlined text-gray-400 hover:text-white">close</button>
            </header>

            {/* TAB SELECTOR */}
            <div className="flex border-b border-gray-100 dark:border-gray-800 px-8 pt-4 gap-4 bg-gray-50/50 dark:bg-white/5">
              <button 
                onClick={() => setShareModalTab('SHARE_NEW')}
                className={`pb-4 text-xs font-black uppercase tracking-widest border-b-2 transition-all flex items-center gap-2 ${shareModalTab === 'SHARE_NEW' ? 'border-primary text-primary' : 'border-transparent text-text-muted hover:text-white'}`}
              >
                <span className="material-symbols-outlined text-[18px]">send</span> Share Intelligence
              </button>
              <button 
                onClick={() => setShareModalTab('SHARED_LIST')}
                className={`pb-4 text-xs font-black uppercase tracking-widest border-b-2 transition-all flex items-center gap-2 ${shareModalTab === 'SHARED_LIST' ? 'border-primary text-primary' : 'border-transparent text-text-muted hover:text-white'}`}
              >
                <span className="material-symbols-outlined text-[18px]">folder_shared</span> Shared Hub ({sharesReceived.length + sharesSent.length})
              </button>
            </div>

            <div className="p-6 md:p-8 overflow-y-auto space-y-6 flex-1">
              {shareModalTab === 'SHARE_NEW' && (
                <div className="space-y-6 animate-fade-in">
                  {/* Step 1: Select Item Category */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-text-muted">1. Select Intelligence Type</label>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      {[
                        { id: 'recipe', label: 'Recipe', icon: 'restaurant', color: 'text-primary' },
                        { id: 'pairing', label: 'Pairing', icon: 'science', color: 'text-blue-500' },
                        { id: 'food_cost', label: 'Food Cost', icon: 'payments', color: 'text-amber-500' },
                        { id: 'project', label: 'Folder', icon: 'folder', color: 'text-purple-500' }
                      ].map(cat => (
                        <button 
                          key={cat.id} 
                          onClick={() => { setShareTargetType(cat.id as any); setShareTargetItemId(''); }} 
                          className={`p-3 rounded-2xl border text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all ${shareTargetType === cat.id ? 'border-primary bg-primary/10 text-primary shadow-sm' : 'border-gray-200 dark:border-gray-800 text-text-muted hover:border-gray-400'}`}
                        >
                          <span className={`material-symbols-outlined text-[18px] ${cat.color}`}>{cat.icon}</span> {cat.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Step 2: Pick specific item */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-text-muted">2. Choose Specific Item</label>
                    <select 
                      value={shareTargetItemId} 
                      onChange={(e) => setShareTargetItemId(e.target.value)} 
                      className="w-full h-12 px-4 rounded-2xl bg-gray-50 dark:bg-black/30 border border-gray-200 dark:border-gray-800 font-bold text-xs uppercase outline-none focus:border-primary"
                    >
                      <option value="">-- Choose item to share --</option>
                      {selectableShareItems.map(it => (
                        <option key={it.id} value={it.id}>{it.name}</option>
                      ))}
                    </select>
                  </div>

                  {/* Step 3: Search Recipient Chef */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-text-muted">3. Recipient Chef (Search by Chef Name or Username)</label>
                    <div className="relative">
                      <input 
                        value={shareRecipientSearch} 
                        onChange={(e) => setShareRecipientSearch(e.target.value)} 
                        placeholder="Search chef by name (e.g., Auguste, Massimo)..." 
                        className="w-full h-12 pl-12 pr-4 rounded-2xl bg-gray-50 dark:bg-black/30 border border-gray-200 dark:border-gray-800 font-bold text-xs outline-none focus:border-primary"
                      />
                      <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">search</span>
                    </div>

                    {/* Search Results */}
                    {recipientResults.length > 0 && (
                      <div className="mt-2 p-2 bg-gray-50 dark:bg-black/40 border border-gray-200 dark:border-gray-800 rounded-2xl space-y-1 max-h-48 overflow-y-auto">
                        {recipientResults.map(chef => (
                          <div 
                            key={chef.id} 
                            onClick={() => { setSelectedRecipient(chef); setShareRecipientSearch(chef.chef_name || chef.username); setRecipientResults([]); }}
                            className={`p-3 rounded-xl flex items-center justify-between cursor-pointer hover:bg-primary/10 transition-all ${selectedRecipient?.id === chef.id ? 'bg-primary/20 border border-primary/40' : ''}`}
                          >
                            <div className="flex items-center gap-3">
                              <div className="size-8 rounded-full bg-primary/20 flex items-center justify-center font-black text-xs text-primary">
                                {chef.avatar_url ? <img src={chef.avatar_url} className="size-full rounded-full object-cover" /> : (chef.chef_name?.[0] || 'C')}
                              </div>
                              <div className="flex flex-col">
                                <span className="text-xs font-black uppercase">{chef.chef_name || chef.username}</span>
                                <span className="text-[9px] text-text-muted">@{chef.username}</span>
                              </div>
                            </div>
                            <span className="text-[10px] font-black uppercase text-primary">Select</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {selectedRecipient && (
                      <div className="p-3 bg-primary/10 border border-primary/20 rounded-2xl flex items-center justify-between mt-2">
                        <div className="flex items-center gap-3">
                          <span className="material-symbols-outlined text-primary">person_check</span>
                          <span className="text-xs font-black uppercase">Recipient: {selectedRecipient.chef_name || selectedRecipient.username}</span>
                        </div>
                        <button onClick={() => setSelectedRecipient(null)} className="text-xs text-text-muted hover:text-red-500 font-bold uppercase">Clear</button>
                      </div>
                    )}
                  </div>

                  {/* Step 4: Access Permission */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-text-muted">4. Permission Level</label>
                    <div className="grid grid-cols-2 gap-3">
                      <button 
                        onClick={() => setSharePermission('view')}
                        className={`p-3 rounded-2xl border text-xs font-black uppercase flex items-center justify-center gap-2 ${sharePermission === 'view' ? 'bg-primary/10 border-primary text-primary' : 'border-gray-200 dark:border-gray-800 text-text-muted'}`}
                      >
                        <span className="material-symbols-outlined text-[18px]">visibility</span> View Only
                      </button>
                      <button 
                        onClick={() => setSharePermission('edit')}
                        className={`p-3 rounded-2xl border text-xs font-black uppercase flex items-center justify-center gap-2 ${sharePermission === 'edit' ? 'bg-primary/10 border-primary text-primary' : 'border-gray-200 dark:border-gray-800 text-text-muted'}`}
                      >
                        <span className="material-symbols-outlined text-[18px]">edit_document</span> Full Edit
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {shareModalTab === 'SHARED_LIST' && (
                <div className="space-y-6 animate-fade-in">
                  <div className="flex gap-2 border-b border-gray-100 dark:border-gray-800 pb-3">
                    <button 
                      onClick={() => setSharedListSubTab('RECEIVED')} 
                      className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest ${sharedListSubTab === 'RECEIVED' ? 'bg-primary text-black' : 'bg-gray-100 dark:bg-white/5 text-text-muted'}`}
                    >
                      Shared With Me ({sharesReceived.length})
                    </button>
                    <button 
                      onClick={() => setSharedListSubTab('SENT')} 
                      className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest ${sharedListSubTab === 'SENT' ? 'bg-primary text-black' : 'bg-gray-100 dark:bg-white/5 text-text-muted'}`}
                    >
                      Shared By Me ({sharesSent.length})
                    </button>
                  </div>

                  {sharedListSubTab === 'RECEIVED' && (
                    <div className="space-y-3">
                      {sharesReceived.map(share => (
                        <div key={share.id} className="p-4 bg-gray-50 dark:bg-white/5 border border-gray-100 dark:border-gray-800 rounded-2xl flex items-center justify-between gap-4">
                          <div className="flex items-center gap-3 truncate">
                            <div className="size-10 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center shrink-0">
                              <span className="material-symbols-outlined text-[20px]">{share.item_type === 'recipe' ? 'restaurant' : share.item_type === 'pairing' ? 'science' : share.item_type === 'food_cost' ? 'payments' : 'folder'}</span>
                            </div>
                            <div className="flex flex-col truncate">
                              <span className="text-xs font-black uppercase">{share.item_type.replace('_', ' ')}</span>
                              <span className="text-[10px] text-text-muted font-medium">From Chef {share.senderProfile?.chef_name || 'Collaborator'} • {new Date(share.created_at).toLocaleDateString()}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-[9px] font-black uppercase px-2 py-0.5 bg-blue-500/10 text-blue-500 rounded-md">{share.permission}</span>
                            <button onClick={() => handleOpenSharedItem(share)} className="px-4 py-2 bg-primary text-black rounded-xl text-[9px] font-black uppercase tracking-widest hover:scale-105 transition-transform">Open</button>
                          </div>
                        </div>
                      ))}
                      {sharesReceived.length === 0 && (
                        <div className="py-12 text-center text-text-muted text-xs font-bold uppercase tracking-widest">
                          No intelligence shared with you yet.
                        </div>
                      )}
                    </div>
                  )}

                  {sharedListSubTab === 'SENT' && (
                    <div className="space-y-3">
                      {sharesSent.map(share => (
                        <div key={share.id} className="p-4 bg-gray-50 dark:bg-white/5 border border-gray-100 dark:border-gray-800 rounded-2xl flex items-center justify-between gap-4">
                          <div className="flex items-center gap-3 truncate">
                            <div className="size-10 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center shrink-0">
                              <span className="material-symbols-outlined text-[20px]">{share.item_type === 'recipe' ? 'restaurant' : share.item_type === 'pairing' ? 'science' : share.item_type === 'food_cost' ? 'payments' : 'folder'}</span>
                            </div>
                            <div className="flex flex-col truncate">
                              <span className="text-xs font-black uppercase">{share.item_type.replace('_', ' ')}</span>
                              <span className="text-[10px] text-text-muted font-medium">Shared with Chef {share.recipientProfile?.chef_name || 'Chef'} • {new Date(share.created_at).toLocaleDateString()}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <button onClick={() => handleRevokeShare(share.id)} className="px-3 py-1.5 bg-red-500/10 text-red-500 border border-red-500/20 rounded-xl text-[9px] font-black uppercase hover:bg-red-500 hover:text-white transition-all">Revoke</button>
                          </div>
                        </div>
                      ))}
                      {sharesSent.length === 0 && (
                        <div className="py-12 text-center text-text-muted text-xs font-bold uppercase tracking-widest">
                          You have not shared any intelligence yet.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            <footer className="p-6 md:p-8 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-black/20 flex justify-end gap-3">
              {shareModalTab === 'SHARE_NEW' ? (
                <button 
                  onClick={handleExecuteShare} 
                  disabled={!selectedRecipient || !shareTargetItemId || loading} 
                  className="px-8 py-4 rounded-2xl bg-primary text-black text-xs font-black uppercase tracking-widest shadow-xl disabled:opacity-50 hover:scale-105 transition-all flex items-center gap-2"
                >
                  <span className="material-symbols-outlined text-[18px]">send</span> Share Intelligence Now
                </button>
              ) : (
                <button onClick={() => setShowShareModal(false)} className="px-8 py-3 rounded-2xl bg-black text-white dark:bg-white dark:text-black text-xs font-black uppercase tracking-widest">Done</button>
              )}
            </footer>
          </div>
        </div>
      )}

      {/* CREATE PROJECT MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={() => setShowCreateModal(false)}></div>
          <div className="relative w-full max-w-md bg-white dark:bg-surface-dark rounded-[32px] shadow-2xl overflow-hidden animate-fade-in border border-gray-100 dark:border-gray-800">
             <header className="p-8 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between bg-gray-50 dark:bg-white/5">
                <h3 className="text-2xl font-black uppercase tracking-tight">New Project Folder</h3>
                <button onClick={() => setShowCreateModal(false)} className="material-symbols-outlined">close</button>
             </header>
             <div className="p-8 space-y-6">
                <div className="space-y-2">
                   <label className="text-[10px] font-black uppercase tracking-widest text-text-muted">Folder Name</label>
                   <input value={newProject.title} onChange={(e) => setNewProject({...newProject, title: e.target.value})} placeholder="E.g., Winter Menu 2026..." className="w-full h-12 px-4 rounded-xl bg-gray-50 dark:bg-black/20 border-none outline-none focus:ring-1 focus:ring-primary font-bold text-sm" />
                </div>
                <div className="space-y-2">
                   <label className="text-[10px] font-black uppercase tracking-widest text-text-muted">Description</label>
                   <textarea value={newProject.description} onChange={(e) => setNewProject({...newProject, description: e.target.value})} placeholder="Summary..." className="w-full h-24 px-4 py-3 rounded-xl bg-gray-50 dark:bg-black/20 border-none outline-none focus:ring-1 focus:ring-primary font-bold text-sm" />
                </div>
                <div className="space-y-2">
                   <label className="text-[10px] font-black uppercase tracking-widest text-text-muted">Color</label>
                   <div className="flex gap-3">
                      {['orange', 'blue', 'red', 'green', 'purple', 'yellow', 'cyan'].map(c => (
                        <button key={c} onClick={() => setNewProject({...newProject, color: c as any})} className={`size-8 rounded-lg ${getProjectColorClass(c)} border-4 ${newProject.color === c ? 'border-primary/50' : 'border-transparent opacity-60'}`} />
                      ))}
                   </div>
                </div>
             </div>
             <footer className="p-8 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-black/10">
                <button onClick={handleCreateProject} disabled={!newProject.title || loading} className="w-full py-4 rounded-2xl bg-primary text-black text-xs font-black uppercase tracking-widest shadow-xl disabled:opacity-50">Create Folder</button>
             </footer>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {itemToDelete && (
        <div className="fixed inset-0 z-[600] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/90 backdrop-blur-sm" onClick={() => setItemToDelete(null)}></div>
          <div className="relative w-full max-w-sm bg-white dark:bg-surface-dark rounded-3xl shadow-2xl p-8 border border-red-500/20 text-center space-y-6 animate-fade-in">
             <div className="size-16 rounded-full bg-red-500/10 text-red-500 flex items-center justify-center mx-auto"><span className="material-symbols-outlined text-4xl">warning</span></div>
             <div className="space-y-2">
                <h3 className="text-xl font-black uppercase">Destroy {itemToDelete.type.replace('_', ' ')}?</h3>
                <p className="text-xs text-text-muted font-medium">"{itemToDelete.name}" will be removed permanently.</p>
             </div>
             <div className="flex gap-3">
                <button onClick={() => setItemToDelete(null)} className="flex-1 py-3 rounded-xl bg-gray-100 dark:bg-white/5 text-[10px] font-black uppercase">Cancel</button>
                <button onClick={confirmDeleteItem} disabled={loading} className="flex-1 py-3 rounded-xl bg-red-500 text-white text-[10px] font-black uppercase shadow-lg shadow-red-500/20">Delete</button>
             </div>
          </div>
        </div>
      )}

      {/* ADD/REMOVE ITEMS TO FOLDER MODAL */}
      {showAddItemsModal && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={() => setShowAddItemsModal(false)}></div>
          <div className="relative w-full max-w-2xl bg-white dark:bg-surface-dark rounded-[32px] shadow-2xl overflow-hidden animate-fade-in border border-gray-100 dark:border-gray-800 flex flex-col max-h-[85vh]">
             <header className="p-8 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between bg-gray-50 dark:bg-white/5">
                <h3 className="text-2xl font-black uppercase tracking-tight">Manage Folder Items</h3>
                <button onClick={() => setShowAddItemsModal(false)} className="material-symbols-outlined">close</button>
             </header>
             <div className="flex-1 overflow-y-auto p-8 space-y-10">
                <section className="space-y-4">
                   <h4 className="text-[10px] font-black uppercase tracking-widest text-primary border-b border-primary/20 pb-2">Available Recipes</h4>
                   <div className="grid gap-2">
                      {unlinkedRecipes.map(r => (
                        <div key={r.id} className="p-4 bg-gray-50 dark:bg-white/5 rounded-xl flex items-center justify-between border border-transparent hover:border-primary/30 transition-all">
                           <span className="text-xs font-black uppercase truncate pr-3">{r.title || r.name}</span>
                           <button onClick={() => linkItemToProject('recipes', r.id)} className="h-8 px-4 rounded-lg bg-primary text-black text-[9px] font-black uppercase">Add</button>
                        </div>
                      ))}
                      {unlinkedRecipes.length === 0 && <p className="text-xs text-text-muted italic">All your recipes are currently linked.</p>}
                   </div>
                </section>
                <section className="space-y-4">
                   <h4 className="text-[10px] font-black uppercase tracking-widest text-blue-500 border-b border-blue-500/20 pb-2">Available Pairings</h4>
                   <div className="grid gap-2">
                      {unlinkedPairings.map(p => (
                        <div key={p.id} className="p-4 bg-gray-50 dark:bg-white/5 rounded-xl flex items-center justify-between border border-transparent hover:border-blue-500/30 transition-all">
                           <span className="text-xs font-black uppercase truncate pr-3">{p.title || p.ingredients.join(' + ')}</span>
                           <button onClick={() => linkItemToProject('pairings', p.id)} className="h-8 px-4 rounded-lg bg-blue-500 text-white text-[9px] font-black uppercase">Add</button>
                        </div>
                      ))}
                      {unlinkedPairings.length === 0 && <p className="text-xs text-text-muted italic">All your pairings are currently linked.</p>}
                   </div>
                </section>
                <section className="space-y-4">
                   <h4 className="text-[10px] font-black uppercase tracking-widest text-amber-500 border-b border-amber-500/20 pb-2">Available Food Costs</h4>
                   <div className="grid gap-2">
                      {unlinkedFoodCosts.map(f => (
                        <div key={f.id} className="p-4 bg-gray-50 dark:bg-white/5 rounded-xl flex items-center justify-between border border-transparent hover:border-amber-500/30 transition-all">
                           <span className="text-xs font-black uppercase truncate pr-3">{getFoodCostName(f)}</span>
                           <button onClick={() => linkItemToProject('food_costs', f.id)} className="h-8 px-4 rounded-lg bg-amber-500 text-black text-[9px] font-black uppercase">Add</button>
                        </div>
                      ))}
                      {unlinkedFoodCosts.length === 0 && <p className="text-xs text-text-muted italic">All your food costs are currently linked.</p>}
                   </div>
                </section>
             </div>
             <footer className="p-8 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-black/10">
                <button onClick={() => setShowAddItemsModal(false)} className="w-full py-4 rounded-2xl bg-black text-white dark:bg-white dark:text-black text-xs font-black uppercase">Done</button>
             </footer>
          </div>
        </div>
      )}
    </div>
  );
};
export default MyProjects;
