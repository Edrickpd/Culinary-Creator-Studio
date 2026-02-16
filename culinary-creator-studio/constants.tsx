
import React from 'react';
import { PriceEntry, Project, FoodCostItem, PairingAnalysisItem, CostTemplate } from './types';

export const COUNTRIES = [
  { name: 'Spain', code: 'ES', flag: '🇪🇸', currency: 'EUR', symbol: '€' },
  { name: 'Mexico', code: 'MX', flag: '🇲🇽', currency: 'MXN', symbol: '$' },
  { name: 'USA', code: 'US', flag: '🇺🇸', currency: 'USD', symbol: '$' },
  { name: 'France', code: 'FR', flag: '🇫🇷', currency: 'EUR', symbol: '€' },
  { name: 'Italy', code: 'IT', flag: '🇮🇹', currency: 'EUR', symbol: '€' },
  { name: 'Portugal', code: 'PT', flag: '🇵🇹', currency: 'EUR', symbol: '€' },
  { name: 'Japan', code: 'JP', flag: '🇯🇵', currency: 'JPY', symbol: '¥' },
];

export const SUPPLIERS_BY_COUNTRY: Record<string, string[]> = {
  ES: ['Grupo TGT', 'Mercabarna', 'Mercasa'],
  MX: ['CEDA', 'Central de Abastos', 'La Canasta'],
  US: ['Costco Business', 'Sysco', 'US Foods'],
  FR: ['Carrefour Pro', 'Metro France', 'Rungis Market'],
  IT: ['Carrefour Grossista', 'Esselunga Business', 'Metro Italia'],
  PT: ['Continente Pro', 'Merc Lisboa', 'Pingo Doce Business'],
  JP: ['Aeon Supermarket', 'Ito-Yokado', 'Ota Market'],
};

export const CATEGORIES = ['Protein', 'Vegetable', 'Fruit', 'Dairy', 'Spice/Herb', 'Grain', 'Oil/Fat', 'Other'];

const rawJanData = `Almonds,France,Carrefour Pro,kg,EUR,15.86
Apples,France,Carrefour Pro,kg,EUR,1.3
Avocado,France,Carrefour Pro,kg,EUR,3.18
Baking Powder,France,Carrefour Pro,kg,EUR,3.6
Bananas,France,Carrefour Pro,kg,EUR,1.08
Basil,France,Carrefour Pro,kg,EUR,11.86
Bay Leaves,France,Carrefour Pro,kg,EUR,9.64
Beans,France,Carrefour Pro,kg,EUR,3.62
Beef,France,Carrefour Pro,kg,EUR,9.02
Beets,France,Carrefour Pro,kg,EUR,0.93
Bell Peppers,France,Carrefour Pro,kg,EUR,2.33
Black Pepper,France,Carrefour Pro,kg,EUR,14.13
Blueberries,France,Carrefour Pro,kg,EUR,9.54
Bread,France,Carrefour Pro,kg,EUR,2.96
Broccoli,France,Carrefour Pro,kg,EUR,1.8
Butter,France,Carrefour Pro,kg,EUR,8.8
Cabbage,France,Carrefour Pro,kg,EUR,0.52
Cardamom,France,Carrefour Pro,kg,EUR,25.65
Carrots,France,Carrefour Pro,kg,EUR,0.72
Cashews,France,Carrefour Pro,kg,EUR,18.43
Cassava,France,Carrefour Pro,kg,EUR,1.11
Cauliflower,France,Carrefour Pro,kg,EUR,1.72
Celery,France,Carrefour Pro,kg,EUR,1.13
Cheese,France,Carrefour Pro,kg,EUR,12.34
Chicken,France,Carrefour Pro,kg,EUR,3.93
Chickpeas,France,Carrefour Pro,kg,EUR,3.75
Chili Pepper,France,Carrefour Pro,kg,EUR,4.95
Chocolate,France,Carrefour Pro,kg,EUR,12.42
Cilantro,France,Carrefour Pro,kg,EUR,2.36
Cinnamon,France,Carrefour Pro,kg,EUR,16.28
Cloves,France,Carrefour Pro,kg,EUR,21.86
Coconut Milk,France,Carrefour Pro,L,EUR,3.15
Coffee,France,Carrefour Pro,kg,EUR,13.24
Corn,France,Carrefour Pro,kg,EUR,1.33
Cream,France,Carrefour Pro,L,EUR,7.3
Cucumbers,France,Carrefour Pro,kg,EUR,0.96
Cumin,France,Carrefour Pro,kg,EUR,8.89
Eggplant,France,Carrefour Pro,kg,EUR,1.37
Eggs,France,Carrefour Pro,kg,EUR,2.71
Fennel,France,Carrefour Pro,kg,EUR,10.37
Fish,France,Carrefour Pro,kg,EUR,14.34
Fish Sauce,France,Carrefour Pro,L,EUR,9.41
Garlic,France,Carrefour Pro,kg,EUR,4.39
Ginger,France,Carrefour Pro,kg,EUR,5.8
Grapes,France,Carrefour Pro,kg,EUR,2.89
Hazelnuts,France,Carrefour Pro,kg,EUR,17.12
Honey,France,Carrefour Pro,kg,EUR,15.11
Lemon,France,Carrefour Pro,kg,EUR,1.97
Lentils,France,Carrefour Pro,kg,EUR,4.05
Lettuce,France,Carrefour Pro,kg,EUR,1.31
Mango,France,Carrefour Pro,kg,EUR,2.68
Milk,France,Carrefour Pro,L,EUR,1.15
Mushrooms,France,Carrefour Pro,kg,EUR,4.27
Mustard,France,Carrefour Pro,kg,EUR,2.65
Nutmeg,France,Carrefour Pro,kg,EUR,16.99
Olive Oil,France,Carrefour Pro,L,EUR,8.07
Onions,France,Carrefour Pro,kg,EUR,0.71
Oranges,France,Carrefour Pro,kg,EUR,0.92
Oregano,France,Carrefour Pro,kg,EUR,11.11
Oregano Powder,France,Carrefour Pro,kg,EUR,10.48
Papaya,France,Carrefour Pro,kg,EUR,2.09
Paprika,France,Carrefour Pro,kg,EUR,7.67
Parsley,France,Carrefour Pro,kg,EUR,1.82
Pasta,France,Carrefour Pro,kg,EUR,1.33
Peanuts,France,Carrefour Pro,kg,EUR,7.58
Pecans,France,Carrefour Pro,kg,EUR,20.04
Pineapple,France,Carrefour Pro,kg,EUR,1.72
Pistachios,France,Carrefour Pro,kg,EUR,20.79
Poppy Seeds,France,Carrefour Pro,kg,EUR,13.97
Pork,France,Carrefour Pro,kg,EUR,4.47
Potatoes,France,Carrefour Pro,kg,EUR,0.71
Quinoa,France,Carrefour Pro,kg,EUR,6.39
Radish,France,Carrefour Pro,kg,EUR,1.01
Rice,France,Carrefour Pro,kg,EUR,1.39
Rosemary,France,Carrefour Pro,kg,EUR,10.69
Saffron,France,Carrefour Pro,kg,EUR,54.77
Salt,France,Carrefour Pro,kg,EUR,0.52
Sesame Seeds,France,Carrefour Pro,kg,EUR,10.39
Shrimp,France,Carrefour Pro,kg,EUR,16.71
Soy Sauce,France,Carrefour Pro,L,EUR,3.92
Spinach,France,Carrefour Pro,kg,EUR,2.02
Star Anise,France,Carrefour Pro,kg,EUR,18.55
Strawberries,France,Carrefour Pro,kg,EUR,4.02
Sugar,France,Carrefour Pro,kg,EUR,1.01
Sunflower Oil,France,Carrefour Pro,L,EUR,5.07
Sweet Potatoes,France,Carrefour Pro,kg,EUR,1.3
Tea,France,Carrefour Pro,kg,EUR,10.22
Thyme,France,Carrefour Pro,kg,EUR,11.45
Tomatoes,France,Carrefour Pro,kg,EUR,1.5
Turmeric,France,Carrefour Pro,kg,EUR,9.22
Turnips,France,Carrefour Pro,kg,EUR,0.88
Vanilla,France,Carrefour Pro,kg,EUR,28.94
Vegetable Oil,France,Carrefour Pro,L,EUR,5.05
Vinegar,France,Carrefour Pro,L,EUR,1.38
Walnuts,France,Carrefour Pro,kg,EUR,14.99
Watermelon,France,Carrefour Pro,kg,EUR,0.86
Wheat Flour,France,Carrefour Pro,kg,EUR,0.75
Yeast,France,Carrefour Pro,kg,EUR,5.0
Yogurt,France,Carrefour Pro,L,EUR,4.37
Zucchini,France,Carrefour Pro,kg,EUR,1.06`;

const rawDecData = `Almonds,France,Carrefour Pro,kg,EUR,15.4
Apples,France,Carrefour Pro,kg,EUR,1.26
Avocado,France,Carrefour Pro,kg,EUR,3.09
Baking Powder,France,Carrefour Pro,kg,EUR,3.5
Bananas,France,Carrefour Pro,kg,EUR,1.05
Basil,France,Carrefour Pro,kg,EUR,11.51
Bay Leaves,France,Carrefour Pro,kg,EUR,9.36
Beans,France,Carrefour Pro,kg,EUR,3.51
Beef,France,Carrefour Pro,kg,EUR,8.76
Beets,France,Carrefour Pro,kg,EUR,0.9
Bell Peppers,France,Carrefour Pro,kg,EUR,2.26
Black Pepper,France,Carrefour Pro,kg,EUR,13.72
Blueberries,France,Carrefour Pro,kg,EUR,9.26
Bread,France,Carrefour Pro,kg,EUR,2.87
Broccoli,France,Carrefour Pro,kg,EUR,1.75
Butter,France,Carrefour Pro,kg,EUR,8.54
Cabbage,France,Carrefour Pro,kg,EUR,0.5
Cardamom,France,Carrefour Pro,kg,EUR,24.9
Carrots,France,Carrefour Pro,kg,EUR,0.7
Cashews,France,Carrefour Pro,kg,EUR,17.89
Cassava,France,Carrefour Pro,kg,EUR,1.08
Cauliflower,France,Carrefour Pro,kg,EUR,1.67
Celery,France,Carrefour Pro,kg,EUR,1.1
Cheese,France,Carrefour Pro,kg,EUR,11.98
Chicken,France,Carrefour Pro,kg,EUR,3.82
Chickpeas,France,Carrefour Pro,kg,EUR,3.64
Chili Pepper,France,Carrefour Pro,kg,EUR,4.81
Chocolate,France,Carrefour Pro,kg,EUR,12.06
Cilantro,France,Carrefour Pro,kg,EUR,2.29
Cinnamon,France,Carrefour Pro,kg,EUR,15.81
Cloves,France,Carrefour Pro,kg,EUR,21.22
Coconut Milk,France,Carrefour Pro,L,EUR,3.06
Coffee,France,Carrefour Pro,kg,EUR,12.85
Corn,France,Carrefour Pro,kg,EUR,1.29
Cream,France,Carrefour Pro,L,EUR,7.09
Cucumbers,France,Carrefour Pro,kg,EUR,0.93
Cumin,France,Carrefour Pro,kg,EUR,8.63
Eggplant,France,Carrefour Pro,kg,EUR,1.33
Eggs,France,Carrefour Pro,kg,EUR,2.63
Fennel,France,Carrefour Pro,kg,EUR,10.07
Fish,France,Carrefour Pro,kg,EUR,13.92
Fish Sauce,France,Carrefour Pro,L,EUR,9.14
Garlic,France,Carrefour Pro,kg,EUR,4.26
Ginger,France,Carrefour Pro,kg,EUR,5.63
Grapes,France,Carrefour Pro,kg,EUR,2.81
Hazelnuts,France,Carrefour Pro,kg,EUR,16.62
Honey,France,Carrefour Pro,kg,EUR,14.67
Lemon,France,Carrefour Pro,kg,EUR,1.91
Lentils,France,Carrefour Pro,kg,EUR,3.93
Lettuce,France,Carrefour Pro,kg,EUR,1.27
Mango,France,Carrefour Pro,kg,EUR,2.6
Milk,France,Carrefour Pro,L,EUR,1.12
Mushrooms,France,Carrefour Pro,kg,EUR,4.15
Mustard,France,Carrefour Pro,kg,EUR,2.57
Nutmeg,France,Carrefour Pro,kg,EUR,16.5
Olive Oil,France,Carrefour Pro,L,EUR,7.83
Onions,France,Carrefour Pro,kg,EUR,0.69
Oranges,France,Carrefour Pro,kg,EUR,0.89
Oregano,France,Carrefour Pro,kg,EUR,10.79
Oregano Powder,France,Carrefour Pro,kg,EUR,10.17
Papaya,France,Carrefour Pro,kg,EUR,2.03
Paprika,France,Carrefour Pro,kg,EUR,7.45
Parsley,France,Carrefour Pro,kg,EUR,1.77
Pasta,France,Carrefour Pro,kg,EUR,1.29
Peanuts,France,Carrefour Pro,kg,EUR,7.36
Pecans,France,Carrefour Pro,kg,EUR,19.46
Pineapple,France,Carrefour Pro,kg,EUR,1.67
Pistachios,France,Carrefour Pro,kg,EUR,20.18
Poppy Seeds,France,Carrefour Pro,kg,EUR,13.56
Pork,France,Carrefour Pro,kg,EUR,4.34
Potatoes,France,Carrefour Pro,kg,EUR,0.69
Quinoa,France,Carrefour Pro,kg,EUR,6.2
Radish,France,Carrefour Pro,kg,EUR,0.98
Rice,France,Carrefour Pro,kg,EUR,1.35
Rosemary,France,Carrefour Pro,kg,EUR,10.38
Saffron,France,Carrefour Pro,kg,EUR,53.17
Salt,France,Carrefour Pro,kg,EUR,0.5
Sesame Seeds,France,Carrefour Pro,kg,EUR,10.09
Shrimp,France,Carrefour Pro,kg,EUR,16.22
Soy Sauce,France,Carrefour Pro,L,EUR,3.81
Spinach,France,Carrefour Pro,kg,EUR,1.96
Star Anise,France,Carrefour Pro,kg,EUR,18.01
Strawberries,France,Carrefour Pro,kg,EUR,3.9
Sugar,France,Carrefour Pro,kg,EUR,0.98
Sunflower Oil,France,Carrefour Pro,L,EUR,4.92
Sweet Potatoes,France,Carrefour Pro,kg,EUR,1.26
Tea,France,Carrefour Pro,kg,EUR,9.92
Thyme,France,Carrefour Pro,kg,EUR,11.12
Tomatoes,France,Carrefour Pro,kg,EUR,1.46
Turmeric,France,Carrefour Pro,kg,EUR,8.95
Turnips,France,Carrefour Pro,kg,EUR,0.85
Vanilla,France,Carrefour Pro,kg,EUR,28.1
Vegetable Oil,France,Carrefour Pro,L,EUR,4.9
Vinegar,France,Carrefour Pro,L,EUR,1.34
Walnuts,France,Carrefour Pro,kg,EUR,14.55
Watermelon,France,Carrefour Pro,kg,EUR,0.83
Wheat Flour,France,Carrefour Pro,kg,EUR,0.73
Yeast,France,Carrefour Pro,kg,EUR,4.85
Yogurt,France,Carrefour Pro,L,EUR,4.24
Zucchini,France,Carrefour Pro,kg,EUR,1.03`;

const categorize = (name: string): string => {
  const n = name.toLowerCase();
  if (n.match(/(chicken|beef|pork|fish|shrimp|salmon|eggs|steak|almonds|cashews|hazelnuts|peanuts|pecans|pistachios|walnuts|poppy seeds|sesame seeds)/)) return 'Protein';
  if (n.match(/(apple|avocado|banana|blueberry|blueberries|grape|lemon|mango|orange|papaya|pineapple|strawberry|strawberries|watermelon)/)) return 'Fruit';
  if (n.match(/(tomato|onion|garlic|potato|carrot|broccoli|cabbage|beet|bell pepper|chili pepper|cucumber|zucchini|spinach|celery|lettuce|radish|turnip|eggplant|fennel|mushroom|sweet potato|cassava|cauliflower)/)) return 'Vegetable';
  if (n.match(/(milk|cream|cheese|yogurt|butter)/)) return 'Dairy';
  if (n.match(/(salt|pepper|basil|bay leaves|cardamom|cilantro|cinnamon|cloves|cumin|nutmeg|oregano|paprika|parsley|rosemary|saffron|star anise|thyme|turmeric|vanilla)/)) return 'Spice/Herb';
  if (n.match(/(rice|pasta|bread|wheat|flour|corn|beans|chickpeas|lentils|quinoa)/)) return 'Grain';
  if (n.match(/(oil)/)) return 'Oil/Fat';
  return 'Other';
};

const processData = (): PriceEntry[] => {
  const baseJan = rawJanData.split('\n').map(line => line.split(','));
  const baseDec = rawDecData.split('\n').map(line => line.split(','));
  const entries: PriceEntry[] = [];
  let id = 1;

  COUNTRIES.forEach(country => {
    const suppliers = SUPPLIERS_BY_COUNTRY[country.code];
    suppliers.forEach(supplier => {
      baseJan.forEach((row, idx) => {
        if (!row[0]) return;
        const name = row[0];
        const unit = row[3];
        let currentPrice = parseFloat(row[5]);
        let oldPrice = parseFloat(baseDec[idx][5]);
        if (country.code === 'MX') { currentPrice *= 20; oldPrice *= 20; }
        if (country.code === 'JP') { currentPrice *= 150; oldPrice *= 150; }
        if (country.code === 'US') { currentPrice *= 1.1; oldPrice *= 1.1; }
        const variance = 0.95 + (Math.random() * 0.1);
        currentPrice *= variance;
        oldPrice *= variance;
        const diff = currentPrice - oldPrice;
        const trend = diff > 0 ? 'up' : diff < 0 ? 'down' : 'stable';
        const trendVal = oldPrice !== 0 ? ((Math.abs(diff) / oldPrice) * 100).toFixed(1) : "0.0";
        entries.push({
          id: `pe-${id++}`,
          ingredientId: name.toLowerCase().replace(/\s+/g, '-'),
          name: name,
          category: categorize(name),
          country: country.name,
          countryCode: country.code,
          supplier: supplier,
          unit: unit,
          price: parseFloat(currentPrice.toFixed(2)),
          previousPrice: parseFloat(oldPrice.toFixed(2)),
          currency: country.symbol,
          lastUpdated: '1h ago',
          trend,
          trendValue: `${trendVal}%`
        });
      });
    });
  });
  return entries;
};

export const MOCK_PRICE_ENTRIES = processData();

export const BASE_INGREDIENTS = [
  { name: 'Chicken Breast', category: 'Protein', unit: 'kg', basePrice: 6.50, protein: 31, carbs: 0, fats: 3.6, calories: 165 },
  { name: 'Beef Chuck', category: 'Protein', unit: 'kg', basePrice: 12.00, protein: 26, carbs: 0, fats: 15, calories: 250 },
  { name: 'Salmon Fillet', category: 'Protein', unit: 'kg', basePrice: 18.50, protein: 20, carbs: 0, fats: 13, calories: 208 },
  { name: 'Shrimp', category: 'Protein', unit: 'kg', basePrice: 22.00, protein: 24, carbs: 0, fats: 0.3, calories: 99 },
  { name: 'Eggs', category: 'Protein', unit: 'doz', basePrice: 3.50, protein: 13, carbs: 1.1, fats: 11, calories: 155 },
  { name: 'Tomato', category: 'Vegetable', unit: 'kg', basePrice: 2.20, protein: 0.9, carbs: 3.9, fats: 0.2, calories: 18 },
  { name: 'Onion', category: 'Vegetable', unit: 'kg', basePrice: 1.10, protein: 1.1, carbs: 9, fats: 0.1, calories: 40 },
  { name: 'Garlic', category: 'Vegetable', unit: 'kg', basePrice: 8.00, protein: 6.4, carbs: 33, fats: 0.5, calories: 149 },
  { name: 'Potato', category: 'Vegetable', unit: 'kg', basePrice: 0.90, protein: 2, carbs: 17, fats: 0.1, calories: 77 },
  { name: 'Cheddar Cheese', category: 'Dairy', unit: 'kg', basePrice: 9.50, protein: 25, carbs: 1.3, fats: 33, calories: 402 },
  { name: 'Milk (Whole)', category: 'Dairy', unit: 'L', basePrice: 1.20, protein: 3.2, carbs: 4.8, fats: 3.3, calories: 61 },
  { name: 'Butter', category: 'Dairy', unit: '250g', basePrice: 2.80, protein: 0.9, carbs: 0.1, fats: 81, calories: 717 },
  { name: 'Sea Salt', category: 'Spice/Herb', unit: '500g', basePrice: 1.50, protein: 0, carbs: 0, fats: 0, calories: 0 },
  { name: 'Black Pepper', category: 'Spice/Herb', unit: '100g', basePrice: 4.50, protein: 10, carbs: 64, fats: 3, calories: 251 },
  { name: 'Spaghetti', category: 'Grain', unit: '500g', basePrice: 1.30, protein: 13, carbs: 75, fats: 1.5, calories: 371 },
  { name: 'Long Grain Rice', category: 'Grain', unit: 'kg', basePrice: 1.80, protein: 2.7, carbs: 28, fats: 0.3, calories: 130 },
  { name: 'Olive Oil', category: 'Oil/Fat', unit: 'L', basePrice: 9.00, protein: 0, carbs: 0, fats: 100, calories: 884 },
  { name: 'Sugar (White)', category: 'Other', unit: 'kg', basePrice: 1.15, protein: 0, carbs: 100, fats: 0, calories: 387 },
  { name: 'Honey', category: 'Other', unit: '500g', basePrice: 6.00, protein: 0.3, carbs: 82, fats: 0, calories: 304 },
  { name: 'Soy Sauce', category: 'Other', unit: '500ml', basePrice: 3.50, protein: 8, carbs: 4.9, fats: 0.6, calories: 53 },
];

export const MENU_ITEMS = [
  { id: 'dashboard', translationKey: 'navigation.dashboard', icon: 'dashboard', path: '/' },
  { id: 'price-tracker', translationKey: 'navigation.priceTracker', icon: 'sell', path: '/price-tracker' },
  { id: 'food-cost', translationKey: 'navigation.foodCost', icon: 'attach_money', path: '/food-cost' },
  { id: 'pairing', translationKey: 'navigation.pairingAnalysis', icon: 'science', path: '/pairing' },
  { id: 'history', translationKey: 'navigation.foodHistory', icon: 'history', path: '/history' },
  { id: 'create-dish', translationKey: 'navigation.createDish', icon: 'add_circle', path: '/create-dish' },
  { id: 'projects', translationKey: 'navigation.myProjects', icon: 'folder_open', path: '/projects' },
  { id: 'social', translationKey: 'navigation.socialHub', icon: 'groups', path: '/social' },
  { id: 'settings', translationKey: 'navigation.settings', icon: 'settings', path: '/settings' },
];

export const CUISINES = ['Spanish', 'Mexican', 'Italian', 'French', 'Japanese'];

export const MOCK_HISTORY_ENTRIES = [
  { id: 'h1', title: 'The Evolution of Paella', cuisine: 'Spanish', content: 'Paella originated in its modern form in the mid-19th century in Valencia.', source: 'UNESCO Cultural Heritage' },
  { id: 'h2', title: 'Mole Poblano Origins', cuisine: 'Mexican', content: 'Mole is a traditional sauce and marinade originally used in Mexican cuisine.', source: 'Gastronomy Institute' },
  { id: 'h3', title: 'History of Ramen', cuisine: 'Japanese', content: 'Ramen is a Japanese noodle soup consisting of Chinese-style wheat noodles.', source: 'Tokyo Culinary Museum' }
];

export const MOCK_DISHES = [
  { id: 'd1', title: 'Sous Vide Salmon', chef: 'Gordon', rating: 4.9, img: 'https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?auto=format&fit=crop&q=80&w=800', difficulty: 'Intermediate', description: 'Precision cooked salmon with aromatic herbs.' },
  { id: 'd2', title: 'Truffle Risotto', chef: 'Isabella', rating: 4.7, img: 'https://images.unsplash.com/photo-1476124369491-e7addf5db371?auto=format&fit=crop&q=80&w=800', difficulty: 'Advanced', description: 'Creamy carnaroli rice infused with black truffle.' },
  { id: 'd3', title: 'Classic Tacos', chef: 'Mateo', rating: 4.8, img: 'https://images.unsplash.com/photo-1565299585323-38d6b0865b47?auto=format&fit=crop&q=80&w=800', difficulty: 'Beginner', description: 'Authentic street-style tacos with slow-cooked carnitas.' },
];

export const MOCK_PROJECTS: Project[] = [
  {
    id: 'proj-001',
    userId: 'user-1',
    title: 'Autumn Menu 2026',
    color: 'orange',
    description: 'Fall seasonal menu development.',
    createdAt: '2025-12-20',
    updatedAt: '2026-01-03',
    recipes: ['d1', 'd2', 'd3'],
    foodCosts: ['fc-001'],
    pairings: ['pa-001']
  }
];

export const MOCK_FOOD_COSTS: FoodCostItem[] = [
  { id: 'fc-001', projectId: 'proj-001', recipeName: 'Paella Valenciana', template: CostTemplate.BASIC, totalCost: 12.50, servings: 4, costPerServing: 3.12, ingredients: [], createdAt: '2026-01-01', updatedAt: '2026-01-01' }
];

export const MOCK_PAIRINGS: PairingAnalysisItem[] = [
  { id: 'pa-001', projectId: 'proj-001', ingredients: ['Saffron', 'Tomato'], score: 8.5, analysis: 'Excellent synergy.', createdAt: '2026-01-01', updatedAt: '2026-01-01' }
];
