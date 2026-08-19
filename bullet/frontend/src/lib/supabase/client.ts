import { createBrowserClient } from "@supabase/ssr";

// The publishable key is public by design (RLS enforces access); safe in the bundle.
const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  "https://zycgtxsxnxwkxookawkl.supabase.co";
const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp5Y2d0eHN4bnh3a3hvb2thd2tsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ4OTk5NTEsImV4cCI6MjEwMDQ3NTk1MX0.apUqsCKAd88OCFiF7gi628rMTbg6cEQ59MgoIZ6bzOg";

/** Browser-side Supabase client. Reads the session from cookies set by the server. */
export function createClient() {
  return createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}
