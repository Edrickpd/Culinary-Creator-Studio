
import React, { useState, useEffect, useRef } from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { PriceTracker } from './pages/PriceTracker';
import { PairingAnalysis } from './pages/PairingAnalysis';
import { FoodCost } from './pages/FoodCost';
import { FoodHistory } from './pages/FoodHistory';
import { CreateDish } from './pages/CreateDish';
import { MyProjects } from './pages/MyProjects';
import { SocialHub } from './pages/SocialHub';
import { Settings } from './pages/Settings';
import { gemini } from './services/geminiService';
import { AppProvider, useAppContext } from './AppContext';
import { AuthModals } from './components/AuthModals';
import { supabase } from './supabaseClient';

const ChatBot = () => {
  const { t, isLoggedIn, user } = useAppContext();
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<'ai' | 'direct'>('ai');
  const [selectedChef, setSelectedChef] = useState<any>(null);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'bot' | 'chef', text: string, senderId?: string }>>([
    { role: 'bot', text: 'Hello Chef! How can I assist you in the studio today?' }
  ]);
  const [loading, setLoading] = useState(false);
  const [chefs, setChefs] = useState<any[]>([]);
  const [showChefSearch, setShowChefSearch] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Real-time subscription for Direct Messages
  useEffect(() => {
    if (!isLoggedIn || !user) return;

    const channel = supabase
      .channel('schema-db-changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `receiver_id=eq.${user.id}`
        },
        (payload) => {
          const newMsg = payload.new;
          if (mode === 'direct' && selectedChef && newMsg.sender_id === selectedChef.id) {
            setMessages(prev => [...prev, { role: 'chef', text: newMsg.text, senderId: newMsg.sender_id }]);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isLoggedIn, user, mode, selectedChef]);

  useEffect(() => {
    if (isOpen && mode === 'direct' && isLoggedIn) {
      fetchChefs();
    }
  }, [isOpen, mode, isLoggedIn]);

  const fetchChefs = async () => {
    const { data } = await supabase.from('profiles').select('*').neq('id', user?.id);
    if (data) setChefs(data);
  };

  const handleSend = async () => {
    if (!input.trim()) return;
    const userMsg = input;
    setInput('');

    if (mode === 'ai') {
      setMessages(prev => [...prev, { role: 'user', text: userMsg }]);
      setLoading(true);
      try {
        const response = await gemini.getCulinaryAdvice(userMsg);
        setMessages(prev => [...prev, { role: 'bot', text: response || "I'm not sure how to answer that." }]);
        
        // Optionally persist AI conversation to Supabase
        if (isLoggedIn && user) {
          await supabase.from('messages').insert({
            sender_id: user.id,
            text: userMsg,
            is_ai: true
          });
        }
      } finally {
        setLoading(false);
      }
    } else if (selectedChef && user) {
      setMessages(prev => [...prev, { role: 'user', text: userMsg, senderId: user.id }]);
      await supabase.from('messages').insert({
        sender_id: user.id,
        receiver_id: selectedChef.id,
        text: userMsg,
        is_ai: false
      });
    }
  };

  const selectDirectChat = async (chef: any) => {
    setSelectedChef(chef);
    setMode('direct');
    setShowChefSearch(false);
    setMessages([{ role: 'chef', text: `Conversación iniciada con Chef ${chef.chef_name || chef.full_name}` }]);
    
    // Load history
    if (user) {
      const { data } = await supabase
        .from('messages')
        .select('*')
        .or(`and(sender_id.eq.${user.id},receiver_id.eq.${chef.id}),and(sender_id.eq.${chef.id},receiver_id.eq.${user.id})`)
        .order('created_at', { ascending: true });
      
      if (data) {
        const history = data.map(m => ({
          role: m.sender_id === user.id ? 'user' : 'chef' as any,
          text: m.text,
          senderId: m.sender_id
        }));
        setMessages(history);
      }
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-[100] flex flex-col items-end">
      {isOpen && (
        <div className="w-80 h-[500px] bg-white dark:bg-surface-dark border border-gray-200 dark:border-gray-700 rounded-2xl shadow-2xl flex flex-col mb-4 animate-fade-in overflow-hidden">
          <header className="p-4 flex items-center justify-between bg-primary shrink-0">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-black font-bold">
                {mode === 'ai' ? 'smart_toy' : 'person'}
              </span>
              <div className="flex flex-col">
                <span className="font-black text-[10px] text-black uppercase tracking-widest leading-none">
                  {mode === 'ai' ? 'Studio Assistant' : `Chef ${selectedChef?.chef_name || 'Direct'}`}
                </span>
                {mode === 'direct' && <span className="text-[8px] text-black/60 font-bold uppercase">Online Now</span>}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button 
                onClick={() => { setShowChefSearch(!showChefSearch); setMode('direct'); }}
                className="size-8 rounded-lg hover:bg-black/10 flex items-center justify-center text-black"
                title="Nueva conversación"
              >
                <span className="material-symbols-outlined font-black">add</span>
              </button>
              <button onClick={() => { setIsOpen(false); setShowChefSearch(false); }} className="text-black hover:opacity-50">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
          </header>

          {showChefSearch ? (
            <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-gray-50 dark:bg-black/20">
              <h4 className="text-[10px] font-black uppercase tracking-widest text-text-muted mb-4">Select Chef to Chat</h4>
              {chefs.map(chef => (
                <button 
                  key={chef.id}
                  onClick={() => selectDirectChat(chef)}
                  className="w-full p-3 bg-white dark:bg-surface-dark rounded-xl border border-gray-100 dark:border-gray-800 flex items-center gap-3 hover:border-primary transition-all text-left"
                >
                  <div className="size-8 rounded-lg bg-gray-100 dark:bg-white/10 flex items-center justify-center font-black text-xs">
                    {chef.chef_name?.[0] || 'C'}
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs font-black">{chef.chef_name || chef.full_name}</span>
                    <span className="text-[8px] text-text-muted uppercase font-bold">{chef.tier} Chef</span>
                  </div>
                </button>
              ))}
              {chefs.length === 0 && <p className="text-center text-[10px] text-text-muted py-10">No chefs found.</p>}
              <button 
                onClick={() => { setShowChefSearch(false); setMode('ai'); }}
                className="w-full py-2 text-[10px] font-black uppercase text-primary"
              >
                Volver al Asistente IA
              </button>
            </div>
          ) : (
            <>
              <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-background-light dark:bg-surface-dark">
                {messages.map((m, idx) => (
                  <div key={idx} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] p-3 rounded-2xl text-sm ${
                      m.role === 'user' 
                        ? 'bg-primary text-black font-bold shadow-sm' 
                        : 'bg-gray-100 dark:bg-white/10 text-text-main dark:text-gray-200 border border-gray-200 dark:border-gray-700'
                    }`}>
                      {m.text}
                    </div>
                  </div>
                ))}
                {loading && (
                  <div className="flex justify-start">
                    <div className="bg-gray-100 dark:bg-white/10 p-3 rounded-2xl flex gap-1 items-center">
                      <span className="size-1.5 bg-primary rounded-full animate-bounce"></span>
                      <span className="size-1.5 bg-primary rounded-full animate-bounce [animation-delay:0.2s]"></span>
                      <span className="size-1.5 bg-primary rounded-full animate-bounce [animation-delay:0.4s]"></span>
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>
              <div className="p-4 border-t border-gray-100 dark:border-gray-800 bg-white dark:bg-surface-dark shrink-0">
                <div className="flex gap-2">
                  <input 
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                    className="flex-1 bg-gray-50 dark:bg-black/20 border-none rounded-xl text-sm focus:ring-1 focus:ring-primary outline-none px-4"
                    placeholder={mode === 'ai' ? "Ask Chef Gemini..." : `Message ${selectedChef?.chef_name || 'Chef'}...`}
                  />
                  <button onClick={handleSend} className="bg-primary size-10 rounded-xl flex items-center justify-center shadow-lg shadow-primary/20 text-black shrink-0 hover:scale-105 active:scale-95 transition-all">
                    <span className="material-symbols-outlined">send</span>
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="size-14 rounded-full bg-primary text-black flex items-center justify-center shadow-2xl hover:scale-110 active:scale-95 transition-all"
      >
        <span className="material-symbols-outlined text-3xl">{isOpen ? 'keyboard_arrow_down' : 'chat'}</span>
      </button>
    </div>
  );
};

const AppContent = () => {
  const { isLoggedIn } = useAppContext();
  const [showAuth, setShowAuth] = useState(false);

  useEffect(() => {
    // Show auth modal only if user is not logged in and specifically needs to interact
    // Removed automatic trigger to allow browsing dashboard as guest
  }, [isLoggedIn]);

  return (
    <>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/price-tracker" element={<PriceTracker />} />
        <Route path="/pairing" element={<PairingAnalysis />} />
        <Route path="/food-cost" element={<FoodCost />} />
        <Route path="/history" element={<FoodHistory />} />
        <Route path="/create-dish" element={<CreateDish />} />
        <Route path="/projects" element={<MyProjects />} />
        <Route path="/social" element={<SocialHub />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
      <ChatBot />
      {showAuth && !isLoggedIn && <AuthModals onClose={() => setShowAuth(false)} />}
    </>
  );
};

const App = () => {
  return (
    <HashRouter>
      <AppProvider>
        <Layout>
          <AppContent />
        </Layout>
      </AppProvider>
    </HashRouter>
  );
};

export default App;
