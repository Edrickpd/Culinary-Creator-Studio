import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useAppContext } from '../AppContext';
import { CostIngredient, CostTemplate, ClipboardItem } from '../types';
import { EU_ALLERGENS } from '../constants';
import { supabase } from '../supabaseClient';

interface BaseSheet {
  id: string;
  name: string;
  ingredients: CostIngredient[];
}

// Convert any ingredient quantity to standardized kilograms (kg)
const convertToKg = (qty: number, unit: string): number => {
  const normalizedUnit = (unit || 'kg').trim().toLowerCase();
  switch (normalizedUnit) {
    case 'kg':
    case 'l': // Assuming 1L ≈ 1kg for density
      return qty;
    case 'g':
    case 'ml':
      return qty / 1000;
    case 'oz':
      return qty * 0.0283495;
    case 'lb':
      return qty * 0.453592;
    case 'unit':
    case 'portion':
    default:
      return qty;
  }
};

const getInitialFoodCostDraft = () => {
  try {
    const raw = sessionStorage.getItem('ccs_active_food_cost_draft');
    if (raw) return JSON.parse(raw);
  } catch (_) {}
  return null;
};

const CURRENCY_OPTIONS = [
  { symbol: '€', label: 'EUR (€)' },
  { symbol: '$', label: 'USD ($)' },
  { symbol: '£', label: 'GBP (£)' },
  { symbol: '¥', label: 'JPY (¥)' },
  { symbol: 'MXN$', label: 'MXN ($)' },
  { symbol: 'CAD$', label: 'CAD ($)' },
  { symbol: 'CHF', label: 'CHF (Fr)' },
  { symbol: 'R$', label: 'BRL (R$)' }
];

export const FoodCost = () => {
  const {
    user,
    clipboard,
    currency,
    setCurrency,
    t,
    updateClipboardQuantity,
    removeFromClipboard,
    duplicateClipboardItem,
    clearClipboard,
    isClipboardExpanded,
    setIsClipboardExpanded
  } = useAppContext();

  // --- STATE ---
  const initialDraft = useMemo(() => getInitialFoodCostDraft(), []);

  const [currentFoodCostId, setCurrentFoodCostId] = useState<string | null>(() => initialDraft?.currentFoodCostId ?? null);
  const [recipeName, setRecipeName] = useState<string>(() => initialDraft?.recipeName ?? '');
  const [servings, setServings] = useState<number>(() => Number(initialDraft?.servings) || 4);
  const [basePortionsRef, setBasePortionsRef] = useState<number>(() => Number(initialDraft?.servings) || 4);
  const [targetFoodCostPct, setTargetFoodCostPct] = useState<number>(() => Number(initialDraft?.targetFoodCostPct) || 30);
  const [taxPct, setTaxPct] = useState<number>(() => Number(initialDraft?.taxPct) || 10);
  const [selectedAllergens, setSelectedAllergens] = useState<string[]>(() => Array.isArray(initialDraft?.selectedAllergens) ? initialDraft.selectedAllergens : []);
  const [isAllergenDropdownOpen, setIsAllergenDropdownOpen] = useState(false);
  const [isCurrencyDropdownOpen, setIsCurrencyDropdownOpen] = useState(false);
  const [isScalerModalOpen, setIsScalerModalOpen] = useState(false);
  const [showConfirmClean, setShowConfirmClean] = useState(false);

  // Active sheet selection: 'final' or baseSheetId
  const [activeSheetId, setActiveSheetId] = useState<string>(() => initialDraft?.activeSheetId ?? 'final');

  // Ingredients for Final Sheet
  const [finalIngredients, setFinalIngredients] = useState<CostIngredient[]>(() => Array.isArray(initialDraft?.finalIngredients) ? initialDraft.finalIngredients : []);

  // Base Sheets (Sub-recipes / Elaborations)
  const [baseSheets, setBaseSheets] = useState<BaseSheet[]>(() => Array.isArray(initialDraft?.baseSheets) ? initialDraft.baseSheets : []);

  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const [searchParams] = useSearchParams();
  const lastLoadedIdRef = useRef<string | null>(initialDraft?.currentFoodCostId ?? null);

  // Auto-import buffer if navigated from external
  useEffect(() => {
    try {
      const buffer = localStorage.getItem('ccs_transfer_buffer');
      if (buffer) {
        const parsed = JSON.parse(buffer);
        if (Array.isArray(parsed) && parsed.length > 0) {
          importItemsToCurrentSheet(parsed);
          localStorage.removeItem('ccs_transfer_buffer');
        }
      }
    } catch (e) {
      console.warn('Error reading transfer buffer:', e);
    }
  }, []);

  // Load specific food cost from URL query params (?id=...)
  useEffect(() => {
    const costId = searchParams.get('id');
    if (costId && user && costId !== lastLoadedIdRef.current) {
      lastLoadedIdRef.current = costId;
      loadSpecificFoodCost(costId);
    }
  }, [searchParams, user]);

  // Sync ongoing working state to session storage
  useEffect(() => {
    try {
      const stateToPersist = {
        currentFoodCostId,
        recipeName,
        servings,
        targetFoodCostPct,
        taxPct,
        selectedAllergens,
        finalIngredients,
        baseSheets,
        activeSheetId
      };
      sessionStorage.setItem('ccs_active_food_cost_draft', JSON.stringify(stateToPersist));
    } catch (_) {}
  }, [currentFoodCostId, recipeName, servings, targetFoodCostPct, taxPct, selectedAllergens, finalIngredients, baseSheets, activeSheetId]);

  const loadSpecificFoodCost = async (id: string) => {
    if (!id || !user) return;
    try {
      const { data, error } = await supabase.from('food_costs').select('*').eq('id', id).maybeSingle();
      if (error) {
        console.error("Error loading food cost:", error);
        return;
      }
      if (data) {
        setCurrentFoodCostId(data.id);

        let sheetData: any = {};
        if (data.ingredients && typeof data.ingredients === 'object' && !Array.isArray(data.ingredients)) {
          sheetData = data.ingredients;
        } else if (data.data && typeof data.data === 'object' && !Array.isArray(data.data)) {
          sheetData = data.data;
        } else if (Array.isArray(data.ingredients)) {
          sheetData = { finalIngredients: data.ingredients };
        } else if (typeof data.ingredients === 'string') {
          try { sheetData = JSON.parse(data.ingredients); } catch (_) {}
        } else if (typeof data.data === 'string') {
          try { sheetData = JSON.parse(data.data); } catch (_) {}
        }

        const resolvedName = data.recipe_name || data.name || data.title || sheetData?.recipeName || sheetData?.recipe_name || sheetData?.title || sheetData?.name || 'Untitled Cost Sheet';
        setRecipeName(resolvedName);

        const loadedServings = Number(sheetData?.servings) || Number(data?.servings) || 4;
        setServings(loadedServings);
        setBasePortionsRef(loadedServings);

        if (sheetData?.targetFoodCostPct !== undefined && sheetData.targetFoodCostPct !== null) {
          setTargetFoodCostPct(Number(sheetData.targetFoodCostPct) || 30);
        }
        if (sheetData?.taxPct !== undefined && sheetData.taxPct !== null) {
          setTaxPct(Number(sheetData.taxPct) || 10);
        }
        if (Array.isArray(sheetData?.allergens)) {
          setSelectedAllergens(sheetData.allergens);
        }

        const loadedFinalIngredients = Array.isArray(sheetData?.finalIngredients)
          ? sheetData.finalIngredients
          : Array.isArray(sheetData?.ingredients)
            ? sheetData.ingredients
            : Array.isArray(sheetData?.items)
              ? sheetData.items
              : Array.isArray(data.ingredients)
                ? data.ingredients
                : [];
        setFinalIngredients(loadedFinalIngredients);

        const loadedBaseSheets = Array.isArray(sheetData?.baseSheets)
          ? sheetData.baseSheets
          : Array.isArray(sheetData?.subRecipes)
            ? sheetData.subRecipes
            : Array.isArray(sheetData?.bases)
              ? sheetData.bases
              : [];
        setBaseSheets(loadedBaseSheets);

        setActiveSheetId('final');
        setSaveMessage(`Loaded "${resolvedName}"`);
        setTimeout(() => setSaveMessage(null), 3000);
      }
    } catch (e) {
      console.error("Error loading food cost:", e);
    }
  };

  // --- CALCULATIONS ---
  const calculateSheetMetrics = (items: CostIngredient[]) => {
    let totalRaw = 0;
    let totalAdjusted = 0;
    let totalNetWeightKg = 0;

    const rows = items.map(ing => {
      const qty = Number(ing.quantity) || 0;
      const price = Number(ing.unitPrice) || 0;
      const wastePct = Math.min(99, Math.max(0, Number(ing.handlingLoss) || 0));

      const rawCost = qty * price;
      const yieldFactor = (100 - wastePct) / 100;
      const effectiveCost = yieldFactor > 0 ? rawCost / yieldFactor : rawCost;

      totalRaw += rawCost;
      totalAdjusted += effectiveCost;

      const rawWeightKg = convertToKg(qty, ing.unit);
      const netWeightKg = rawWeightKg * yieldFactor;
      totalNetWeightKg += netWeightKg;

      return {
        ...ing,
        rawCost,
        effectiveCost,
        wastePct,
        rawWeightKg,
        netWeightKg
      };
    });

    const safeNetWeightKg = totalNetWeightKg > 0 ? totalNetWeightKg : Math.max(0.001, items.reduce((acc, i) => acc + convertToKg(Number(i.quantity) || 0, i.unit), 0));
    const costPerKg = safeNetWeightKg > 0 ? totalAdjusted / safeNetWeightKg : totalAdjusted;

    return {
      rows,
      totalRaw,
      totalAdjusted,
      totalNetWeightKg: safeNetWeightKg,
      costPerKg
    };
  };

  const baseSheetsCalculated = useMemo(() => {
    return baseSheets.map(sheet => {
      const metrics = calculateSheetMetrics(sheet.ingredients);
      return {
        ...sheet,
        metrics
      };
    });
  }, [baseSheets]);

  const baseSheetsMap = useMemo(() => {
    const map = new Map<string, { name: string; costPerKg: number; totalCost: number; totalNetWeightKg: number }>();
    baseSheetsCalculated.forEach(bs => {
      map.set(bs.id, {
        name: bs.name,
        costPerKg: bs.metrics.costPerKg,
        totalCost: bs.metrics.totalAdjusted,
        totalNetWeightKg: bs.metrics.totalNetWeightKg
      });
    });
    return map;
  }, [baseSheetsCalculated]);

  const synchronizedFinalIngredients = useMemo(() => {
    return finalIngredients.map(ing => {
      if (ing.isBaseSheet && ing.baseSheetId) {
        const bsData = baseSheetsMap.get(ing.baseSheetId);
        if (bsData) {
          return {
            ...ing,
            name: bsData.name || ing.name,
            unit: 'kg',
            unitPrice: bsData.costPerKg
          };
        }
      }
      return ing;
    });
  }, [finalIngredients, baseSheetsMap]);

  const finalSheetMetrics = useMemo(() => {
    const directMetrics = calculateSheetMetrics(synchronizedFinalIngredients);

    const safeServings = Math.max(1, servings);
    const combinedTotalCost = directMetrics.totalAdjusted;
    const combinedRawCost = directMetrics.totalRaw;
    const totalRecipeWeightKg = directMetrics.totalNetWeightKg;

    const costPerServing = combinedTotalCost / safeServings;
    const costPerKg = totalRecipeWeightKg > 0 ? combinedTotalCost / totalRecipeWeightKg : 0;

    const targetFcDecimal = Math.max(1, Math.min(80, targetFoodCostPct)) / 100;
    const netSellingPrice = targetFcDecimal > 0 ? costPerServing / targetFcDecimal : 0;

    const taxMultiplier = 1 + (Math.max(0, taxPct) / 100);
    const recommendedPriceWithTax = netSellingPrice * taxMultiplier;

    const grossMarginPerServing = netSellingPrice - costPerServing;
    const grossMarginPct = netSellingPrice > 0 ? (grossMarginPerServing / netSellingPrice) * 100 : 0;

    return {
      directRows: directMetrics.rows,
      combinedRawCost,
      combinedTotalCost,
      totalRecipeWeightKg,
      costPerServing,
      costPerKg,
      netSellingPrice,
      recommendedPriceWithTax,
      grossMarginPerServing,
      grossMarginPct
    };
  }, [synchronizedFinalIngredients, servings, targetFoodCostPct, taxPct]);

  // --- BATCH SCALER LOGIC ---
  const handleScalePortions = (newPortions: number, scaleQuantities: boolean = false) => {
    const targetP = Math.max(1, newPortions);
    if (scaleQuantities && servings > 0) {
      const factor = targetP / servings;
      // Proportinally scale final ingredients quantities
      setFinalIngredients(prev =>
        prev.map(ing => ({
          ...ing,
          quantity: Number((ing.quantity * factor).toFixed(3))
        }))
      );
      // Scale base sheets ingredients
      setBaseSheets(prev =>
        prev.map(bs => ({
          ...bs,
          ingredients: bs.ingredients.map(ing => ({
            ...ing,
            quantity: Number((ing.quantity * factor).toFixed(3))
          }))
        }))
      );
      setSaveMessage(`Scaled batch & ingredients to ${targetP} portions (x${factor.toFixed(2)})`);
    } else {
      setSaveMessage(`Scaled portions to ${targetP} pax.`);
    }
    setServings(targetP);
    setIsScalerModalOpen(false);
    setTimeout(() => setSaveMessage(null), 3000);
  };

  // --- ACTIONS ON SHEETS ---
  const handleAddBaseSheet = () => {
    const newBaseId = `base_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const newBaseName = `${t('foodCost.baseSheet')} ${baseSheets.length + 1}`;
    
    const newBaseSheet: BaseSheet = {
      id: newBaseId,
      name: newBaseName,
      ingredients: []
    };
    
    setBaseSheets(prev => [...prev, newBaseSheet]);

    const newFinalRow: CostIngredient = {
      id: `bs_row_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      name: newBaseName,
      quantity: 1,
      unit: 'kg',
      unitPrice: 0,
      currency: currency || '€',
      handlingLoss: 0,
      isBaseSheet: true,
      baseSheetId: newBaseId
    };

    setFinalIngredients(prev => [...prev, newFinalRow]);
    setActiveSheetId(newBaseId);
  };

  const handleInsertBaseSheetToFinal = (sheetId: string) => {
    const bs = baseSheetsCalculated.find(s => s.id === sheetId);
    if (!bs) return;

    const newFinalRow: CostIngredient = {
      id: `bs_row_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      name: bs.name,
      quantity: 1,
      unit: 'kg',
      unitPrice: bs.metrics.costPerKg,
      currency: currency || '€',
      handlingLoss: 0,
      isBaseSheet: true,
      baseSheetId: bs.id
    };

    setFinalIngredients(prev => [...prev, newFinalRow]);
    setActiveSheetId('final');
    setSaveMessage(`Linked "${bs.name}" to Final Sheet.`);
    setTimeout(() => setSaveMessage(null), 3000);
  };

  const handleRemoveBaseSheet = (sheetId: string) => {
    setBaseSheets(prev => prev.filter(s => s.id !== sheetId));
    setFinalIngredients(prev => prev.filter(ing => ing.baseSheetId !== sheetId));
    if (activeSheetId === sheetId) {
      setActiveSheetId('final');
    }
  };

  const handleUpdateBaseSheet = (sheetId: string, updates: Partial<BaseSheet>) => {
    setBaseSheets(prev =>
      prev.map(s => (s.id === sheetId ? { ...s, ...updates } : s))
    );
  };

  const handleAddIngredientRow = () => {
    const newRow: CostIngredient = {
      id: `row_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      name: '',
      quantity: 1,
      unit: 'kg',
      unitPrice: 0,
      currency: currency || '€',
      handlingLoss: 0
    };

    if (activeSheetId === 'final') {
      setFinalIngredients(prev => [...prev, newRow]);
    } else {
      setBaseSheets(prev =>
        prev.map(s =>
          s.id === activeSheetId
            ? { ...s, ingredients: [...s.ingredients, newRow] }
            : s
        )
      );
    }
  };

  const handleUpdateIngredient = (rowId: string, updates: Partial<CostIngredient>) => {
    if (activeSheetId === 'final') {
      setFinalIngredients(prev =>
        prev.map(ing => (ing.id === rowId ? { ...ing, ...updates } : ing))
      );
    } else {
      setBaseSheets(prev =>
        prev.map(s => {
          if (s.id !== activeSheetId) return s;
          return {
            ...s,
            ingredients: s.ingredients.map(ing =>
              ing.id === rowId ? { ...ing, ...updates } : ing
            )
          };
        })
      );
    }
  };

  const handleRemoveIngredient = (rowId: string) => {
    if (activeSheetId === 'final') {
      setFinalIngredients(prev => prev.filter(ing => ing.id !== rowId));
    } else {
      setBaseSheets(prev =>
        prev.map(s => {
          if (s.id !== activeSheetId) return s;
          return {
            ...s,
            ingredients: s.ingredients.filter(ing => ing.id !== rowId)
          };
        })
      );
    }
  };

  const importItemsToCurrentSheet = (itemsToImport: (ClipboardItem | CostIngredient)[]) => {
    if (!itemsToImport || itemsToImport.length === 0) return;

    const newRows: CostIngredient[] = itemsToImport.map(item => ({
      id: `ing_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      name: item.name || 'New Ingredient',
      quantity: Number((item as any).quantity) || 1,
      unit: item.unit || 'kg',
      unitPrice: Number((item as any).price || (item as any).unitPrice || 0),
      currency: currency || '€',
      handlingLoss: (item as any).handlingLoss || 0
    }));

    if (activeSheetId === 'final') {
      setFinalIngredients(prev => [...prev, ...newRows]);
    } else {
      setBaseSheets(prev =>
        prev.map(s =>
          s.id === activeSheetId
            ? { ...s, ingredients: [...s.ingredients, ...newRows] }
            : s
        )
      );
    }

    itemsToImport.forEach(item => removeFromClipboard(item.id));

    const sheetName = activeSheetId === 'final' 
      ? t('foodCost.finalSheet') 
      : baseSheets.find(s => s.id === activeSheetId)?.name || t('foodCost.baseSheet');

    setSaveMessage(`Imported ${newRows.length} item(s) to "${sheetName}".`);
    setTimeout(() => setSaveMessage(null), 3000);
  };

  const handleAddSingleItemToFC = (item: ClipboardItem) => {
    importItemsToCurrentSheet([item]);
  };

  const handleResetEntireTemplate = () => {
    try {
      sessionStorage.removeItem('ccs_active_food_cost_draft');
      window.history.replaceState(null, '', '/food-cost');
    } catch (_) {}
    lastLoadedIdRef.current = null;
    setCurrentFoodCostId(null);
    setRecipeName('');
    setServings(4);
    setBasePortionsRef(4);
    setTargetFoodCostPct(30);
    setTaxPct(10);
    setSelectedAllergens([]);
    setFinalIngredients([]);
    setBaseSheets([]);
    setActiveSheetId('final');
    setShowConfirmClean(false);
    setSaveMessage('New blank sheet ready.');
    setTimeout(() => setSaveMessage(null), 3000);
  };

  const handleSaveRecipe = async () => {
    const cleanName = recipeName.trim();
    if (!cleanName) {
      alert('Please enter a recipe or dish name before saving.');
      return;
    }
    if (!user) {
      alert('Please log in to save your food cost calculations.');
      return;
    }

    setIsSaving(true);
    try {
      const calculationData = {
        recipeName: cleanName,
        recipe_name: cleanName,
        servings: Number(servings) || 4,
        allergens: selectedAllergens,
        targetFoodCostPct,
        taxPct,
        currency: currency || '€',
        finalIngredients,
        baseSheets,
        totals: {
          combinedTotalCost: finalSheetMetrics.combinedTotalCost,
          costPerServing: finalSheetMetrics.costPerServing,
          costPerKg: finalSheetMetrics.costPerKg,
          netSellingPrice: finalSheetMetrics.netSellingPrice,
          recommendedPriceWithTax: finalSheetMetrics.recommendedPriceWithTax,
          grossMarginPerServing: finalSheetMetrics.grossMarginPerServing,
          grossMarginPct: finalSheetMetrics.grossMarginPct
        }
      };

      const candidatePayloads: Record<string, any>[] = [
        {
          user_id: user.id,
          recipe_name: cleanName,
          template: CostTemplate.ADVANCED,
          servings: Number(servings) || 4,
          total_cost: Number(finalSheetMetrics.combinedTotalCost) || 0,
          cost_per_serving: Number(finalSheetMetrics.costPerServing) || 0,
          ingredients: calculationData,
          data: calculationData,
          updated_at: new Date().toISOString()
        },
        {
          user_id: user.id,
          recipe_name: cleanName,
          template: CostTemplate.ADVANCED,
          ingredients: calculationData,
          updated_at: new Date().toISOString()
        },
        {
          user_id: user.id,
          recipe_name: cleanName,
          ingredients: calculationData,
          data: calculationData,
          updated_at: new Date().toISOString()
        },
        {
          user_id: user.id,
          name: cleanName,
          ingredients: calculationData,
          updated_at: new Date().toISOString()
        }
      ];

      let savedRecord: any = null;
      let finalError: any = null;

      for (const rawPayload of candidatePayloads) {
        let currentPayload = { ...rawPayload };
        let attemptSuccess = false;

        for (let retry = 0; retry < 4; retry++) {
          try {
            if (currentFoodCostId) {
              const { data, error } = await supabase
                .from('food_costs')
                .update(currentPayload)
                .eq('id', currentFoodCostId)
                .eq('user_id', user.id)
                .select()
                .maybeSingle();

              if (!error && data) {
                savedRecord = data;
                attemptSuccess = true;
                break;
              }

              if (error) {
                const match = error.message?.match(/Could not find the '([^']+)' column/i);
                if (match && match[1] && currentPayload[match[1]] !== undefined) {
                  delete currentPayload[match[1]];
                  continue;
                }
                finalError = error;
                break;
              }

              if (!data) {
                const { data: insData, error: insError } = await supabase
                  .from('food_costs')
                  .insert([{ ...currentPayload, created_at: new Date().toISOString() }])
                  .select()
                  .maybeSingle();

                if (!insError && insData) {
                  savedRecord = insData;
                  attemptSuccess = true;
                  break;
                }
                if (insError) {
                  const match = insError.message?.match(/Could not find the '([^']+)' column/i);
                  if (match && match[1] && currentPayload[match[1]] !== undefined) {
                    delete currentPayload[match[1]];
                    continue;
                  }
                  finalError = insError;
                  break;
                }
              }
            } else {
              const { data, error } = await supabase
                .from('food_costs')
                .insert([{ ...currentPayload, created_at: new Date().toISOString() }])
                .select()
                .maybeSingle();

              if (!error && data) {
                savedRecord = data;
                attemptSuccess = true;
                break;
              }

              if (error) {
                const match = error.message?.match(/Could not find the '([^']+)' column/i);
                if (match && match[1] && currentPayload[match[1]] !== undefined) {
                  delete currentPayload[match[1]];
                  continue;
                }
                finalError = error;
                break;
              }
            }
          } catch (e: any) {
            finalError = e;
            break;
          }
        }

        if (attemptSuccess && savedRecord) {
          break;
        }
      }

      if (!savedRecord && finalError) {
        throw finalError;
      }

      if (savedRecord?.id) {
        setCurrentFoodCostId(savedRecord.id);
        lastLoadedIdRef.current = savedRecord.id;
        try {
          window.history.replaceState(null, '', `/food-cost?id=${savedRecord.id}`);
        } catch (_) {}
      }

      setRecipeName(cleanName);
      setSaveMessage(`"${cleanName}" saved successfully!`);
      setTimeout(() => setSaveMessage(null), 4000);
    } catch (err: any) {
      console.error('Error saving food cost:', err);
      setSaveMessage(err.message || 'Error saving to database.');
      setTimeout(() => setSaveMessage(null), 4000);
    } finally {
      setIsSaving(false);
    }
  };

  // --- PROFESSIONAL PDF EXPORT GENERATOR ---
  const exportTechnicalPDF = () => {
    try {
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });

      const curr = currency || '€';
      const cleanRecipeTitle = recipeName || 'Culinary Recipe Specification';

      // Header Banner
      doc.setFillColor(24, 24, 27); // Dark zinc #18181b
      doc.rect(0, 0, 210, 26, 'F');

      // Accent gold strip
      doc.setFillColor(224, 159, 62);
      doc.rect(0, 25, 210, 1.5, 'F');

      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.text('CULINARY CREATOR STUDIO', 14, 11);

      doc.setFontSize(8.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(200, 205, 215);
      doc.text(t('foodCost.pdfHeader') || 'TECHNICAL FOOD COST SPECIFICATION', 14, 17);

      doc.setFontSize(7.5);
      doc.setTextColor(160, 170, 185);
      doc.text(`Date: ${new Date().toLocaleDateString()}  •  Chef: ${user?.chefName || user?.fullName || 'Executive Kitchen'}`, 14, 22);

      // Recipe Title Box
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(14, 32, 182, 20, 2, 2, 'FD');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.setTextColor(15, 23, 42);
      doc.text(cleanRecipeTitle, 18, 41);

      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 116, 139);
      const allergenText = selectedAllergens.length > 0 ? selectedAllergens.join(', ') : 'None marked';
      doc.text(`Portions: ${servings} pax  |  Target FC: ${targetFoodCostPct}%  |  Currency: ${curr}  |  Allergens: ${allergenText}`, 18, 47);

      // Financial KPI Summary Table
      const kpiData = [
        [
          `${curr}${finalSheetMetrics.combinedTotalCost.toFixed(2)}`,
          `${curr}${finalSheetMetrics.costPerServing.toFixed(2)}`,
          `${curr}${finalSheetMetrics.costPerKg.toFixed(2)}`,
          `${targetFoodCostPct}%`,
          `${curr}${finalSheetMetrics.recommendedPriceWithTax.toFixed(2)}`,
          `${curr}${finalSheetMetrics.grossMarginPerServing.toFixed(2)} (${finalSheetMetrics.grossMarginPct.toFixed(1)}%)`
        ]
      ];

      autoTable(doc, {
        startY: 56,
        head: [['Total Batch Cost', 'Cost / Serving', 'Cost / Kg', 'Target FC %', 'Rec. Price (PVP)', 'Gross Margin / Pax']],
        body: kpiData,
        theme: 'grid',
        headStyles: {
          fillColor: [30, 41, 59],
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          fontSize: 7.5,
          halign: 'center'
        },
        bodyStyles: {
          fontSize: 8.5,
          fontStyle: 'bold',
          halign: 'center',
          textColor: [15, 23, 42]
        },
        margin: { left: 14, right: 14 }
      });

      let currentY = (doc as any).lastAutoTable.finalY + 8;

      // Sub-Recipes Table (if base sheets exist)
      if (baseSheetsCalculated.length > 0) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9.5);
        doc.setTextColor(30, 41, 59);
        doc.text(t('foodCost.pdfSubRecipesTitle') || 'SUB-RECIPES & BASE PREPARATIONS', 14, currentY);

        const subRecipeRows = baseSheetsCalculated.map((bs, index) => [
          `${index + 1}. ${bs.name}`,
          `${bs.ingredients.length} items`,
          `${bs.metrics.totalNetWeightKg.toFixed(3)} kg`,
          `${curr}${bs.metrics.totalAdjusted.toFixed(2)}`,
          `${curr}${bs.metrics.costPerKg.toFixed(2)} / kg`
        ]);

        autoTable(doc, {
          startY: currentY + 2.5,
          head: [['Sub-Recipe Name', 'Ingredients', 'Yield Net Weight', 'Batch Cost', 'Calculated Price / Kg']],
          body: subRecipeRows,
          theme: 'striped',
          headStyles: {
            fillColor: [71, 85, 105],
            textColor: [255, 255, 255],
            fontSize: 7.5,
            fontStyle: 'bold'
          },
          bodyStyles: { fontSize: 7.5 },
          margin: { left: 14, right: 14 }
        });

        currentY = (doc as any).lastAutoTable.finalY + 8;
      }

      // Final Dish Ingredients Table
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(30, 41, 59);
      doc.text(t('foodCost.pdfFinalIngredientsTitle') || 'RECIPE INGREDIENTS & COMPOSITION', 14, currentY);

      const ingredientsRows = finalSheetMetrics.directRows.map((ing, idx) => [
        (idx + 1).toString(),
        ing.isBaseSheet ? `[Sub-Recipe] ${ing.name}` : ing.name || 'Unnamed item',
        `${Number(ing.quantity).toFixed(2)}`,
        ing.unit || 'kg',
        `${curr}${Number(ing.unitPrice || 0).toFixed(2)}`,
        `${Number(ing.handlingLoss || 0).toFixed(0)}%`,
        `${curr}${Number(ing.effectiveCost || 0).toFixed(2)}`
      ]);

      autoTable(doc, {
        startY: currentY + 2.5,
        head: [['#', 'Ingredient / Elaboration', 'Quantity', 'Unit', 'Unit Price', 'Waste %', 'Real Cost']],
        body: ingredientsRows,
        theme: 'striped',
        headStyles: {
          fillColor: [30, 41, 59],
          textColor: [255, 255, 255],
          fontSize: 7.5,
          fontStyle: 'bold'
        },
        bodyStyles: { fontSize: 7.5 },
        columnStyles: {
          0: { halign: 'center', cellWidth: 10 },
          1: { cellWidth: 'auto' },
          2: { halign: 'center', cellWidth: 18 },
          3: { halign: 'center', cellWidth: 16 },
          4: { halign: 'right', cellWidth: 22 },
          5: { halign: 'center', cellWidth: 18 },
          6: { halign: 'right', cellWidth: 24, fontStyle: 'bold' }
        },
        margin: { left: 14, right: 14 },
        foot: [[
          '',
          'TOTAL FINAL DISH COST',
          '',
          '',
          '',
          '',
          `${curr}${finalSheetMetrics.combinedTotalCost.toFixed(2)}`
        ]],
        footStyles: {
          fillColor: [241, 245, 249],
          textColor: [15, 23, 42],
          fontStyle: 'bold',
          fontSize: 8
        }
      });

      // Footer
      const totalPages = doc.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setFontSize(7);
        doc.setTextColor(148, 163, 184);
        doc.text(
          `Culinary Creator Studio • Page ${i} of ${totalPages} • Confidential Technical Kitchen Specification`,
          14,
          290
        );
      }

      const safeFileName = (cleanRecipeTitle).replace(/[^a-zA-Z0-9_\-]/g, '_');
      doc.save(`${safeFileName}_Food_Cost_Specification.pdf`);
      setSaveMessage(`Exported PDF: "${safeFileName}.pdf"`);
      setTimeout(() => setSaveMessage(null), 3500);
    } catch (e: any) {
      console.error('Error generating PDF:', e);
      alert('Could not export PDF: ' + (e.message || e));
    }
  };

  const clipboardTotal = useMemo(() => {
    return clipboard.reduce((acc, item) => acc + (item.price * item.quantity), 0);
  }, [clipboard]);

  const activeSheetObj = activeSheetId === 'final' 
    ? null 
    : baseSheetsCalculated.find(s => s.id === activeSheetId);

  const activeSheetRows = activeSheetId === 'final'
    ? finalSheetMetrics.directRows
    : activeSheetObj?.metrics.rows || [];

  const unlinkedBaseSheets = useMemo(() => {
    const linkedIds = new Set(finalIngredients.filter(i => i.isBaseSheet).map(i => i.baseSheetId));
    return baseSheetsCalculated.filter(bs => !linkedIds.has(bs.id));
  }, [baseSheetsCalculated, finalIngredients]);

  const activeCurr = currency || '€';

  return (
    <div className="flex h-full animate-fade-in overflow-hidden relative">
      {/* --- MAIN WORKSHEET --- */}
      <div className="flex-1 overflow-y-auto p-4 lg:p-8 flex flex-col gap-6 scroll-smooth">
        <div className="max-w-[1400px] mx-auto w-full flex flex-col gap-6 pb-24">
          
          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div className="flex flex-col gap-1">
              <h1 className="text-2xl lg:text-4xl font-black tracking-tight text-text-main dark:text-white uppercase leading-none">
                {t('foodCost.title')}
              </h1>
              <p className="text-text-muted text-xs lg:text-sm">
                {t('foodCost.subtitle')}
              </p>
            </div>

            {/* Top Action Buttons */}
            <div className="flex items-center gap-2 flex-wrap">
              <button 
                onClick={handleResetEntireTemplate}
                className="h-11 px-3.5 rounded-xl border border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-white/5 text-text-main dark:text-white font-black text-xs uppercase tracking-wider transition-all flex items-center gap-2"
                title="Start a new blank food cost calculation"
              >
                <span className="material-symbols-outlined text-[18px]">add_circle</span>
                {t('foodCost.newSheet')}
              </button>

              <button 
                onClick={handleSaveRecipe}
                disabled={isSaving}
                className="h-11 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs uppercase tracking-wider transition-all shadow-sm flex items-center gap-2 disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-[18px]">
                  {isSaving ? 'sync' : 'save'}
                </span>
                {isSaving ? t('foodCost.saving') : t('foodCost.saveSheet')}
              </button>

              {/* Export Technical PDF (jsPDF) */}
              <button 
                onClick={exportTechnicalPDF}
                className="h-11 px-4 rounded-xl bg-primary text-black font-black text-xs uppercase tracking-wider transition-all flex items-center gap-2 hover:brightness-105 shadow-sm"
                title="Download Technical PDF Specification"
              >
                <span className="material-symbols-outlined text-[18px]">picture_as_pdf</span>
                {t('foodCost.exportPdf')}
              </button>

              {/* Trash / Clean Confirmation Action */}
              <div className="relative">
                <button 
                  onClick={() => setShowConfirmClean(!showConfirmClean)}
                  className="size-11 rounded-xl border border-gray-200 dark:border-gray-800 hover:bg-red-500/10 hover:text-red-500 hover:border-red-300 text-text-muted transition-all flex items-center justify-center"
                  title="Reset entire sheet"
                >
                  <span className="material-symbols-outlined text-[18px]">delete_sweep</span>
                </button>

                {showConfirmClean && (
                  <div className="absolute right-0 top-12 z-50 bg-white dark:bg-surface-dark p-4 rounded-2xl border border-red-200 dark:border-red-900/40 shadow-2xl w-64 space-y-3 animate-fade-in">
                    <div className="flex items-center gap-2 text-red-500">
                      <span className="material-symbols-outlined text-[20px]">warning</span>
                      <span className="text-xs font-black uppercase tracking-wider">{t('foodCost.resetTitle')}</span>
                    </div>
                    <p className="text-[11px] text-text-muted">
                      {t('foodCost.resetDesc')}
                    </p>
                    <div className="flex items-center gap-2 pt-1">
                      <button 
                        onClick={handleResetEntireTemplate}
                        className="flex-1 py-2 bg-red-500 hover:bg-red-600 text-white rounded-xl text-[10px] font-black uppercase tracking-wider shadow-sm transition-all"
                      >
                        {t('foodCost.confirmReset')}
                      </button>
                      <button 
                        onClick={() => setShowConfirmClean(false)}
                        className="px-3 py-2 border border-gray-200 dark:border-gray-800 rounded-xl text-[10px] font-bold text-text-muted hover:text-text-main"
                      >
                        {t('foodCost.cancel')}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Batch Scaler Button (Icon-only, to the right of reset sheet) */}
              <button 
                onClick={() => setIsScalerModalOpen(true)}
                className="size-11 rounded-xl border border-primary/40 bg-primary/10 hover:bg-primary hover:text-black text-primary font-black transition-all flex items-center justify-center shadow-sm"
                title={`${t('foodCost.scaleBatch')} (${servings} pax)`}
              >
                <span className="material-symbols-outlined text-[20px]">aspect_ratio</span>
              </button>
            </div>
          </div>

          {/* Batch Scaler Popup Modal */}
          {isScalerModalOpen && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[80] flex items-center justify-center p-4 animate-fade-in">
              <div className="bg-white dark:bg-surface-dark rounded-3xl border border-gray-200 dark:border-gray-800 p-6 max-w-md w-full shadow-2xl space-y-5">
                <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary text-2xl">aspect_ratio</span>
                    <h3 className="text-sm font-black uppercase tracking-wider text-text-main dark:text-white">
                      {t('foodCost.scaleBatch')}
                    </h3>
                  </div>
                  <button 
                    onClick={() => setIsScalerModalOpen(false)}
                    className="size-8 rounded-lg flex items-center justify-center text-text-muted hover:bg-gray-100 dark:hover:bg-white/5"
                  >
                    <span className="material-symbols-outlined text-[18px]">close</span>
                  </button>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-text-muted block mb-2">
                      Quick Multipliers (from base {basePortionsRef} pax):
                    </label>
                    <div className="grid grid-cols-4 gap-2">
                      {[0.5, 1, 2, 5, 10, 25, 50, 100].map(mult => {
                        const calculatedPortions = Math.max(1, Math.round(basePortionsRef * mult));
                        return (
                          <button
                            key={mult}
                            onClick={() => handleScalePortions(calculatedPortions, false)}
                            className={`py-2 px-1 rounded-xl text-xs font-black transition-all border ${
                              servings === calculatedPortions
                                ? 'bg-primary border-primary text-black'
                                : 'bg-gray-50 dark:bg-white/5 border-gray-200 dark:border-gray-800 text-text-main dark:text-white hover:border-primary'
                            }`}
                          >
                            {mult}x ({calculatedPortions}p)
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="space-y-2 pt-2 border-t border-gray-100 dark:border-gray-800">
                    <label className="text-[10px] font-black uppercase tracking-widest text-text-muted block">
                      {t('foodCost.customScale')}:
                    </label>
                    <div className="flex items-center gap-2">
                      <input 
                        type="number"
                        min="1"
                        value={servings}
                        onChange={(e) => setServings(Math.max(1, parseInt(e.target.value) || 1))}
                        className="flex-1 h-11 px-4 bg-gray-50 dark:bg-black/30 rounded-xl border border-gray-200 dark:border-gray-800 text-sm font-black font-mono focus:border-primary outline-none"
                      />
                      <button
                        onClick={() => handleScalePortions(servings, false)}
                        className="px-4 h-11 bg-primary text-black font-black text-xs uppercase rounded-xl hover:brightness-105"
                      >
                        Apply Portions
                      </button>
                    </div>
                  </div>

                  <div className="p-3 bg-amber-500/10 rounded-xl border border-amber-500/20 text-[11px] text-amber-700 dark:text-amber-400 font-medium flex flex-col gap-2">
                    <div className="flex items-center gap-1.5 font-bold">
                      <span className="material-symbols-outlined text-[16px]">scale</span>
                      <span>Scale Ingredient Quantities Proportionally?</span>
                    </div>
                    <p className="text-[10px] text-text-muted">
                      Multiplies raw weights in the table for banquet prep (e.g. 5x ingredients).
                    </p>
                    <button
                      onClick={() => handleScalePortions(servings, true)}
                      className="py-2 bg-amber-500 text-black font-black uppercase tracking-wider text-[10px] rounded-lg hover:brightness-105 transition-all"
                    >
                      Multiply Table Weights (x{(servings / (basePortionsRef || 1)).toFixed(2)})
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Alert Notification if any */}
          {saveMessage && (
            <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-400 text-xs font-bold flex items-center gap-2 animate-fade-in">
              <span className="material-symbols-outlined text-[18px]">check_circle</span>
              {saveMessage}
            </div>
          )}

          {/* Recipe Configuration Card */}
          <div className="bg-white dark:bg-surface-dark rounded-2xl border border-gray-200 dark:border-gray-800 p-5 shadow-sm space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
              
              {/* Recipe Name Input */}
              <div className="md:col-span-4 space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-text-muted">
                  {t('foodCost.dishName')}
                </label>
                <input 
                  type="text"
                  value={recipeName}
                  onChange={(e) => setRecipeName(e.target.value)}
                  placeholder="e.g. Birria Tacos with Handmade Corn Tortillas"
                  className="w-full h-11 px-4 bg-gray-50 dark:bg-black/20 rounded-xl border border-gray-200 dark:border-gray-800 text-sm font-black focus:ring-1 focus:ring-primary focus:border-primary placeholder:font-normal"
                />
              </div>

              {/* Servings Stepper */}
              <div className="md:col-span-2 space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-text-muted">
                  {t('foodCost.portions')}
                </label>
                <div className="flex items-center h-11 bg-gray-50 dark:bg-black/20 rounded-xl border border-gray-200 dark:border-gray-800 px-2 justify-between">
                  <button 
                    onClick={() => setServings(s => Math.max(1, s - 1))}
                    className="size-7 rounded-lg bg-white dark:bg-surface-dark border border-gray-200 dark:border-gray-700 flex items-center justify-center text-xs font-black hover:bg-primary hover:text-black transition-all"
                  >
                    -
                  </button>
                  <span className="text-sm font-black font-mono">{servings}</span>
                  <button 
                    onClick={() => setServings(s => s + 1)}
                    className="size-7 rounded-lg bg-white dark:bg-surface-dark border border-gray-200 dark:border-gray-700 flex items-center justify-center text-xs font-black hover:bg-primary hover:text-black transition-all"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Allergens Selector (14 EU Allergens Multi-Select) */}
              <div className="md:col-span-3 space-y-1.5 relative">
                <label className="text-[10px] font-black uppercase tracking-widest text-text-muted flex items-center justify-between">
                  <span>{t('foodCost.allergens14')}</span>
                  {selectedAllergens.length > 0 && (
                    <span className="text-amber-500 font-bold font-mono">{selectedAllergens.length} {t('foodCost.tagged')}</span>
                  )}
                </label>
                
                <button
                  type="button"
                  onClick={() => setIsAllergenDropdownOpen(!isAllergenDropdownOpen)}
                  className="w-full h-11 px-3 bg-gray-50 dark:bg-black/20 rounded-xl border border-gray-200 dark:border-gray-800 text-xs font-bold flex items-center justify-between hover:border-gray-300 dark:hover:border-gray-700"
                >
                  <div className="flex items-center gap-1.5 truncate">
                    <span className="material-symbols-outlined text-[16px] text-amber-500">warning</span>
                    <span className="truncate">
                      {selectedAllergens.length === 0 
                        ? t('foodCost.noneSelected') 
                        : selectedAllergens.join(', ')}
                    </span>
                  </div>
                  <span className="material-symbols-outlined text-[16px] text-text-muted">
                    {isAllergenDropdownOpen ? 'expand_less' : 'expand_more'}
                  </span>
                </button>

                {isAllergenDropdownOpen && (
                  <div className="absolute left-0 top-16 z-50 w-72 bg-white dark:bg-surface-dark rounded-2xl border border-gray-200 dark:border-gray-800 shadow-2xl p-3 space-y-2 animate-fade-in max-h-72 overflow-y-auto">
                    <div className="flex items-center justify-between px-1 pb-1 border-b border-gray-100 dark:border-gray-800">
                      <span className="text-[9px] font-black uppercase tracking-wider text-text-muted">
                        {t('foodCost.allergens14')}
                      </span>
                      {selectedAllergens.length > 0 && (
                        <button 
                          onClick={() => setSelectedAllergens([])}
                          className="text-[9px] font-black text-red-500 uppercase hover:underline"
                        >
                          {t('foodCost.clearAllergens')}
                        </button>
                      )}
                    </div>
                    <div className="space-y-1">
                      {EU_ALLERGENS.map(allergen => {
                        const isChecked = selectedAllergens.includes(allergen);
                        return (
                          <label 
                            key={allergen}
                            className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-white/5 cursor-pointer text-xs font-bold"
                          >
                            <input 
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => {
                                setSelectedAllergens(prev =>
                                  isChecked ? prev.filter(a => a !== allergen) : [...prev, allergen]
                                );
                              }}
                              className="size-4 rounded accent-primary text-black"
                            />
                            <span className={isChecked ? 'text-amber-500' : 'text-text-main dark:text-gray-300'}>
                              {allergen}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Target Food Cost % Slider */}
              <div className="md:col-span-3 space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-black uppercase tracking-widest text-text-muted">
                    {t('foodCost.targetFc')}
                  </label>
                  <span className="text-xs font-black text-primary font-mono">{targetFoodCostPct}%</span>
                </div>
                <div className="flex items-center gap-2">
                  <input 
                    type="range"
                    min="1"
                    max="80"
                    step="1"
                    value={targetFoodCostPct}
                    onChange={(e) => setTargetFoodCostPct(parseInt(e.target.value) || 30)}
                    className="w-full accent-primary cursor-pointer"
                  />
                </div>
              </div>

            </div>

            {/* Selected Allergens Badges */}
            {selectedAllergens.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-2 border-t border-gray-100 dark:border-gray-800">
                {selectedAllergens.map(alg => (
                  <span 
                    key={alg} 
                    className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[10px] font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
                  >
                    <span>⚠️ {alg}</span>
                    <button 
                      onClick={() => setSelectedAllergens(prev => prev.filter(a => a !== alg))}
                      className="hover:text-red-500 ml-0.5"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Key KPI Metric Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            
            {/* Total Recipe Cost */}
            <div className="bg-white dark:bg-surface-dark p-4 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm flex flex-col justify-between">
              <span className="text-[9px] font-black uppercase tracking-wider text-text-muted">
                {t('foodCost.totalCost')}
              </span>
              <div className="mt-2">
                <span className="text-2xl font-black font-mono">
                  {activeCurr}{finalSheetMetrics.combinedTotalCost.toFixed(2)}
                </span>
                <span className="block text-[10px] text-text-muted font-medium mt-0.5">
                  {t('foodCost.rawCost')}: {activeCurr}{finalSheetMetrics.combinedRawCost.toFixed(2)}
                </span>
              </div>
            </div>

            {/* Cost Per Serving / Cost Per Kg */}
            <div className="bg-white dark:bg-surface-dark p-4 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm flex flex-col justify-between">
              <span className="text-[9px] font-black uppercase tracking-wider text-text-muted">
                {t('foodCost.costRatio')}
              </span>
              <div className="mt-2">
                <div className="flex items-baseline gap-1.5 flex-wrap">
                  <span className="text-2xl font-black text-primary font-mono">
                    {activeCurr}{finalSheetMetrics.costPerServing.toFixed(2)}
                  </span>
                  <span className="text-xl font-bold text-text-muted font-mono">/</span>
                  <span className="text-xl font-black text-text-main dark:text-white font-mono">
                    {activeCurr}{finalSheetMetrics.costPerKg.toFixed(2)}
                  </span>
                </div>
                <span className="block text-[10px] text-text-muted font-medium mt-0.5">
                  for {servings} pax
                </span>
              </div>
            </div>

            {/* Recommended Selling Price (PVP) */}
            <div className="bg-primary/10 dark:bg-primary/15 p-4 rounded-xl border border-primary/30 shadow-sm flex flex-col justify-between">
              <span className="text-[9px] font-black uppercase tracking-wider text-primary">
                {t('foodCost.recPrice')}
              </span>
              <div className="mt-2">
                <span className="text-2xl font-black text-text-main dark:text-white font-mono">
                  {activeCurr}{finalSheetMetrics.recommendedPriceWithTax.toFixed(2)}
                </span>
                <span className="block text-[10px] text-text-muted font-medium mt-0.5">
                  @ {targetFoodCostPct}% Food Cost target
                </span>
              </div>
            </div>

            {/* Gross Profit Margin */}
            <div className="bg-emerald-500/10 p-4 rounded-xl border border-emerald-500/20 shadow-sm flex flex-col justify-between">
              <span className="text-[9px] font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                {t('foodCost.grossProfit')}
              </span>
              <div className="mt-2">
                <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400 font-mono">
                  {activeCurr}{finalSheetMetrics.grossMarginPerServing.toFixed(2)}
                </span>
                <span className="block text-[10px] text-text-muted font-medium mt-0.5">
                  {t('foodCost.grossMargin')}: {finalSheetMetrics.grossMarginPct.toFixed(1)}%
                </span>
              </div>
            </div>

          </div>

          {/* --- SHEET MANAGEMENT & ACTION BAR --- */}
          <div className="flex flex-col gap-3">
            
            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="flex items-center gap-2 w-full sm:w-auto flex-wrap">
                {/* 1. Add Base Sheet Button */}
                <button 
                  onClick={handleAddBaseSheet}
                  className="h-10 px-4 rounded-xl border border-primary/40 bg-primary/10 hover:bg-primary hover:text-black text-primary font-black text-xs uppercase tracking-wider flex items-center gap-1.5 transition-all shadow-sm flex-1 sm:flex-none justify-center"
                >
                  <span className="material-symbols-outlined text-[18px]">layers</span>
                  {t('foodCost.addBaseSheet')}
                </button>

                {/* 2. Add Ingredient Row Button */}
                <button 
                  onClick={handleAddIngredientRow}
                  className="h-10 px-4 rounded-xl bg-primary text-black font-black text-xs uppercase tracking-wider flex items-center gap-1.5 hover:brightness-105 transition-all shadow-sm flex-1 sm:flex-none justify-center"
                >
                  <span className="material-symbols-outlined text-[18px]">add_circle</span>
                  {t('foodCost.addIngredientRow')}
                </button>

                {/* 3. Import from Clipboard Button */}
                <button 
                  onClick={() => importItemsToCurrentSheet(clipboard)}
                  disabled={clipboard.length === 0}
                  className="h-10 px-4 rounded-xl border border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-white/5 font-black text-xs uppercase tracking-wider flex items-center gap-1.5 transition-all disabled:opacity-40 flex-1 sm:flex-none justify-center"
                >
                  <span className="material-symbols-outlined text-[18px] text-primary">content_paste</span>
                  {t('foodCost.importClipboard')} ({clipboard.length})
                </button>

                {/* 4. Currency Selector Dropdown */}
                <div className="relative">
                  <button
                    onClick={() => setIsCurrencyDropdownOpen(!isCurrencyDropdownOpen)}
                    className="h-10 px-3.5 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-surface-dark hover:border-primary text-text-main dark:text-white font-black text-xs uppercase tracking-wider transition-all flex items-center gap-1.5 shadow-sm"
                    title={t('foodCost.currency') || 'Change Currency'}
                  >
                    <span className="material-symbols-outlined text-[16px] text-primary">payments</span>
                    <span>{activeCurr}</span>
                    <span className="material-symbols-outlined text-[14px] text-text-muted">expand_more</span>
                  </button>

                  {isCurrencyDropdownOpen && (
                    <div className="absolute left-0 top-12 z-50 bg-white dark:bg-surface-dark p-2 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-2xl w-44 space-y-1 animate-fade-in">
                      <span className="text-[9px] font-black uppercase tracking-wider text-text-muted px-2 block py-1">
                        {t('foodCost.currency')}
                      </span>
                      {CURRENCY_OPTIONS.map(opt => (
                        <button
                          key={opt.symbol}
                          onClick={() => {
                            setCurrency(opt.symbol);
                            setIsCurrencyDropdownOpen(false);
                          }}
                          className={`w-full text-left px-3 py-2 rounded-xl text-xs font-bold flex items-center justify-between transition-colors ${
                            activeCurr === opt.symbol
                              ? 'bg-primary text-black font-black'
                              : 'hover:bg-gray-100 dark:hover:bg-white/5 text-text-main dark:text-gray-300'
                          }`}
                        >
                          <span>{opt.label}</span>
                          {activeCurr === opt.symbol && (
                            <span className="material-symbols-outlined text-[14px]">check</span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* 5. Link existing Base Sheet to Final Sheet (if unlinked) */}
                {activeSheetId === 'final' && unlinkedBaseSheets.length > 0 && (
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-text-muted font-bold uppercase hidden md:inline">{t('foodCost.linkSubRecipe')}:</span>
                    {unlinkedBaseSheets.map(bs => (
                      <button
                        key={bs.id}
                        onClick={() => handleInsertBaseSheetToFinal(bs.id)}
                        className="h-10 px-3 rounded-xl border border-dashed border-primary/50 hover:bg-primary/20 text-primary text-[10px] font-black uppercase tracking-wider flex items-center gap-1 transition-all"
                        title={`Add ${bs.name} to Final Sheet table`}
                      >
                        <span className="material-symbols-outlined text-[14px]">add_link</span>
                        + {bs.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Target Sheet Indicator */}
              <span className="text-xs font-bold text-text-muted">
                {t('foodCost.activeView')}: <strong className="text-text-main dark:text-white uppercase font-black">
                  {activeSheetId === 'final' ? t('foodCost.finalSheet') : baseSheets.find(s => s.id === activeSheetId)?.name}
                </strong>
              </span>
            </div>

            {/* TAB NAVIGATION: FINAL SHEET & BASE SHEETS */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1 border-b border-gray-200 dark:border-gray-800">
              
              {/* Final Sheet Tab */}
              <button
                onClick={() => setActiveSheetId('final')}
                className={`h-10 px-4 rounded-xl font-black text-xs uppercase tracking-wider flex items-center gap-2 transition-all shrink-0 ${
                  activeSheetId === 'final'
                    ? 'bg-text-main text-white dark:bg-white dark:text-black shadow-sm'
                    : 'bg-white dark:bg-surface-dark border border-gray-200 dark:border-gray-800 text-text-muted hover:text-text-main'
                }`}
              >
                <span className="material-symbols-outlined text-[18px]">menu_book</span>
                {t('foodCost.finalSheet')} ({finalIngredients.length})
                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-black/20 dark:bg-black/10">
                  {activeCurr}{finalSheetMetrics.combinedTotalCost.toFixed(2)}
                </span>
              </button>

              {/* Base Sheets Tabs */}
              {baseSheetsCalculated.map(sheet => {
                const isActive = activeSheetId === sheet.id;
                return (
                  <div 
                    key={sheet.id}
                    className={`h-10 px-3 rounded-xl flex items-center gap-2 transition-all shrink-0 border ${
                      isActive
                        ? 'bg-primary border-primary text-black font-black shadow-sm'
                        : 'bg-white dark:bg-surface-dark border-gray-200 dark:border-gray-800 text-text-muted hover:border-gray-300'
                    }`}
                  >
                    <button
                      onClick={() => setActiveSheetId(sheet.id)}
                      className="flex items-center gap-2 text-xs uppercase font-black"
                    >
                      <span className="material-symbols-outlined text-[16px]">layers</span>
                      {sheet.name} ({sheet.ingredients.length})
                      <span className="font-mono text-[10px] opacity-80">
                        {activeCurr}{sheet.metrics.costPerKg.toFixed(2)}/kg
                      </span>
                    </button>

                    <button
                      onClick={() => handleRemoveBaseSheet(sheet.id)}
                      className="size-5 rounded flex items-center justify-center hover:bg-red-500 hover:text-white transition-colors"
                      title="Delete Base Sheet"
                    >
                      <span className="material-symbols-outlined text-[14px]">close</span>
                    </button>
                  </div>
                );
              })}

            </div>
          </div>

          {/* BASE SHEET EDIT HEADER */}
          {activeSheetObj && (
            <div className="p-4 bg-primary/10 rounded-2xl border border-primary/30 flex flex-col sm:flex-row items-center justify-between gap-4 animate-fade-in">
              <div className="flex items-center gap-3 w-full sm:w-auto">
                <span className="material-symbols-outlined text-primary text-2xl">layers</span>
                <div className="flex flex-col flex-1">
                  <span className="text-[9px] font-black uppercase tracking-widest text-primary">
                    {t('foodCost.baseSheet')} (Defines Price per Kg for Final Sheet)
                  </span>
                  <input 
                    type="text"
                    value={activeSheetObj.name}
                    onChange={(e) => handleUpdateBaseSheet(activeSheetObj.id, { name: e.target.value })}
                    className="h-8 px-2 bg-white dark:bg-black/40 rounded-lg border border-primary/40 text-xs font-black outline-none focus:ring-1 focus:ring-primary"
                    placeholder="e.g. Corn Tortillas Base"
                  />
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="text-right">
                  <span className="text-[9px] font-black uppercase text-text-muted block">Sub-Sheet Batch Total</span>
                  <span className="text-sm font-black font-mono text-text-main dark:text-white">
                    {activeCurr}{activeSheetObj.metrics.totalAdjusted.toFixed(2)}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-[9px] font-black uppercase text-text-muted block">Price per Kg</span>
                  <span className="text-sm font-black font-mono text-primary">
                    {activeCurr}{activeSheetObj.metrics.costPerKg.toFixed(2)}/kg
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* INGREDIENTS MATRIX TABLE FOR ACTIVE SHEET */}
          <div className="bg-white dark:bg-surface-dark rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[700px]">
                <thead>
                  <tr className="bg-gray-50 dark:bg-white/5 border-b border-gray-200 dark:border-gray-800 text-[10px] font-black uppercase tracking-wider text-text-muted">
                    <th className="p-3.5 w-12 text-center">#</th>
                    <th className="p-3.5 min-w-[220px]">
                      {activeSheetId === 'final' ? 'Ingredient / Sub-Recipe' : 'Base Ingredient'}
                    </th>
                    <th className="p-3.5 w-24 text-center">{t('foodCost.qty')}</th>
                    <th className="p-3.5 w-24 text-center">{t('foodCost.unit')}</th>
                    <th className="p-3.5 w-36 text-right">{t('foodCost.unitPrice')}</th>
                    <th className="p-3.5 w-28 text-center" title="Waste / Trimming / Plating Loss Percentage">{t('foodCost.wastePct')}</th>
                    <th className="p-3.5 w-32 text-right">{t('foodCost.realCost')}</th>
                    <th className="p-3.5 w-12 text-center"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800/60">
                  {activeSheetRows.map((ing, idx) => {
                    const isRowBaseSheet = Boolean(ing.isBaseSheet);

                    return (
                      <tr 
                        key={ing.id} 
                        className={`transition-colors group ${
                          isRowBaseSheet 
                            ? 'bg-primary/[0.03] hover:bg-primary/[0.08]' 
                            : 'hover:bg-primary/5'
                        }`}
                      >
                        
                        {/* # Index */}
                        <td className="p-3.5 text-center text-xs font-mono text-text-muted">
                          {idx + 1}
                        </td>

                        {/* Ingredient Name (or Sub-recipe Link) */}
                        <td className="p-3.5">
                          {isRowBaseSheet ? (
                            <div className="flex items-center gap-2">
                              <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-primary/20 text-primary border border-primary/30 shrink-0">
                                {t('foodCost.subRecipeBadge')}
                              </span>
                              <span className="text-xs font-black text-text-main dark:text-white truncate">
                                {ing.name}
                              </span>
                              {ing.baseSheetId && (
                                <button
                                  type="button"
                                  onClick={() => setActiveSheetId(ing.baseSheetId!)}
                                  className="text-primary hover:text-primary/80 transition-colors p-0.5"
                                  title={t('foodCost.jumpSubRecipe')}
                                >
                                  <span className="material-symbols-outlined text-[15px]">open_in_new</span>
                                </button>
                              )}
                            </div>
                          ) : (
                            <input 
                              type="text"
                              value={ing.name}
                              onChange={(e) => handleUpdateIngredient(ing.id, { name: e.target.value })}
                              placeholder="e.g. Avocado, Beef, Cilantro..."
                              className="w-full h-9 px-3 bg-transparent hover:bg-gray-50 dark:hover:bg-white/5 focus:bg-white dark:focus:bg-black/30 rounded-lg border border-transparent focus:border-primary text-xs font-black transition-all outline-none"
                            />
                          )}
                        </td>

                        {/* Quantity */}
                        <td className="p-3.5 text-center">
                          <input 
                            type="number"
                            min="0"
                            step="0.01"
                            value={ing.quantity}
                            onChange={(e) => handleUpdateIngredient(ing.id, { quantity: parseFloat(e.target.value) || 0 })}
                            className="w-20 h-9 bg-gray-50 dark:bg-black/30 rounded-lg border border-gray-200 dark:border-gray-700 text-center text-xs font-mono font-bold focus:border-primary outline-none"
                          />
                        </td>

                        {/* Unit */}
                        <td className="p-3.5 text-center">
                          {isRowBaseSheet ? (
                            <span className="text-xs font-black text-primary uppercase">
                              kg
                            </span>
                          ) : (
                            <select 
                              value={ing.unit}
                              onChange={(e) => handleUpdateIngredient(ing.id, { unit: e.target.value })}
                              className="h-9 px-2 bg-gray-50 dark:bg-black/30 rounded-lg border border-gray-200 dark:border-gray-700 text-xs font-bold uppercase focus:border-primary outline-none"
                            >
                              <option value="kg">kg</option>
                              <option value="g">g</option>
                              <option value="L">L</option>
                              <option value="ml">ml</option>
                              <option value="unit">unit</option>
                              <option value="portion">portion</option>
                              <option value="oz">oz</option>
                              <option value="lb">lb</option>
                            </select>
                          )}
                        </td>

                        {/* Unit Price */}
                        <td className="p-3.5 text-right">
                          {isRowBaseSheet ? (
                            <div className="flex items-center justify-end gap-1" title="Price per Kg calculated automatically from Sub-Recipe">
                              <span className="material-symbols-outlined text-[13px] text-primary" title="Synced Price/Kg from Base Sheet">link</span>
                              <span className="text-xs font-mono font-black text-primary">
                                {activeCurr}{Number(ing.unitPrice || 0).toFixed(2)}
                              </span>
                              <span className="text-[10px] text-text-muted">/kg</span>
                            </div>
                          ) : (
                            <div className="flex items-center justify-end gap-1">
                              <span className="text-xs text-text-muted font-bold">{activeCurr}</span>
                              <input 
                                type="number"
                                min="0"
                                step="0.01"
                                value={ing.unitPrice}
                                onChange={(e) => handleUpdateIngredient(ing.id, { unitPrice: parseFloat(e.target.value) || 0 })}
                                className="w-20 h-9 bg-gray-50 dark:bg-black/30 rounded-lg border border-gray-200 dark:border-gray-700 text-right text-xs font-mono font-bold focus:border-primary outline-none px-2"
                              />
                            </div>
                          )}
                        </td>

                        {/* Waste / Loss % */}
                        <td className="p-3.5 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <input 
                              type="number"
                              min="0"
                              max="99"
                              value={ing.handlingLoss || 0}
                              onChange={(e) => handleUpdateIngredient(ing.id, { handlingLoss: parseFloat(e.target.value) || 0 })}
                              className="w-14 h-9 bg-gray-50 dark:bg-black/30 rounded-lg border border-gray-200 dark:border-gray-700 text-center text-xs font-mono font-bold focus:border-primary outline-none"
                            />
                            <span className="text-xs text-text-muted font-bold">%</span>
                          </div>
                        </td>

                        {/* Effective Real Cost */}
                        <td className="p-3.5 text-right">
                          <span className="text-xs font-black font-mono text-text-main dark:text-white">
                            {activeCurr}{ing.effectiveCost.toFixed(2)}
                          </span>
                        </td>

                        {/* Remove Row Button */}
                        <td className="p-3.5 text-center">
                          <button 
                            onClick={() => handleRemoveIngredient(ing.id)}
                            className="size-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-500/10 transition-colors"
                            title="Delete item"
                          >
                            <span className="material-symbols-outlined text-[16px]">close</span>
                          </button>
                        </td>

                      </tr>
                    );
                  })}

                  {activeSheetRows.length === 0 && (
                    <tr>
                      <td colSpan={8} className="py-12 text-center">
                        <div className="flex flex-col items-center justify-center gap-2 opacity-40">
                          <span className="material-symbols-outlined text-3xl">post_add</span>
                          <p className="text-xs font-bold uppercase tracking-wider">
                            {t('foodCost.noItems')}
                          </p>
                          <p className="text-xs text-text-muted">
                            {t('foodCost.noItemsDesc')}
                          </p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Sub-recipes overview cards */}
            {activeSheetId === 'final' && baseSheetsCalculated.length > 0 && (
              <div className="p-4 bg-gray-50/70 dark:bg-black/20 border-t border-gray-200 dark:border-gray-800">
                <span className="text-[10px] font-black uppercase tracking-widest text-text-muted block mb-3">
                  {t('foodCost.subRecipesOverview')}
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {baseSheetsCalculated.map(bs => {
                    const isIncludedInFinal = finalIngredients.some(i => i.isBaseSheet && i.baseSheetId === bs.id);

                    return (
                      <div 
                        key={bs.id}
                        onClick={() => setActiveSheetId(bs.id)}
                        className="p-3 rounded-xl bg-white dark:bg-surface-dark border border-gray-200 dark:border-gray-700/60 cursor-pointer hover:border-primary transition-all flex items-center justify-between"
                      >
                        <div className="flex items-center gap-2">
                          <span className="material-symbols-outlined text-primary text-[18px]">layers</span>
                          <div className="flex flex-col">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-black">{bs.name}</span>
                              {isIncludedInFinal ? (
                                <span className="text-[8px] font-black uppercase px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                                  In Final
                                </span>
                              ) : (
                                <span className="text-[8px] font-black uppercase px-1.5 py-0.2 rounded bg-gray-500/10 text-gray-500">
                                  Not linked
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] text-text-muted">{bs.ingredients.length} ingredients</span>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="text-xs font-black font-mono text-primary block">
                            {activeCurr}{bs.metrics.costPerKg.toFixed(2)}/kg
                          </span>
                          <span className="text-[9px] text-text-muted font-mono">
                            Batch: {activeCurr}{bs.metrics.totalAdjusted.toFixed(2)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Table Footer */}
            <div className="p-4 bg-gray-50 dark:bg-white/5 border-t border-gray-200 dark:border-gray-800 flex flex-col sm:flex-row items-center justify-between gap-4">
              <span className="text-xs text-text-muted font-medium">
                * Real Cost accounts for ingredient trimming, prep waste, and plating loss.
              </span>
              <div className="flex items-center gap-4">
                <span className="text-xs font-bold uppercase tracking-wider text-text-muted">
                  {activeSheetId === 'final' ? 'Total Final Dish Cost:' : 'Sub-Recipe Batch Total:'}
                </span>
                <span className="text-lg font-black font-mono text-text-main dark:text-white">
                  {activeCurr}{activeSheetId === 'final' 
                    ? finalSheetMetrics.combinedTotalCost.toFixed(2)
                    : (activeSheetObj?.metrics.totalAdjusted.toFixed(2) || '0.00')}
                </span>
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* --- RIGHT SIDEBAR: PERSISTENT GLOBAL CLIPBOARD --- */}
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
            {/* Header */}
            <div className="p-4 md:p-5 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="material-symbols-outlined text-primary text-[20px]">shopping_basket</span>
                <h2 className="text-xs font-black uppercase tracking-widest">{t('foodCost.clipboard')}</h2>
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

            {/* Items */}
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
              
              {/* Summary Card */}
              <div className="bg-primary/10 rounded-xl p-4 border border-primary/20 flex flex-col gap-1">
                <span className="text-[9px] font-black uppercase tracking-widest text-primary">{t('foodCost.clipboardBuffer')}</span>
                <div className="flex justify-between items-end">
                  <span className="text-xl font-black">{clipboard.length} Items</span>
                  <span className="text-base font-black text-primary font-mono">
                    {activeCurr}{clipboardTotal.toFixed(2)}
                  </span>
                </div>
              </div>

              {/* Items List */}
              <div className="flex-1 space-y-3">
                <div className="flex items-center justify-between px-1">
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-text-muted truncate">
                    Target: {activeSheetId === 'final' ? t('foodCost.finalSheet') : baseSheets.find(s => s.id === activeSheetId)?.name}
                  </h4>
                  {clipboard.length > 0 && (
                    <button 
                      onClick={clearClipboard} 
                      className="text-[9px] font-black text-red-500 uppercase hover:underline"
                    >
                      Clear
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
                            {item.supplier} • {item.currency || activeCurr}{item.price.toFixed(2)}/{item.unit}
                          </span>
                        </div>
                        
                        <div className="flex items-center gap-1">
                          {/* Single Add to FC Button */}
                          <button 
                            onClick={() => handleAddSingleItemToFC(item)}
                            className="px-2 py-1 bg-primary/20 hover:bg-primary hover:text-black text-primary text-[10px] font-black rounded-lg transition-all flex items-center gap-0.5"
                            title={`Add directly to ${activeSheetId === 'final' ? 'Final Sheet' : 'Active Base Sheet'}`}
                          >
                            <span className="material-symbols-outlined text-[13px]">add</span>
                            {t('foodCost.addToFC')}
                          </button>

                          {/* Duplicate Item Button */}
                          <button 
                            onClick={() => duplicateClipboardItem(item.id)} 
                            className="text-gray-400 hover:text-primary transition-colors p-1"
                            title="Duplicate item in clipboard"
                          >
                            <span className="material-symbols-outlined text-[16px]">content_copy</span>
                          </button>

                          {/* Delete Item Button */}
                          <button 
                            onClick={() => removeFromClipboard(item.id)} 
                            className="text-gray-400 hover:text-red-500 transition-colors p-1"
                            title="Remove from clipboard"
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
                            {item.currency || activeCurr}{(item.price * item.quantity).toFixed(2)}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}

                  {clipboard.length === 0 && (
                    <div className="py-12 flex flex-col items-center justify-center text-center opacity-40 gap-2">
                      <span className="material-symbols-outlined text-3xl">inventory_2</span>
                      <p className="text-[10px] font-black uppercase tracking-widest">Clipboard is empty</p>
                      <p className="text-[10px] text-text-muted max-w-[180px]">
                        Select ingredients in Price Tracker to insert them here.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Bottom Insert Action */}
            <div className="p-4 border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-black/20">
              <button 
                disabled={clipboard.length === 0}
                onClick={() => importItemsToCurrentSheet(clipboard)}
                className="w-full bg-primary text-black py-3 rounded-xl font-black uppercase tracking-wider text-xs shadow-md shadow-primary/20 hover:brightness-105 active:scale-95 transition-all disabled:opacity-40 flex items-center justify-center gap-2"
              >
                <span className="material-symbols-outlined text-[18px]">add_box</span>
                {t('foodCost.insertAllToActive')}
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
                {t('foodCost.clipboard')}
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
