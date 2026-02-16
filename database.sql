
-- ========================================================
-- MASTER CULINARY STUDIO DATABASE SCHEMA (VERSION 2.8 - FIXED)
-- ========================================================

-- 1. CLEANUP
DROP TABLE IF EXISTS public.users CASCADE;

-- 2. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 3. CORE: PROFILES
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE,
  full_name TEXT,
  chef_name TEXT,
  bio TEXT,
  avatar_url TEXT,
  tier TEXT DEFAULT 'free',
  subscription_status TEXT DEFAULT 'active',
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. CONTENT: PROJECTS (FOLDERS)
CREATE TABLE IF NOT EXISTS public.projects (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'New Project',
  description TEXT,
  color TEXT DEFAULT 'orange',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. CONTENT: RECIPES
CREATE TABLE IF NOT EXISTS public.recipes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
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

-- 6. CONTENT: PAIRINGS
CREATE TABLE IF NOT EXISTS public.pairings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT,
  ingredients TEXT[] NOT NULL,
  analysis JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 7. CONTENT: FOOD COSTS
CREATE TABLE IF NOT EXISTS public.food_costs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  recipe_name TEXT NOT NULL,
  template TEXT NOT NULL,
  data JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 8. SOCIAL HUB / COMMUNITY
-- IMPORTANT: ON DELETE CASCADE on recipe_id ensures that if the recipe is deleted, the post is gone.
CREATE TABLE IF NOT EXISTS public.social_posts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
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
  user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(post_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.social_comments (
  id BIGSERIAL PRIMARY KEY,
  post_id UUID REFERENCES public.social_posts(id) ON DELETE CASCADE NOT NULL,
  user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.social_saves (
  id BIGSERIAL PRIMARY KEY,
  post_id UUID REFERENCES public.social_posts(id) ON DELETE CASCADE NOT NULL,
  user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(post_id, user_id)
);

-- 9. FOLLOWING SYSTEM
CREATE TABLE IF NOT EXISTS public.follows (
  id BIGSERIAL PRIMARY KEY,
  follower_id UUID NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  following_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(follower_id, following_id)
);

-- 10. COMMUNICATION: MESSAGES
CREATE TABLE IF NOT EXISTS public.messages (
  id BIGSERIAL PRIMARY KEY,
  sender_id UUID DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  receiver_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  is_ai BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 11. CULINARY ENCYCLOPEDIA
CREATE TABLE IF NOT EXISTS public.culinary_encyclopedia (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  topic_id TEXT UNIQUE NOT NULL,
  content TEXT NOT NULL,
  image_url TEXT,
  reading_time TEXT DEFAULT '5 min',
  author TEXT DEFAULT 'Culinary AI Studio',
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 12. USER SAVED TOPICS
CREATE TABLE IF NOT EXISTS public.user_saved_topics (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  topic_id TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, topic_id)
);

-- 13. AUTOMATION: PROFILE GUARD
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

-- 14. AUTOMATION: NEW USER TRIGGER
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, username, full_name, chef_name, tier)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', SPLIT_PART(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'Chef'),
    COALESCE(NEW.raw_user_meta_data->>'chef_name', 'Chef Studio'),
    COALESCE(NEW.raw_user_meta_data->>'tier', 'free')
  )
  ON CONFLICT (id) DO UPDATE SET
    updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 15. RLS POLICIES
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pairings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.food_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_saves ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.culinary_encyclopedia ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_saved_topics ENABLE ROW LEVEL SECURITY;

DO $$ 
DECLARE
  t TEXT;
  c_exists BOOLEAN;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Public View" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Owner Manage" ON public.%I', t);
    
    IF t IN ('profiles', 'social_posts', 'social_likes', 'social_comments', 'social_saves', 'culinary_encyclopedia', 'recipes') THEN
       EXECUTE format('CREATE POLICY "Public View" ON public.%I FOR SELECT USING (true)', t);
    END IF;
    
    IF t = 'profiles' THEN
       EXECUTE format('CREATE POLICY "Owner Manage" ON public.%I FOR ALL USING (auth.uid() = id)', t);
    ELSIF t = 'follows' THEN
       EXECUTE format('CREATE POLICY "Public View" ON public.%I FOR SELECT USING (true)', t);
       EXECUTE format('CREATE POLICY "Owner Manage" ON public.%I FOR ALL USING (auth.uid() = follower_id)', t);
    ELSE
       SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = t AND column_name = 'user_id') INTO c_exists;
       IF c_exists THEN
          EXECUTE format('CREATE POLICY "Owner Manage" ON public.%I FOR ALL USING (auth.uid() = user_id)', t);
       END IF;
    END IF;
  END LOOP;
END $$;
