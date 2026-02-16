
import React, { useState, useMemo, useEffect } from 'react';
import { Project } from '../types';
import { useAppContext } from '../AppContext';
import { supabase } from '../supabaseClient';
import { useNavigate } from 'react-router-dom';

type ViewState = 'LIST' | 'DETAIL' | 'ALL_RECIPES' | 'ALL_PAIRINGS' | 'ALL_COSTS';

export const MyProjects = () => {
  const { t, user, isLoggedIn } = useAppContext();
  const navigate = useNavigate();
  
  // --- STATE ---
  const [view, setView] = useState<ViewState>('LIST');
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [recipes, setRecipes] = useState<any[]>([]);
  const [pairings, setPairings] = useState<any[]>([]);
  const [foodCosts, setFoodCosts] = useState<any[]>([]);
  const [sharedRecipeIds, setSharedRecipeIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showAddItemsModal, setShowAddItemsModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Delete Confirmation State
  const [projectToDelete, setProjectToDelete] = useState<string | null>(null);
  const [recipeToShare, setRecipeToShare] = useState<any | null>(null);
  
  // Create Project Form
  const [newProject, setNewProject] = useState({ 
    title: '', 
    description: '', 
    color: 'orange' as Project['color'] 
  });

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

    } catch (e) {
      console.error("Error fetching library:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isLoggedIn && user) {
      fetchAllData();
    }
  }, [isLoggedIn, user]);

  // --- HANDLERS ---
  const toggleShare = async (recipe: any, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) return;
    const isShared = sharedRecipeIds.has(recipe.id);
    
    setLoading(true);
    try {
      if (isShared) {
        await supabase.from('social_posts').delete().match({ recipe_id: recipe.id, user_id: user.id });
        alert("Recipe is now private.");
      } else {
        await supabase.from('social_posts').insert({
          user_id: user.id,
          recipe_id: recipe.id,
          title: recipe.title || recipe.name,
          description: recipe.description,
          image_url: recipe.images?.[0] || 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&q=80&w=1600',
          difficulty: recipe.difficulty
        });
        alert("Recipe shared with community!");
      }
      fetchAllData();
    } catch (err: any) {
      alert("Error: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const deleteProject = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setProjectToDelete(id);
  };

  const confirmDeleteProject = async () => {
    if (!projectToDelete) return;
    setLoading(true);
    try {
      const { error } = await supabase.from('projects').delete().eq('id', projectToDelete);
      if (error) throw error;
      
      setProjects(prev => prev.filter(p => p.id !== projectToDelete));
      if (selectedProjectId === projectToDelete) {
        setView('LIST');
        setSelectedProjectId(null);
      }
      setProjectToDelete(null);
    } catch (err: any) {
      alert("Delete failed: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateProject = async () => {
    if (!newProject.title || !user) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('projects')
        .insert({
          title: newProject.title,
          description: newProject.description,
          color: newProject.color,
          user_id: user.id
        })
        .select()
        .single();

      if (error) throw error;
      
      await fetchAllData();
      setShowCreateModal(false);
      setNewProject({ title: '', description: '', color: 'orange' });
      if (data) {
        setSelectedProjectId(data.id);
        setView('DETAIL');
      }
    } catch (err: any) {
      alert("Failed to create project: " + err.message);
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
    } catch (err: any) { alert("Link failed: " + err.message); }
  };

  const unlinkItem = async (type: 'recipes' | 'pairings' | 'food_costs', itemId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const { error } = await supabase.from(type).update({ project_id: null }).eq('id', itemId);
      if (error) throw error;
      await fetchAllData();
    } catch (err: any) { alert("Unlink failed: " + err.message); }
  };

  const getProjectColorClass = (color: string) => {
    const colors: Record<string, string> = {
      orange: 'bg-amber-500', blue: 'bg-blue-500', red: 'bg-red-500', 
      green: 'bg-emerald-500', purple: 'bg-purple-500', yellow: 'bg-yellow-400', cyan: 'bg-cyan-500'
    };
    return colors[color] || 'bg-gray-400';
  };

  // --- FILTERED DATA ---
  const filteredProjects = useMemo(() => projects.filter(p => p.title.toLowerCase().includes(searchTerm.toLowerCase())), [projects, searchTerm]);
  const filteredRecipes = useMemo(() => recipes.filter(r => (r.title || r.name || '').toLowerCase().includes(searchTerm.toLowerCase())), [recipes, searchTerm]);
  const filteredPairings = useMemo(() => pairings.filter(p => (p.title || p.ingredients.join(' ')).toLowerCase().includes(searchTerm.toLowerCase())), [pairings, searchTerm]);
  const filteredFoodCosts = useMemo(() => foodCosts.filter(f => (f.recipe_name || '').toLowerCase().includes(searchTerm.toLowerCase())), [foodCosts, searchTerm]);
  const selectedProject = useMemo(() => projects.find(p => p.id === selectedProjectId), [projects, selectedProjectId]);
  const projectRecipes = useMemo(() => recipes.filter(r => r.project_id === selectedProjectId), [recipes, selectedProjectId]);
  const projectPairings = useMemo(() => pairings.filter(p => p.project_id === selectedProjectId), [pairings, selectedProjectId]);
  const projectFoodCosts = useMemo(() => foodCosts.filter(f => f.project_id === selectedProjectId), [foodCosts, selectedProjectId]);
  const unlinkedRecipes = useMemo(() => recipes.filter(r => !r.project_id), [recipes]);
  const unlinkedPairings = useMemo(() => pairings.filter(p => !p.project_id), [pairings]);
  const unlinkedFoodCosts = useMemo(() => foodCosts.filter(f => !f.project_id), [foodCosts]);

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
            {view === 'LIST' ? 'Organize your professional culinary folders' : 
             view === 'ALL_RECIPES' ? 'Browse your collection of masterpieces' : 
             view === 'ALL_PAIRINGS' ? 'Molecular research database' : 
             view === 'ALL_COSTS' ? 'Calculate professional margins' : 
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
          </div>
          
          <div className="flex flex-wrap gap-2">
            <button onClick={() => { setView('LIST'); setSearchTerm(''); }} className={`h-11 px-5 rounded-xl flex items-center gap-2 text-[10px] font-black uppercase tracking-widest transition-all ${view === 'LIST' ? 'bg-black text-white' : 'bg-white dark:bg-white/5 border border-gray-100 dark:border-gray-800 text-gray-500'}`}>
              <span className="material-symbols-outlined text-[18px]">folder</span> Folders
            </button>
            <button onClick={() => setShowCreateModal(true)} className="h-11 px-6 rounded-xl bg-primary text-black text-[10px] font-black uppercase tracking-widest shadow-xl">+ New Folder</button>
          </div>
        </div>
      </div>

      <div className="relative max-w-xl mt-6">
        <input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Search library..." className="w-full h-12 pl-12 pr-4 bg-white dark:bg-white/5 border border-gray-200 dark:border-gray-800 rounded-2xl focus:ring-1 focus:ring-primary outline-none text-sm dark:text-white" />
        <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-[22px]">search</span>
      </div>
    </div>
  );

  return (
    <div className="p-4 md:p-8 lg:p-12 animate-fade-in max-w-[1600px] mx-auto min-h-screen text-text-main dark:text-white">
      {isLoggedIn ? (
        <>
          <SectionHeader />

          {view === 'LIST' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
              {filteredProjects.map(project => (
                <div key={project.id} onClick={() => { setSelectedProjectId(project.id); setView('DETAIL'); }} className="bg-white dark:bg-surface-dark rounded-[32px] border border-gray-100 dark:border-gray-800 p-8 shadow-sm hover:shadow-2xl transition-all cursor-pointer group flex flex-col gap-6">
                  <div className="flex items-start justify-between">
                    <div className={`size-16 rounded-2xl ${getProjectColorClass(project.color)} flex items-center justify-center text-white shadow-lg`}><span className="material-symbols-outlined text-4xl">folder</span></div>
                    <button onClick={(e) => deleteProject(project.id, e)} className="size-10 rounded-full hover:bg-red-50 text-gray-300 hover:text-red-500 transition-colors flex items-center justify-center"><span className="material-symbols-outlined text-[20px]">delete</span></button>
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
            </div>
          )}

          {view === 'DETAIL' && (
            <div className="space-y-12 animate-fade-in">
              <div className="flex items-center justify-between">
                <button onClick={() => setView('LIST')} className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-text-muted hover:text-primary transition-colors"><span className="material-symbols-outlined text-[18px]">arrow_back</span> Library</button>
                <button onClick={() => setShowAddItemsModal(true)} className="px-6 py-2.5 rounded-xl bg-black text-white text-[10px] font-black uppercase tracking-widest shadow-xl flex items-center gap-2"><span className="material-symbols-outlined">add_link</span> Manage Folder</button>
              </div>
              
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
                <div className="space-y-6">
                  <h2 className="text-sm font-black uppercase tracking-widest border-b border-gray-100 dark:border-gray-800 pb-4 flex items-center justify-between">Recipes <span className="bg-primary/10 text-primary px-3 py-1 rounded-full">{projectRecipes.length}</span></h2>
                  <div className="grid gap-3">
                    {projectRecipes.map(recipe => (
                      <div key={recipe.id} className="p-5 bg-white dark:bg-surface-dark border border-gray-50 dark:border-gray-800 rounded-2xl flex items-center justify-between group cursor-pointer hover:border-primary transition-all">
                        <div onClick={() => navigate(`/create-dish?id=${recipe.id}`)} className="flex flex-col flex-1"><span className="text-sm font-black uppercase group-hover:text-primary">{recipe.title || recipe.name}</span><span className="text-[9px] text-text-muted font-bold uppercase">{recipe.difficulty}</span></div>
                        <div className="flex items-center gap-2">
                          <button onClick={(e) => toggleShare(recipe, e)} className={`size-8 rounded-lg flex items-center justify-center transition-all opacity-0 group-hover:opacity-100 ${sharedRecipeIds.has(recipe.id) ? 'text-primary' : 'text-gray-300 hover:text-blue-500'}`} title={sharedRecipeIds.has(recipe.id) ? 'Public' : 'Private'}>
                            <span className={`material-symbols-outlined text-[18px] ${sharedRecipeIds.has(recipe.id) ? 'filled' : ''}`}>{sharedRecipeIds.has(recipe.id) ? 'public' : 'share'}</span>
                          </button>
                          <button onClick={(e) => unlinkItem('recipes', recipe.id, e)} className="size-8 rounded-lg text-gray-300 hover:text-red-500 flex items-center justify-center transition-all opacity-0 group-hover:opacity-100"><span className="material-symbols-outlined text-[18px]">link_off</span></button>
                          <span className="material-symbols-outlined text-gray-300">chevron_right</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-6">
                   <h2 className="text-sm font-black uppercase tracking-widest border-b border-gray-100 dark:border-gray-800 pb-4 flex items-center justify-between">Pairings <span className="bg-blue-500/10 text-blue-500 px-3 py-1 rounded-full">{projectPairings.length}</span></h2>
                   <div className="grid gap-3">
                    {projectPairings.map(pairing => (
                      <div key={pairing.id} onClick={() => navigate(`/pairing?id=${pairing.id}`)} className="p-5 bg-white dark:bg-surface-dark border border-gray-50 dark:border-gray-800 rounded-2xl flex items-center justify-between group cursor-pointer hover:border-primary transition-all">
                        <div className="flex flex-col"><span className="text-sm font-black uppercase group-hover:text-primary">{pairing.title || pairing.ingredients.join(' + ')}</span><span className="text-[9px] text-text-muted font-bold uppercase">{pairing.analysis?.compatibilityScore}% Score</span></div>
                        <div className="flex items-center gap-3">
                          <button onClick={(e) => unlinkItem('pairings', pairing.id, e)} className="size-8 rounded-lg text-gray-300 hover:text-red-500 flex items-center justify-center transition-all opacity-0 group-hover:opacity-100"><span className="material-symbols-outlined text-[18px]">link_off</span></button>
                          <span className="material-symbols-outlined text-gray-300">chevron_right</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-6">
                   <h2 className="text-sm font-black uppercase tracking-widest border-b border-gray-100 dark:border-gray-800 pb-4 flex items-center justify-between">Costs <span className="bg-amber-500/10 text-amber-500 px-3 py-1 rounded-full">{projectFoodCosts.length}</span></h2>
                   <div className="grid gap-3">
                    {projectFoodCosts.map(cost => (
                      <div key={cost.id} className="p-5 bg-white dark:bg-surface-dark border border-gray-100 dark:border-gray-800 rounded-2xl flex items-center justify-between group cursor-pointer hover:border-primary transition-all">
                        <div className="flex flex-col"><span className="text-sm font-black uppercase group-hover:text-primary">{cost.recipe_name}</span><span className="text-[9px] text-text-muted font-bold uppercase">{cost.template}</span></div>
                        <div className="flex items-center gap-3">
                          <button onClick={(e) => unlinkItem('food_costs', cost.id, e)} className="size-8 rounded-lg text-gray-300 hover:text-red-500 flex items-center justify-center transition-all opacity-0 group-hover:opacity-100"><span className="material-symbols-outlined text-[18px]">link_off</span></button>
                          <span className="material-symbols-outlined text-gray-300">chevron_right</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {view === 'ALL_RECIPES' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-fade-in">
              {filteredRecipes.map(recipe => (
                <div key={recipe.id} className="p-6 bg-white dark:bg-surface-dark border border-gray-100 dark:border-gray-800 rounded-[32px] flex items-center justify-between group shadow-sm hover:border-primary transition-all">
                  <div onClick={() => navigate(`/create-dish?id=${recipe.id}`)} className="flex items-center gap-4 cursor-pointer flex-1">
                    <div className="size-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary group-hover:scale-110 transition-transform"><span className="material-symbols-outlined">restaurant</span></div>
                    <div className="flex flex-col">
                      <span className="font-black text-sm uppercase group-hover:text-primary transition-colors">{recipe.title || recipe.name}</span>
                      <span className="text-[10px] text-text-muted font-black uppercase">{recipe.difficulty}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={(e) => toggleShare(recipe, e)} className={`size-9 rounded-xl flex items-center justify-center transition-all ${sharedRecipeIds.has(recipe.id) ? 'text-primary' : 'text-gray-400 hover:text-blue-500'}`} title={sharedRecipeIds.has(recipe.id) ? 'Unshare masterpiece' : 'Share with community'}>
                      <span className={`material-symbols-outlined text-[20px] ${sharedRecipeIds.has(recipe.id) ? 'filled' : ''}`}>{sharedRecipeIds.has(recipe.id) ? 'public' : 'share'}</span>
                    </button>
                    <button onClick={() => navigate(`/create-dish?id=${recipe.id}`)} className="size-9 rounded-xl text-gray-400 hover:text-primary flex items-center justify-center transition-colors"><span className="material-symbols-outlined text-[20px]">edit</span></button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {view === 'ALL_PAIRINGS' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-fade-in">
              {filteredPairings.map(pairing => (
                <div key={pairing.id} onClick={() => navigate(`/pairing?id=${pairing.id}`)} className="p-6 bg-white dark:bg-surface-dark border border-gray-100 dark:border-gray-800 rounded-[32px] flex items-center justify-between group cursor-pointer shadow-sm hover:border-primary transition-all">
                  <div className="flex items-center gap-4">
                    <div className="size-12 rounded-2xl bg-blue-500/10 flex items-center justify-center text-blue-500 group-hover:scale-110 transition-transform"><span className="material-symbols-outlined">science</span></div>
                    <div className="flex flex-col">
                      <span className="font-black text-sm uppercase group-hover:text-primary transition-colors">{pairing.title || pairing.ingredients.join(' + ')}</span>
                      <span className="text-[10px] text-text-muted font-black uppercase tracking-widest">{pairing.analysis?.compatibilityScore || 0}% Score</span>
                    </div>
                  </div>
                  <span className="material-symbols-outlined text-gray-300">visibility</span>
                </div>
              ))}
            </div>
          )}
          
          {view === 'ALL_COSTS' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-fade-in">
              {filteredFoodCosts.map(cost => (
                <div key={cost.id} className="p-6 bg-white dark:bg-surface-dark border border-gray-100 dark:border-gray-800 rounded-[32px] flex items-center justify-between group cursor-pointer shadow-sm hover:border-primary transition-all">
                  <div className="flex items-center gap-4">
                    <div className="size-12 rounded-2xl bg-amber-500/10 flex items-center justify-center text-amber-500 group-hover:scale-110 transition-transform"><span className="material-symbols-outlined">payments</span></div>
                    <div className="flex flex-col">
                      <span className="font-black text-sm uppercase group-hover:text-primary transition-colors">{cost.recipe_name}</span>
                      <span className="text-[10px] text-text-muted font-black uppercase">{cost.template}</span>
                    </div>
                  </div>
                  <span className="material-symbols-outlined text-gray-300">visibility</span>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="py-32 text-center">
          <h2 className="text-3xl font-black uppercase tracking-tight">Access Restricted</h2>
          <p className="text-text-muted mt-4">Please log in to manage your library.</p>
        </div>
      )}

      {/* CREATE MODAL */}
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
                      {['orange', 'blue', 'red', 'green', 'purple', 'cyan'].map(c => (
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

      {/* DELETE PROJECT MODAL */}
      {projectToDelete && (
        <div className="fixed inset-0 z-[600] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/90 backdrop-blur-sm" onClick={() => setProjectToDelete(null)}></div>
          <div className="relative w-full max-w-sm bg-white dark:bg-surface-dark rounded-3xl shadow-2xl p-8 border border-red-500/20 text-center space-y-6 animate-fade-in">
             <div className="size-16 rounded-full bg-red-500/10 text-red-500 flex items-center justify-center mx-auto"><span className="material-symbols-outlined text-4xl">warning</span></div>
             <div className="space-y-2">
                <h3 className="text-xl font-black uppercase">Destroy Folder?</h3>
                <p className="text-xs text-text-muted font-medium">Items inside will be unlinked but NOT destroyed from your studio library.</p>
             </div>
             <div className="flex gap-3">
                <button onClick={() => setProjectToDelete(null)} className="flex-1 py-3 rounded-xl bg-gray-100 dark:bg-white/5 text-[10px] font-black uppercase">Cancel</button>
                <button onClick={confirmDeleteProject} disabled={loading} className="flex-1 py-3 rounded-xl bg-red-500 text-white text-[10px] font-black uppercase shadow-lg shadow-red-500/20">Delete</button>
             </div>
          </div>
        </div>
      )}

      {/* ADD ITEMS MODAL */}
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
                           <span className="text-xs font-black uppercase truncate">{r.title || r.name}</span>
                           <button onClick={() => linkItemToProject('recipes', r.id)} className="h-8 px-4 rounded-lg bg-primary text-black text-[9px] font-black uppercase">Add</button>
                        </div>
                      ))}
                   </div>
                </section>
                <section className="space-y-4">
                   <h4 className="text-[10px] font-black uppercase tracking-widest text-blue-500 border-b border-blue-500/20 pb-2">Available Pairings</h4>
                   <div className="grid gap-2">
                      {unlinkedPairings.map(p => (
                        <div key={p.id} className="p-4 bg-gray-50 dark:bg-white/5 rounded-xl flex items-center justify-between border border-transparent hover:border-blue-500/30 transition-all">
                           <span className="text-xs font-black uppercase truncate">{p.title || p.ingredients.join(' + ')}</span>
                           <button onClick={() => linkItemToProject('pairings', p.id)} className="h-8 px-4 rounded-lg bg-blue-500 text-white text-[9px] font-black uppercase">Add</button>
                        </div>
                      ))}
                   </div>
                </section>
                <section className="space-y-4">
                   <h4 className="text-[10px] font-black uppercase tracking-widest text-amber-500 border-b border-amber-500/20 pb-2">Available Food Costs</h4>
                   <div className="grid gap-2">
                      {unlinkedFoodCosts.map(f => (
                        <div key={f.id} className="p-4 bg-gray-50 dark:bg-white/5 rounded-xl flex items-center justify-between border border-transparent hover:border-amber-500/30 transition-all">
                           <span className="text-xs font-black uppercase truncate">{f.recipe_name}</span>
                           <button onClick={() => linkItemToProject('food_costs', f.id)} className="h-8 px-4 rounded-lg bg-amber-500 text-black text-[9px] font-black uppercase">Add</button>
                        </div>
                      ))}
                   </div>
                </section>
             </div>
             <footer className="p-8 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-black/10">
                <button onClick={() => setShowAddItemsModal(false)} className="w-full py-4 rounded-2xl bg-black text-white text-xs font-black uppercase">Done</button>
             </footer>
          </div>
        </div>
      )}
    </div>
  );
};
