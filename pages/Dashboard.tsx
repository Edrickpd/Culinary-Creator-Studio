import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { NewsPanel } from '../components/Layout';
import { useAppContext } from '../AppContext';
import { AuthModals } from '../components/AuthModals';
import { supabase } from '../supabaseClient';

interface FeaturedPost {
  id: string;
  recipe_id?: string;
  user_id: string;
  title: string;
  description: string;
  image_url: string;
  difficulty: string;
  created_at: string;
  likesCount: number;
  isLiked?: boolean;
  isSaved?: boolean;
  chefName: string;
  chefAvatar?: string;
}

const FeaturedDishCard: React.FC<{ post: FeaturedPost; onToggleLike: (post: FeaturedPost) => void; onToggleSave: (post: FeaturedPost) => void }> = ({ post, onToggleLike, onToggleSave }) => {
  const navigate = useNavigate();

  return (
    <article className="group relative bg-white dark:bg-surface-dark rounded-[32px] overflow-hidden shadow-lg hover:shadow-2xl transition-all duration-500 hover:-translate-y-2 border border-gray-100 dark:border-gray-800 flex flex-col h-full">
      <div className="aspect-[4/3] w-full bg-gray-200 dark:bg-zinc-800 relative overflow-hidden">
        <img 
          src={post.image_url || 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&q=80&w=1600'} 
          alt={post.title} 
          className="w-full h-full object-cover transition-transform duration-1000 ease-out group-hover:scale-110" 
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
        
        <div className="absolute top-4 right-4 z-10">
          <div className="bg-white/80 dark:bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-2xl flex items-center gap-1.5 shadow-xl border border-white/20">
            <span className="material-symbols-outlined text-primary text-[16px] filled">skillet</span>
            <span className="text-xs font-bold text-gray-900 dark:text-white">{post.likesCount}</span>
          </div>
        </div>

        <div className="absolute bottom-4 left-4 z-10">
           <span className={`text-[9px] font-black px-3 py-1 rounded-full uppercase tracking-widest bg-primary text-black shadow-lg`}>
            {post.difficulty || 'Expert'}
          </span>
        </div>
      </div>
      
      <div className="p-8 flex flex-col flex-1 gap-6">
        <div className="space-y-2">
          <div className="flex items-center gap-3 mb-2">
            <div className="size-8 rounded-xl bg-primary/20 flex items-center justify-center text-[10px] font-black text-primary border border-primary/20 overflow-hidden">
              {post.chefAvatar ? (
                <img src={post.chefAvatar} alt={post.chefName} className="size-full object-cover" />
              ) : (
                post.chefName?.[0] || 'C'
              )}
            </div>
            <span className="text-xs font-bold dark:text-gray-200">Chef {post.chefName}</span>
          </div>
          <h3 className="text-2xl font-black uppercase tracking-tight leading-tight group-hover:text-primary transition-colors block truncate">
            {post.title}
          </h3>
          <p className="text-sm text-text-muted leading-relaxed font-medium italic line-clamp-2">
            "{post.description || 'Masterpiece created in Culinary Creator Studio'}"
          </p>
        </div>

        <div className="pt-6 mt-auto border-t border-gray-50 dark:border-gray-800 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <button 
              onClick={() => onToggleLike(post)}
              className={`flex items-center gap-2 transition-all ${post.isLiked ? 'text-primary scale-110' : 'text-gray-300 hover:text-primary'}`}
              title="Like with skillet"
            >
              <span className={`material-symbols-outlined text-[24px] ${post.isLiked ? 'filled' : ''}`}>skillet</span>
              <span className="text-xs font-bold">{post.likesCount}</span>
            </button>
            <button 
              onClick={() => onToggleSave(post)}
              className={`flex items-center gap-2 transition-all ${post.isSaved ? 'text-primary scale-110' : 'text-gray-300 hover:text-primary'}`}
              title="Save Recipe"
            >
              <span className={`material-symbols-outlined text-[24px] ${post.isSaved ? 'filled' : ''}`}>bookmark</span>
            </button>
          </div>
          <button 
            onClick={() => navigate('/social')}
            className="size-11 rounded-full bg-gray-50 dark:bg-white/5 flex items-center justify-center text-text-muted hover:bg-primary hover:text-black transition-all shadow-sm"
            title="Inspect in Community"
          >
            <span className="material-symbols-outlined text-[20px]">visibility</span>
          </button>
        </div>
      </div>
    </article>
  );
};

export const Dashboard = () => {
  const { t, user, isLoggedIn } = useAppContext();
  const navigate = useNavigate();
  const [showAuth, setShowAuth] = useState(false);
  const [featuredPosts, setFeaturedPosts] = useState<FeaturedPost[]>([]);
  const [featuredTimeframe, setFeaturedTimeframe] = useState<string>('week');
  const [loadingPosts, setLoadingPosts] = useState(true);

  // Fetch top 3 liked posts with progressive fallback (Last 7 days -> 30 days -> 90 days -> all time)
  useEffect(() => {
    fetchTopLikedPosts();
  }, [user]);

  const fetchTopLikedPosts = async () => {
    setLoadingPosts(true);
    try {
      // 1. Try 7 days
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      let { data: posts } = await supabase
        .from('social_posts')
        .select('*, profiles:user_id(chef_name, avatar_url), recipe:recipe_id(id)')
        .gte('created_at', sevenDaysAgo);

      let timeframe = 'this week';

      // 2. If none, try 30 days
      if (!posts || posts.length === 0) {
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        const res = await supabase
          .from('social_posts')
          .select('*, profiles:user_id(chef_name, avatar_url), recipe:recipe_id(id)')
          .gte('created_at', thirtyDaysAgo);
        posts = res.data;
        timeframe = 'this month';
      }

      // 3. If none, try 90 days
      if (!posts || posts.length === 0) {
        const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
        const res = await supabase
          .from('social_posts')
          .select('*, profiles:user_id(chef_name, avatar_url), recipe:recipe_id(id)')
          .gte('created_at', ninetyDaysAgo);
        posts = res.data;
        timeframe = 'the last 3 months';
      }

      // 4. Fallback to all time if still none
      if (!posts || posts.length === 0) {
        const res = await supabase
          .from('social_posts')
          .select('*, profiles:user_id(chef_name, avatar_url), recipe:recipe_id(id)');
        posts = res.data;
        timeframe = 'all time';
      }

      const validPosts = (posts || []).filter(p => p.recipe_id && p.recipe !== null);

      if (validPosts && validPosts.length > 0) {
        // Fetch like counts & user like/save states
        const postIds = validPosts.map(p => p.id);
        const [likesRes, myLikesRes, mySavesRes] = await Promise.all([
          supabase.from('social_likes').select('post_id'),
          user ? supabase.from('social_likes').select('post_id').eq('user_id', user.id).in('post_id', postIds) : Promise.resolve({ data: [] }),
          user ? supabase.from('social_saves').select('post_id').eq('user_id', user.id).in('post_id', postIds) : Promise.resolve({ data: [] })
        ]);

        const likesCountMap: Record<string, number> = {};
        likesRes.data?.forEach(l => {
          likesCountMap[l.post_id] = (likesCountMap[l.post_id] || 0) + 1;
        });

        const myLikedSet = new Set(myLikesRes.data?.map(l => l.post_id) || []);
        const mySavedSet = new Set(mySavesRes.data?.map(s => s.post_id) || []);

        const mapped: FeaturedPost[] = validPosts.map(p => ({
          id: p.id,
          recipe_id: p.recipe_id,
          user_id: p.user_id,
          title: p.title,
          description: p.description,
          image_url: p.image_url,
          difficulty: p.difficulty || 'Expert',
          created_at: p.created_at,
          likesCount: likesCountMap[p.id] || 0,
          isLiked: myLikedSet.has(p.id),
          isSaved: mySavedSet.has(p.id),
          chefName: p.profiles?.chef_name || 'Anonymous Chef',
          chefAvatar: p.profiles?.avatar_url
        }));

        // Sort by likes descending, take top 3
        mapped.sort((a, b) => b.likesCount - a.likesCount);
        setFeaturedPosts(mapped.slice(0, 3));
        setFeaturedTimeframe(timeframe);
      } else {
        setFeaturedPosts([]);
      }
    } catch (e) {
      console.error("Error loading featured posts:", e);
      setFeaturedPosts([]);
    } finally {
      setLoadingPosts(false);
    }
  };

  const handleToggleLike = async (post: FeaturedPost) => {
    if (!isLoggedIn || !user) {
      setShowAuth(true);
      return;
    }
    try {
      if (post.isLiked) {
        await supabase.from('social_likes').delete().match({ post_id: post.id, user_id: user.id });
      } else {
        await supabase.from('social_likes').insert({ post_id: post.id, user_id: user.id });
      }
      setFeaturedPosts(prev => prev.map(p => p.id === post.id ? { ...p, isLiked: !p.isLiked, likesCount: p.isLiked ? p.likesCount - 1 : p.likesCount + 1 } : p));
    } catch (err) {
      console.error("Like toggle failed:", err);
    }
  };

  const handleToggleSave = async (post: FeaturedPost) => {
    if (!isLoggedIn || !user) {
      setShowAuth(true);
      return;
    }
    try {
      if (post.isSaved) {
        await supabase.from('social_saves').delete().match({ post_id: post.id, user_id: user.id });
      } else {
        await supabase.from('social_saves').insert({ post_id: post.id, user_id: user.id });
      }
      setFeaturedPosts(prev => prev.map(p => p.id === post.id ? { ...p, isSaved: !p.isSaved } : p));
    } catch (err) {
      console.error("Save toggle failed:", err);
    }
  };

  const scrollToTools = () => {
    document.getElementById('tools-grid')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleToolClick = (path: string) => {
    if (!isLoggedIn) {
      setShowAuth(true);
    } else {
      navigate(path);
    }
  };

  const getSubscriptionLabel = () => {
    if (!user?.tier) return '';
    const label = t(`subscription.${user.tier}`);
    if (label.includes('subscription.')) {
      return user.tier.charAt(0).toUpperCase() + user.tier.slice(1);
    }
    return label;
  };

  const toolSections = [
    { id: 'createDish', icon: 'edit_square', color: 'bg-primary text-black', path: '/create-dish', desc: 'Step-by-step master recipe engineer.' },
    { id: 'myProjects', icon: 'folder_special', color: 'bg-amber-500 text-white', path: '/projects', desc: 'Folders, saved creations & shared hubs.' },
    { id: 'socialHub', icon: 'groups', color: 'bg-pink-500 text-white', path: '/social', desc: 'Connect with the elite chef community.' },
    { id: 'pairingAnalysis', icon: 'science', color: 'bg-blue-500 text-white', path: '/pairing', desc: 'Molecular synergy & flavor affinites.' },
    { id: 'foodHistory', icon: 'history', color: 'bg-purple-500 text-white', path: '/history', desc: 'Deep cultural origins & techniques.' },
    { id: 'priceTracker', icon: 'sell', color: 'bg-green-500 text-white', path: '/price-tracker', desc: 'Global ingredients & supplier pricing.' },
    { id: 'foodCost', icon: 'payments', color: 'bg-amber-600 text-white', path: '/food-cost', desc: 'Professional margin & cost engineering.' },
    { id: 'settings', icon: 'settings', color: 'bg-gray-500 text-white', path: '/settings', desc: 'Preferences, profile & studio controls.' },
  ];

  return (
    <div className="flex h-full animate-fade-in overflow-hidden">
      <div className="flex-1 overflow-y-auto p-4 lg:p-8 scroll-smooth">
        <div className="max-w-6xl mx-auto space-y-16 pb-24">
          
          {/* Hero Section */}
          <div className="relative w-full rounded-[40px] overflow-hidden shadow-2xl group min-h-[500px] flex items-center">
            <div className="absolute inset-0 bg-cover bg-center transition-transform duration-[2s] group-hover:scale-105" 
                 style={{backgroundImage: 'linear-gradient(to right, rgba(0, 0, 0, 0.85) 0%, rgba(0, 0, 0, 0.2) 100%), url("https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&q=80&w=1600")'}}></div>
            
            <div className="relative z-10 p-8 md:p-12 lg:p-16 flex flex-col items-start gap-6">
              {isLoggedIn && (
                <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-white text-[10px] font-black uppercase tracking-[0.2em]">
                  <span className="size-2 bg-primary rounded-full animate-pulse"></span> {getSubscriptionLabel()} Studio Access
                </div>
              )}
              
              <h1 className="text-white text-5xl md:text-6xl lg:text-8xl font-black leading-[0.9] tracking-tighter max-w-2xl">
                Culinary <br/>
                <span className="text-white">Creator</span> <br/>
                <span className="text-primary italic">Studio</span>
              </h1>
              
              <p className="text-gray-200 text-lg md:text-xl font-medium leading-relaxed max-w-xl opacity-90">
                {t('app.tagline')} - Elevate your culinary workflow with precision AI tools and global market intelligence.
              </p>

              <div className="pt-8 flex flex-wrap gap-5">
                <button 
                  onClick={() => handleToolClick('/create-dish')}
                  className="group/btn relative h-16 px-10 bg-primary text-black text-sm font-black uppercase tracking-[0.1em] rounded-2xl flex items-center gap-4 transition-all hover:scale-105 active:scale-95 shadow-2xl shadow-primary/40 overflow-hidden"
                >
                  <span>{t('dashboard.startCreating') || 'Start Creating'}</span>
                  <span className="material-symbols-outlined">edit_square</span>
                </button>
                <button 
                  onClick={scrollToTools}
                  className="h-16 px-10 bg-white/10 hover:bg-white/20 backdrop-blur-md text-white text-sm font-black uppercase tracking-[0.1em] rounded-2xl transition-all border border-white/20 flex items-center gap-3"
                >
                  {t('dashboard.exploreFeatures') || 'Explore Features'}
                </button>
              </div>
            </div>
          </div>

          {/* Featured Masterpieces (Top 3 Liked Posts) */}
          <div className="space-y-8">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-gray-100 dark:border-gray-800 pb-6">
              <div className="space-y-1">
                <h2 className="text-3xl font-black tracking-tighter uppercase dark:text-white">
                  {t('dashboard.topLiked') || 'Top Liked Masterpieces'}
                </h2>
                <p className="text-sm text-text-muted font-medium">
                  {t('dashboard.topLikedDesc') || 'Most celebrated culinary works'} ({featuredTimeframe}).
                </p>
              </div>
              <button 
                onClick={() => handleToolClick('/social')}
                className="flex items-center gap-2 text-primary font-black uppercase text-xs tracking-widest hover:translate-x-2 transition-transform"
              >
                {t('dashboard.communityFeed') || 'Community Feed'} <span className="material-symbols-outlined">arrow_right_alt</span>
              </button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
              {featuredPosts.map(post => (
                <FeaturedDishCard 
                  key={post.id} 
                  post={post} 
                  onToggleLike={handleToggleLike} 
                  onToggleSave={handleToggleSave} 
                />
              ))}

              {/* Empty Placeholders if fewer than 3 posts */}
              {!loadingPosts && featuredPosts.length === 0 && (
                [1, 2, 3].map(placeholderIdx => (
                  <div key={placeholderIdx} className="border-2 border-dashed border-gray-200 dark:border-gray-800 rounded-[32px] p-8 flex flex-col items-center justify-center text-center gap-4 min-h-[380px] bg-gray-50/50 dark:bg-white/[0.02]">
                    <div className="size-16 rounded-2xl bg-gray-100 dark:bg-white/5 flex items-center justify-center text-gray-400">
                      <span className="material-symbols-outlined text-3xl">skillet</span>
                    </div>
                    <div className="space-y-1">
                      <h4 className="font-black text-sm uppercase tracking-wider text-text-muted">{t('dashboard.featuredSpot') || 'Featured Spot Available'}</h4>
                      <p className="text-xs text-text-muted font-medium max-w-[200px]">{t('dashboard.shareWithCommunity') || 'Share your latest creation with the global community.'}</p>
                    </div>
                    <button onClick={() => handleToolClick('/create-dish')} className="mt-2 px-5 py-2.5 rounded-xl bg-primary text-black text-[10px] font-black uppercase tracking-widest shadow-md hover:scale-105 transition-transform">
                      {t('dashboard.createRecipe') || 'Create Recipe'}
                    </button>
                  </div>
                ))
              )}

              {/* If 1 or 2 posts exist, fill remaining up to 3 with placeholders */}
              {!loadingPosts && featuredPosts.length > 0 && featuredPosts.length < 3 && (
                Array.from({ length: 3 - featuredPosts.length }).map((_, idx) => (
                  <div key={idx} className="border-2 border-dashed border-gray-200 dark:border-gray-800 rounded-[32px] p-8 flex flex-col items-center justify-center text-center gap-4 min-h-[380px] bg-gray-50/50 dark:bg-white/[0.02]">
                    <div className="size-16 rounded-2xl bg-gray-100 dark:bg-white/5 flex items-center justify-center text-gray-400">
                      <span className="material-symbols-outlined text-3xl">restaurant</span>
                    </div>
                    <div className="space-y-1">
                      <h4 className="font-black text-sm uppercase tracking-wider text-text-muted">{t('dashboard.featuredSpot') || 'Featured Spot Available'}</h4>
                      <p className="text-xs text-text-muted font-medium max-w-[200px]">{t('dashboard.shareWithCommunity') || 'Share your latest creation with the global community.'}</p>
                    </div>
                    <button onClick={() => handleToolClick('/create-dish')} className="mt-2 px-5 py-2.5 rounded-xl bg-primary text-black text-[10px] font-black uppercase tracking-widest shadow-md hover:scale-105 transition-transform">
                      {t('dashboard.createRecipe') || 'Create Recipe'}
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Expanded Tools Grid */}
          <div id="tools-grid" className="space-y-8 pt-10">
            <div className="space-y-1">
              <h2 className="text-2xl font-black tracking-tight uppercase dark:text-white">{t('dashboard.modules') || 'Studio Modules'}</h2>
              <p className="text-sm text-text-muted">{t('dashboard.modulesDesc') || 'Access professional-grade culinary engineering tools.'}</p>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {toolSections.map((tool) => (
                <button 
                  onClick={() => handleToolClick(tool.path)}
                  key={tool.id} 
                  className="bg-white dark:bg-surface-dark border border-gray-100 dark:border-gray-800 p-8 rounded-[32px] flex flex-col items-start gap-4 transition-all group hover:border-primary hover:shadow-2xl hover:shadow-primary/5 hover:-translate-y-1 text-left w-full"
                >
                  <div className={`${tool.color} size-14 rounded-2xl flex items-center justify-center shadow-lg transition-transform group-hover:scale-110 group-hover:rotate-3`}>
                    <span className="material-symbols-outlined text-3xl">{tool.icon}</span>
                  </div>
                  <div className="space-y-1 text-left">
                    <h4 className="font-black text-base uppercase tracking-wider dark:text-white group-hover:text-primary transition-colors">{t(`navigation.${tool.id}`)}</h4>
                    <p className="text-xs text-text-muted font-medium leading-relaxed">{tool.desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

        </div>
      </div>
      <NewsPanel />
      {showAuth && <AuthModals onClose={() => setShowAuth(false)} />}
    </div>
  );
};
