-- ========================================================
-- MASTER CULINARY STUDIO DATABASE SCHEMA (VERSION 3.2 - COMPLETE & IDEMPOTENT)
-- Production PostgreSQL / Supabase Schema with Multi-User Isolation,
-- Granular Row Level Security (RLS), Promo Codes & Storage Policies.
-- ========================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. CORE: PROFILES (Chef Identity & Tiers)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE,
  full_name TEXT,
  chef_name TEXT,
  bio TEXT,
  avatar_url TEXT,
  tier TEXT DEFAULT 'free',
  subscription_status TEXT DEFAULT 'active',
  subscription_renewal TIMESTAMP WITH TIME ZONE,
  stripe_customer_id TEXT,
  quick_analyses_count INTEGER DEFAULT 0,
  deep_analyses_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Safe column additions for existing tables
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS username TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS full_name TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS chef_name TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS bio TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS tier TEXT DEFAULT 'free';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'active';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS subscription_renewal TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS quick_analyses_count INTEGER DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS deep_analyses_count INTEGER DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- 2.1 PROMO CODES & BETA INVITATION SYSTEM
CREATE TABLE IF NOT EXISTS public.promo_codes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  tier TEXT NOT NULL DEFAULT 'platinum_prime',
  duration_months INTEGER NOT NULL DEFAULT 3,
  max_uses INTEGER NOT NULL DEFAULT 100,
  current_uses INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  valid_until TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.promo_redemptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  promo_id UUID NOT NULL REFERENCES public.promo_codes(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  redeemed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(promo_id, user_id)
);

-- Seed Initial Beta Codes
INSERT INTO public.promo_codes (code, tier, duration_months, max_uses, is_active)
VALUES 
  ('BETAPLATINUM3M', 'platinum_prime', 3, 500, TRUE),
  ('CHEFPRIME', 'prime', 3, 500, TRUE),
  ('CULINARYBETA', 'platinum_prime', 6, 1000, TRUE)
ON CONFLICT (code) DO NOTHING;

-- Function: Redeem Promo Code Atomically
CREATE OR REPLACE FUNCTION public.redeem_promo_code(p_code TEXT, p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_promo RECORD;
  v_renewal TIMESTAMP WITH TIME ZONE;
BEGIN
  -- Check if promo exists
  SELECT * INTO v_promo FROM public.promo_codes WHERE UPPER(code) = UPPER(p_code) FOR UPDATE;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Promo code does not exist.');
  END IF;

  IF NOT v_promo.is_active THEN
    RETURN jsonb_build_object('success', false, 'message', 'Promo code is inactive.');
  END IF;

  IF v_promo.max_uses > 0 AND v_promo.current_uses >= v_promo.max_uses THEN
    RETURN jsonb_build_object('success', false, 'message', 'Promo code has reached max redemptions.');
  END IF;

  IF v_promo.valid_until IS NOT NULL AND v_promo.valid_until < NOW() THEN
    RETURN jsonb_build_object('success', false, 'message', 'Promo code is expired.');
  END IF;

  -- Check if user already redeemed this promo
  IF EXISTS (SELECT 1 FROM public.promo_redemptions WHERE promo_id = v_promo.id AND user_id = p_user_id) THEN
    RETURN jsonb_build_object('success', false, 'message', 'You have already redeemed this promo code.');
  END IF;

  -- Calculate renewal date
  v_renewal := NOW() + (v_promo.duration_months || ' months')::interval;

  -- Update profile
  UPDATE public.profiles
  SET 
    tier = v_promo.tier,
    subscription_status = 'active',
    subscription_renewal = v_renewal,
    updated_at = NOW()
  WHERE id = p_user_id;

  -- Increment promo usage
  UPDATE public.promo_codes
  SET current_uses = current_uses + 1
  WHERE id = v_promo.id;

  -- Insert redemption record
  INSERT INTO public.promo_redemptions (promo_id, user_id, redeemed_at)
  VALUES (v_promo.id, p_user_id, NOW());

  RETURN jsonb_build_object(
    'success', true,
    'tier', v_promo.tier,
    'duration_months', v_promo.duration_months,
    'renewal_date', v_renewal,
    'message', 'Promo code redeemed successfully!'
  );
END;
$$;


-- 3. CONTENT: PROJECTS (Folders / Workspaces)
CREATE TABLE IF NOT EXISTS public.projects (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'New Project',
  description TEXT,
  color TEXT DEFAULT 'orange',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS color TEXT DEFAULT 'orange';
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();


-- 4. CONTENT: RECIPES (Dish Masterpieces & Technical Sheets)
CREATE TABLE IF NOT EXISTS public.recipes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  name TEXT, 
  description TEXT,
  difficulty TEXT DEFAULT 'Beginner',
  prep_time INTEGER DEFAULT 0,
  servings INTEGER DEFAULT 1,
  ingredients JSONB DEFAULT '[]'::jsonb,
  prep_steps JSONB DEFAULT '[]'::jsonb,
  images TEXT[] DEFAULT '{}'::text[],
  chef_notes JSONB DEFAULT '[]'::jsonb,
  attachments JSONB DEFAULT '[]'::jsonb,
  is_draft BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.recipes ADD COLUMN IF NOT EXISTS project_id UUID;
ALTER TABLE public.recipes ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE public.recipes ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.recipes ADD COLUMN IF NOT EXISTS difficulty TEXT DEFAULT 'Beginner';
ALTER TABLE public.recipes ADD COLUMN IF NOT EXISTS prep_time INTEGER DEFAULT 0;
ALTER TABLE public.recipes ADD COLUMN IF NOT EXISTS servings INTEGER DEFAULT 1;
ALTER TABLE public.recipes ADD COLUMN IF NOT EXISTS ingredients JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.recipes ADD COLUMN IF NOT EXISTS prep_steps JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.recipes ADD COLUMN IF NOT EXISTS images TEXT[] DEFAULT '{}'::text[];
ALTER TABLE public.recipes ADD COLUMN IF NOT EXISTS chef_notes JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.recipes ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.recipes ADD COLUMN IF NOT EXISTS is_draft BOOLEAN DEFAULT TRUE;
ALTER TABLE public.recipes ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();


-- 5. CONTENT: PAIRINGS (Flavor Matrix & Chemical Harmonizations)
CREATE TABLE IF NOT EXISTS public.pairings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT,
  name TEXT,
  ingredients TEXT[] NOT NULL,
  analysis JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.pairings ADD COLUMN IF NOT EXISTS project_id UUID;
ALTER TABLE public.pairings ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE public.pairings ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE public.pairings ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();


-- 6. CONTENT: FOOD COSTS (Professional Yield & Margin Calculations)
CREATE TABLE IF NOT EXISTS public.food_costs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  recipe_name TEXT NOT NULL,
  name TEXT,
  title TEXT,
  template TEXT NOT NULL DEFAULT 'ADVANCED',
  servings INTEGER DEFAULT 4,
  total_cost NUMERIC(10,2) DEFAULT 0,
  cost_per_serving NUMERIC(10,2) DEFAULT 0,
  ingredients JSONB DEFAULT '{}'::jsonb,
  data JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.food_costs ADD COLUMN IF NOT EXISTS project_id UUID;
ALTER TABLE public.food_costs ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE public.food_costs ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE public.food_costs ADD COLUMN IF NOT EXISTS template TEXT DEFAULT 'ADVANCED';
ALTER TABLE public.food_costs ADD COLUMN IF NOT EXISTS servings INTEGER DEFAULT 4;
ALTER TABLE public.food_costs ADD COLUMN IF NOT EXISTS total_cost NUMERIC(10,2) DEFAULT 0;
ALTER TABLE public.food_costs ADD COLUMN IF NOT EXISTS cost_per_serving NUMERIC(10,2) DEFAULT 0;
ALTER TABLE public.food_costs ADD COLUMN IF NOT EXISTS ingredients JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.food_costs ADD COLUMN IF NOT EXISTS data JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.food_costs ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();


-- 7. COLLABORATION: SHARED ITEMS (Granular 1-to-1 Sharing)
CREATE TABLE IF NOT EXISTS public.shared_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL CHECK (item_type IN ('recipe', 'pairing', 'food_cost', 'project')),
  item_id UUID NOT NULL,
  permission TEXT DEFAULT 'view' CHECK (permission IN ('view', 'edit')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(sender_id, recipient_id, item_type, item_id)
);


-- 8. SOCIAL HUB & COMMUNITY
CREATE TABLE IF NOT EXISTS public.social_posts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  recipe_id UUID REFERENCES public.recipes(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  image_url TEXT,
  difficulty TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(recipe_id)
);

CREATE TABLE IF NOT EXISTS public.social_likes (
  id BIGSERIAL PRIMARY KEY,
  post_id UUID REFERENCES public.social_posts(id) ON DELETE CASCADE NOT NULL,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(post_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.social_comments (
  id BIGSERIAL PRIMARY KEY,
  post_id UUID REFERENCES public.social_posts(id) ON DELETE CASCADE NOT NULL,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.social_saves (
  id BIGSERIAL PRIMARY KEY,
  post_id UUID REFERENCES public.social_posts(id) ON DELETE CASCADE NOT NULL,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(post_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.follows (
  id BIGSERIAL PRIMARY KEY,
  follower_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  following_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(follower_id, following_id)
);


-- 9. INGREDIENTS PRICE TRACKER (Global Benchmark Reference)
CREATE TABLE IF NOT EXISTS public.ingredients_prices (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  ingredient_name TEXT NOT NULL,
  category TEXT NOT NULL,
  country_code TEXT NOT NULL,
  country_name TEXT,
  distributor_name TEXT NOT NULL,
  price_per_unit NUMERIC(10,2) NOT NULL,
  unit TEXT NOT NULL DEFAULT 'kg',
  currency TEXT NOT NULL DEFAULT '€',
  last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);


-- 10. INDEXES FOR LIGHTNING-FAST LOOKUPS
CREATE INDEX IF NOT EXISTS idx_ingredients_prices_lookup 
  ON public.ingredients_prices(country_code, category, ingredient_name);
CREATE INDEX IF NOT EXISTS idx_recipes_user_id ON public.recipes(user_id);
CREATE INDEX IF NOT EXISTS idx_pairings_user_id ON public.pairings(user_id);
CREATE INDEX IF NOT EXISTS idx_food_costs_user_id ON public.food_costs(user_id);
CREATE INDEX IF NOT EXISTS idx_projects_user_id ON public.projects(user_id);
CREATE INDEX IF NOT EXISTS idx_shared_items_recipient ON public.shared_items(recipient_id);
CREATE INDEX IF NOT EXISTS idx_shared_items_sender ON public.shared_items(sender_id);
CREATE INDEX IF NOT EXISTS idx_social_posts_created_at ON public.social_posts(created_at DESC);


-- 11. AUTOMATION: PROFILE GUARD (Ensures profile exists prior to inserting content)
CREATE OR REPLACE FUNCTION public.ensure_profile_exists_for_content()
RETURNS TRIGGER AS $$
DECLARE
  target_user_id UUID;
BEGIN
  target_user_id := COALESCE(NEW.user_id, auth.uid());
  IF target_user_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = target_user_id) THEN
    INSERT INTO public.profiles (id, username, full_name, chef_name, tier)
    VALUES (
      target_user_id,
      'chef_' || substr(target_user_id::text, 1, 8),
      'Chef',
      'Chef Studio',
      'free'
    ) ON CONFLICT (id) DO NOTHING;
  END IF;
  NEW.user_id := target_user_id;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger applications
DROP TRIGGER IF EXISTS tr_ensure_profile_projects ON public.projects;
CREATE TRIGGER tr_ensure_profile_projects BEFORE INSERT ON public.projects FOR EACH ROW EXECUTE FUNCTION public.ensure_profile_exists_for_content();

DROP TRIGGER IF EXISTS tr_ensure_profile_recipes ON public.recipes;
CREATE TRIGGER tr_ensure_profile_recipes BEFORE INSERT ON public.recipes FOR EACH ROW EXECUTE FUNCTION public.ensure_profile_exists_for_content();

DROP TRIGGER IF EXISTS tr_ensure_profile_pairings ON public.pairings;
CREATE TRIGGER tr_ensure_profile_pairings BEFORE INSERT ON public.pairings FOR EACH ROW EXECUTE FUNCTION public.ensure_profile_exists_for_content();

DROP TRIGGER IF EXISTS tr_ensure_profile_food_costs ON public.food_costs;
CREATE TRIGGER tr_ensure_profile_food_costs BEFORE INSERT ON public.food_costs FOR EACH ROW EXECUTE FUNCTION public.ensure_profile_exists_for_content();


-- 12. AUTOMATION: NEW USER SIGNUP TRIGGER
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, username, full_name, chef_name, tier)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', SPLIT_PART(COALESCE(NEW.email, 'user'), '@', 1), 'chef_' || substr(NEW.id::text, 1, 8)),
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'Chef'),
    COALESCE(NEW.raw_user_meta_data->>'chef_name', 'Chef Studio'),
    COALESCE(NEW.raw_user_meta_data->>'tier', 'free')
  )
  ON CONFLICT (id) DO UPDATE SET
    updated_at = NOW();
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'auth' AND tablename = 'users') THEN
    DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
    CREATE TRIGGER on_auth_user_created
      AFTER INSERT ON auth.users
      FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;


-- 13. ROW LEVEL SECURITY (RLS) POLICIES
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pairings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.food_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shared_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_saves ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ingredients_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promo_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promo_redemptions ENABLE ROW LEVEL SECURITY;

-- Explicit Policy Re-creations
-- Profiles
DROP POLICY IF EXISTS "Profiles Public View" ON public.profiles;
CREATE POLICY "Profiles Public View" ON public.profiles FOR SELECT USING (true);
DROP POLICY IF EXISTS "Profiles Owner Manage" ON public.profiles;
CREATE POLICY "Profiles Owner Manage" ON public.profiles FOR ALL USING (auth.uid() = id);

-- Projects
DROP POLICY IF EXISTS "Projects Owner Manage" ON public.projects;
CREATE POLICY "Projects Owner Manage" ON public.projects FOR ALL USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Projects Shared Read" ON public.projects;
CREATE POLICY "Projects Shared Read" ON public.projects FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.shared_items 
    WHERE shared_items.item_type = 'project' 
    AND shared_items.item_id = projects.id 
    AND shared_items.recipient_id = auth.uid()
  )
);

-- Recipes
DROP POLICY IF EXISTS "Recipes Owner Manage" ON public.recipes;
CREATE POLICY "Recipes Owner Manage" ON public.recipes FOR ALL USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Recipes Public View" ON public.recipes;
CREATE POLICY "Recipes Public View" ON public.recipes FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.social_posts WHERE social_posts.recipe_id = recipes.id)
  OR EXISTS (
    SELECT 1 FROM public.shared_items 
    WHERE shared_items.item_type = 'recipe' 
    AND shared_items.item_id = recipes.id 
    AND shared_items.recipient_id = auth.uid()
  )
);

-- Pairings
DROP POLICY IF EXISTS "Pairings Owner Manage" ON public.pairings;
CREATE POLICY "Pairings Owner Manage" ON public.pairings FOR ALL USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Pairings Shared Read" ON public.pairings;
CREATE POLICY "Pairings Shared Read" ON public.pairings FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.shared_items 
    WHERE shared_items.item_type = 'pairing' 
    AND shared_items.item_id = pairings.id 
    AND shared_items.recipient_id = auth.uid()
  )
);

-- Food Costs
DROP POLICY IF EXISTS "Food Costs Owner Manage" ON public.food_costs;
CREATE POLICY "Food Costs Owner Manage" ON public.food_costs FOR ALL USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Food Costs Shared Read" ON public.food_costs;
CREATE POLICY "Food Costs Shared Read" ON public.food_costs FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.shared_items 
    WHERE shared_items.item_type = 'food_cost' 
    AND shared_items.item_id = food_costs.id 
    AND shared_items.recipient_id = auth.uid()
  )
);

-- Shared Items
DROP POLICY IF EXISTS "Shared Items View" ON public.shared_items;
CREATE POLICY "Shared Items View" ON public.shared_items FOR SELECT USING (
  auth.uid() = sender_id OR auth.uid() = recipient_id
);
DROP POLICY IF EXISTS "Shared Items Insert" ON public.shared_items;
CREATE POLICY "Shared Items Insert" ON public.shared_items FOR INSERT WITH CHECK (
  auth.uid() = sender_id
);
DROP POLICY IF EXISTS "Shared Items Delete" ON public.shared_items;
CREATE POLICY "Shared Items Delete" ON public.shared_items FOR DELETE USING (
  auth.uid() = sender_id OR auth.uid() = recipient_id
);

-- Social Feed
DROP POLICY IF EXISTS "Social Posts Public View" ON public.social_posts;
CREATE POLICY "Social Posts Public View" ON public.social_posts FOR SELECT USING (true);
DROP POLICY IF EXISTS "Social Posts Owner Manage" ON public.social_posts;
CREATE POLICY "Social Posts Owner Manage" ON public.social_posts FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Social Likes Public View" ON public.social_likes;
CREATE POLICY "Social Likes Public View" ON public.social_likes FOR SELECT USING (true);
DROP POLICY IF EXISTS "Social Likes Owner Manage" ON public.social_likes;
CREATE POLICY "Social Likes Owner Manage" ON public.social_likes FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Social Comments Public View" ON public.social_comments;
CREATE POLICY "Social Comments Public View" ON public.social_comments FOR SELECT USING (true);
DROP POLICY IF EXISTS "Social Comments Insert" ON public.social_comments;
CREATE POLICY "Social Comments Insert" ON public.social_comments FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Social Comments Delete" ON public.social_comments;
CREATE POLICY "Social Comments Delete" ON public.social_comments FOR DELETE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Social Saves Public View" ON public.social_saves;
CREATE POLICY "Social Saves Public View" ON public.social_saves FOR SELECT USING (true);
DROP POLICY IF EXISTS "Social Saves Owner Manage" ON public.social_saves;
CREATE POLICY "Social Saves Owner Manage" ON public.social_saves FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Follows Public View" ON public.follows;
CREATE POLICY "Follows Public View" ON public.follows FOR SELECT USING (true);
DROP POLICY IF EXISTS "Follows Owner Manage" ON public.follows;
CREATE POLICY "Follows Owner Manage" ON public.follows FOR ALL USING (auth.uid() = follower_id);

-- Benchmark Market Prices
DROP POLICY IF EXISTS "Ingredients Prices Public View" ON public.ingredients_prices;
CREATE POLICY "Ingredients Prices Public View" ON public.ingredients_prices FOR SELECT USING (true);

-- Promo Codes
DROP POLICY IF EXISTS "Promo Codes View" ON public.promo_codes;
CREATE POLICY "Promo Codes View" ON public.promo_codes FOR SELECT USING (true);

-- Promo Redemptions
DROP POLICY IF EXISTS "Promo Redemptions User View" ON public.promo_redemptions;
CREATE POLICY "Promo Redemptions User View" ON public.promo_redemptions FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Promo Redemptions User Insert" ON public.promo_redemptions;
CREATE POLICY "Promo Redemptions User Insert" ON public.promo_redemptions FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 14. STORAGE: DISH IMAGES BUCKET & POLICIES (Safe setup)
DO $$
BEGIN
  INSERT INTO storage.buckets (id, name, public)
  VALUES ('dish-images', 'dish-images', true)
  ON CONFLICT (id) DO UPDATE SET public = true;

  DROP POLICY IF EXISTS "Dish Images Public View" ON storage.objects;
  CREATE POLICY "Dish Images Public View" ON storage.objects FOR SELECT USING (bucket_id = 'dish-images');

  DROP POLICY IF EXISTS "Dish Images Auth Upload" ON storage.objects;
  CREATE POLICY "Dish Images Auth Upload" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'dish-images');

  DROP POLICY IF EXISTS "Dish Images Auth Update" ON storage.objects;
  CREATE POLICY "Dish Images Auth Update" ON storage.objects FOR UPDATE USING (bucket_id = 'dish-images');

  DROP POLICY IF EXISTS "Dish Images Auth Delete" ON storage.objects;
  CREATE POLICY "Dish Images Auth Delete" ON storage.objects FOR DELETE USING (bucket_id = 'dish-images');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;
