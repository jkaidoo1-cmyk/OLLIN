import { isLocalMode, getLocalUser } from "@/lib/local";
import { createClient } from "@/lib/supabase/client";

/** The person using the app in this browser, as far as a client page can tell. */
export interface CurrentUser {
  name: string;
  email: string | null;
  isGuest: boolean;
}

/**
 * Resolve the signed-in user for a client page.
 *
 * The app's own session cookie is the source of truth: login sets `ollin_session`,
 * while the browser frequently holds no Supabase session at all. Local mode and
 * the Supabase client are only fallbacks for when the cookie is unavailable
 * (offline, or an older client-side login).
 *
 * Pages used to carry their own copy of this chain, which is how /join and
 * /quiz/[code] drifted into asking signed-in students for their name again.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  try {
    const res = await fetch("/api/auth/me", { cache: "no-store" });
    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      if (data?.user) {
        return {
          name: data.user.full_name || data.user.email?.split("@")[0] || "Student",
          email: data.user.email ?? null,
          isGuest: false,
        };
      }
    }
  } catch {
    /* offline — fall back to the client-side stores */
  }

  if (isLocalMode()) {
    const localUser = getLocalUser();
    if (localUser) {
      return { name: localUser.full_name || "Student", email: localUser.email ?? null, isGuest: false };
    }
    return null;
  }

  const supabase = createClient();
  if (!supabase) return null;
  try {
    const { data } = await supabase.auth.getUser();
    if (!data.user) return null;
    return {
      name: data.user.user_metadata?.full_name || data.user.email?.split("@")[0] || "Student",
      email: data.user.email ?? null,
      isGuest: false,
    };
  } catch {
    return null;
  }
}
