
import React, { useState, useMemo, useEffect } from 'react';
import { CostTemplate, CostIngredient, OptimizationSuggestion, PriceEntry } from '../types';
import { BASE_INGREDIENTS, MOCK_PRICE_ENTRIES, COUNTRIES } from '../constants';
import { gemini } from '../services/geminiService';

export const FoodCost = () => {
  // --- GLOBAL STATE ---
  const [template, setTemplate] = useState<CostTemplate>(CostTemplate.BASIC);
  const [isClipboardOpen, setIsClipboardOpen] = useState(true);
  const [recipeName, setRecipeName] = useState('');
  const [servings, setServings] = useState(1);
  const [ingredients, setIngredients] = useState<CostIngredient[]>([]);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<OptimizationSuggestion[]>([]);
  
  // Template specific settings
  const [cookingLoss, setCookingLoss] = useState(20); 
  const [targetMargin, setTargetMargin] = useState(30); 
  const [classification, setClassification] = useState('Main');
  const [targetProtein, setTargetProtein] = useState('');
  const [targetCalories, setTargetCalories] = useState('');
  const [pricingStrategy, setPricingStrategy] = useState('cost-margin');

  // Clipboard State (Simulating shared data from Price Tracker)
  // In this session-based demo, we'll initialize it as empty per the prompt
  const [clipboardItems, setClipboardItems] = useState<PriceEntry[]>([]);

  // --- CALCULATIONS ---
  const totals = useMemo(() => {
    let totalCost = 0;
    let totalGrossWeight = 0;
    let totalNetWeight = 0;
    let totalPro = 0;
    let totalCarb = 0;
    let totalFat = 0;
    let totalKcal = 0;
    let totalFiber = 0;

    const processed = ingredients.map(ing => {
      const qty = ing.quantity || 0;
      const price = ing.unitPrice || 0;
      let cost = qty * price;

      // Restaurant Calcs
      const hl = (ing.handlingLoss || 0) / 100;
      const nw = qty * (1 - hl);
      
      // Economic Calcs
      const disc = (ing.bulkDiscount || 0) / 100;
      const finalCost = cost * (1 - disc);
      const potentialSavings = ((ing.unitPrice - (ing.cheapestPrice || ing.unitPrice)) * qty);

      totalCost += template === CostTemplate.ECONOMIC ? finalCost : cost;
      totalGrossWeight += qty;
      totalNetWeight += nw;
      
      // Nutri Calcs - simple normalization for demo
      const multiplier = ing.unit === 'kg' || ing.unit === 'L' ? qty : qty / 1000;
      totalPro += (ing.protein || 0) * (multiplier * 10); // assumed per 100g in database
      totalCarb += (ing.carbs || 0) * (multiplier * 10);
      totalFat += (ing.fats || 0) * (multiplier * 10);
      totalKcal += (ing.calories || 0) * (multiplier * 10);
      totalFiber += (ing.fiber || 0) * (multiplier * 10);

      return {
        ...ing,
        netWeight: nw,
        finalCost: template === CostTemplate.ECONOMIC ? finalCost : cost,
        savings: potentialSavings
      };
    });

    const cookedNetWeight = totalNetWeight * (1 - cookingLoss / 100);
    const costPerServing = totalCost / (servings || 1);
    const suggestedPrice = pricingStrategy === 'cost-margin' 
      ? costPerServing / (1 - (targetMargin / 100))
      : costPerServing * 3; // placeholder for other strategies

    return {
      processed,
      totalCost,
      totalGrossWeight,
      totalNetWeight,
      cookedNetWeight,
      costPerServing,
      suggestedPrice,
      totalPro,
      totalCarb,
      totalFat,
      totalKcal,
      totalFiber
    };
  }, [ingredients, template, servings, cookingLoss, targetMargin, pricingStrategy]);

  // --- HANDLERS ---
  const handleAddRow = () => {
    const newIng: CostIngredient = {
      id: Math.random().toString(36).substr(2, 9),
      name: '',
      quantity: 1,
      unit: 'kg',
      unitPrice: 0,
      currency: '€'
    };
    setIngredients([...ingredients, newIng]);
  };

  const updateIngredient = (id: string, updates: Partial<CostIngredient>) => {
    setIngredients(ingredients.map(ing => ing.id === id ? { ...ing, ...updates } : ing));
  };

  const removeIngredient = (id: string) => {
    setIngredients(ingredients.filter(ing => ing.id !== id));
  };

  const handleAutoImport = () => {
    if (clipboardItems.length === 0) return;
    const newItems = clipboardItems.map(p => {
      const base = BASE_INGREDIENTS.find(b => b.name === p.name);
      return {
        id: Math.random().toString(36).substr(2, 9),
        name: p.name,
        quantity: 1,
        unit: p.unit,
        unitPrice: p.price,
        currency: p.currency,
        protein: base?.protein || 0,
        carbs: base?.carbs || 0,
        fats: base?.fats || 0,
        calories: base?.calories || 0,
        fiber: 0,
        allergens: 'None',
        cheapestPrice: p.price * 0.9,
        cheapestSupplier: 'Bulk Market',
        currentSupplier: p.supplier,
        handlingLoss: 5,
        bulkDiscount: 0
      };
    });
    setIngredients([...ingredients, ...newItems]);
    setClipboardItems([]); // Clear after import
  };

  const handleGetAiAdvice = async () => {
    if (ingredients.length === 0) return;
    setIsAiLoading(true);
    try {
      let result;
      if (template === CostTemplate.NUTRITIONAL) result = await gemini.getNutritionalOptimization(ingredients);
      else result = await gemini.getEconomicOptimization(ingredients);
      setSuggestions(result);
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleSave = () => {
    if (!recipeName) return alert("Please enter a recipe name.");
    alert("Project saved successfully!");
  };

  const clearAll = () => {
    if (window.confirm("Clear all ingredients?")) {
      setIngredients([]);
      setSuggestions([]);
    }
  };

  // --- RENDER HELPERS ---

  return (
    <div className="flex h-screen animate-fade-in overflow-hidden">
      {/* MAIN CONTENT AREA */}
      <div className="flex-1 flex flex-col overflow-hidden bg-background-light dark:bg-background-dark">
        <header className="p-8 pb-4 shrink-0 border-b border-gray-100 dark:border-gray-800">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-6">
            <div className="flex flex-col">
              <h1 className="text-4xl font-black tracking-tight text-text-main dark:text-white uppercase leading-none">Food Cost</h1>
              <p className="text-text-muted text-sm mt-1">Calculate margins and professional menu pricing</p>
            </div>
            <div className="flex gap-2">
              <button onClick={handleSave} className="bg-green-600 text-white px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-green-700 shadow-lg shadow-green-500/20 transition-all flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px]">check</span> SAVE
              </button>
              <button className="bg-blue-600 text-white px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-blue-700 shadow-lg shadow-blue-500/20 transition-all flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px]">refresh</span> EDIT
              </button>
              <button className="bg-amber-500 text-black px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-amber-600 shadow-lg shadow-amber-500/20 transition-all flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px]">export_notes</span> EXPORT PDF
              </button>
            </div>
          </div>

          <div className="flex gap-2 p-1 bg-gray-100 dark:bg-white/5 rounded-2xl w-fit">
            {Object.values(CostTemplate).map(t => (
              <button 
                key={t}
                onClick={() => setTemplate(t)}
                className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                  template === t ? 'bg-primary text-black shadow-lg shadow-primary/20' : 'text-text-muted hover:text-text-main'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-8">
          <div className="max-w-[1400px] mx-auto flex flex-col gap-10 pb-20">
            
            {/* 1. METADATA SECTION */}
            <div className="bg-white dark:bg-surface-dark rounded-3xl border border-gray-100 dark:border-gray-800 p-8 shadow-sm space-y-6">
              <input 
                className="w-full text-3xl font-black uppercase tracking-tight bg-transparent border-none focus:ring-0 p-0 placeholder:text-gray-200"
                placeholder="E.G., CHICKEN PARMESAN"
                value={recipeName}
                onChange={e => setRecipeName(e.target.value)}
              />
              <div className="flex items-center justify-between border-t border-gray-50 dark:border-gray-800 pt-6">
                <div className="flex items-center gap-6">
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-black uppercase tracking-widest text-text-muted">Portions</label>
                    <div className="flex items-center gap-2">
                      <button onClick={() => setServings(Math.max(1, servings - 1))} className="size-8 rounded-lg bg-gray-100 dark:bg-white/5 flex items-center justify-center font-black">-</button>
                      <input type="number" className="w-12 h-8 bg-transparent border-none text-center font-black text-lg p-0" value={servings} onChange={e => setServings(parseInt(e.target.value) || 1)} />
                      <button onClick={() => setServings(servings + 1)} className="size-8 rounded-lg bg-gray-100 dark:bg-white/5 flex items-center justify-center font-black">+</button>
                    </div>
                  </div>
                  
                  {template === CostTemplate.RESTAURANT && (
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-black uppercase tracking-widest text-text-muted">Classification</label>
                      <select className="h-8 bg-gray-50 dark:bg-black/20 border-none rounded-lg px-2 text-xs font-bold" value={classification} onChange={e => setClassification(e.target.value)}>
                        <option>Appetizer</option><option>Main</option><option>Side</option><option>Dessert</option><option>Sauce</option>
                      </select>
                    </div>
                  )}

                  {template === CostTemplate.ECONOMIC && (
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-black uppercase tracking-widest text-text-muted">Desired Margin (%)</label>
                      <input type="number" className="w-20 h-8 bg-gray-50 dark:bg-black/20 border-none rounded-lg text-center font-black text-xs" value={targetMargin} onChange={e => setTargetMargin(parseInt(e.target.value) || 0)} />
                    </div>
                  )}
                </div>
                <button onClick={clearAll} className="text-[10px] font-black uppercase tracking-widest text-red-500 hover:underline">Clear All</button>
              </div>
            </div>

            {/* 2. OPTIONS & CONTROLS (TEMPLATE SPECIFIC) */}
            {template === CostTemplate.RESTAURANT && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="bg-white dark:bg-surface-dark p-6 rounded-2xl border border-gray-100 dark:border-gray-800 space-y-4">
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-primary">Cooking Loss Settings</h4>
                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-1">
                      <label className="text-[9px] font-bold text-text-muted uppercase">Global Cooking Loss %</label>
                      <input type="number" className="w-full h-10 bg-gray-50 dark:bg-black/20 border-none rounded-xl px-3 font-mono text-sm" value={cookingLoss} onChange={e => setCookingLoss(parseInt(e.target.value) || 0)} />
                    </div>
                    <div className="flex items-center text-[10px] text-text-muted italic leading-tight">
                      Tip: Meat 15-25%, Fish 20-30%, Vegetables 5%
                    </div>
                  </div>
                </div>
                <div className="bg-white dark:bg-surface-dark p-6 rounded-2xl border border-gray-100 dark:border-gray-800 space-y-4">
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-primary">Base Elaborations Linked</h4>
                  <div className="flex items-center gap-4">
                    <div className="flex-1 text-[11px] font-bold opacity-40">No bases linked to this recipe yet.</div>
                    <button className="text-[10px] font-black uppercase text-primary hover:underline">+ Add Base</button>
                  </div>
                </div>
              </div>
            )}

            {template === CostTemplate.NUTRITIONAL && (
              <div className="bg-white dark:bg-surface-dark p-8 rounded-2xl border border-gray-100 dark:border-gray-800 space-y-6">
                <h4 className="text-[10px] font-black uppercase tracking-widest text-primary">Nutritional Goals (Optional)</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold text-text-muted uppercase">Target Protein (g)</label>
                    <input className="w-full h-10 bg-gray-50 dark:bg-black/20 border-none rounded-xl px-3 text-sm" value={targetProtein} onChange={e => setTargetProtein(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold text-text-muted uppercase">Target Calories</label>
                    <input className="w-full h-10 bg-gray-50 dark:bg-black/20 border-none rounded-xl px-3 text-sm" value={targetCalories} onChange={e => setTargetCalories(e.target.value)} />
                  </div>
                  <div className="md:col-span-2 space-y-1">
                    <label className="text-[9px] font-bold text-text-muted uppercase">Dietary Classification</label>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {['Vegan', 'Keto', 'Gluten-Free', 'Low-Carb'].map(tag => (
                        <button key={tag} className="px-3 py-1 bg-primary/10 border border-primary/20 text-primary text-[9px] font-black uppercase rounded-lg hover:bg-primary hover:text-black transition-all">{tag}</button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {template === CostTemplate.ECONOMIC && (
              <div className="bg-white dark:bg-surface-dark p-8 rounded-2xl border border-gray-100 dark:border-gray-800 space-y-6">
                <h4 className="text-[10px] font-black uppercase tracking-widest text-primary">Selling Strategy</h4>
                <div className="flex gap-8">
                  <label className="flex items-center gap-2 cursor-pointer group">
                    <input type="radio" name="strategy" checked={pricingStrategy === 'cost-margin'} onChange={() => setPricingStrategy('cost-margin')} className="text-primary focus:ring-primary" />
                    <span className="text-xs font-bold group-hover:text-primary transition-colors">Cost + Margin</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer group opacity-50">
                    <input type="radio" name="strategy" checked={pricingStrategy === 'market'} onChange={() => setPricingStrategy('market')} className="text-primary focus:ring-primary" />
                    <span className="text-xs font-bold group-hover:text-primary transition-colors">Market Price</span>
                  </label>
                </div>
              </div>
            )}

            {/* 3. ACTION BUTTONS */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <button onClick={handleAddRow} className="bg-primary text-black py-4 rounded-2xl font-black uppercase tracking-widest text-xs shadow-lg shadow-primary/20 hover:scale-[1.02] transition-all flex items-center justify-center gap-2">
                <span className="material-symbols-outlined">add_circle</span> Add Ingredient
              </button>
              <button className="bg-gray-100 dark:bg-white/5 text-text-muted py-4 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-gray-200 transition-all flex items-center justify-center gap-2">
                <span className="material-symbols-outlined">content_paste</span> From Price Tracker
              </button>
              {(template === CostTemplate.NUTRITIONAL || template === CostTemplate.ECONOMIC) && (
                <button onClick={handleGetAiAdvice} className="bg-black text-white py-4 rounded-2xl font-black uppercase tracking-widest text-xs flex items-center justify-center gap-2">
                  <span className="material-symbols-outlined text-primary">auto_awesome</span> {isAiLoading ? 'Analyzing...' : 'Get AI Recs'}
                </button>
              )}
            </div>

            {/* 4. SUMMARY CARDS */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
              <div className="bg-white dark:bg-surface-dark p-6 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm flex flex-col justify-between h-32">
                <span className="text-[10px] font-black uppercase tracking-widest text-text-muted">Total Recipe Cost</span>
                <span className="text-3xl font-black">€{totals.totalCost.toFixed(2)}</span>
              </div>
              <div className="bg-white dark:bg-surface-dark p-6 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm flex flex-col justify-between h-32">
                <span className="text-[10px] font-black uppercase tracking-widest text-text-muted">Cost Per Serving</span>
                <span className="text-3xl font-black text-primary">€{totals.costPerServing.toFixed(2)}</span>
              </div>
              
              {template === CostTemplate.NUTRITIONAL ? (
                <>
                  <div className="bg-white dark:bg-surface-dark p-6 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm flex flex-col justify-between h-32">
                    <span className="text-[10px] font-black uppercase tracking-widest text-text-muted">Protein (Serving)</span>
                    <span className="text-3xl font-black">{(totals.totalPro / servings).toFixed(1)}g</span>
                  </div>
                  <div className="bg-white dark:bg-surface-dark p-6 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm flex flex-col justify-between h-32">
                    <span className="text-[10px] font-black uppercase tracking-widest text-text-muted">Calories (Serving)</span>
                    <span className="text-3xl font-black">{(totals.totalKcal / servings).toFixed(0)} kcal</span>
                  </div>
                </>
              ) : template === CostTemplate.ECONOMIC ? (
                <>
                  <div className="bg-primary text-black p-6 rounded-2xl shadow-sm flex flex-col justify-between h-32">
                    <span className="text-[10px] font-black uppercase tracking-widest opacity-50">Suggested Price</span>
                    <span className="text-3xl font-black">€{totals.suggestedPrice.toFixed(2)}</span>
                  </div>
                  <div className="bg-green-600 text-white p-6 rounded-2xl shadow-sm flex flex-col justify-between h-32">
                    <span className="text-[10px] font-black uppercase tracking-widest opacity-60">Profit / Serving</span>
                    <span className="text-3xl font-black">€{(totals.suggestedPrice - totals.costPerServing).toFixed(2)}</span>
                  </div>
                </>
              ) : (
                <>
                  <div className="bg-white dark:bg-surface-dark p-6 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm flex flex-col justify-between h-32">
                    <span className="text-[10px] font-black uppercase tracking-widest text-text-muted">Net Yield</span>
                    <span className="text-3xl font-black">{totals.cookedNetWeight.toFixed(2)} kg</span>
                  </div>
                  <div className="bg-white dark:bg-surface-dark p-6 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm flex flex-col justify-between h-32">
                    <span className="text-[10px] font-black uppercase tracking-widest text-text-muted">Rev. Status</span>
                    <span className="text-sm font-black uppercase tracking-widest text-green-500">Verified</span>
                  </div>
                </>
              )}
            </div>

            {/* 5. INGREDIENTS TABLE (FULL WIDTH) */}
            <div className="bg-white dark:bg-surface-dark rounded-3xl border border-gray-100 dark:border-gray-800 shadow-xl overflow-hidden">
               <div className="p-6 border-b border-gray-50 dark:border-gray-800">
                  <h3 className="text-xs font-black uppercase tracking-[0.2em]">Ingredients Matrix</h3>
               </div>
               <div className="overflow-x-auto">
                 {/* 
                    Column layout strategies to prevent horizontal scroll:
                    Using explicit widths or grid-cols to ensure visibility.
                 */}
                  <table className="w-full text-left border-collapse table-fixed">
                    <thead className="bg-gray-50 dark:bg-white/5 border-b border-gray-100 dark:border-gray-800">
                      <tr className="text-[10px] font-black uppercase tracking-widest text-text-muted">
                        {template === CostTemplate.BASIC && (
                          <>
                            <th className="p-4 w-[40%]">Ingredient</th>
                            <th className="p-4 w-[12%] text-center">Qty</th>
                            <th className="p-4 w-[12%] text-center">Unit</th>
                            <th className="p-4 w-[14%] text-right">Unit $</th>
                            <th className="p-4 w-[14%] text-right">Total $</th>
                            <th className="p-4 w-[8%] text-center"></th>
                          </>
                        )}
                        {template === CostTemplate.RESTAURANT && (
                          <>
                            <th className="p-4 w-[4%] text-center">#</th>
                            <th className="p-4 w-[22%]">Name</th>
                            <th className="p-4 w-[12%] text-center">GW</th>
                            <th className="p-4 w-[10%] text-center">HL%</th>
                            <th className="p-4 w-[10%] text-center">NW</th>
                            <th className="p-4 w-[10%] text-right">PR</th>
                            <th className="p-4 w-[10%] text-right">Cost</th>
                            <th className="p-4 w-[10%] text-center">%TC</th>
                            <th className="p-4 w-[10%] text-center"></th>
                          </>
                        )}
                        {template === CostTemplate.NUTRITIONAL && (
                          <>
                            <th className="p-4 w-[20%]">Ingredient</th>
                            <th className="p-4 w-[10%] text-center">Qty</th>
                            <th className="p-4 w-[8%] text-center">Unit</th>
                            <th className="p-4 w-[10%] text-right">Price</th>
                            <th className="p-4 w-[10%] text-center">Pro</th>
                            <th className="p-4 w-[10%] text-center">Carb</th>
                            <th className="p-4 w-[10%] text-center">Fat</th>
                            <th className="p-4 w-[10%] text-center">Cal</th>
                            <th className="p-4 w-[12%] text-center"></th>
                          </>
                        )}
                        {template === CostTemplate.ECONOMIC && (
                          <>
                            <th className="p-4 w-[18%]">Ingredient</th>
                            <th className="p-4 w-[10%] text-center">Qty</th>
                            <th className="p-4 w-[18%]">Supplier</th>
                            <th className="p-4 w-[12%] text-right">U.Price</th>
                            <th className="p-4 w-[12%] text-center">Disc%</th>
                            <th className="p-4 w-[12%] text-right">Final</th>
                            <th className="p-4 w-[18%] text-center"></th>
                          </>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                      {totals.processed.map((ing, idx) => (
                        <tr key={ing.id} className="hover:bg-primary/5 transition-colors group">
                          {template === CostTemplate.BASIC && (
                            <>
                              <td className="p-4"><input className="w-full bg-transparent border-none font-bold text-sm focus:ring-0" value={ing.name} onChange={e => updateIngredient(ing.id, {name: e.target.value})} /></td>
                              <td className="p-4"><input type="number" className="w-full bg-gray-50 dark:bg-black/20 border-none rounded-lg text-center text-sm font-bold" value={ing.quantity} onChange={e => updateIngredient(ing.id, {quantity: parseFloat(e.target.value) || 0})} /></td>
                              <td className="p-4 text-center">
                                <select className="bg-transparent border-none text-[10px] font-black uppercase" value={ing.unit} onChange={e => updateIngredient(ing.id, {unit: e.target.value})}>
                                  <option>kg</option><option>g</option><option>L</option><option>ml</option><option>unit</option>
                                </select>
                              </td>
                              <td className="p-4 text-right"><input type="number" className="w-full bg-transparent border-none text-right font-mono text-sm" value={ing.unitPrice} onChange={e => updateIngredient(ing.id, {unitPrice: parseFloat(e.target.value) || 0})} /></td>
                              <td className="p-4 text-right font-black text-sm">€{ing.finalCost?.toFixed(2)}</td>
                              <td className="p-4 text-center"><button onClick={() => removeIngredient(ing.id)} className="text-gray-300 hover:text-red-500"><span className="material-symbols-outlined text-[18px]">close</span></button></td>
                            </>
                          )}
                          {template === CostTemplate.RESTAURANT && (
                            <>
                              <td className="p-4 text-center text-[10px] opacity-40 font-mono">{idx + 1}</td>
                              <td className="p-4"><input className="w-full bg-transparent border-none font-bold text-sm focus:ring-0" value={ing.name} onChange={e => updateIngredient(ing.id, {name: e.target.value})} /></td>
                              <td className="p-4"><input type="number" className="w-full bg-gray-50 dark:bg-black/20 border-none rounded-lg text-center text-sm font-bold" value={ing.quantity} onChange={e => updateIngredient(ing.id, {quantity: parseFloat(e.target.value) || 0})} /></td>
                              <td className="p-4 text-center"><input type="number" className="w-full bg-transparent border-none text-center text-xs" value={ing.handlingLoss || 0} onChange={e => updateIngredient(ing.id, {handlingLoss: parseFloat(e.target.value) || 0})} /></td>
                              <td className="p-4 text-center text-xs font-mono opacity-60">{ing.netWeight?.toFixed(2)}</td>
                              <td className="p-4 text-right font-mono text-xs">€{ing.unitPrice.toFixed(2)}</td>
                              <td className="p-4 text-right font-black text-sm">€{ing.finalCost?.toFixed(2)}</td>
                              <td className="p-4 text-center text-[10px] font-black opacity-40">{((ing.finalCost || 0) / (totals.totalCost || 1) * 100).toFixed(1)}%</td>
                              <td className="p-4 text-center"><button onClick={() => removeIngredient(ing.id)} className="text-gray-300 hover:text-red-500"><span className="material-symbols-outlined text-[18px]">close</span></button></td>
                            </>
                          )}
                          {template === CostTemplate.NUTRITIONAL && (
                            <>
                              <td className="p-4"><input className="w-full bg-transparent border-none font-bold text-sm focus:ring-0" value={ing.name} onChange={e => updateIngredient(ing.id, {name: e.target.value})} /></td>
                              <td className="p-4"><input type="number" className="w-full bg-gray-50 dark:bg-black/20 border-none rounded-lg text-center text-sm font-bold" value={ing.quantity} onChange={e => updateIngredient(ing.id, {quantity: parseFloat(e.target.value) || 0})} /></td>
                              <td className="p-4 text-center text-[10px] uppercase font-black">{ing.unit}</td>
                              <td className="p-4 text-right font-mono text-xs">€{ing.unitPrice.toFixed(2)}</td>
                              <td className="p-4 text-center text-xs font-mono">{ing.protein}g</td>
                              <td className="p-4 text-center text-xs font-mono">{ing.carbs}g</td>
                              <td className="p-4 text-center text-xs font-mono">{ing.fats}g</td>
                              <td className="p-4 text-center text-xs font-mono">{ing.calories}</td>
                              <td className="p-4 text-center"><button onClick={() => removeIngredient(ing.id)} className="text-gray-300 hover:text-red-500"><span className="material-symbols-outlined text-[18px]">close</span></button></td>
                            </>
                          )}
                          {template === CostTemplate.ECONOMIC && (
                            <>
                              <td className="p-4"><input className="w-full bg-transparent border-none font-bold text-sm focus:ring-0" value={ing.name} onChange={e => updateIngredient(ing.id, {name: e.target.value})} /></td>
                              <td className="p-4"><input type="number" className="w-full bg-gray-50 dark:bg-black/20 border-none rounded-lg text-center text-sm font-bold" value={ing.quantity} onChange={e => updateIngredient(ing.id, {quantity: parseFloat(e.target.value) || 0})} /></td>
                              <td className="p-4 text-xs font-bold text-text-muted">{ing.currentSupplier}</td>
                              <td className="p-4 text-right font-mono text-xs">€{ing.unitPrice.toFixed(2)}</td>
                              <td className="p-4 text-center"><input type="number" className="w-12 bg-gray-50 dark:bg-black/20 border-none rounded-lg text-center text-xs" value={ing.bulkDiscount || 0} onChange={e => updateIngredient(ing.id, {bulkDiscount: parseInt(e.target.value) || 0})} /></td>
                              <td className="p-4 text-right font-black text-sm">€{ing.finalCost?.toFixed(2)}</td>
                              <td className="p-4 text-center"><button onClick={() => removeIngredient(ing.id)} className="text-gray-300 hover:text-red-500"><span className="material-symbols-outlined text-[18px]">close</span></button></td>
                            </>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
               </div>
            </div>

            {/* 6. CALCULATION RESULTS & AI RECOMMENDATIONS */}
            {suggestions.length > 0 && (
              <div className="bg-gradient-to-br from-primary/10 to-primary/5 rounded-3xl p-8 border border-primary/20 space-y-6">
                <h4 className="text-xl font-black flex items-center gap-2"><span className="material-symbols-outlined text-primary">auto_awesome</span> Optimization Opportunities</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                   {suggestions.map((s, idx) => (
                      <div key={idx} className="bg-white dark:bg-surface-dark p-6 rounded-2xl shadow-sm border border-primary/10 space-y-3 group hover:border-primary transition-all">
                         <div className="flex justify-between items-start">
                            <span className="text-[10px] font-black uppercase tracking-widest text-primary">{s.title}</span>
                            <span className="material-symbols-outlined text-green-500 opacity-0 group-hover:opacity-100 transition-opacity">bolt</span>
                         </div>
                         <p className="text-xs leading-relaxed">{s.impact}</p>
                         <div className="flex justify-end pt-2">
                            <button className="text-[10px] font-black uppercase text-green-600 hover:underline">Apply Recommendation</button>
                         </div>
                      </div>
                   ))}
                </div>
              </div>
            )}
          </div>
        </main>
      </div>

      {/* RIGHT SIDEBAR: CLIPBOARD PANEL (SAME AS PRICE TRACKER) */}
      <aside className={`${isClipboardOpen ? 'w-80' : 'w-12'} bg-surface-light dark:bg-surface-dark border-l border-gray-200 dark:border-[#3b362a] flex flex-col h-full shrink-0 transition-all duration-300 z-30 shadow-2xl relative`}>
        {isClipboardOpen ? (
          <>
            <div className="p-6 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-primary">add_shopping_cart</span>
                <h2 className="text-sm font-black uppercase tracking-widest">🔀 Transfer Buffer</h2>
              </div>
              <button onClick={() => setIsClipboardOpen(false)} className="text-text-muted hover:text-text-main">
                <span className="material-symbols-outlined">chevron_right</span>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-8">
               <div className="space-y-1">
                  <span className="text-[10px] font-black uppercase tracking-widest text-text-muted">Selection Status</span>
                  <div className="p-4 bg-primary/5 rounded-2xl border border-primary/20 text-center">
                    <p className="text-3xl font-black">{clipboardItems.length} Items</p>
                    <p className="text-[9px] text-text-muted font-bold uppercase mt-1">Ready for transfer</p>
                  </div>
               </div>
               
               <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-[10px] font-black uppercase tracking-widest text-text-muted">Available from Tracker</h4>
                    <button className="text-[9px] font-black text-primary hover:underline uppercase">Sync All</button>
                  </div>
                  <div className="space-y-3">
                     {clipboardItems.map(p => (
                       <div key={p.id} className="p-4 bg-gray-50 dark:bg-white/5 rounded-2xl border border-gray-100 dark:border-gray-800 flex flex-col gap-1 hover:border-primary/50 cursor-pointer group transition-all">
                          <div className="flex justify-between items-start">
                             <span className="text-xs font-black">{p.name}</span>
                             <button onClick={(e) => { e.stopPropagation(); setClipboardItems(c => c.filter(i => i.id !== p.id)); }} className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
                                <span className="material-symbols-outlined text-[14px]">close</span>
                             </button>
                          </div>
                          <span className="text-[11px] text-text-muted uppercase font-bold tracking-tight">{p.price} {p.currency} / {p.unit}</span>
                          <span className="text-[9px] text-primary font-black uppercase opacity-60 mt-1">Selected in Price Tracker</span>
                       </div>
                     ))}
                     {clipboardItems.length === 0 && (
                        <div className="py-20 flex flex-col items-center justify-center text-center opacity-30 gap-4 grayscale">
                          <span className="material-symbols-outlined text-4xl">inventory_2</span>
                          <div className="flex flex-col gap-1">
                            <p className="text-[10px] font-black uppercase tracking-widest">No ingredients selected</p>
                            <p className="text-[9px]">Go to Price Tracker to add items.</p>
                          </div>
                        </div>
                     )}
                  </div>
               </div>
            </div>
            <div className="p-6 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-black/20">
               <button 
                onClick={handleAutoImport}
                disabled={clipboardItems.length === 0}
                className="w-full bg-primary text-black py-5 rounded-2xl font-black uppercase tracking-widest text-xs shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-30 disabled:grayscale"
               >
                 <span className="material-symbols-outlined">auto_fix_high</span> AUTO-IMPORT ALL
               </button>
            </div>
          </>
        ) : (
          <button 
            onClick={() => setIsClipboardOpen(true)}
            className="w-12 bg-surface-light dark:bg-surface-dark border-l border-gray-200 dark:border-[#3b362a] flex flex-col items-center py-8 gap-12 group"
          >
            <span className="material-symbols-outlined text-text-muted group-hover:text-primary transition-colors">chevron_left</span>
            <div className="rotate-90 origin-center whitespace-nowrap">
              <span className="text-[10px] font-black uppercase tracking-[0.3em] text-text-muted group-hover:text-primary transition-colors">Transfer Buffer ({clipboardItems.length})</span>
            </div>
          </button>
        )}
      </aside>
    </div>
  );
};
