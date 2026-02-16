
import React, { useState, useMemo, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { supabase } from '../supabaseClient';
import { useAppContext } from '../AppContext';

// --- TYPES ---
interface Subtopic {
  id: string;
  category: string;
  parentGroup?: string;
  title: string;
  badge?: 'heritage' | 'verified' | 'technique';
  icon?: string;
}

interface ArticleContent {
  content: string;
  image_url?: string;
  reading_time?: string;
  author?: string;
}

// --- CONSTANTS ---
const CATEGORIES = [
  { id: 'INGREDIENTS', label: 'Ingredients', icon: '📋' },
  { id: 'TECHNIQUES', label: 'Techniques', icon: '🔪' },
  { id: 'MEXICO', label: 'Mexico', icon: '🇲🇽' },
  { id: 'JAPAN', label: 'Japan', icon: '🇯🇵' },
  { id: 'SPAIN', label: 'Spain', icon: '🇪🇸' },
  { id: 'ITALY', label: 'Italy', icon: '🇮🇹' },
  { id: 'FRANCE', label: 'France', icon: '🇫🇷' },
];

const TOPICS_HIERARCHY: Record<string, Subtopic[]> = {
  INGREDIENTS: [
    { id: 'ing-1', category: 'INGREDIENTS', title: 'Grains & Cereals', icon: '📋', badge: 'verified' },
    { id: 'ing-2', category: 'INGREDIENTS', title: 'Vegetables', icon: '📋', badge: 'verified' },
    { id: 'ing-3', category: 'INGREDIENTS', title: 'Fruits', icon: '📋', badge: 'verified' },
    { id: 'ing-4', category: 'INGREDIENTS', title: 'Herbs & Spices', icon: '📋', badge: 'verified' },
    { id: 'ing-5', category: 'INGREDIENTS', title: 'Legumes & Pulses', icon: '📋', badge: 'verified' },
    { id: 'ing-6', category: 'INGREDIENTS', title: 'Dairy & Cheeses', icon: '📋', badge: 'verified' },
    { id: 'ing-7', category: 'INGREDIENTS', title: 'Meats & Game', icon: '📋', badge: 'verified' },
    { id: 'ing-8', category: 'INGREDIENTS', title: 'Fish & Seafood', icon: '📋', badge: 'verified' },
    { id: 'ing-9', category: 'INGREDIENTS', title: 'Oils & Fats', icon: '📋', badge: 'verified' },
    { id: 'ing-10', category: 'INGREDIENTS', title: 'Nuts & Seeds', icon: '📋', badge: 'verified' },
    { id: 'ing-11', category: 'INGREDIENTS', title: 'Sweeteners', icon: '📋', badge: 'verified' },
    { id: 'ing-12', category: 'INGREDIENTS', title: 'Fermented & Pickled', icon: '📋', badge: 'verified' },
    { id: 'ing-13', category: 'INGREDIENTS', title: 'Sauces & Condiments', icon: '📋', badge: 'verified' },
    { id: 'ing-14', category: 'INGREDIENTS', title: 'Gelling & Thickening Agents', icon: '📋', badge: 'verified' },
    { id: 'ing-15', category: 'INGREDIENTS', title: 'Sourdoughs & Starters', icon: '📋', badge: 'verified' },
    { id: 'ing-16', category: 'INGREDIENTS', title: 'Specialty Ingredients', icon: '📋', badge: 'verified' },
  ],
  TECHNIQUES: [
    { id: 'tech-k1', category: 'TECHNIQUES', parentGroup: 'Knife Skills', title: 'Chopping', icon: '🔪', badge: 'verified' },
    { id: 'tech-k2', category: 'TECHNIQUES', parentGroup: 'Knife Skills', title: 'Slicing', icon: '🔪', badge: 'verified' },
    { id: 'tech-k3', category: 'TECHNIQUES', parentGroup: 'Knife Skills', title: 'Dicing', icon: '🔪', badge: 'verified' },
    { id: 'tech-k4', category: 'TECHNIQUES', parentGroup: 'Knife Skills', title: 'Julienning', icon: '🔪', badge: 'verified' },
    { id: 'tech-k5', category: 'TECHNIQUES', parentGroup: 'Knife Skills', title: 'Brunoise', icon: '🔪', badge: 'verified' },
    { id: 'tech-k6', category: 'TECHNIQUES', parentGroup: 'Knife Skills', title: 'Peeling & Paring', icon: '🔪', badge: 'verified' },
    { id: 'tech-c1', category: 'TECHNIQUES', parentGroup: 'Cooking Methods', title: 'Boiling', icon: '🔥', badge: 'verified' },
    { id: 'tech-c2', category: 'TECHNIQUES', parentGroup: 'Cooking Methods', title: 'Steaming', icon: '🔥', badge: 'verified' },
    { id: 'tech-c3', category: 'TECHNIQUES', parentGroup: 'Cooking Methods', title: 'Poaching', icon: '🔥', badge: 'verified' },
    { id: 'tech-c4', category: 'TECHNIQUES', parentGroup: 'Cooking Methods', title: 'Grilling', icon: '🔥', badge: 'verified' },
    { id: 'tech-c5', category: 'TECHNIQUES', parentGroup: 'Cooking Methods', title: 'Roasting', icon: '🔥', badge: 'verified' },
    { id: 'tech-c6', category: 'TECHNIQUES', parentGroup: 'Cooking Methods', title: 'Baking', icon: '🔥', badge: 'verified' },
    { id: 'tech-c7', category: 'TECHNIQUES', parentGroup: 'Cooking Methods', title: 'Frying', icon: '🔥', badge: 'verified' },
    { id: 'tech-c8', category: 'TECHNIQUES', parentGroup: 'Cooking Methods', title: 'Sautéing', icon: '🔥', badge: 'verified' },
    { id: 'tech-c9', category: 'TECHNIQUES', parentGroup: 'Cooking Methods', title: 'Blanching', icon: '🔥', badge: 'verified' },
    { id: 'tech-c10', category: 'TECHNIQUES', parentGroup: 'Cooking Methods', title: 'Sous-vide', icon: '🔥', badge: 'verified' },
    { id: 'tech-p1', category: 'TECHNIQUES', parentGroup: 'Preparation', title: 'Marinating', icon: '🧪', badge: 'verified' },
    { id: 'tech-p2', category: 'TECHNIQUES', parentGroup: 'Preparation', title: 'Fermenting', icon: '🧪', badge: 'verified' },
    { id: 'tech-p3', category: 'TECHNIQUES', parentGroup: 'Preparation', title: 'Smoking', icon: '🧪', badge: 'verified' },
    { id: 'tech-p4', category: 'TECHNIQUES', parentGroup: 'Preparation', title: 'Curing', icon: '🧪', badge: 'verified' },
    { id: 'tech-p5', category: 'TECHNIQUES', parentGroup: 'Preparation', title: 'Pickling', icon: '🧪', badge: 'verified' },
    { id: 'tech-p6', category: 'TECHNIQUES', parentGroup: 'Preparation', title: 'Emulsifying', icon: '🧪', badge: 'verified' },
    { id: 'tech-p7', category: 'TECHNIQUES', parentGroup: 'Preparation', title: 'Clarifying', icon: '🧪', badge: 'verified' },
    { id: 'tech-pl1', category: 'TECHNIQUES', parentGroup: 'Plating', title: 'Classic Styles', icon: '🎨', badge: 'verified' },
    { id: 'tech-pl2', category: 'TECHNIQUES', parentGroup: 'Plating', title: 'Modern Styles', icon: '🎨', badge: 'verified' },
    { id: 'tech-pl3', category: 'TECHNIQUES', parentGroup: 'Plating', title: 'Garnishing', icon: '🎨', badge: 'verified' },
    { id: 'tech-pl4', category: 'TECHNIQUES', parentGroup: 'Plating', title: 'Texture & Height', icon: '🎨', badge: 'verified' },
    { id: 'tech-pl5', category: 'TECHNIQUES', parentGroup: 'Plating', title: 'Color Theory', icon: '🎨', badge: 'verified' },
  ],
  MEXICO: Array.from({ length: 21 }).map((_, i) => ({
    id: `mex-${i + 1}`,
    category: 'MEXICO',
    title: [
      'Culinary History', 'Pre-Columbian Traditions', 'Colonial Influences', 'Traditional Ingredients',
      'Cooking Techniques', 'Corn Gastronomy and Nixtamalization', 'Regional Cuisines', 'Culinary Masters',
      'Iconic Dishes', 'Traditional Tools', 'Festivals and Food', 'Street Food Culture', 'Sauces & Moles Varieties',
      'Staple Foods', 'Traditional Beverages', 'Indigenous Influence', 'Religious & Festive Dishes',
      'Modern Mexican Cuisine', 'Fusion & Contemporary Styles', 'Markets & Food Distribution', 'Local Foodways & Agriculture'
    ][i],
    icon: '🇲🇽',
    badge: 'verified'
  })),
  JAPAN: Array.from({ length: 20 }).map((_, i) => ({
    id: `jpn-${i + 1}`,
    category: 'JAPAN',
    title: [
      'Washoku Tradition', 'Historical Development', 'Seasonal Cooking', 'Traditional Ingredients',
      'Kaiseki Cuisine', 'Regional Variations', 'Culinary Philosophy', 'Traditional Dishes',
      'Cooking Utensils', 'Tea Culture', 'Sushi & Sashimi Culture', 'Noodle Varieties (Ramen, Soba, Udon)',
      'Fermentation (Miso, Soy, Pickles, Sake)', 'Street Food / Izayaka', 'Presentation & Aesthetics',
      'Festive/Religious Cuisine', 'Modern Japanese Fusion', 'Seafood Traditions', 'Obentos & Home Cooking',
      'Confectionery (Wagashi)'
    ][i],
    icon: '🇯🇵',
    badge: 'verified'
  })),
  SPAIN: Array.from({ length: 22 }).map((_, i) => ({
    id: `esp-${i + 1}`,
    category: 'SPAIN',
    title: [
      'Culinary Evolution', 'Moorish Influences', 'Regional Cuisines', 'Traditional Ingredients',
      'Cooking Methods', 'Tapas Culture', 'Renowned Chefs', 'Classic Dishes', 'Traditional Equipment',
      'Culinary Festivals', 'Seafood & Coasts', 'Jamon & Cured Meats', 'Paella & Rice Dishes',
      'Olive Oil Culture', 'Wines & Sherries', 'Spanish Sweets & Pastries', 'Bar & Taverna Culture',
      'Religious and Festive Foods', 'Spanish Bread Traditions', 'Farmhouse & Mountain Cooking',
      'Gastronomic Societies (Txokos)', 'Contemporary Spanish Cuisine'
    ][i],
    icon: '🇪🇸',
    badge: 'verified'
  })),
  ITALY: Array.from({ length: 23 }).map((_, i) => ({
    id: `ita-${i + 1}`,
    category: 'ITALY',
    title: [
      'Regional Diversity', 'Ancient Origins', 'Renaissance Influence', 'Traditional Ingredients',
      'Pasta Culture', 'Regional Specialties', 'Master Chefs', 'Iconic Recipes', 'Traditional Tools',
      'Food Traditions', 'Olive Oil & Vinegar Traditions', 'Cheese Varieties', 'Bread & Pizza Traditions',
      'Coffee & Espresso Culture', 'Antipasti & Aperitivi', 'Seafood Traditions', 'Confectionery & Desserts',
      'Festivals & Celebrations', 'Wine Regions & Traditions', 'Home Cooking / Familiare', 'Italian Street Food',
      'Slow Food Movement', 'Contemporary & Fusion Italian'
    ][i],
    icon: '🇮🇹',
    badge: 'verified'
  })),
  FRANCE: Array.from({ length: 23 }).map((_, i) => ({
    id: `fra-${i + 1}`,
    category: 'FRANCE',
    title: [
      'Haute Cuisine History', 'Classical Foundations', 'Regional Traditions', 'Essential Ingredients',
      'Classical Techniques', 'Wine Regions', 'Legendary Chefs', 'Classic Preparations',
      'Professional Equipment', 'Culinary Schools', 'Bistro & Brasserie Culture', 'Charcuterie & Pâtés',
      'Bread & Viennoiserie (Bakery)', 'Cheese Traditions', 'Pastry & Desserts (Pâtisserie)',
      'Butter & Dairy Traditions', 'Festive & Religious Cuisine', 'Sauces & Stocks',
      'French Home Cooking', 'Contemporary / Fusion French', 'Food Markets & Distribution',
      'Great Food Writers & Literature', 'Gastronomic Tourism'
    ][i],
    icon: '🇮🇷',
    badge: 'verified'
  })),
};

const ALL_TOPICS = Object.values(TOPICS_HIERARCHY).flat();

export const FoodHistory = () => {
  const { user, isLoggedIn } = useAppContext();
  
  // --- STATE ---
  const [activeCategory, setActiveCategory] = useState('INGREDIENTS');
  const [activeTopic, setActiveTopic] = useState<Subtopic>(TOPICS_HIERARCHY['INGREDIENTS'][0]);
  const [searchQuery, setSearchQuery] = useState('');
  const [article, setArticle] = useState<ArticleContent | null>(null);
  const [loading, setLoading] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);
  const [savedTopics, setSavedTopics] = useState<string[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
    'Knife Skills': true,
    'Cooking Methods': true,
    'Preparation': true,
    'Plating': true
  });

  // --- FETCH ARTICLE & SAVED STATUS ---
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setArticle(null);
      
      try {
        const { data: artData } = await supabase
          .from('culinary_encyclopedia')
          .select('*')
          .eq('topic_id', activeTopic.id)
          .maybeSingle();

        if (artData) {
          setArticle(artData);
        } else {
          setArticle({
            content: `### 📜 ${activeTopic.title}\n\nOur historians are currently verifying and digitizing the archives for **${activeTopic.title}**.\n\n> "History is the secret ingredient in every recipe." - Studio Archive`,
            reading_time: '5 min',
            author: 'Culinary Studio AI'
          });
        }

        if (isLoggedIn && user) {
          const { data: allSaved } = await supabase
            .from('user_saved_topics')
            .select('topic_id')
            .eq('user_id', user.id);
          
          if (allSaved) {
            const ids = allSaved.map(s => s.topic_id);
            setSavedTopics(ids);
            setIsSaved(ids.includes(activeTopic.id));
          }
        }
      } catch (e) {
        console.error("Data error:", e);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [activeTopic, isLoggedIn, user]);

  // --- HANDLERS ---
  const toggleSave = async () => {
    if (!isLoggedIn || !user) return alert("Log in to save to your library");
    
    try {
      if (isSaved) {
        await supabase
          .from('user_saved_topics')
          .delete()
          .match({ user_id: user.id, topic_id: activeTopic.id });
        setIsSaved(false);
        setSavedTopics(prev => prev.filter(id => id !== activeTopic.id));
      } else {
        await supabase
          .from('user_saved_topics')
          .insert({ user_id: user.id, topic_id: activeTopic.id });
        setIsSaved(true);
        setSavedTopics(prev => [...prev, activeTopic.id]);
      }
    } catch (e) {
      console.error("Save error:", e);
    }
  };

  const navigateToTopicId = (id: string) => {
    const topic = ALL_TOPICS.find(t => t.id === id);
    if (topic) {
      setActiveCategory(topic.category);
      setActiveTopic(topic);
      setShowLibrary(false);
      setIsSidebarOpen(false);
    }
  };

  // --- DERIVED DATA ---
  const filteredTopics = useMemo(() => {
    const currentList = TOPICS_HIERARCHY[activeCategory] || [];
    if (!searchQuery) return currentList;
    const q = searchQuery.toLowerCase();
    return currentList.filter(t => 
      t.title.toLowerCase().includes(q) || 
      (t.parentGroup && t.parentGroup.toLowerCase().includes(q))
    );
  }, [activeCategory, searchQuery]);

  const libraryTopics = useMemo(() => {
    return ALL_TOPICS.filter(t => savedTopics.includes(t.id));
  }, [savedTopics]);

  const toggleGroup = (group: string) => {
    setExpandedGroups(prev => ({ ...prev, [group]: !prev[group] }));
  };

  const handleTopicSelection = (topic: Subtopic) => {
    setActiveTopic(topic);
    setIsSidebarOpen(false); // Close sidebar on mobile after selection
  };

  const renderTopicList = () => {
    const grouped: Record<string, Subtopic[]> = {};
    filteredTopics.forEach(t => {
      const group = t.parentGroup || 'General';
      if (!grouped[group]) grouped[group] = [];
      grouped[group].push(t);
    });

    return Object.entries(grouped).map(([group, topics]) => (
      <div key={group} className="mb-2">
        {group !== 'General' && (
          <button 
            onClick={() => toggleGroup(group)}
            className="w-full flex items-center justify-between px-4 py-2 text-[10px] font-black uppercase tracking-widest text-text-muted hover:text-primary transition-all"
          >
            <span>{group}</span>
            <span className="material-symbols-outlined text-[14px]">
              {expandedGroups[group] ? 'expand_less' : 'expand_more'}
            </span>
          </button>
        )}
        {(group === 'General' || expandedGroups[group]) && (
          <div className="space-y-1">
            {topics.map(topic => (
              <button
                key={topic.id}
                onClick={() => handleTopicSelection(topic)}
                className={`w-full text-left px-4 py-2.5 text-sm transition-all flex items-center gap-3 border-l-4 ${
                  activeTopic?.id === topic.id 
                  ? 'bg-primary/10 border-primary text-black dark:text-white font-black' 
                  : 'border-transparent text-gray-500 hover:bg-gray-100 dark:hover:bg-white/5'
                }`}
              >
                <span>{topic.icon}</span>
                <span className="truncate">{topic.title}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    ));
  };

  return (
    <div className="h-screen flex flex-col bg-[#FFFBF3] dark:bg-background-dark text-[#1F2121] dark:text-white overflow-hidden animate-fade-in font-sans">
      
      {/* HEADER */}
      <header className="p-4 md:p-8 bg-white dark:bg-surface-dark border-b border-[#E5E7EB] dark:border-gray-800 shrink-0">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 mb-6">
          <h1 className="text-2xl md:text-4xl font-black uppercase tracking-tighter">Culinary Encyclopedia</h1>
          
          <div className="flex items-center gap-3 w-full lg:w-auto">
            {/* My Library Button */}
            <div className="relative">
              <button 
                onClick={() => setShowLibrary(!showLibrary)}
                className={`h-11 px-3 md:px-4 rounded-xl flex items-center gap-2 text-[10px] font-black uppercase tracking-widest transition-all ${showLibrary ? 'bg-primary text-black' : 'bg-gray-100 dark:bg-white/5 text-gray-500 hover:text-black shadow-sm'}`}
              >
                <span className="material-symbols-outlined text-[20px]">library_books</span>
                <span className="hidden sm:block">My Library</span>
                <span className="bg-primary/20 dark:bg-white/10 px-2 py-0.5 rounded-full text-[9px]">{savedTopics.length}</span>
              </button>

              {showLibrary && (
                <div className="absolute top-14 left-0 w-64 bg-white dark:bg-surface-dark rounded-2xl shadow-2xl border border-gray-100 dark:border-gray-800 z-[100] animate-fade-in py-4 max-h-80 overflow-y-auto">
                  <h4 className="px-5 pb-3 text-[10px] font-black uppercase text-primary border-b border-gray-50 dark:border-gray-800 mb-2">Saved Archives</h4>
                  {libraryTopics.length > 0 ? libraryTopics.map(t => (
                    <button 
                      key={t.id}
                      onClick={() => navigateToTopicId(t.id)}
                      className="w-full text-left px-5 py-3 text-xs font-bold hover:bg-primary/10 transition-colors flex items-center gap-3"
                    >
                      <span>{t.icon}</span> {t.title}
                    </button>
                  )) : (
                    <p className="px-5 py-8 text-center text-[10px] text-text-muted font-black uppercase">Your library is empty.</p>
                  )}
                </div>
              )}
            </div>

            <div className="relative flex-1 lg:w-80">
              <input 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search category topics..."
                className="w-full h-11 pl-11 pr-4 bg-[#F3F4F6] dark:bg-white/5 rounded-xl border-none focus:ring-1 focus:ring-primary text-sm"
              />
              <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400">search</span>
            </div>
          </div>
        </div>

        <nav className="flex flex-nowrap gap-2 overflow-x-auto pb-2 no-scrollbar scroll-smooth">
          {CATEGORIES.map(cat => (
            <button
              key={cat.id}
              onClick={() => {
                setActiveCategory(cat.id);
                setActiveTopic(TOPICS_HIERARCHY[cat.id][0]);
              }}
              className={`px-4 md:px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-[0.1em] transition-all flex items-center gap-2 whitespace-nowrap ${
                activeCategory === cat.id 
                ? 'bg-[#FFC107] text-black scale-105 shadow-md' 
                : 'bg-[#F3F4F6] dark:bg-white/5 text-gray-500 hover:bg-gray-200 dark:hover:bg-white/10'
              }`}
            >
              <span>{cat.icon}</span> {cat.label}
            </button>
          ))}
        </nav>
      </header>

      <div className="flex-1 overflow-hidden flex flex-col md:flex-row relative">
        
        {/* SIDEBAR - Toggleable on Mobile */}
        {isSidebarOpen && (
          <div 
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[70] md:hidden transition-opacity duration-300"
            onClick={() => setIsSidebarOpen(false)}
          />
        )}

        <aside className={`
          ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
          fixed md:relative top-0 left-0 h-full w-[280px] md:w-72 
          border-r border-[#E5E7EB] dark:border-gray-800 bg-[#F9F9F7] dark:bg-background-dark/50 
          overflow-y-auto shrink-0 transition-transform duration-300 z-[80] md:z-auto
        `}>
          <div className="p-4 md:p-4">
            <div className="flex items-center justify-between mb-4 px-4 md:hidden">
              <h2 className="text-[10px] font-black uppercase tracking-widest text-primary">Topics</h2>
              <button onClick={() => setIsSidebarOpen(false)} className="material-symbols-outlined">close</button>
            </div>
            <h2 className="hidden md:block text-[10px] font-black uppercase tracking-widest text-text-muted mb-4 px-4">Topics</h2>
            {renderTopicList()}
          </div>
        </aside>

        {/* MAIN ARTICLE */}
        <main className="flex-1 overflow-y-auto bg-white dark:bg-background-dark transition-all duration-300 relative">
          
          {/* Mobile Floating Menu Button */}
          <button 
            onClick={() => setIsSidebarOpen(true)}
            className="md:hidden fixed bottom-6 left-6 z-[65] size-14 rounded-full bg-black text-white shadow-2xl flex items-center justify-center border border-white/20"
          >
            <span className="material-symbols-outlined">menu_book</span>
          </button>

          {loading ? (
             <div className="absolute inset-0 flex items-center justify-center bg-white/50 dark:bg-black/50 backdrop-blur-sm z-50">
               <span className="material-symbols-outlined animate-spin text-4xl text-primary">sync</span>
             </div>
          ) : (
            <div className="max-w-3xl mx-auto p-6 md:p-12 lg:p-16 space-y-12 animate-fade-in">
              
              <div className="space-y-6">
                <nav className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-text-muted">
                  <span>{activeTopic?.category}</span>
                  <span className="material-symbols-outlined text-[12px]">chevron_right</span>
                  <span className="text-primary truncate">{activeTopic?.title}</span>
                </nav>

                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                  <h2 className="text-3xl md:text-6xl font-black tracking-tighter leading-tight md:leading-none">{activeTopic?.title}</h2>
                  <div className="flex gap-2">
                    <span className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-[9px] font-black uppercase shadow-sm whitespace-nowrap">Verified Academic</span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-4 md:gap-6 py-4 border-y border-gray-100 dark:border-gray-800 text-[10px] font-black uppercase tracking-widest text-text-muted">
                  <div className="flex items-center gap-2"><span className="material-symbols-outlined text-[16px]">schedule</span> {article?.reading_time || '5 min'} Read</div>
                  <div className="flex items-center gap-2"><span className="material-symbols-outlined text-[16px]">person</span> {article?.author || 'Culinary AI Studio'}</div>
                  <button 
                    onClick={toggleSave}
                    className={`flex items-center gap-2 transition-all ${isSaved ? 'text-primary' : 'hover:text-primary'} ml-0 md:ml-auto`}
                  >
                    <span className={`material-symbols-outlined text-[20px] ${isSaved ? 'material-symbols-filled' : ''}`}>bookmark</span>
                    {isSaved ? 'Saved' : 'Save'}
                  </button>
                </div>
              </div>

              {article?.image_url && (
                <div className="w-full h-[250px] md:h-[400px] rounded-3xl overflow-hidden shadow-2xl relative group">
                  <img 
                    src={article.image_url} 
                    alt={activeTopic.title} 
                    className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-105" 
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent"></div>
                </div>
              )}

              {/* RENDER MARKDOWN */}
              <article className="prose-editorial max-w-none">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {article?.content || ''}
                </ReactMarkdown>
              </article>

              <footer className="pt-12 border-t border-gray-100 dark:border-gray-800 flex justify-between items-center opacity-60">
                <p className="text-[9px] md:text-[10px] font-black uppercase tracking-[0.2em]">Culinary Archives • 2026</p>
                <div className="flex gap-4">
                  <span className="material-symbols-outlined text-[18px]">verified</span>
                  <span className="material-symbols-outlined text-[18px]">workspace_premium</span>
                </div>
              </footer>
            </div>
          )}
        </main>
      </div>

      <style>{`
        .prose-editorial h1, .prose-editorial h2, .prose-editorial h3 {
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: -0.02em;
          margin-top: 2.5rem;
          margin-bottom: 1.25rem;
          color: var(--text-primary);
        }
        .prose-editorial h2 { 
          font-size: 1.75rem; 
          border-bottom: 2px solid #FFC107; 
          display: inline-block; 
          padding-bottom: 4px; 
          line-height: 1.1;
        }
        @media (min-width: 768px) {
          .prose-editorial h2 { font-size: 2.25rem; }
        }
        .prose-editorial h3 { font-size: 1.25rem; }
        .prose-editorial p {
          font-family: 'Georgia', serif;
          font-size: 1.05rem;
          line-height: 1.7;
          margin-bottom: 1.5rem;
          color: #374151;
        }
        @media (min-width: 768px) {
          .prose-editorial p { font-size: 1.15rem; line-height: 1.9; }
        }
        .dark .prose-editorial p { color: #E5E7EB; }
        .prose-editorial blockquote {
          border-left: 4px solid #FFC107;
          font-style: italic;
          color: #FFC107;
          margin: 2rem 0;
          font-size: 1.2rem;
          background: rgba(255, 193, 7, 0.04);
          padding: 1.5rem;
          border-radius: 0 1rem 1rem 0;
          font-family: 'Work Sans', sans-serif;
          font-weight: 500;
        }
        @media (min-width: 768px) {
           .prose-editorial blockquote { font-size: 1.4rem; padding: 2rem; }
        }
        .prose-editorial ul, .prose-editorial ol {
          margin-left: 0;
          margin-bottom: 2rem;
          list-style: none;
        }
        .prose-editorial li {
          position: relative;
          padding-left: 1.5rem;
          margin-bottom: 0.5rem;
          font-weight: 500;
          font-size: 1rem;
        }
        @media (min-width: 768px) {
          .prose-editorial li { padding-left: 2rem; margin-bottom: 0.75rem; font-size: 1.05rem; }
        }
        .prose-editorial li::before {
          content: "◈";
          position: absolute;
          left: 0;
          color: #FFC107;
          font-weight: bold;
        }
        .prose-editorial strong { font-weight: 800; color: #111827; }
        .dark .prose-editorial strong { color: #FFFFFF; }
      `}</style>
    </div>
  );
};
