import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  "https://zycgtxsxnxwkxookawkl.supabase.co";
const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp5Y2d0eHN4bnh3a3hvb2thd2tsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ4OTk5NTEsImV4cCI6MjEwMDQ3NTk1MX0.apUqsCKAd88OCFiF7gi628rMTbg6cEQ59MgoIZ6bzOg";

/** Server-side Supabase client bound to the request cookie store. */
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // called from a Server Component; middleware refreshes the session instead.
        }
      },
    },
  });
}
