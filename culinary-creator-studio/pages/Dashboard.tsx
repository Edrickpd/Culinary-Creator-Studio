
import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { MOCK_DISHES } from '../constants';
import { NewsPanel } from '../components/Layout';
import { useAppContext } from '../AppContext';
import { AuthModals } from '../components/AuthModals';

const FeaturedDishCard: React.FC<{ dish: any }> = ({ dish }) => {
  const [touched, setTouched] = useState(false);
  const [saved, setSaved] = useState(false);

  return (
    <article className="group relative bg-white dark:bg-surface-dark rounded-[32px] overflow-hidden shadow-lg hover:shadow-2xl transition-all duration-500 hover:-translate-y-2 border border-gray-100 dark:border-gray-800 flex flex-col h-full">
      <div className="aspect-[4/3] w-full bg-gray-200 relative overflow-hidden">
        <img 
          src={dish.img} 
          alt={dish.title} 
          className="w-full h-full object-cover transition-transform duration-1000 ease-out group-hover:scale-110" 
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
        
        <div className="absolute top-4 right-4 z-10">
          <div className="bg-white/80 dark:bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-2xl flex items-center gap-1.5 shadow-xl border border-white/20">
            <span className="material-symbols-outlined text-primary text-[16px] filled">star</span>
            <span className="text-xs font-bold text-gray-900 dark:text-white">{dish.rating}</span>
          </div>
        </div>

        <div className="absolute bottom-4 left-4 z-10">
           <span className={`text-[9px] font-black px-3 py-1 rounded-full uppercase tracking-widest bg-primary text-black shadow-lg`}>
            {dish.difficulty}
          </span>
        </div>
      </div>
      
      <div className="p-8 flex flex-col flex-1 gap-6">
        <div className="space-y-2">
          <div className="flex items-center gap-3 mb-2">
            <div className="size-8 rounded-xl bg-primary/20 flex items-center justify-center text-[10px] font-black text-primary border border-primary/20">
              {dish.chef[0]}
            </div>
            <span className="text-xs font-bold dark:text-gray-200">Chef {dish.chef}</span>
          </div>
          <h3 className="text-2xl font-black uppercase tracking-tight leading-tight group-hover:text-primary transition-colors block">
            {dish.title}
          </h3>
          <p className="text-sm text-text-muted leading-relaxed font-medium italic line-clamp-2">
            "{dish.description}"
          </p>
        </div>

        <div className="pt-6 mt-auto border-t border-gray-50 dark:border-gray-800 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <button 
              onClick={() => setTouched(!touched)}
              className={`flex items-center gap-2 transition-all ${touched ? 'text-primary' : 'text-gray-300 hover:text-primary'}`}
            >
              <span className={`material-symbols-outlined text-[24px] ${touched ? 'filled' : ''}`}>skillet</span>
            </button>
            <button 
              onClick={() => setSaved(!saved)}
              className={`flex items-center gap-2 transition-all ${saved ? 'text-primary' : 'text-gray-300 hover:text-primary'}`}
            >
              <span className={`material-symbols-outlined text-[24px] ${saved ? 'filled' : ''}`}>bookmark</span>
            </button>
          </div>
          <Link 
            to="/social"
            className="size-11 rounded-full bg-gray-50 dark:bg-white/5 flex items-center justify-center text-text-muted hover:bg-primary hover:text-black transition-all shadow-sm"
          >
            <span className="material-symbols-outlined text-[20px]">visibility</span>
          </Link>
        </div>
      </div>
    </article>
  );
};

export const Dashboard = () => {
  const { t, user, isLoggedIn } = useAppContext();
  const navigate = useNavigate();
  const [showAuth, setShowAuth] = useState(false);

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
    { id: 'pairingAnalysis', icon: 'science', color: 'bg-blue-500', path: '/pairing', desc: 'AI-powered molecular flavor synergies.' },
    { id: 'priceTracker', icon: 'sell', color: 'bg-green-500', path: '/price-tracker', desc: 'Real-time global supplier monitoring.' },
    { id: 'foodCost', icon: 'attach_money', color: 'bg-amber-500', path: '/food-cost', desc: 'Professional margin & profit analysis.' },
    { id: 'foodHistory', icon: 'history', color: 'bg-purple-500', path: '/history', desc: 'Deep cultural origins & techniques.' },
    { id: 'socialHub', icon: 'groups', color: 'bg-pink-500', path: '/social', desc: 'Connect with the elite chef community.' },
    { id: 'settings', icon: 'settings', color: 'bg-gray-500', path: '/settings', desc: 'Personalize your studio experience.' },
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
                  <span>Start Creating</span>
                  <span className="material-symbols-outlined">edit_square</span>
                </button>
                <button 
                  onClick={scrollToTools}
                  className="h-16 px-10 bg-white/10 hover:bg-white/20 backdrop-blur-md text-white text-sm font-black uppercase tracking-[0.1em] rounded-2xl transition-all border border-white/20 flex items-center gap-3"
                >
                  Explore Features
                </button>
              </div>
            </div>
          </div>

          {/* Featured Masterpieces */}
          <div className="space-y-8">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-gray-100 dark:border-gray-800 pb-6">
              <div className="space-y-1">
                <h2 className="text-3xl font-black tracking-tighter uppercase dark:text-white">Featured <span className="text-primary italic">Masterpieces</span></h2>
                <p className="text-sm text-text-muted font-medium">Curated high-performance dishes from the community.</p>
              </div>
              <button 
                onClick={() => handleToolClick('/social')}
                className="flex items-center gap-2 text-primary font-black uppercase text-xs tracking-widest hover:translate-x-2 transition-transform"
              >
                Community Feed <span className="material-symbols-outlined">arrow_right_alt</span>
              </button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
              {MOCK_DISHES.map(dish => (
                <FeaturedDishCard key={dish.id} dish={dish} />
              ))}
            </div>
          </div>

          {/* Expanded Tools Grid */}
          <div id="tools-grid" className="space-y-8 pt-10">
            <div className="space-y-1">
              <h2 className="text-2xl font-black tracking-tight uppercase dark:text-white">Studio <span className="text-primary italic">Modules</span></h2>
              <p className="text-sm text-text-muted">Access professional-grade culinary engineering tools.</p>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {toolSections.map((tool) => (
                <button 
                  onClick={() => handleToolClick(tool.path)}
                  key={tool.id} 
                  className="bg-white dark:bg-surface-dark border border-gray-100 dark:border-gray-800 p-8 rounded-[32px] flex flex-col items-start gap-4 transition-all group hover:border-primary hover:shadow-2xl hover:shadow-primary/5 hover:-translate-y-1 text-left w-full"
                >
                  <div className={`${tool.color} text-white size-14 rounded-2xl flex items-center justify-center shadow-lg transition-transform group-hover:scale-110 group-hover:rotate-3`}>
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
