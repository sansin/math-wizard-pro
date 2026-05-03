import { NextResponse } from 'next/server';
import { z } from 'zod';
import { signInLegacy, fetchLegacyProfile, fetchLegacyAnswers, gradeToBand } from '@/lib/firebase/legacy';

export const runtime = 'nodejs';

const Body = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(req: Request) {
  let body: z.infer<typeof Body>;
  try { body = Body.parse(await req.json()); }
  catch (e) { return NextResponse.json({ error: 'invalid', detail: (e as Error).message }, { status: 400 }); }

  if (!process.env.LEGACY_FIREBASE_API_KEY || !process.env.LEGACY_FIREBASE_PROJECT_ID) {
    return NextResponse.json({
      error: 'migration-not-configured',
      detail: 'The Classic Math Wizard import flow is not configured on this server. Set LEGACY_FIREBASE_API_KEY and LEGACY_FIREBASE_PROJECT_ID to enable. (Admin: see deploy docs.)',
    }, { status: 503 });
  }

  let signed;
  try {
    signed = await signInLegacy(body.email, body.password);
  } catch (e) {
    const err = e as Error & { firebaseCode?: string };
    return NextResponse.json({
      error: 'classic-auth-failed',
      detail: err.message,
      firebaseCode: err.firebaseCode ?? null,
    }, { status: 401 });
  }

  const profile = await fetchLegacyProfile(signed.localId, signed.idToken);
  if (!profile) {
    return NextResponse.json({ error: 'classic-no-profile' }, { status: 404 });
  }

  const answers = await fetchLegacyAnswers(signed.localId, signed.idToken, 5000).catch(() => []);

  return NextResponse.json({
    preview: {
      legacyUid: signed.localId,
      email: profile.email || body.email,
      displayName: profile.name,
      gradeBand: gradeToBand(profile.grade),
      totalXP: profile.totalXP,
      answerCount: answers.length,
      level: profile.level,
    },
  });
}
