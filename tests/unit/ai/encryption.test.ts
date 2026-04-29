import { describe, it, expect } from 'vitest';
import { encryptKey, decryptKey, makeHint } from '@/lib/ai/encryption';

const SECRET = 'a'.repeat(64); // 32 bytes hex

describe('encryptKey / decryptKey', () => {
  it('round-trips an arbitrary key', async () => {
    const plaintext = 'sk-ant-api03-abcdef1234567890abcdef1234567890';
    const encrypted = await encryptKey(plaintext, SECRET);
    expect(encrypted).not.toContain(plaintext);
    const back = await decryptKey(encrypted, SECRET);
    expect(back).toBe(plaintext);
  });

  it('produces different ciphertext on each call (random IV)', async () => {
    const plaintext = 'gsk_abc123';
    const a = await encryptKey(plaintext, SECRET);
    const b = await encryptKey(plaintext, SECRET);
    expect(a).not.toBe(b);
  });

  it('fails to decrypt under a different secret', async () => {
    const plaintext = 'sk_dummy';
    const encrypted = await encryptKey(plaintext, SECRET);
    const otherSecret = 'b'.repeat(64);
    await expect(decryptKey(encrypted, otherSecret)).rejects.toThrow();
  });

  it('rejects malformed ciphertext', async () => {
    await expect(decryptKey('not:encrypted', SECRET)).rejects.toThrow();
  });

  it('rejects bad secret length', async () => {
    await expect(encryptKey('hi', 'abc')).rejects.toThrow();
  });
});

describe('makeHint', () => {
  it('returns last 4 chars padded', () => {
    expect(makeHint('sk-abc1234')).toBe('••••1234');
  });
  it('handles short keys', () => {
    expect(makeHint('xyz')).toContain('xyz');
  });
});
