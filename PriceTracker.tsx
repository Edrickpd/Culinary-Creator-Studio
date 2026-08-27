import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { MOCK_PRICE_ENTRIES, COUNTRIES, CATEGORIES } from '../constants';
import { PriceEntry, FilterState, PlanTier } from '../types';
import { useAppContext } from '../AppContext';
import { supabase } from '../supabaseClient';
import { PlanUpgradeModal } from '../components/PlanUpgradeModal';
import { normalizeTier } from '../services/planLimits';

export const PriceTracker = () => {
  const navigate = useNavigate();
  const {
    t,
    user,
    clipboard,
    toggleClipboardItem,
    updateClipboardQuantity,
    removeFromClipboard,
    duplicateClipboardItem,
    clearClipboard,
    isClipboardExpanded,
    setIsClipboardExpanded
  } = useAppContext();

  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const currentTier = normalizeTier(user?.tier);
  const isFreePlan = currentTier === PlanTier.FREE;

  // --- STATE ---
  const [isFilterExpanded, setIsFilterExpanded] = useState(false);
  const [isLoadingDb, setIsLoadingDb] = useState(false);
  const [dbEntries, setDbEntries] = useState<PriceEntry[]>([]);
  const [dataSource, setDataSource] = useState<'supabase' | 'local'>('local');

  const [filters, setFilters] = useState<FilterState>({
    country: 'All',
    categories: [],
    suppliers: [],
    priceRange: [0, 50000],
    searchTerm: '',
  });

  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(30); // 15 pairs in 2 cols
  const [sortKey, setSortKey] = useState<keyof PriceEntry>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // --- FETCH FROM SUPABASE ---
  const loadPricesFromSupabase = useCallback(async () => {
    setIsLoadingDb(true);
    try {
      const { data, error } = await supabase
        .from('ingredients_prices')
        .select('*')
        .order('ingredient_name', { ascending: true });

      if (error) {
        console.warn('Supabase ingredients_prices fetch warning, using local dataset:', error.message);
        setDataSource('local');
      } else if (data && data.length > 0) {
        const mapped: PriceEntry[] = data.map((row: any) => ({
          id: row.id || `sp_${row.ingredient_name}_${row.country_code}_${row.distributor_name}`,
          ingredientId: row.id,
          name: row.ingredient_name || row.name,
          category: row.category || 'Other',
          country: row.country_name || row.country || row.country_code,
          countryCode: row.country_code || 'ES',
          supplier: row.distributor_name || row.supplier || 'Direct Market',
          unit: row.unit || 'kg',
          price: Number(row.price_per_unit || row.price || 0),
          currency: row.currency || '€',
          lastUpdated: row.last_updated || new Date().toISOString()
        }));
        setDbEntries(mapped);
        setDataSource('supabase');
      } else {
        setDataSource('local');
      }
    } catch (err) {
      console.warn('Could not query Supabase ingredients_prices:', err);
      setDataSource('local');
    } finally {
      setIsLoadingDb(false);
    }
  }, []);

  useEffect(() => {
    loadPricesFromSupabase();
  }, [loadPricesFromSupabase]);

  // Use Supabase data if present, otherwise fallback to curated dataset
  const activeDataset = useMemo(() => {
    return dbEntries.length > 0 ? dbEntries : MOCK_PRICE_ENTRIES;
  }, [dbEntries]);

  // Selected row IDs derived from global clipboard
  const selectedRowIds = useMemo(() => new Set(clipboard.map(i => i.id)), [clipboard]);

  // --- FILTER & SORT ---
  const filteredData = useMemo(() => {
    return activeDataset.filter(entry => {
      if (filters.country !== 'All' && entry.countryCode !== filters.country) return false;
      if (filters.categories.length > 0 && !filters.categories.includes(entry.category)) return false;
      if (filters.suppliers.length > 0 && !filters.suppliers.includes(entry.supplier)) return false;
      if (entry.price < filters.priceRange[0] || entry.price > filters.priceRange[1]) return false;
      if (filters.searchTerm) {
        const query = filters.searchTerm.toLowerCase();
        const matchesName = entry.name.toLowerCase().includes(query);
        const matchesCat = entry.category.toLowerCase().includes(query);
        const matchesSupplier = entry.supplier.toLowerCase().includes(query);
        if (!matchesName && !matchesCat && !matchesSupplier) return false;
      }
      return true;
    });
  }, [activeDataset, filters]);

  const sortedData = useMemo(() => {
    return [...filteredData].sort((a, b) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];
      if (aVal === undefined || bVal === undefined) return 0;
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
      }
      const strA = String(aVal).toLowerCase();
      const strB = String(bVal).toLowerCase();
      return sortDirection === 'asc' ? strA.localeCompare(strB) : strB.localeCompare(strA);
    });
  }, [filteredData, sortKey, sortDirection]);

  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return sortedData.slice(start, start + itemsPerPage);
  }, [sortedData, currentPage, itemsPerPage]);

  const totalPages = Math.max(1, Math.ceil(sortedData.length / itemsPerPage));

  useEffect(() => {
    setCurrentPage(1);
  }, [filters, itemsPerPage]);

  const toggleSort = (key: keyof PriceEntry) => {
    if (sortKey === key) {
      setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDirection('asc');
    }
  };

  const handlePriceRangeChange = (type: 'min' | 'max', val: string) => {
    const num = parseFloat(val) || 0;
    setFilters(prev => ({
      ...prev,
      priceRange: type === 'min' ? [num, prev.priceRange[1]] : [prev.priceRange[0], num]
    }));
  };

  const handleTransferToFoodCost = () => {
    navigate('/food-cost');
  };

  const clipboardTotal = useMemo(() => {
    return clipboard.reduce((acc, item) => acc + (item.price * item.quantity), 0);
  }, [clipboard]);

  const countryFlag = (code: string) => {
    const found = COUNTRIES.find(c => c.code === code);
    return found ? found.flag : '🌐';
  };

  const getCategoryColor = (cat: string) => {
    switch (cat) {
      case 'Protein':
        return 'bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800/40';
      case 'Vegetable':
        return 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/40';
      case 'Fruit':
        return 'bg-pink-500/10 text-pink-700 dark:text-pink-400 border-pink-200 dark:border-pink-800/40';
      case 'Dairy':
        return 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800/40';
      case 'Grain':
        return 'bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-200 dark:border-orange-800/40';
      case 'Spice/Herb':
        return 'bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-200 dark:border-purple-800/40';
      case 'Oil/Fat':
        return 'bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-200 dark:border-yellow-800/40';
      default:
        return 'bg-gray-500/10 text-gray-700 dark:text-gray-400 border-gray-200 dark:border-gray-800';
    }
  };

  if (isFreePlan) {
    return (
      <div className="p-4 md:p-8 lg:p-12 animate-fade-in max-w-5xl mx-auto space-y-8">
        <PlanUpgradeModal
          isOpen={showUpgradeModal}
          onClose={() => setShowUpgradeModal(false)}
          title="Unlock Global Market Price Tracker"
          description="Global commodity prices across 100 key ingredients and 7 benchmark markets are accessible on Prime (9€) and Platinum Prime (25€) plans."
          requiredTier={PlanTier.PRIME}
        />

        <header className="space-y-2">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl md:text-5xl font-black uppercase tracking-tight">Market Price Tracker</h1>
            <span className="px-3 py-1 bg-amber-500/10 text-amber-500 rounded-full text-xs font-black uppercase tracking-widest flex items-center gap-1">
              <span className="material-symbols-outlined text-sm">lock</span> Prime & Platinum
            </span>
          </div>
          <p className="text-text-muted text-lg">Global market prices, distributor benchmarks, and cost analysis tools.</p>
        </header>

        <div className="bg-white dark:bg-surface-dark border border-gray-200 dark:border-gray-800 rounded-3xl p-8 md:p-12 shadow-xl text-center space-y-6 max-w-2xl mx-auto">
          <div className="size-20 rounded-3xl bg-primary/10 text-primary flex items-center justify-center mx-auto shadow-inner">
            <span className="material-symbols-outlined text-4xl">monitoring</span>
          </div>
          <div className="space-y-2">
            <h3 className="text-2xl font-black uppercase tracking-tight">Real-Time Commodity Benchmarks</h3>
            <p className="text-sm text-text-muted leading-relaxed font-medium">
              Access real-time price tracking across 7 countries (ES, US, FR, IT, MX, JP, UK), multi-supplier comparisons, unit pricing, and instant clipboard transfer to Food Cost sheets.
            </p>
          </div>

          <div className="pt-4 flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={() => setShowUpgradeModal(true)}
              className="px-8 py-3.5 bg-primary text-black rounded-xl text-xs font-black uppercase tracking-widest hover:bg-primary-hover shadow-lg shadow-primary/25 transition-all"
            >
              Upgrade to Prime or Enter Promo Code
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full animate-fade-in overflow-hidden relative">
      {/* --- CENTER SECTION: PRICE TRACKER --- */}
      <div className="flex-1 overflow-y-auto p-4 lg:p-8 flex flex-col gap-6 scroll-smooth">
        <div className="max-w-[1400px] mx-auto w-full flex flex-col gap-6 pb-24">
          
          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-3">
                <h1 className="text-2xl lg:text-4xl font-black tracking-tight text-text-main dark:text-white uppercase leading-none">
                  {t('priceTracker.title') || "Price Tracker"}
                </h1>
                {dataSource === 'supabase' && (
                  <span className="px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                    Live Supabase
                  </span>
                )}
              </div>
              <p className="text-text-muted text-xs lg:text-sm">
                {t('priceTracker.subtitle') || "Global market database across 100 key ingredients & 7 benchmark countries."}
              </p>
            </div>
            
            <div className="flex items-center gap-2">
              <button 
                onClick={() => setIsFilterExpanded(!isFilterExpanded)} 
                className={`h-11 px-4 rounded-xl border flex items-center justify-center gap-2 transition-all ${
                  isFilterExpanded 
                    ? 'bg-primary border-primary text-black font-black' 
                    : 'border-gray-200 dark:border-gray-800 text-text-muted hover:border-gray-300 dark:hover:border-gray-700'
                }`}
              >
                <span className="material-symbols-outlined text-[18px]">tune</span>
                <span className="text-[10px] font-black uppercase tracking-widest">{t('priceTracker.filters') || "Filters"}</span>
                {(filters.country !== 'All' || filters.categories.length > 0 || filters.searchTerm) && (
                  <span className="size-2 rounded-full bg-primary" />
                )}
              </button>

              <button 
                onClick={() => loadPricesFromSupabase()} 
                title="Sync from Supabase"
                className="size-11 rounded-xl border border-gray-200 dark:border-gray-800 flex items-center justify-center hover:bg-gray-50 dark:hover:bg-white/5 transition-all text-text-muted hover:text-text-main"
              >
                <span className={`material-symbols-outlined text-[18px] ${isLoadingDb ? 'animate-spin' : ''}`}>
                  sync
                </span>
              </button>
            </div>
          </div>

          {/* Quick Stats Bar */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { label: 'Total Ingredients', val: `${activeDataset.length} items`, icon: 'inventory_2', col: 'text-blue-500 bg-blue-500/10' },
              { label: 'Countries Covered', val: '7 Markets', icon: 'public', col: 'text-emerald-500 bg-emerald-500/10' },
              { label: 'Distributors / Country', val: '3 Verified', icon: 'storefront', col: 'text-amber-500 bg-amber-500/10' },
              { label: 'Update Cycle', val: 'Monthly', icon: 'update', col: 'text-purple-500 bg-purple-500/10' },
            ].map(stat => (
              <div key={stat.label} className="bg-white dark:bg-surface-dark p-3.5 md:p-4 rounded-xl border border-gray-100 dark:border-gray-800 shadow-sm flex items-center gap-3">
                <div className={`size-9 rounded-lg ${stat.col} flex items-center justify-center shrink-0`}>
                  <span className="material-symbols-outlined text-[18px]">{stat.icon}</span>
                </div>
                <div className="flex flex-col overflow-hidden">
                  <span className="text-[9px] text-text-muted font-black uppercase tracking-wider truncate">{stat.label}</span>
                  <span className="text-sm font-black truncate">{stat.val}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Search & Sort Quick Controls */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted text-[18px]">
                search
              </span>
              <input 
                type="text"
                value={filters.searchTerm}
                onChange={(e) => setFilters(f => ({ ...f, searchTerm: e.target.value }))}
                placeholder="Search by ingredient, category or distributor..."
                className="w-full h-11 pl-10 pr-4 bg-white dark:bg-surface-dark rounded-xl border border-gray-200 dark:border-gray-800 text-xs font-bold focus:ring-1 focus:ring-primary focus:border-primary placeholder:font-normal"
              />
              {filters.searchTerm && (
                <button 
                  onClick={() => setFilters(f => ({ ...f, searchTerm: '' }))}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-main"
                >
                  <span className="material-symbols-outlined text-[16px]">close</span>
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <select
                value={sortKey}
                onChange={(e) => setSortKey(e.target.value as keyof PriceEntry)}
                className="h-11 px-3 bg-white dark:bg-surface-dark rounded-xl border border-gray-200 dark:border-gray-800 text-xs font-bold focus:ring-1 focus:ring-primary"
              >
                <option value="name">Sort: Ingredient Name</option>
                <option value="price">Sort: Price</option>
                <option value="category">Sort: Category</option>
                <option value="country">Sort: Country</option>
              </select>

              <button
                onClick={() => setSortDirection(d => d === 'asc' ? 'desc' : 'asc')}
                className="size-11 rounded-xl bg-white dark:bg-surface-dark border border-gray-200 dark:border-gray-800 flex items-center justify-center hover:bg-gray-50 dark:hover:bg-white/5 text-text-muted hover:text-text-main"
                title={sortDirection === 'asc' ? 'Ascending' : 'Descending'}
              >
                <span className="material-symbols-outlined text-[18px]">
                  {sortDirection === 'asc' ? 'arrow_upward' : 'arrow_downward'}
                </span>
              </button>
            </div>
          </div>

          {/* Filter Panel (Collapsible) */}
          {isFilterExpanded && (
            <div className="bg-white dark:bg-surface-dark rounded-2xl border border-gray-200 dark:border-gray-800 p-5 shadow-sm space-y-5 animate-fade-in">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                
                {/* Country Filter */}
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-text-muted">
                    Filter by Country
                  </label>
                  <select 
                    value={filters.country}
                    onChange={(e) => setFilters(f => ({ ...f, country: e.target.value }))}
                    className="w-full h-10 bg-gray-50 dark:bg-black/20 rounded-xl px-3 text-xs font-bold border border-gray-200 dark:border-gray-800 focus:ring-1 focus:ring-primary"
                  >
                    <option value="All">🌐 All Countries (7 Markets)</option>
                    {COUNTRIES.map(c => (
                      <option key={c.code} value={c.code}>
                        {c.flag} {c.name} ({c.code})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Price Range Filter */}
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-text-muted">
                    Price Range ({COUNTRIES.find(c => c.code === filters.country)?.symbol || '€'})
                  </label>
                  <div className="flex items-center gap-2">
                    <input 
                      type="number" 
                      min="0"
                      value={filters.priceRange[0]}
                      onChange={(e) => handlePriceRangeChange('min', e.target.value)}
                      placeholder="Min"
                      className="w-full h-10 bg-gray-50 dark:bg-black/20 rounded-xl px-3 text-xs font-mono border border-gray-200 dark:border-gray-800 focus:ring-1 focus:ring-primary" 
                    />
                    <span className="text-text-muted">—</span>
                    <input 
                      type="number" 
                      min="0"
                      value={filters.priceRange[1]}
                      onChange={(e) => handlePriceRangeChange('max', e.target.value)}
                      placeholder="Max"
                      className="w-full h-10 bg-gray-50 dark:bg-black/20 rounded-xl px-3 text-xs font-mono border border-gray-200 dark:border-gray-800 focus:ring-1 focus:ring-primary" 
                    />
                  </div>
                </div>

                {/* Reset Action */}
                <div className="flex flex-col justify-end">
                  <button 
                    onClick={() => setFilters({
                      country: 'All',
                      categories: [],
                      suppliers: [],
                      priceRange: [0, 50000],
                      searchTerm: ''
                    })}
                    className="h-10 px-4 rounded-xl border border-gray-200 dark:border-gray-800 text-xs font-bold hover:bg-gray-50 dark:hover:bg-white/5 transition-all text-text-muted hover:text-text-main flex items-center justify-center gap-2"
                  >
                    <span className="material-symbols-outlined text-[16px]">restart_alt</span>
                    Reset All Filters
                  </button>
                </div>
              </div>

              {/* Categories Pills */}
              <div className="space-y-2 pt-2 border-t border-gray-100 dark:border-gray-800">
                <label className="text-[10px] font-black uppercase tracking-widest text-text-muted">
                  Categories
                </label>
                <div className="flex flex-wrap gap-2">
                  {CATEGORIES.map(cat => {
                    const isSelected = filters.categories.includes(cat);
                    return (
                      <button 
                        key={cat}
                        onClick={() => setFilters(f => ({
                          ...f, 
                          categories: isSelected ? f.categories.filter(c => c !== cat) : [...f.categories, cat]
                        }))}
                        className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all border ${
                          isSelected 
                            ? 'bg-primary border-primary text-black' 
                            : 'bg-gray-50 dark:bg-white/5 border-gray-200 dark:border-gray-800 text-text-muted hover:border-gray-400'
                        }`}
                      >
                        {cat}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Results Summary Bar */}
          <div className="flex items-center justify-between px-1">
            <span className="text-[11px] font-bold text-text-muted uppercase tracking-wider">
              Showing <strong className="text-text-main dark:text-white font-black">{paginatedData.length}</strong> of <strong className="text-text-main dark:text-white font-black">{sortedData.length}</strong> items
            </span>
            
            <div className="flex items-center gap-2 text-xs">
              <span className="text-[10px] uppercase font-bold text-text-muted">Per page:</span>
              {[20, 30, 50].map(sz => (
                <button
                  key={sz}
                  onClick={() => setItemsPerPage(sz)}
                  className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all ${
                    itemsPerPage === sz ? 'bg-primary text-black' : 'text-text-muted hover:text-text-main'
                  }`}
                >
                  {sz}
                </button>
              ))}
            </div>
          </div>

          {/* --- 2-COLUMN COMPACT GRID (4 COLUMNS PER ITEM: INGREDIENT, COUNTRY, CATEGORY, PRICE) --- */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {paginatedData.map(entry => {
              const isSelected = selectedRowIds.has(entry.id);
              return (
                <div 
                  key={entry.id}
                  onClick={() => toggleClipboardItem(entry)}
                  className={`group cursor-pointer p-3.5 rounded-xl border transition-all duration-150 flex items-center justify-between gap-3 ${
                    isSelected 
                      ? 'bg-primary/10 border-primary shadow-sm' 
                      : 'bg-white dark:bg-surface-dark border-gray-200/80 dark:border-gray-800 hover:border-primary/40 hover:bg-gray-50/50 dark:hover:bg-white/[0.02]'
                  }`}
                >
                  {/* Left: Checkbox + Column 1: Ingredient & Supplier/Unit */}
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div 
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleClipboardItem(entry);
                      }}
                      className={`size-5 rounded flex items-center justify-center shrink-0 border transition-all ${
                        isSelected 
                          ? 'bg-primary border-primary text-black' 
                          : 'border-gray-300 dark:border-gray-700 bg-transparent group-hover:border-primary'
                      }`}
                    >
                      {isSelected && (
                        <span className="material-symbols-outlined text-[16px] font-black leading-none">
                          check
                        </span>
                      )}
                    </div>

                    <div className="flex flex-col min-w-0">
                      <span className="text-xs font-black text-text-main dark:text-white truncate group-hover:text-primary transition-colors">
                        {entry.name}
                      </span>
                      <span className="text-[10px] text-text-muted truncate font-medium">
                        {entry.supplier} • {entry.unit}
                      </span>
                    </div>
                  </div>

                  {/* Middle: Column 2: Country & Column 3: Category */}
                  <div className="flex items-center gap-2 shrink-0">
                    {/* Country */}
                    <div 
                      className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-gray-100 dark:bg-white/5 text-[10px] font-bold text-text-main dark:text-gray-300"
                      title={`${entry.country} (${entry.countryCode})`}
                    >
                      <span className="text-[11px]">{countryFlag(entry.countryCode)}</span>
                      <span className="uppercase text-[9px] font-black">{entry.countryCode}</span>
                    </div>

                    {/* Category Badge */}
                    <span className={`px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wide border ${getCategoryColor(entry.category)}`}>
                      {entry.category}
                    </span>
                  </div>

                  {/* Right: Column 4: Price */}
                  <div className="text-right shrink-0 min-w-[75px]">
                    <span className="text-xs font-black font-mono tracking-tight text-text-main dark:text-white">
                      {entry.currency}{entry.price.toFixed(2)}
                    </span>
                    <span className="block text-[9px] text-text-muted font-medium">
                      /{entry.unit}
                    </span>
                  </div>
                </div>
              );
            })}

            {paginatedData.length === 0 && (
              <div className="col-span-full py-16 bg-white dark:bg-surface-dark rounded-2xl border border-gray-200 dark:border-gray-800 flex flex-col items-center justify-center text-center p-6 gap-3">
                <span className="material-symbols-outlined text-4xl text-text-muted">search_off</span>
                <p className="text-sm font-bold text-text-main dark:text-white">No ingredients found</p>
                <p className="text-xs text-text-muted">Try changing your search terms or resetting filters.</p>
                <button
                  onClick={() => setFilters({ country: 'All', categories: [], suppliers: [], priceRange: [0, 50000], searchTerm: '' })}
                  className="mt-2 px-4 py-2 bg-primary text-black rounded-xl text-xs font-black uppercase tracking-wider"
                >
                  Clear Filters
                </button>
              </div>
            )}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <span className="text-xs text-text-muted font-medium">
                Page {currentPage} of {totalPages}
              </span>
              <div className="flex items-center gap-2">
                <button
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(p => p - 1)}
                  className="px-3.5 py-2 rounded-xl border border-gray-200 dark:border-gray-800 text-xs font-bold disabled:opacity-30 hover:bg-white dark:hover:bg-surface-dark transition-all"
                >
                  Previous
                </button>
                <button
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage(p => p + 1)}
                  className="px-3.5 py-2 rounded-xl border border-gray-200 dark:border-gray-800 text-xs font-bold disabled:opacity-30 hover:bg-white dark:hover:bg-surface-dark transition-all"
                >
                  Next
                </button>
              </div>
            </div>
          )}

        </div>
      </div>

      {/* --- RIGHT SIDEBAR: UNIFIED PERSISTENT CLIPBOARD --- */}
      {isClipboardExpanded && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[65] md:hidden transition-opacity duration-300"
          onClick={() => setIsClipboardExpanded(false)}
        />
      )}

      <aside className={`
        ${isClipboardExpanded ? 'w-[calc(100%-48px)] md:w-80' : 'w-12'} 
        bg-surface-light dark:bg-surface-dark border-l border-gray-200 dark:border-gray-800 
        flex flex-col h-full shrink-0 transition-all duration-300 
        fixed md:relative right-0 top-0 z-[70] shadow-2xl md:shadow-none
      `}>
        {isClipboardExpanded ? (
          <div className="flex flex-col h-full overflow-hidden animate-fade-in">
            {/* Sidebar Header */}
            <div className="p-4 md:p-5 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="material-symbols-outlined text-primary text-[20px]">shopping_basket</span>
                <h2 className="text-xs font-black uppercase tracking-widest">Clipboard</h2>
                <span className="px-2 py-0.5 rounded-full bg-primary/20 text-primary text-[10px] font-black">
                  {clipboard.length}
                </span>
              </div>
              <button 
                onClick={() => setIsClipboardExpanded(false)} 
                className="text-text-muted hover:text-text-main size-8 rounded-lg flex items-center justify-center hover:bg-gray-100 dark:hover:bg-white/5"
              >
                <span className="material-symbols-outlined text-[20px]">chevron_right</span>
              </button>
            </div>

            {/* Sidebar Content */}
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
              
              {/* Summary Card */}
              <div className="bg-primary/10 rounded-xl p-4 border border-primary/20 flex flex-col gap-1">
                <span className="text-[9px] font-black uppercase tracking-widest text-primary">Clipboard Total</span>
                <div className="flex justify-between items-end">
                  <span className="text-xl font-black">{clipboard.length} Selected</span>
                  <span className="text-base font-black text-primary font-mono">
                    {clipboard[0]?.currency || '€'}{clipboardTotal.toFixed(2)}
                  </span>
                </div>
              </div>

              {/* Items List */}
              <div className="flex-1 space-y-3">
                <div className="flex items-center justify-between px-1">
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-text-muted">Selected Items</h4>
                  {clipboard.length > 0 && (
                    <button 
                      onClick={clearClipboard} 
                      className="text-[9px] font-black text-red-500 uppercase hover:underline"
                    >
                      Clear All
                    </button>
                  )}
                </div>

                <div className="space-y-2.5">
                  {clipboard.map(item => (
                    <div 
                      key={item.id} 
                      className="p-3 bg-gray-50 dark:bg-white/5 rounded-xl border border-gray-100 dark:border-gray-800 flex flex-col gap-2 group animate-fade-in"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex flex-col min-w-0">
                          <span className="text-xs font-black truncate">{item.name}</span>
                          <span className="text-[9px] text-text-muted truncate font-medium">
                            {item.supplier} • {item.currency}{item.price.toFixed(2)}/{item.unit}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          {/* Duplicate Item Button */}
                          <button 
                            onClick={() => duplicateClipboardItem(item.id)} 
                            className="text-gray-400 hover:text-primary transition-colors p-1"
                            title="Duplicate item"
                          >
                            <span className="material-symbols-outlined text-[16px]">content_copy</span>
                          </button>
                          {/* Remove Item Button */}
                          <button 
                            onClick={() => removeFromClipboard(item.id)} 
                            className="text-gray-400 hover:text-red-500 transition-colors p-1"
                            title="Remove item"
                          >
                            <span className="material-symbols-outlined text-[16px]">close</span>
                          </button>
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-3 pt-2 border-t border-gray-200/60 dark:border-gray-800">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[9px] font-black text-text-muted uppercase">Qty ({item.unit})</span>
                          <input 
                            type="number"
                            min="0.01"
                            step="0.1"
                            value={item.quantity}
                            onChange={(e) => updateClipboardQuantity(item.id, parseFloat(e.target.value) || 0)}
                            className="w-16 h-7 bg-white dark:bg-black/40 border border-gray-200 dark:border-gray-700 rounded-md px-2 text-xs font-black text-center outline-none focus:border-primary"
                          />
                        </div>
                        <div className="text-right">
                          <span className="text-xs font-black font-mono">
                            {item.currency}{(item.price * item.quantity).toFixed(2)}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}

                  {clipboard.length === 0 && (
                    <div className="py-12 flex flex-col items-center justify-center text-center opacity-40 gap-2">
                      <span className="material-symbols-outlined text-3xl">shopping_cart_checkout</span>
                      <p className="text-[10px] font-black uppercase tracking-widest">No items selected</p>
                      <p className="text-[10px] text-text-muted max-w-[180px]">
                        Click on any ingredient card to add it to your clipboard.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Sidebar Footer Action */}
            <div className="p-4 border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-black/20">
              <button 
                disabled={clipboard.length === 0}
                onClick={handleTransferToFoodCost}
                className="w-full bg-primary text-black py-3 rounded-xl font-black uppercase tracking-wider text-xs shadow-md shadow-primary/20 hover:brightness-105 active:scale-95 transition-all disabled:opacity-40 flex items-center justify-center gap-2"
              >
                <span className="material-symbols-outlined text-[18px]">restaurant_menu</span>
                Add to Food Cost
              </button>
            </div>
          </div>
        ) : (
          <button 
            onClick={() => setIsClipboardExpanded(true)}
            className="w-full h-full flex flex-col items-center py-6 gap-8 group transition-colors hover:bg-primary/5"
            title="Open Clipboard"
          >
            <span className="material-symbols-outlined text-text-muted group-hover:text-primary transition-colors text-[20px]">
              chevron_left
            </span>
            <div className="rotate-90 origin-center whitespace-nowrap flex items-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-[0.25em] text-text-muted group-hover:text-primary transition-colors">
                Clipboard
              </span>
              {clipboard.length > 0 && (
                <span className="px-1.5 py-0.5 rounded-full bg-primary text-black text-[9px] font-black leading-none">
                  {clipboard.length}
                </span>
              )}
            </div>
          </button>
        )}
      </aside>
    </div>
  );
};
