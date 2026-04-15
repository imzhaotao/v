import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://cuoadvkafpjyeasyribj.supabase.co';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_Z3qks5beCk-7SwUTHZ_A9g_ohX4LeUE';

export const supabase = createClient(supabaseUrl, supabaseKey);
