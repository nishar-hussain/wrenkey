import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  "https://zycgtxsxnxwkxookawkl.supabase.co";
const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp5Y2d0eHN4bnh3a3hvb2thd2tsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ4OTk5NTEsImV4cCI6MjEwMDQ3NTk1MX0.apUqsCKAd88OCFiF7gi628rMTbg6cEQ59MgoIZ6bzOg";

/** Refresh the Supabase session on every request so Server Components see fresh cookies. */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  // Without Supabase config there is no session to refresh. Skip instead of
  // letting createServerClient throw, which would 500 every request.
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return response;
  }

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // Touch the user to trigger a token refresh when needed. A failure here
  // (network, bad config) must not take down the request.
  try {
    await supabase.auth.getUser();
  } catch {
    // Session refresh failed; serve the request unauthenticated.
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.svg$).*)"],
};
