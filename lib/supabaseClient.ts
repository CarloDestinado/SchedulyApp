import { createClient } from "@supabase/supabase-js";
import AsyncStorage from "@react-native-async-storage/async-storage";

const supabaseUrl = "https://owtssaxuksprxghsvmey.supabase.co";
const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im93dHNzYXh1a3NwcnhnaHN2bWV5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2NzY0NzAsImV4cCI6MjA5NzI1MjQ3MH0.frDcsq3y08beLVteUhESI8XOurL4BDABS-Bx9gxqxzM";

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
