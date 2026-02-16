export enum PlanTier {
  FREE = 'free',
  PLATINUM = 'platinum',
  PLATINUM_PRIME = 'platinum_prime'
}

export enum CostTemplate {
  BASIC = 'BASIC',
  RESTAURANT = 'RESTAURANT',
  NUTRITIONAL = 'NUTRITIONAL',
  ECONOMIC = 'ECONOMIC'
}

export interface UserProfile {
  id: string;
  email: string;
  username: string;
  fullName: string;
  chefName: string;
  bio?: string;
  avatarUrl?: string;
  tier: PlanTier;
  isVerified: boolean;
  subscriptionRenewal?: string;
  autoRenew: boolean;
  paymentMethod?: string;
  stripeCustomerId?: string;
  subscriptionStatus?: string;
}

export interface Project {
  id: string;
  userId: string;
  title: string;
  description: string;
  color: 'orange' | 'blue' | 'red' | 'green' | 'purple' | 'yellow' | 'cyan';
  createdAt: string;
  updatedAt: string;
  recipes: string[];
  foodCosts: string[];
  pairings: string[];
}

export interface FoodCostItem {
  id: string;
  projectId: string;
  recipeName: string;
  template: CostTemplate;
  totalCost: number;
  servings: number;
  costPerServing: number;
  ingredients: any[];
  createdAt: string;
  updatedAt: string;
}

export interface PairingAnalysisItem {
  id: string;
  projectId: string;
  ingredients: string[];
  score: number;
  analysis: string;
  createdAt: string;
  updatedAt: string;
}

export interface PriceEntry {
  id: string;
  ingredientId: string;
  name: string;
  category: string;
  country: string;
  countryCode: string;
  supplier: string;
  unit: string;
  price: number;
  previousPrice?: number;
  currency: string;
  lastUpdated: string;
  trend: 'up' | 'down' | 'stable';
  trendValue: string;
}

export interface ClipboardItem extends PriceEntry {
  quantity: number;
}

export interface FilterState {
  country: string;
  categories: string[];
  suppliers: string[];
  priceRange: [number, number];
  searchTerm: string;
}

export interface CostIngredient {
  id: string;
  name: string;
  quantity: number; 
  unit: string;
  unitPrice: number;
  currency: string;
  grossWeight?: number;
  handlingLoss?: number;
  netWeight?: number;
  cookedNetWeight?: number;
  costPercentage?: number;
  protein?: number;
  carbs?: number;
  fats?: number;
  calories?: number;
  fiber?: number;
  allergens?: string;
  currentSupplier?: string;
  cheapestSupplier?: string;
  cheapestPrice?: number;
  bulkDiscount?: number;
  finalCost?: number;
  savings?: number;
}

export interface PairingAnalysis {
  compatibilityScore: number;
  flavorProfile: string[];
  detailedExplanation: string;
  suggestedDishes: Array<{
    name: string;
    difficulty: string;
  }>;
  physicochemicalInfo?: string;
  complementaryIngredients?: string[];
  tips?: string[];
  thingsToAvoid?: string[];
  historicalContext?: string;
}

export interface OptimizationSuggestion {
  title: string;
  current: string;
  recommendation: string;
  impact: string;
  type: 'nutritional' | 'economic';
}

export interface PrepStep {
  id: string;
  order: number;
  description: string;
}

export type ChefNoteType = 'tip' | 'variation' | 'alternative' | 'suggestion' | 'substitute';

export interface ChefNote {
  id: string;
  type: ChefNoteType;
  content: string;
}

export interface Attachment {
  id: string;
  type: 'pairing' | 'foodCost' | 'context';
  itemId: string;
  itemName: string;
  itemData?: any;
  attachedAt: string;
}

export interface IngredientItem {
  id: string;
  name: string;
  quantity: string;
  unit: string;
}

export interface IngredientSubdivision {
  id: string;
  title: string;
  items: IngredientItem[];
}

export interface Recipe {
  id: string;
  title: string;
  description: string;
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced';
  prepTime: number;
  prepTimeUnit: 'mins' | 'hours';
  servings: number;
  subdivisions: IngredientSubdivision[];
  prepSteps: string[];
  images: string[];
  chefNotes: ChefNote[];
  attachments: Attachment[];
  isDraft: boolean;
}