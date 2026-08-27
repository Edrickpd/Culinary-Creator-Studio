
import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { MENU_ITEMS } from '../constants';
import { useAppContext } from '../AppContext';
import { AuthModals } from './AuthModals';

const Sidebar = ({ isCollapsed, setCollapsed }: { isCollapsed: boolean, setCollapsed: (v: boolean) => void }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { t, user, isLoggedIn } = useAppContext();
  const [showAuth, setShowAuth] = useState(false);
  
  const isActive = (path: string) => location.pathname === path;

  // Auto-collapse sidebar on mobile when navigating
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 768) {
        setCollapsed(true);
      }
    };
    handleResize(); // Initial check
    
    // Collapse on location change if mobile
    if (window.innerWidth < 768) {
      setCollapsed(true);
    }
  }, [location.pathname, setCollapsed]);

  const handleNavClick = (e: React.MouseEvent, path: string) => {
    if (!isLoggedIn && path !== '/') {
      e.preventDefault();
      setShowAuth(true);
    }
  };

  const handleUserClick = () => {
    if (!isLoggedIn) {
      setShowAuth(true);
    } else {
      navigate('/settings?tab=profile');
    }
  };

  return (
    <>
      {/* Mobile Overlay */}
      {!isCollapsed && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[55] md:hidden transition-opacity duration-300"
          onClick={() => setCollapsed(true)}
        />
      )}

      <aside className={`
        ${isCollapsed ? 'w-16 md:w-24' : 'w-[280px]'} 
        bg-surface-light dark:bg-surface-dark border-r border-gray-200 dark:border-gray-800 
        flex flex-col h-full shrink-0 transition-all duration-300 
        fixed md:relative z-[60] shadow-2xl md:shadow-none
      `}>
        <div className="sidebar-logo border-b border-gray-200 dark:border-gray-800">
          {!isCollapsed ? (
            <div className="sidebar-logo-expanded">
              <div className="logo-text">
                <span className="logo-line logo-culinary text-black dark:text-white">CULINARY</span>
                <span className="logo-line logo-creator text-black dark:text-white">CREATOR</span>
                <span className="logo-line logo-studio text-primary">STUDIO</span>
              </div>
            </div>
          ) : (
            <div className="sidebar-logo-collapsed">
              <span className="logo-letter logo-c text-black dark:text-white font-black">C</span>
              <span className="logo-letter logo-c text-black dark:text-white font-black">C</span>
              <span className="logo-letter logo-s text-primary font-black">S</span>
            </div>
          )}
        </div>

        <nav className="flex-1 overflow-y-auto py-4 px-2 md:px-3 space-y-1">
          {MENU_ITEMS.map(item => (
            <Link
              key={item.id}
              to={item.path}
              onClick={(e) => handleNavClick(e, item.path)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all group ${
                isActive(item.path) 
                  ? 'bg-primary text-black font-bold shadow-lg shadow-primary/20' 
                  : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5'
              } ${isCollapsed ? 'justify-center' : ''}`}
            >
              <span className={`material-symbols-outlined ${isActive(item.path) ? 'filled' : ''}`}>
                {item.icon}
              </span>
              {!isCollapsed && <span className="text-sm font-black uppercase tracking-widest whitespace-nowrap">{t(item.translationKey)}</span>}
            </Link>
          ))}
        </nav>

        <div className="p-3 border-t border-gray-200 dark:border-gray-800 shrink-0 space-y-2">
          <div 
            onClick={handleUserClick}
            className={`flex items-center gap-3 ${isCollapsed ? 'justify-center' : 'px-3'} py-3 cursor-pointer group hover:bg-gray-50 dark:hover:bg-white/5 rounded-2xl transition-all`}
          >
            <div className={`size-10 overflow-hidden ${isLoggedIn ? 'bg-primary' : 'bg-gray-200 dark:bg-gray-700'} rounded-xl flex items-center justify-center text-black font-black text-sm shrink-0 shadow-sm border border-black/5`}>
              {isLoggedIn && user?.avatarUrl ? (
                <img src={user.avatarUrl} alt="Avatar" className="size-full object-cover" />
              ) : (
                <span>{isLoggedIn ? user?.fullName?.split(' ').map(n => n[0]).join('') : '?'}</span>
              )}
            </div>
            {!isCollapsed && (
              <div className="flex flex-col overflow-hidden">
                <span className="text-sm font-black whitespace-nowrap truncate dark:text-white">
                  {isLoggedIn ? user?.chefName || user?.fullName : 'Guest'}
                </span>
                <span className="text-[10px] text-text-muted uppercase font-black tracking-widest">
                  {isLoggedIn ? t(`subscription.${user?.tier}`) : 'Sign In'}
                </span>
              </div>
            )}
          </div>

          <button 
            onClick={() => setCollapsed(!isCollapsed)}
            className="w-full flex items-center justify-center p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-white/5 text-gray-400"
          >
            <span className="material-symbols-outlined">
              {isCollapsed ? 'chevron_right' : 'chevron_left'}
            </span>
          </button>
        </div>

        {showAuth && <AuthModals onClose={() => setShowAuth(false)} />}
      </aside>
    </>
  );
};

export const NewsPanel = () => {
  const [news, setNews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const fetchNews = async () => {
      try {
        const rssUrl = 'https://edrickpd.wixsite.com/culinary-creator-stu/blog-feed.xml';
        const proxyUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(rssUrl)}`;
        const response = await fetch(proxyUrl);
        if (!response.ok) throw new Error('Network response was not ok');
        const data = await response.json();
        if (isMounted && data.status === 'ok') {
          setNews(data.items.slice(0, 5));
        }
      } catch (error) {
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    fetchNews();
    return () => { isMounted = false; };
  }, []);

  return (
    <aside className="w-80 bg-white dark:bg-surface-dark border-l border-gray-200 dark:border-gray-800 flex flex-col h-full shrink-0 transition-all duration-300 hidden xl:flex z-20">
      <div className="h-20 flex items-center px-6 border-b border-gray-200 dark:border-gray-800 shrink-0">
        <h2 className="text-[28px] font-black uppercase tracking-[0.05em] text-gray-900 dark:text-white">NEWS</h2>
      </div>
      <div className="flex-1 overflow-y-auto p-6 space-y-8">
        {loading ? (
          <div className="flex flex-col gap-6 animate-pulse">
            {[1, 2, 3].map(i => (
              <div key={i} className="space-y-2">
                <div className="h-4 bg-gray-100 dark:bg-gray-800 rounded w-1/2" />
                <div className="h-12 bg-gray-100 dark:bg-gray-800 rounded w-full" />
              </div>
            ))}
          </div>
        ) : news.length > 0 ? (
          news.map((item, idx) => (
            <React.Fragment key={idx}>
              <a href={item.link} target="_blank" rel="noopener noreferrer" className="flex flex-col gap-2 group cursor-pointer block">
                <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-primary">
                  <span>{new Date(item.pubDate).toLocaleDateString()}</span>
                </div>
                <h3 className="font-black text-sm leading-tight group-hover:text-primary transition-colors dark:text-white uppercase tracking-tight">{item.title}</h3>
                <p className="text-xs text-text-muted line-clamp-2 leading-relaxed" dangerouslySetInnerHTML={{ __html: item.description.substring(0, 100) + '...' }} />
              </a>
              {idx < news.length - 1 && <div className="h-px bg-gray-100 dark:bg-gray-800 w-full" />}
            </React.Fragment>
          ))
        ) : (
          <div className="text-center py-10 opacity-30 grayscale flex flex-col items-center gap-3">
            <span className="material-symbols-outlined text-4xl">newspaper</span>
            <p className="text-[10px] font-black uppercase tracking-widest">No recent updates.</p>
          </div>
        )}
        
        <div className="bg-gray-50 dark:bg-white/5 rounded-[32px] p-6 space-y-6 border border-gray-100 dark:border-gray-800">
          <div className="space-y-1">
            <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">STAY UPDATED</h4>
            <p className="text-[9px] font-bold text-text-muted uppercase tracking-wider">Follow our socials</p>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <a href="#" className="aspect-square rounded-2xl bg-white dark:bg-surface-dark border border-gray-100 dark:border-gray-800 flex items-center justify-center hover:border-primary hover:text-primary transition-all shadow-sm">
              <span className="material-symbols-outlined text-xl">public</span>
            </a>
            <a href="#" className="aspect-square rounded-2xl bg-white dark:bg-surface-dark border border-gray-100 dark:border-gray-800 flex items-center justify-center hover:border-primary hover:text-primary transition-all shadow-sm">
               <span className="material-symbols-outlined text-xl">video_library</span>
            </a>
            <a href="#" className="aspect-square rounded-2xl bg-white dark:bg-surface-dark border border-gray-100 dark:border-gray-800 flex items-center justify-center hover:border-primary hover:text-primary transition-all shadow-sm">
               <span className="material-symbols-outlined text-xl">photo_camera</span>
            </a>
          </div>
        </div>
      </div>
    </aside>
  );
};

export const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isCollapsed, setCollapsed] = useState(true);

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar isCollapsed={isCollapsed} setCollapsed={setCollapsed} />
      <div className="flex-1 flex flex-col overflow-hidden min-w-0 pl-16 md:pl-0">
        <main className="flex-1 overflow-y-auto bg-background-light dark:bg-background-dark transition-colors duration-300">
          {children}
        </main>
      </div>
    </div>
  );
};
