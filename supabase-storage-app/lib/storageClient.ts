/**
 * @see https://docs.expo.dev/guides/environment-variables/
 * @see https://supabase.com/docs/reference/javascript/initializing
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";

// ─── Variables de entorno ────────────────────────────────────────────────────
const SUPABASE_URL: string = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY: string =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";

// ─── Validación en tiempo de ejecución ──────────────────────────────────────
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    "[storageClient] Las variables de entorno EXPO_PUBLIC_SUPABASE_URL y " +
      "EXPO_PUBLIC_SUPABASE_ANON_KEY son obligatorias. " +
      "Verifica tu archivo .env en la raíz del proyecto."
  );
}

// ─── Cliente Supabase ────────────────────────────────────────────────────────
export const supabase: SupabaseClient = createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  {
    auth: {
      // Para apps móviles públicas sin autenticación de usuario,
      // desactivamos la persistencia de sesión automática.
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  }
);

// ─── Nombre del bucket ───────────────────────────────────────────────────────
export const STORAGE_BUCKET = "uploads";