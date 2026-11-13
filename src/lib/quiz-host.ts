/**
 * Resolve the `quizzes.host_id` for a creating session.
 *
 * `quizzes.host_id` is `uuid not null references profiles(id)`, but the
 * built-in admin and file-mode accounts have non-uuid ids such as
 * "admin-001". Inserting one raised
 *   22P02 invalid input syntax for type uuid: "admin-001"
 * which the create route then swallowed into a file write that cannot persist
 * on a serverless host — a quiz that appeared to save and was gone on reload.
 *
 * Real Supabase accounts pass straight through. Everything else is mapped to
 * the profile that owns the same email, falling back to an existing admin
 * profile, so the quiz is attributed to a real user instead of failing.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function resolveQuizHostId(
  // Admin (service-role) client; typed loosely to avoid pulling Supabase types
  // into every caller.
  admin: any,
  session: { id: string; email?: string | null } | null
): Promise<string | null> {
  if (!session) return null;
  if (UUID_RE.test(session.id)) return session.id;

  try {
    if (session.email) {
      const { data } = await admin
        .from("profiles")
        .select("id")
        .ilike("email", session.email)
        .maybeSingle();
      if (data?.id) return data.id;
    }
    const { data: admins } = await admin
      .from("profiles")
      .select("id")
      .eq("role", "admin")
      .order("created_at", { ascending: true })
      .limit(1);
    return admins?.[0]?.id ?? null;
  } catch {
    return null;
  }
}
