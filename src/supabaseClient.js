import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    "Thiếu VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. " +
    "Tạo file .env (xem .env.example) trước khi chạy app."
  );
}

export const supabase = createClient(supabaseUrl || "", supabaseAnonKey || "");
