import { PlanTier } from '../types';

export interface PlanConfig {
  id: PlanTier;
  nameKey: string;
  priceEur: number;
  priceFormatted: string;
  badge: string;
  limits: {
    recipes: number; // max recipes
    pairings: number; // max saved pairings in projects
    foodCosts: number; // max food costs
    sharedItems: number; // max shared
    folders: number; // max project folders
    quickAnalysesPerMonth: number;
    deepAnalysesPerMonth: number;
  };
  features: {
    pairingAnalysisAllowed: boolean;
    priceTrackerAllowed: boolean;
    clipboardAllowed: boolean;
    allowedLanguages: string[]; // language codes
  };
}

export const PLAN_CONFIGS: Record<PlanTier, PlanConfig> = {
  [PlanTier.FREE]: {
    id: PlanTier.FREE,
    nameKey: 'subscription.freePlan',
    priceEur: 0,
    priceFormatted: 'Free (0€)',
    badge: 'FREE',
    limits: {
      recipes: 5,
      pairings: 0,
      foodCosts: 5,
      sharedItems: 5,
      folders: 5,
      quickAnalysesPerMonth: 0,
      deepAnalysesPerMonth: 0
    },
    features: {
      pairingAnalysisAllowed: false,
      priceTrackerAllowed: false,
      clipboardAllowed: false,
      allowedLanguages: ['en']
    }
  },
  [PlanTier.PRIME]: {
    id: PlanTier.PRIME,
    nameKey: 'subscription.prime',
    priceEur: 9,
    priceFormatted: '9€ / month',
    badge: 'PRIME',
    limits: {
      recipes: 30,
      pairings: 30,
      foodCosts: 30,
      sharedItems: 30,
      folders: 30,
      quickAnalysesPerMonth: 10,
      deepAnalysesPerMonth: 10
    },
    features: {
      pairingAnalysisAllowed: true,
      priceTrackerAllowed: true,
      clipboardAllowed: true,
      allowedLanguages: ['en', 'ca', 'es']
    }
  },
  [PlanTier.PLATINUM_PRIME]: {
    id: PlanTier.PLATINUM_PRIME,
    nameKey: 'subscription.platinum_prime',
    priceEur: 25,
    priceFormatted: '25€ / month',
    badge: 'PLATINUM PRIME',
    limits: {
      recipes: Infinity,
      pairings: Infinity,
      foodCosts: Infinity,
      sharedItems: Infinity,
      folders: Infinity,
      quickAnalysesPerMonth: Infinity,
      deepAnalysesPerMonth: Infinity
    },
    features: {
      pairingAnalysisAllowed: true,
      priceTrackerAllowed: true,
      clipboardAllowed: true,
      allowedLanguages: ['en', 'es', 'ca', 'fr', 'ja', 'it', 'pt', 'zh', 'de']
    }
  }
};

export const normalizeTier = (tier?: string | null): PlanTier => {
  if (!tier) return PlanTier.FREE;
  const lower = tier.toLowerCase();
  if (lower === 'platinum_prime' || lower === 'platinum-prime' || lower === 'platinum prime') {
    return PlanTier.PLATINUM_PRIME;
  }
  if (lower === 'prime' || lower === 'platinum') {
    return PlanTier.PRIME;
  }
  return PlanTier.FREE;
};

export const getPlanConfig = (tier?: string | null): PlanConfig => {
  const norm = normalizeTier(tier);
  return PLAN_CONFIGS[norm] || PLAN_CONFIGS[PlanTier.FREE];
};

export const checkCanCreateItem = (
  tier: string | null | undefined,
  type: 'recipes' | 'pairings' | 'foodCosts' | 'sharedItems' | 'folders',
  currentCount: number
): { allowed: boolean; limit: number; current: number; message?: string } => {
  const config = getPlanConfig(tier);
  const limit = config.limits[type];

  if (currentCount >= limit) {
    return {
      allowed: false,
      limit,
      current: currentCount,
      message: `You have reached the maximum limit of ${limit} ${type} on your current plan (${config.badge}). Upgrade your subscription to create more.`
    };
  }

  return { allowed: true, limit, current: currentCount };
};

export const isLanguageAllowed = (tier: string | null | undefined, langCode: string): boolean => {
  const config = getPlanConfig(tier);
  return config.features.allowedLanguages.includes(langCode);
};
