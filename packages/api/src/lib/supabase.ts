import { createClient } from "@supabase/supabase-js";

export const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export function createSupabaseClient(accessToken: string) {
  console.log("Creating Supabase client with access token:", accessToken);
  console.log("Supabase URL:", process.env.SUPABASE_URL);
  console.log("Supabase Anon Key:", process.env.SUPABASE_ANON_KEY ? "****" : "Not set");
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    }
  );
}
