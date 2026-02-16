
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://erxcltywvfmmcxafansr.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVyeGNsdHl3dmZtbWN4YWZhbnNyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc0Mzc4MzEsImV4cCI6MjA4MzAxMzgzMX0.l-o2Lwk-D-JgY6jgI2XinfT3nqL6jZ03dZc5UJJ9Qc0';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
