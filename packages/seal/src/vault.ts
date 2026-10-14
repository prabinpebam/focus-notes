/**
 * The vault's grant (D-90, FRE-08): the owner's built-in grant in `private/access.json`, holding only
 * the passphrase's derived key. Used by the desktop setup and by `cli.ts vault-init`.
 */
import { derivePasscodeBits, passphraseStrength, randomBytes, randomId, SALT_BYTES, toB64url } from "./format.ts";
import type { AccessFile } from "./publish.ts";

/** A passphrase too easy to guess offline. Its message never quotes the passphrase. */
export class WeakPassphrase extends Error {
  readonly bits: number;
  constructor(bits: number) {
    super(`That passphrase is too easy to guess offline (about ${bits} bits). Use at least 12 characters, for example four or more random words.`);
    this.bits = bits;
  }
}

/** Whether the file already has an owner's grant that's in force. */
export const hasVault = (access: AccessFile) => access.grants.some((g) => g.owner && !g.revokedAt);

/**
 * The access file with a new owner's grant for this passphrase: a fresh salt, the PBKDF2 key, and
 * scope "all". Any earlier owner's grant is withdrawn (kept, with `revokedAt`), so there's one in force.
 */
export async function withVaultGrant(access: AccessFile, passphrase: string, now = new Date()): Promise<AccessFile> {
  const strength = passphraseStrength(passphrase);
  if (!strength.ok) throw new WeakPassphrase(strength.bits);
  const salt = randomBytes(SALT_BYTES);
  const passcodeKey = toB64url(await derivePasscodeBits(passphrase, salt));
  const at = now.toISOString();
  const grants = access.grants.map((g) => (g.owner && !g.revokedAt ? { ...g, revokedAt: at } : g));
  grants.push({ id: randomId("g", 8), name: "You", owner: true, salt: toB64url(salt), passcodeKey, scope: { all: true }, createdAt: at });
  return { ...access, grants };
}
