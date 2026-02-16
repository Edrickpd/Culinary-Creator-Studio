
import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { MOCK_PRICE_ENTRIES, COUNTRIES, CATEGORIES, SUPPLIERS_BY_COUNTRY } from '../constants';
import { PriceEntry, FilterState, ClipboardItem } from '../types';

export const PriceTracker = () => {
  const navigate = useNavigate();

  // --- STATE ---
  const [isFilterExpanded, setIsFilterExpanded] = useState(false);
  const [isClipboardExpanded, setIsClipboardExpanded] = useState(false);
  const [filters, setFilters] = useState<FilterState>({
    country: 'All',
    categories: [],
    suppliers: [],
    priceRange: [0, 50000],
    searchTerm: '',
  });
  
  const [clipboard, setClipboard] = useState<ClipboardItem[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);
  const [sortConfig, setSortConfig] = useState<{ key: keyof PriceEntry; direction: 'asc' | 'desc' } | null>(null);

  // Derive selectedRowIds from clipboard for UI state
  const selectedRowIds = useMemo(() => new Set(clipboard.map(i => i.id)), [clipboard]);

  // --- DERIVED DATA ---
  const filteredData = useMemo(() => {
    return MOCK_PRICE_ENTRIES.filter(entry => {
      if (filters.country !== 'All' && entry.countryCode !== filters.country) return false;
      if (filters.categories.length > 0 && !filters.categories.includes(entry.category)) return false;
      if (filters.suppliers.length > 0 && !filters.suppliers.includes(entry.supplier)) return false;
      if (entry.price < filters.priceRange[0] || entry.price > filters.priceRange[1]) return false;
      if (filters.searchTerm && !entry.name.toLowerCase().includes(filters.searchTerm.toLowerCase())) return false;
      return true;
    });
  }, [filters]);

  const sortedData = useMemo(() => {
    if (!sortConfig) return filteredData;
    const sorted = [...filteredData].sort((a, b) => {
      const aVal = a[sortConfig.key];
      const bVal = b[sortConfig.key];
      if (aVal === undefined || bVal === undefined) return 0;
      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
    return sorted;
  }, [filteredData, sortConfig]);

  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return sortedData.slice(start, start + itemsPerPage);
  }, [sortedData, currentPage, itemsPerPage]);

  const totalPages = Math.ceil(sortedData.length / itemsPerPage);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [filters]);

  // --- HANDLERS ---
  const handleToggleRow = (entry: PriceEntry) => {
    setClipboard(prev => {
      const exists = prev.find(item => item.id === entry.id);
      if (exists) {
        return prev.filter(item => item.id !== entry.id);
      } else {
        return [...prev, { ...entry, quantity: 1 }];
      }
    });
  };

  const handleSelectAll = () => {
    const allInPage = paginatedData;
    const allSelectedInPage = allInPage.every(d => selectedRowIds.has(d.id));

    if (allSelectedInPage) {
      const idsToRemove = new Set(allInPage.map(d => d.id));
      setClipboard(prev => prev.filter(item => !idsToRemove.has(item.id)));
    } else {
      setClipboard(prev => {
        const existingIds = new Set(prev.map(i => i.id));
        const toAdd = allInPage
          .filter(d => !existingIds.has(d.id))
          .map(d => ({ ...d, quantity: 1 }));
        return [...prev, ...toAdd];
      });
    }
  };

  const updateClipboardQuantity = (id: string, qty: number) => {
    setClipboard(prev => prev.map(item => 
      item.id === id ? { ...item, quantity: Math.max(0.01, qty) } : item
    ));
  };

  const clearClipboard = () => setClipboard([]);
  const removeFromClipboard = (id: string) => setClipboard(prev => prev.filter(i => i.id !== id));

  const toggleSort = (key: keyof PriceEntry) => {
    setSortConfig(prev => {
      if (prev?.key === key) {
        if (prev.direction === 'asc') return { key, direction: 'desc' };
        return null;
      }
      return { key, direction: 'asc' };
    });
  };

  const handlePriceRangeChange = (type: 'min' | 'max', val: string) => {
    const num = parseFloat(val) || 0;
    setFilters(prev => ({
      ...prev,
      priceRange: type === 'min' ? [num, prev.priceRange[1]] : [prev.priceRange[0], num]
    }));
  };

  const handleTransferToFoodCost = () => {
    localStorage.setItem('ccs_transfer_buffer', JSON.stringify(clipboard));
    navigate('/food-cost');
  };

  const renderSortIcon = (key: keyof PriceEntry) => {
    if (sortConfig?.key !== key) return <span className="material-symbols-outlined text-[14px] opacity-20">unfold_more</span>;
    return <span className="material-symbols-outlined text-[14px] text-primary">{sortConfig.direction === 'asc' ? 'expand_less' : 'expand_more'}</span>;
  };

  const clipboardTotal = useMemo(() => {
    return clipboard.reduce((acc, item) => acc + (item.price * item.quantity), 0);
  }, [clipboard]);

  return (
    <div className="flex h-full animate-fade-in overflow-hidden relative">
      {/* --- CENTER SECTION: PRICE TRACKER --- */}
      <div className="flex-1 overflow-y-auto p-4 lg:p-8 flex flex-col gap-6 scroll-smooth">
        <div className="max-w-[1400px] mx-auto w-full flex flex-col gap-8 pb-20">
          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div className="flex flex-col gap-1">
              <h1 className="text-3xl lg:text-5xl font-black tracking-tight text-text-main dark:text-white uppercase leading-none">Price Tracker</h1>
              <p className="text-text-muted text-sm lg:text-base">Monitoring global markets.</p>
            </div>
            <div className="flex gap-2">
              <button 
                onClick={() => setIsFilterExpanded(!isFilterExpanded)} 
                className={`flex-1 md:flex-none h-12 px-4 rounded-xl border flex items-center justify-center gap-2 transition-all ${isFilterExpanded ? 'bg-primary border-primary text-black' : 'border-gray-200 dark:border-gray-700 text-text-muted'}`}
              >
                <span className="material-symbols-outlined text-[20px]">tune</span>
                <span className="text-[10px] font-black uppercase tracking-widest">Filters</span>
              </button>
              <button onClick={() => setFilters({country: 'All', categories: [], suppliers: [], priceRange: [0, 50000], searchTerm: ''})} className="size-12 rounded-xl border border-gray-200 dark:border-gray-700 flex items-center justify-center hover:bg-gray-50 dark:hover:bg-white/5 transition-all text-text-muted">
                <span className="material-symbols-outlined text-[20px]">refresh</span>
              </button>
            </div>
          </div>

          {/* Stats Panel (Grid on mobile) */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
            {[
              { label: 'Ingredients', val: '2100+', icon: 'restaurant', col: 'blue' },
              { label: 'Countries', val: '7', icon: 'public', col: 'green' },
              { label: 'Suppliers', val: '21', icon: 'store', col: 'amber' },
              { label: 'Updated', val: 'Monthly', icon: 'history', col: 'purple' }
            ].map(stat => (
              <div key={stat.label} className="bg-white dark:bg-surface-dark p-4 md:p-5 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm flex items-center gap-3 md:gap-4">
                <div className={`size-10 md:size-12 rounded-xl bg-${stat.col}-500/10 text-${stat.col}-500 flex items-center justify-center`}>
                  <span className="material-symbols-outlined text-[20px] md:text-[24px]">{stat.icon}</span>
                </div>
                <div className="flex flex-col overflow-hidden">
                  <span className="text-[8px] md:text-[10px] text-text-muted font-black uppercase tracking-widest truncate">{stat.label}</span>
                  <span className="text-base md:text-xl font-black">{stat.val}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Filter Panel */}
          {isFilterExpanded && (
            <div className="bg-white dark:bg-surface-dark rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm animate-fade-in overflow-hidden">
              <div className="p-6 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-8">
                <div className="space-y-3">
                  <label className="text-[10px] font-black uppercase tracking-widest text-text-muted">Country</label>
                  <select 
                    value={filters.country}
                    onChange={(e) => setFilters(f => ({...f, country: e.target.value, suppliers: []}))}
                    className="w-full h-11 bg-gray-50 dark:bg-white/5 rounded-xl px-4 text-sm font-bold border-none focus:ring-1 focus:ring-primary appearance-none cursor-pointer"
                  >
                    <option value="All">All Countries</option>
                    {COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.flag} {c.name}</option>)}
                  </select>
                </div>
                <div className="space-y-3">
                  <label className="text-[10px] font-black uppercase tracking-widest text-text-muted">Price Range</label>
                  <div className="flex items-center gap-2">
                    <input 
                      type="number" 
                      value={filters.priceRange[0]}
                      onChange={(e) => handlePriceRangeChange('min', e.target.value)}
                      className="w-full h-11 bg-gray-50 dark:bg-white/5 rounded-xl px-3 text-xs font-mono border-none focus:ring-1 focus:ring-primary" 
                    />
                    <span className="text-text-muted">—</span>
                    <input 
                      type="number" 
                      value={filters.priceRange[1]}
                      onChange={(e) => handlePriceRangeChange('max', e.target.value)}
                      className="w-full h-11 bg-gray-50 dark:bg-white/5 rounded-xl px-3 text-xs font-mono border-none focus:ring-1 focus:ring-primary" 
                    />
                  </div>
                </div>
                <div className="space-y-3 md:col-span-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-text-muted">Categories</label>
                  <div className="flex flex-wrap gap-2">
                    {CATEGORIES.map(cat => (
                      <button 
                        key={cat}
                        onClick={() => setFilters(f => ({
                          ...f, 
                          categories: f.categories.includes(cat) ? f.categories.filter(c => c !== cat) : [...f.categories, cat]
                        }))}
                        className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all border ${
                          filters.categories.includes(cat) ? 'bg-primary border-primary text-black' : 'bg-gray-50 dark:bg-white/5 border-gray-100 dark:border-gray-800 text-text-muted hover:border-primary/50'
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-3 xl:col-span-4">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-black uppercase tracking-widest text-text-muted">Search Ingredients</label>
                    {filters.searchTerm && <span className="text-[10px] text-primary font-bold">{sortedData.length} matches</span>}
                  </div>
                  <div className="relative">
                    <input 
                      value={filters.searchTerm}
                      onChange={(e) => setFilters(f => ({...f, searchTerm: e.target.value}))}
                      className="w-full h-12 pl-12 pr-4 bg-gray-50 dark:bg-white/5 rounded-xl border-none focus:ring-1 focus:ring-primary text-sm font-bold"
                      placeholder="Search items..." 
                    />
                    <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-text-muted">search</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Table */}
          <div className="bg-white dark:bg-surface-dark rounded-2xl border border-gray-100 dark:border-gray-800 shadow-xl overflow-hidden">
            <div className="overflow-x-auto no-scrollbar">
              <table className="w-full text-left border-collapse min-w-[900px]">
                <thead>
                  <tr className="bg-gray-50 dark:bg-white/5 border-b border-gray-100 dark:border-gray-800">
                    <th className="p-4 w-12 text-center">
                      <input 
                        type="checkbox" 
                        checked={paginatedData.length > 0 && paginatedData.every(d => selectedRowIds.has(d.id))} 
                        onChange={handleSelectAll}
                        className="rounded border-gray-300 text-primary focus:ring-primary" 
                      />
                    </th>
                    <th className="p-4 cursor-pointer hover:bg-black/5" onClick={() => toggleSort('name')}>
                      <div className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-text-muted">Ingredient {renderSortIcon('name')}</div>
                    </th>
                    <th className="p-4 cursor-pointer hover:bg-black/5" onClick={() => toggleSort('category')}>
                      <div className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-text-muted text-center justify-center">Category {renderSortIcon('category')}</div>
                    </th>
                    <th className="p-4 cursor-pointer hover:bg-black/5 text-right" onClick={() => toggleSort('price')}>
                      <div className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-text-muted justify-end">Unit Price {renderSortIcon('price')}</div>
                    </th>
                    <th className="p-4 text-center">
                      <div className="text-[10px] font-black uppercase tracking-widest text-text-muted">Trend</div>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                  {paginatedData.map(entry => (
                    <tr key={entry.id} className={`hover:bg-primary/5 transition-colors group ${selectedRowIds.has(entry.id) ? 'bg-primary/5' : ''}`}>
                      <td className="p-4 text-center">
                        <input 
                          type="checkbox" 
                          checked={selectedRowIds.has(entry.id)} 
                          onChange={() => handleToggleRow(entry)}
                          className="rounded border-gray-300 text-primary focus:ring-primary" 
                        />
                      </td>
                      <td className="p-4">
                        <div className="flex flex-col">
                          <span className="text-sm font-black group-hover:text-primary transition-colors">{entry.name}</span>
                          <span className="text-[9px] text-text-muted font-bold uppercase tracking-widest">{entry.supplier} • {entry.unit}</span>
                        </div>
                      </td>
                      <td className="p-4 text-center">
                        <span className={`px-2 py-1 rounded text-[9px] font-black uppercase tracking-wider ${
                          entry.category === 'Protein' ? 'bg-blue-100 text-blue-700' :
                          entry.category === 'Vegetable' ? 'bg-green-100 text-green-700' :
                          entry.category === 'Fruit' ? 'bg-pink-100 text-pink-700' :
                          entry.category === 'Dairy' ? 'bg-amber-100 text-amber-700' :
                          entry.category === 'Grain' ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-700'
                        }`}>
                          {entry.category}
                        </span>
                      </td>
                      <td className="p-4 text-right font-mono">
                        <span className="text-sm font-black">{entry.currency}{entry.price.toFixed(2)}</span>
                      </td>
                      <td className="p-4 text-center">
                         <div className="flex flex-col items-center">
                            {entry.trend === 'up' && <span className="text-red-500 material-symbols-outlined text-[16px] font-black">trending_up</span>}
                            {entry.trend === 'down' && <span className="text-green-500 material-symbols-outlined text-[16px] font-black">trending_down</span>}
                            {entry.trend === 'stable' && <span className="text-gray-400 material-symbols-outlined text-[16px] font-black">trending_flat</span>}
                            <span className={`text-[9px] font-bold ${entry.trend === 'up' ? 'text-red-500' : entry.trend === 'down' ? 'text-green-500' : 'text-gray-400'}`}>
                              {entry.trendValue}
                            </span>
                         </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            <div className="p-6 bg-gray-50 dark:bg-white/5 border-t border-gray-100 dark:border-gray-800 flex flex-col md:flex-row items-center justify-between gap-6">
               <div className="flex items-center gap-4">
                 <span className="text-[10px] font-black uppercase tracking-widest text-text-muted">Showing {Math.min(sortedData.length, itemsPerPage)} of {sortedData.length}</span>
               </div>
               <div className="flex items-center gap-3">
                 <button disabled={currentPage === 1} onClick={() => setCurrentPage(prev => prev - 1)} className="px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-xs font-black uppercase tracking-widest disabled:opacity-50 hover:bg-white dark:hover:bg-white/5 transition-all">Previous</button>
                 <button disabled={currentPage === totalPages} onClick={() => setCurrentPage(prev => prev + 1)} className="px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-xs font-black uppercase tracking-widest disabled:opacity-50 hover:bg-white dark:hover:bg-white/5 transition-all">Next</button>
               </div>
            </div>
          </div>
        </div>
      </div>

      {/* --- RIGHT SIDEBAR: CLIPBOARD PANEL (Fixed on Mobile) --- */}
      {isClipboardExpanded && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[65] md:hidden transition-opacity duration-300"
          onClick={() => setIsClipboardExpanded(false)}
        />
      )}

      <aside className={`
        ${isClipboardExpanded ? 'w-[calc(100%-64px)] md:w-80' : 'w-12'} 
        bg-surface-light dark:bg-surface-dark border-l border-gray-200 dark:border-gray-800 
        flex flex-col h-full shrink-0 transition-all duration-300 
        fixed md:relative right-0 top-0 z-[70] shadow-2xl md:shadow-none
      `}>
        {isClipboardExpanded ? (
          <div className="flex flex-col h-full overflow-hidden animate-fade-in">
            <div className="p-6 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
               <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-primary">shopping_basket</span>
                  <h2 className="text-sm font-black uppercase tracking-widest">Clipboard</h2>
               </div>
               <button onClick={() => setIsClipboardExpanded(false)} className="text-text-muted hover:text-text-main">
                 <span className="material-symbols-outlined">chevron_right</span>
               </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6">
              <div className="bg-primary/5 rounded-2xl p-5 border border-primary/20 flex flex-col gap-1">
                 <span className="text-[10px] font-black uppercase tracking-widest text-primary">Summary</span>
                 <div className="flex justify-between items-end">
                    <span className="text-2xl font-black">{clipboard.length} Items</span>
                    <span className="text-lg font-black text-primary font-mono">{clipboard[0]?.currency || '€'}{clipboardTotal.toFixed(2)}</span>
                 </div>
              </div>

              <div className="flex-1 space-y-4">
                 <div className="flex items-center justify-between">
                   <h4 className="text-[10px] font-black uppercase tracking-widest text-text-muted">Selection List</h4>
                   {clipboard.length > 0 && <button onClick={clearClipboard} className="text-[9px] font-black text-red-500 uppercase hover:underline">Clear All</button>}
                 </div>
                 <div className="space-y-3">
                   {clipboard.map(item => (
                      <div key={item.id} className="p-4 bg-gray-50 dark:bg-white/5 rounded-xl border border-gray-100 dark:border-gray-800 flex flex-col gap-3 group animate-fade-in">
                         <div className="flex items-start justify-between">
                            <div className="flex flex-col overflow-hidden max-w-[80%]">
                               <span className="text-sm font-black truncate">{item.name}</span>
                               <span className="text-[10px] text-text-muted uppercase font-bold tracking-tight">
                                  {item.supplier} • {item.currency}{item.price}/{item.unit}
                               </span>
                            </div>
                            <button onClick={() => removeFromClipboard(item.id)} className="text-gray-300 hover:text-red-500 transition-colors">
                               <span className="material-symbols-outlined text-[18px]">close</span>
                            </button>
                         </div>
                         <div className="flex items-center justify-between gap-4 pt-2 border-t border-gray-100 dark:border-gray-800/50">
                            <div className="flex flex-col gap-1">
                               <span className="text-[9px] font-black text-text-muted uppercase">Qty</span>
                               <input 
                                  type="number"
                                  min="0.01"
                                  step="0.1"
                                  value={item.quantity}
                                  onChange={(e) => updateClipboardQuantity(item.id, parseFloat(e.target.value) || 0)}
                                  className="w-16 h-8 bg-white dark:bg-black/20 border border-gray-200 dark:border-gray-700 rounded-lg px-2 text-xs font-black outline-none focus:ring-1 focus:ring-primary"
                               />
                            </div>
                            <div className="flex flex-col items-end gap-1">
                               <span className="text-[9px] font-black text-text-muted uppercase">Subtotal</span>
                               <span className="text-sm font-black font-mono">{item.currency}{(item.price * item.quantity).toFixed(2)}</span>
                            </div>
                         </div>
                      </div>
                   ))}
                   {clipboard.length === 0 && (
                     <div className="py-12 flex flex-col items-center justify-center text-center opacity-30 gap-3 grayscale">
                       <span className="material-symbols-outlined text-4xl">inventory_2</span>
                       <p className="text-[10px] font-black uppercase tracking-widest">Empty</p>
                     </div>
                   )}
                 </div>
              </div>
            </div>

            <div className="p-6 border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-black/20">
               <button 
                disabled={clipboard.length === 0}
                onClick={handleTransferToFoodCost}
                className="w-full bg-primary text-black py-4 rounded-xl font-black uppercase tracking-widest text-xs shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
               >
                 <span className="material-symbols-outlined">output</span> Transfer
               </button>
            </div>
          </div>
        ) : (
          <button 
            onClick={() => setIsClipboardExpanded(true)}
            className="w-full h-full flex flex-col items-center py-8 gap-12 group transition-colors hover:bg-primary/5"
          >
            <span className="material-symbols-outlined text-text-muted group-hover:text-primary transition-colors">chevron_left</span>
            <div className="rotate-90 origin-center whitespace-nowrap">
              <span className="text-[10px] font-black uppercase tracking-[0.3em] text-text-muted group-hover:text-primary transition-colors">Clipboard ({clipboard.length})</span>
            </div>
          </button>
        )}
      </aside>
    </div>
  );
};
