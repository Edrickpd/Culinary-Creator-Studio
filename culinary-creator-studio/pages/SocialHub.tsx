
import React, { useState, useMemo, useEffect } from 'react';
import { useAppContext } from '../AppContext';
import { supabase } from '../supabaseClient';

interface Comment {
  id: string;
  user_id: string;
  user_name: string;
  avatar_url?: string;
  content: string;
  created_at: string;
}

interface SocialPost {
  id: string;
  user_id: string;
  recipe_id: string;
  chefName: string;
  avatar_url?: string;
  createdAt: string;
  title: string;
  description: string;
  difficulty: string;
  image: string;
  likesCount: number;
  commentsCount: number;
  isLiked: boolean;
  isSaved: boolean;
  isFollowing: boolean;
  recipeData?: any;
}

export const SocialHub = () => {
  const { user, isLoggedIn } = useAppContext();
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'EXPLORE' | 'FOLLOWING' | 'SAVED'>('EXPLORE');
  const [exploreFilter, setExploreFilter] = useState<'NEW' | 'TOP'>('NEW');
  const [selectedPost, setSelectedPost] = useState<SocialPost | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);

  useEffect(() => {
    fetchPosts();
  }, [activeTab, exploreFilter, user]);

  const fetchPosts = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('social_posts')
        .select(`
          *,
          profiles:user_id (chef_name, avatar_url),
          likes:social_likes (user_id),
          saves:social_saves (user_id),
          comments_count:social_comments (count),
          recipe:recipe_id (*)
        `);

      if (activeTab === 'SAVED' && user) {
        const { data: savedIds } = await supabase.from('social_saves').select('post_id').eq('user_id', user.id);
        if (savedIds && savedIds.length > 0) {
          query = query.in('id', savedIds.map(s => s.post_id));
        } else {
          setPosts([]);
          setLoading(false);
          return;
        }
      }

      if (activeTab === 'FOLLOWING' && user) {
        const { data: followings } = await supabase.from('follows').select('following_id').eq('follower_id', user.id);
        if (followings && followings.length > 0) {
          query = query.in('user_id', followings.map(f => f.following_id));
        } else {
          setPosts([]);
          setLoading(false);
          return;
        }
      }

      if (exploreFilter === 'TOP') {
        const seventyTwoHoursAgo = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString();
        query = query.gte('created_at', seventyTwoHoursAgo);
      } else {
        query = query.order('created_at', { ascending: false });
      }

      const { data, error } = await query;
      if (error) throw error;

      if (data) {
        let followingIds: string[] = [];
        if (user) {
          const { data: follows } = await supabase.from('follows').select('following_id').eq('follower_id', user.id);
          followingIds = (follows || []).map(f => f.following_id);
        }

        const formatted: SocialPost[] = data.filter(p => p.recipe).map(p => ({
          id: p.id,
          user_id: p.user_id,
          recipe_id: p.recipe_id,
          chefName: p.profiles?.chef_name || 'Chef',
          avatar_url: p.profiles?.avatar_url,
          createdAt: new Date(p.created_at).toLocaleDateString(),
          title: p.title,
          description: p.description,
          difficulty: p.difficulty || 'INTERMEDIATE',
          image: p.image_url,
          likesCount: p.likes?.length || 0,
          commentsCount: p.comments_count?.[0]?.count || 0,
          isLiked: p.likes?.some((l: any) => l.user_id === user?.id),
          isSaved: p.saves?.some((s: any) => s.user_id === user?.id),
          isFollowing: followingIds.includes(p.user_id),
          recipeData: p.recipe
        }));

        if (exploreFilter === 'TOP') formatted.sort((a, b) => b.likesCount - a.likesCount);
        setPosts(formatted);
      }
    } catch (err) { console.error("Fetch posts error:", err); } finally { setLoading(false); }
  };

  const handleToggleLike = async (post: SocialPost) => {
    if (!isLoggedIn || !user) return;
    try {
      if (post.isLiked) await supabase.from('social_likes').delete().match({ post_id: post.id, user_id: user.id });
      else await supabase.from('social_likes').insert({ post_id: post.id, user_id: user.id });
      fetchPosts();
    } catch (e) { console.error(e); }
  };

  const handleToggleSave = async (post: SocialPost) => {
    if (!isLoggedIn || !user) return;
    try {
      if (post.isSaved) await supabase.from('social_saves').delete().match({ post_id: post.id, user_id: user.id });
      else await supabase.from('social_saves').insert({ post_id: post.id, user_id: user.id });
      fetchPosts();
    } catch (e) { console.error(e); }
  };

  const openDetail = async (post: SocialPost) => {
    setSelectedPost(post);
    setComments([]);
    const { data } = await supabase.from('social_comments').select('*, profiles:user_id(chef_name, avatar_url)').eq('post_id', post.id).order('created_at', { ascending: true });
    if (data) setComments(data.map(c => ({ id: c.id, user_id: c.user_id, user_name: c.profiles?.chef_name || 'Chef', avatar_url: c.profiles?.avatar_url, content: c.content, created_at: c.created_at })));
  };

  const handleAddComment = async () => {
    if (!newComment.trim() || !user || !selectedPost) return;
    setSubmittingComment(true);
    try {
      const { data, error } = await supabase.from('social_comments').insert({ post_id: selectedPost.id, user_id: user.id, content: newComment }).select('*, profiles:user_id(chef_name, avatar_url)').single();
      if (!error && data) {
        setComments([...comments, { id: data.id, user_id: data.user_id, user_name: data.profiles?.chef_name || 'Chef', avatar_url: data.profiles?.avatar_url, content: data.content, created_at: data.created_at }]);
        setNewComment('');
        fetchPosts();
      }
    } finally { setSubmittingComment(false); }
  };

  const filteredPosts = useMemo(() => {
    if (!searchQuery) return posts;
    const q = searchQuery.toLowerCase();
    return posts.filter(p => p.title.toLowerCase().includes(q) || p.chefName.toLowerCase().includes(q));
  }, [posts, searchQuery]);

  return (
    <div className="min-h-screen bg-background-light dark:bg-background-dark p-4 md:p-8 lg:p-12 animate-fade-in font-sans">
      <div className="max-w-7xl mx-auto space-y-12 pb-24">
        <header className="space-y-8">
          <h1 className="text-5xl md:text-6xl font-black uppercase tracking-tighter leading-none dark:text-white">Community</h1>
          <div className="flex flex-wrap items-center justify-between gap-6">
            <div className="flex gap-3 p-1 bg-gray-100 dark:bg-white/5 rounded-2xl w-fit">
              {(['EXPLORE', 'FOLLOWING', 'SAVED'] as const).map(tab => (
                <button key={tab} onClick={() => setActiveTab(tab)} className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === tab ? 'bg-primary text-black shadow-lg shadow-primary/20' : 'text-text-muted hover:text-text-main'}`}>{tab}</button>
              ))}
            </div>
            {activeTab === 'EXPLORE' && (
               <div className="flex gap-2">
                  <button onClick={() => setExploreFilter('NEW')} className={`h-10 px-4 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${exploreFilter === 'NEW' ? 'bg-black text-white border-black' : 'border-gray-200 text-text-muted hover:border-black'}`}>New</button>
                  <button onClick={() => setExploreFilter('TOP')} className={`h-10 px-4 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${exploreFilter === 'TOP' ? 'bg-black text-white border-black' : 'border-gray-200 text-text-muted hover:border-black'}`}>Top (72h)</button>
               </div>
            )}
            <div className="relative flex-1 max-w-md">
              <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search chefs or recipes..." className="w-full h-12 pl-12 pr-4 bg-white dark:bg-white/5 border border-gray-100 dark:border-gray-800 rounded-2xl focus:ring-1 focus:ring-primary outline-none text-sm dark:text-white" />
              <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-text-muted">search</span>
            </div>
          </div>
        </header>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
            {[1,2,3,4,5,6].map(i => <div key={i} className="aspect-[4/5] bg-gray-100 dark:bg-white/5 rounded-[40px] animate-pulse" />)}
          </div>
        ) : filteredPosts.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-12">
            {filteredPosts.map(post => (
              <article key={post.id} className="bg-white dark:bg-surface-dark rounded-[40px] border border-gray-50 dark:border-gray-800 shadow-sm hover:shadow-2xl transition-all duration-500 hover:-translate-y-2 flex flex-col group overflow-hidden">
                <div className="aspect-square relative overflow-hidden cursor-pointer" onClick={() => openDetail(post)}>
                  <img src={post.image} alt={post.title} className="w-full h-full object-cover transition-transform duration-[1.5s] group-hover:scale-110" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  <div className="absolute top-6 left-6 flex items-center gap-3">
                     <div className="size-10 rounded-2xl bg-white/20 backdrop-blur-md border border-white/30 overflow-hidden shadow-lg">
                        {post.avatar_url ? <img src={post.avatar_url} className="size-full object-cover" /> : <div className="size-full flex items-center justify-center font-black text-white">{post.chefName[0]}</div>}
                     </div>
                     <div className="flex flex-col"><span className="text-xs font-black text-white uppercase drop-shadow-md">{post.chefName}</span><span className="text-[9px] font-bold text-white/80 uppercase tracking-widest">{post.createdAt}</span></div>
                  </div>
                </div>
                <div className="p-8 flex flex-col flex-1 gap-6">
                  <div className="space-y-3 cursor-pointer" onClick={() => openDetail(post)}>
                    <h3 className="text-2xl font-black uppercase tracking-tight leading-tight group-hover:text-primary transition-colors dark:text-white">{post.title}</h3>
                    <p className="text-sm text-text-muted leading-relaxed line-clamp-2 font-medium italic opacity-80">"{post.description}"</p>
                  </div>
                  <div className="pt-6 mt-auto border-t border-gray-50 dark:border-gray-800 flex items-center justify-between">
                    <div className="flex items-center gap-6">
                      <button onClick={() => handleToggleLike(post)} className={`flex items-center gap-2 transition-all ${post.isLiked ? 'text-primary' : 'text-gray-300 hover:text-primary'}`}>
                        <span className={`material-symbols-outlined text-[24px] ${post.isLiked ? 'filled' : ''}`}>skillet</span>
                        <span className="text-xs font-black">{post.likesCount}</span>
                      </button>
                      <button onClick={() => openDetail(post)} className="flex items-center gap-2 text-gray-300 hover:text-primary transition-colors">
                        <span className="material-symbols-outlined text-[24px]">chat_bubble</span>
                        <span className="text-xs font-black">{post.commentsCount}</span>
                      </button>
                      <button onClick={() => handleToggleSave(post)} className={`flex items-center gap-2 transition-all ${post.isSaved ? 'text-primary' : 'text-gray-300 hover:text-primary'}`}>
                        <span className={`material-symbols-outlined text-[24px] ${post.isSaved ? 'filled' : ''}`}>bookmark</span>
                      </button>
                    </div>
                    <button onClick={() => openDetail(post)} className="size-11 rounded-full bg-gray-50 dark:bg-white/5 flex items-center justify-center text-text-muted hover:bg-primary hover:text-black transition-all shadow-sm">
                      <span className="material-symbols-outlined text-[20px]">visibility</span>
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="py-32 flex flex-col items-center justify-center text-center opacity-30 gap-6 grayscale">
            <span className="material-symbols-outlined text-8xl">flatware</span>
            <p className="text-xl font-black uppercase tracking-[0.2em]">Kitchen is quiet...</p>
          </div>
        )}
      </div>

      {/* DETAIL MODAL */}
      {selectedPost && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center p-4 md:p-8">
           <div className="absolute inset-0 bg-black/95 backdrop-blur-xl" onClick={() => setSelectedPost(null)}></div>
           <div className="relative w-full max-w-7xl h-full max-h-[94vh] bg-white dark:bg-surface-dark rounded-[40px] shadow-2xl overflow-hidden flex flex-col md:flex-row animate-fade-in border border-white/10">
              <div className="w-full md:w-2/5 h-64 md:h-auto relative overflow-hidden bg-black shrink-0">
                <img src={selectedPost.image} alt={selectedPost.title} className="size-full object-cover opacity-80" />
                <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent" />
                <div className="absolute top-8 left-8"><button onClick={() => setSelectedPost(null)} className="size-12 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center text-white"><span className="material-symbols-outlined">arrow_back</span></button></div>
                <div className="absolute bottom-10 left-10 right-10 space-y-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="size-14 rounded-2xl bg-primary flex items-center justify-center font-black text-black text-xl shadow-lg border-2 border-white/10">{selectedPost.avatar_url ? <img src={selectedPost.avatar_url} className="size-full object-cover rounded-2xl" /> : selectedPost.chefName[0]}</div>
                      <div className="flex flex-col"><span className="text-sm font-black text-white uppercase tracking-widest">{selectedPost.chefName}</span><span className="text-[10px] text-primary font-bold uppercase">{selectedPost.createdAt}</span></div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <h2 className="text-4xl md:text-5xl lg:text-6xl font-black text-white uppercase tracking-tighter leading-none">{selectedPost.title}</h2>
                    <p className="text-white/70 text-base font-medium italic">"{selectedPost.description}"</p>
                  </div>
                </div>
              </div>
              <div className="flex-1 flex flex-col overflow-hidden bg-[#fafafa] dark:bg-black/20">
                <header className="p-8 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between bg-white dark:bg-surface-dark">
                   <div className="flex gap-4">
                      <button onClick={() => handleToggleLike(selectedPost)} className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black uppercase transition-all shadow-sm ${selectedPost.isLiked ? 'bg-primary text-black' : 'bg-gray-100 dark:bg-white/10 text-gray-500'}`}><span className="material-symbols-outlined text-[20px]">skillet</span> {selectedPost.likesCount}</button>
                      <button onClick={() => handleToggleSave(selectedPost)} className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black uppercase transition-all shadow-sm ${selectedPost.isSaved ? 'bg-primary text-black' : 'bg-gray-100 dark:bg-white/10 text-gray-500'}`}><span className="material-symbols-outlined text-[20px]">bookmark</span> {selectedPost.isSaved ? 'Saved' : 'Save'}</button>
                   </div>
                   <button onClick={() => setSelectedPost(null)} className="size-12 rounded-full bg-gray-100 dark:bg-white/10 flex items-center justify-center text-text-muted hover:text-red-500"><span className="material-symbols-outlined">close</span></button>
                </header>
                <div className="flex-1 overflow-y-auto no-scrollbar scroll-smooth">
                  <div className="p-8 md:p-12 space-y-20 max-w-4xl mx-auto">
                   {selectedPost.recipeData ? (
                     <div className="space-y-24 animate-fade-in pb-12">
                        <section className="space-y-4"><h4 className="text-[11px] font-black uppercase tracking-[0.3em] text-primary border-b border-primary/20 pb-3">The Inspiration</h4><p className="text-xl leading-relaxed dark:text-gray-300 font-medium">{selectedPost.recipeData.description || selectedPost.description}</p></section>
                        <section className="space-y-8"><h4 className="text-[11px] font-black uppercase tracking-[0.3em] text-primary border-b border-primary/20 pb-3">Ingredient Matrix</h4><div className="grid grid-cols-1 gap-12">{selectedPost.recipeData.ingredients?.map((sub: any) => (<div key={sub.id} className="space-y-4"><h5 className="text-base font-black uppercase dark:text-white flex items-center gap-3"><div className="size-2 rounded-full bg-primary" />{sub.title}</h5><div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{sub.items?.map((ing: any) => (<div key={ing.id} className="p-4 bg-white dark:bg-white/5 rounded-2xl flex justify-between items-center shadow-sm border border-gray-100 dark:border-white/5"><span className="text-sm font-bold dark:text-gray-300">{ing.name}</span><span className="text-[11px] font-black uppercase text-primary bg-primary/5 px-3 py-1 rounded-full">{ing.quantity} {ing.unit}</span></div>))}</div></div>))}</div></section>
                        <section className="space-y-10"><h4 className="text-[11px] font-black uppercase tracking-[0.3em] text-primary border-b border-primary/20 pb-3">Culinary Method</h4><div className="space-y-6">{selectedPost.recipeData.prep_steps?.map((step: string, i: number) => (<div key={i} className="flex gap-8 p-10 bg-white dark:bg-white/5 rounded-[40px] border border-gray-100 dark:border-white/5 shadow-sm group hover:border-primary/20 transition-all"><div className="size-16 rounded-2xl bg-primary flex items-center justify-center text-black font-black text-2xl shrink-0 shadow-lg">{i + 1}</div><p className="text-base md:text-xl leading-relaxed dark:text-gray-200 font-medium">{step}</p></div>))}</div></section>
                     </div>
                   ) : <div className="py-40 flex flex-col items-center justify-center opacity-40 grayscale gap-4"><span className="material-symbols-outlined text-7xl">no_meals</span><p className="text-sm font-black uppercase tracking-[0.4em]">Recipe locked by chef</p></div>}
                   <section id="comments" className="space-y-12 pt-20 border-t border-gray-200 dark:border-gray-800 pb-32">
                      <div className="flex items-center justify-between"><h4 className="text-3xl font-black uppercase tracking-tight dark:text-white">Kitchen Talk ({comments.length})</h4></div>
                      <div className="space-y-10">{comments.map(comment => (<div key={comment.id} className="flex gap-6 group"><div className="size-14 rounded-2xl bg-gray-100 dark:bg-white/10 overflow-hidden shrink-0 border border-gray-200 dark:border-white/10 shadow-sm">{comment.avatar_url ? <img src={comment.avatar_url} className="size-full object-cover" /> : <div className="size-full flex items-center justify-center font-black text-lg text-text-muted">{comment.user_name[0]}</div>}</div><div className="flex-1 space-y-2"><div className="flex items-center gap-3"><span className="text-sm font-black uppercase dark:text-white tracking-widest">{comment.user_name}</span><span className="text-[10px] text-text-muted font-bold">{new Date(comment.created_at).toLocaleDateString()}</span></div><div className="p-6 bg-white dark:bg-white/5 rounded-[32px] rounded-tl-none border border-gray-100 dark:border-white/5 shadow-sm"><p className="text-base md:text-lg dark:text-gray-300 leading-relaxed font-medium">{comment.content}</p></div></div></div>))}</div>
                      {isLoggedIn && (
                        <div className="pt-10 sticky bottom-4 bg-transparent"><div className="flex gap-4 p-3 bg-white dark:bg-surface-dark rounded-[32px] shadow-2xl border border-gray-200 dark:border-white/10"><input value={newComment} onChange={(e) => setNewComment(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleAddComment()} placeholder="Write to the Chef..." className="flex-1 h-16 bg-transparent border-none rounded-2xl px-6 text-base font-bold outline-none focus:ring-0 dark:text-white" /><button onClick={handleAddComment} disabled={submittingComment || !newComment.trim()} className="bg-primary text-black px-10 rounded-[24px] font-black uppercase text-xs tracking-widest shadow-xl disabled:opacity-50">{submittingComment ? 'Sending...' : 'Post'}</button></div></div>
                      )}
                   </section>
                  </div>
                </div>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};
