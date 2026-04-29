/**
 * POST /api/migrate/commit
 *
 * Idempotent: if the email already exists in Supabase auth, we link
 * the legacy uid to that profile rather than creating a duplicate.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getServiceClient } from '@/lib/supabase/server';
import { signInLegacy, fetchLegacyProfile, fetchLegacyAnswers, gradeToBand } from '@/lib/firebase/legacy';

export const runtime = 'nodejs';

const Body = z.object({
  email: z.string().email(),
  legacyPassword: z.string().min(1),
  v2Password: z.string().min(6),
});

export async function POST(req: Request) {
  let body: z.infer<typeof Body>;
  try { body = Body.parse(await req.json()); }
  catch (e) { return NextResponse.json({ error: 'invalid', detail: (e as Error).message }, { status: 400 }); }

  // 1. Verify legacy creds
  let signed;
  try { signed = await signInLegacy(body.email, body.legacyPassword); }
  catch (e) { return NextResponse.json({ error: 'classic-auth-failed', detail: (e as Error).message }, { status: 401 }); }

  // 2. Fetch legacy profile + answers
  const profile = await fetchLegacyProfile(signed.localId, signed.idToken);
  if (!profile) return NextResponse.json({ error: 'classic-no-profile' }, { status: 404 });
  const answers = await fetchLegacyAnswers(signed.localId, signed.idToken, 5000).catch(() => []);

  // 3. Create or fetch the v2 user.
  const sb = getServiceClient();
  const { data: existingUsers } = await sb.auth.admin.listUsers({ page: 1, perPage: 200 });
  const existing = existingUsers?.users?.find((u: { email?: string }) => u.email?.toLowerCase() === body.email.toLowerCase());

  let userId: string;
  if (existing) {
    userId = existing.id;
    // Reset their password to the new value (they're proving ownership via legacy creds).
    await sb.auth.admin.updateUserById(userId, { password: body.v2Password });
  } else {
    const { data: created, error: createErr } = await sb.auth.admin.createUser({
      email: body.email,
      password: body.v2Password,
      email_confirm: true,
      user_metadata: {
        display_name: profile.name,
        grade_band: gradeToBand(profile.grade),
      },
    });
    if (createErr || !created.user) {
      return NextResponse.json({ error: 'create-failed', detail: createErr?.message }, { status: 500 });
    }
    userId = created.user.id;
  }

  // 4. Upsert profile with legacy uid for traceability.
  await sb.from('profiles').upsert({
    user_id: userId,
    display_name: profile.name,
    grade_band: gradeToBand(profile.grade),
    role: 'student',
    legacy_firebase_uid: signed.localId,
  });

  // 5. Carry over XP. We don't replay attempts (which would duplicate), we
  //    just set their starting xp_state.
  await sb.from('xp_state').upsert({
    user_id: userId,
    total_xp: profile.totalXP,
    level: Math.max(1, Math.min(30, profile.level)),
  });

  // 6. Optional: copy a summary record per legacy answer. Cheap and
  //    historically accurate; the verifier won't have run for these so we
  //    flag them with a synthetic question_id pointing to a placeholder.
  // Skipping by default to keep the row count small. Uncomment to enable:
  // (Could chunk-insert ~500 rows, mapping operation -> approximate skill_id.)

  return NextResponse.json({ ok: true, userId, copiedAnswers: 0 });
}
