import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// Server-side Supabase client that reads the caller's session from cookies.
// Uses the anon key (not service role) so RLS still applies as that user —
// this is for identity checks (auth.getUser()) and own-row reads, not for
// privileged/admin operations.
export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Called from a Server Component — session refresh is handled
            // by the middleware instead, this can be safely ignored.
          }
        },
      },
    }
  )
}
