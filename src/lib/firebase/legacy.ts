/**
 * Minimal Firebase Auth + Firestore REST helpers for the v1→v2 migration.
 *
 * We deliberately avoid the firebase-js-sdk dependency: the migration
 * touches three endpoints once per user, and a 60-line REST client is
 * smaller, server-friendlier, and avoids dragging the firebase auth module
 * into our edge bundle.
 */

const FB_API_KEY = process.env.LEGACY_FIREBASE_API_KEY!;
const FB_PROJECT = process.env.LEGACY_FIREBASE_PROJECT_ID!;

interface SignInResponse {
  idToken: string;
  email: string;
  localId: string;
}

export async function signInLegacy(email: string, password: string): Promise<SignInResponse> {
  const r = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FB_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    },
  );
  if (!r.ok) {
    const err = (await r.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(err.error?.message || 'invalid-credentials');
  }
  return (await r.json()) as SignInResponse;
}

type FirestoreField = {
  stringValue?: string;
  integerValue?: string;
  doubleValue?: number;
  booleanValue?: boolean;
  timestampValue?: string;
};

interface FirestoreDoc {
  fields?: Record<string, FirestoreField>;
}

function fieldVal(f?: FirestoreField): unknown {
  if (!f) return undefined;
  if (f.stringValue !== undefined) return f.stringValue;
  if (f.integerValue !== undefined) return parseInt(f.integerValue, 10);
  if (f.doubleValue !== undefined) return f.doubleValue;
  if (f.booleanValue !== undefined) return f.booleanValue;
  if (f.timestampValue !== undefined) return f.timestampValue;
  return undefined;
}

export interface LegacyProfile {
  uid: string;
  email: string;
  name: string;
  grade: string | number;
  totalXP: number;
  level: number;
}

export async function fetchLegacyProfile(uid: string, idToken: string): Promise<LegacyProfile | null> {
  const r = await fetch(
    `https://firestore.googleapis.com/v1/projects/${FB_PROJECT}/databases/(default)/documents/users/${uid}`,
    { headers: { Authorization: `Bearer ${idToken}` } },
  );
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`firestore ${r.status}`);
  const doc = (await r.json()) as FirestoreDoc;
  if (!doc.fields) return null;
  return {
    uid,
    email: (fieldVal(doc.fields.email) as string) ?? '',
    name: (fieldVal(doc.fields.name) as string) ?? 'Wizard',
    grade: (fieldVal(doc.fields.grade) as string | number) ?? '4-5',
    totalXP: (fieldVal(doc.fields.totalXP) as number) ?? 0,
    level: (fieldVal(doc.fields.level) as number) ?? 1,
  };
}

export interface LegacyAnswer {
  question: string;
  operation: string;
  correct: boolean;
  timestamp: string;
}

export async function fetchLegacyAnswers(uid: string, idToken: string, max = 1000): Promise<LegacyAnswer[]> {
  // Use a structured query to filter answers by userId.
  const body = {
    structuredQuery: {
      from: [{ collectionId: 'answers' }],
      where: {
        fieldFilter: {
          field: { fieldPath: 'userId' },
          op: 'EQUAL',
          value: { stringValue: uid },
        },
      },
      limit: max,
    },
  };
  const r = await fetch(
    `https://firestore.googleapis.com/v1/projects/${FB_PROJECT}/databases/(default)/documents:runQuery`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  );
  if (!r.ok) throw new Error(`firestore-query ${r.status}`);
  const rows = (await r.json()) as Array<{ document?: FirestoreDoc }>;
  return rows
    .filter((r) => r.document?.fields)
    .map((r) => {
      const f = r.document!.fields!;
      return {
        question: (fieldVal(f.question) as string) ?? '',
        operation: (fieldVal(f.operation) as string) ?? 'addition',
        correct: (fieldVal(f.correct) as boolean) ?? false,
        timestamp: (fieldVal(f.timestamp) as string) ?? new Date().toISOString(),
      };
    });
}

/** Map a v1 numeric/string grade to a v2 GradeBand. */
export function gradeToBand(grade: string | number): 'K-1' | '2-3' | '4-5' | '6-7' | '8-9' | '10-12' {
  const s = String(grade).trim();
  if (s === 'KG-1' || s === 'K-1') return 'K-1';
  if (s === '2-3') return '2-3';
  if (s === '4-5') return '4-5';
  if (s === '6-7') return '6-7';
  if (s === '7-8' || s === '8-9') return '8-9';
  if (s === '9+' || s === '10-12') return '10-12';
  const n = parseInt(s, 10);
  if (Number.isFinite(n)) {
    if (n <= 1) return 'K-1';
    if (n <= 3) return '2-3';
    if (n <= 5) return '4-5';
    if (n <= 7) return '6-7';
    if (n <= 9) return '8-9';
    return '10-12';
  }
  return '4-5';
}
