/**
 * The publishing deploy key (FRE-08): an Ed25519 pair made in memory. The public half goes to the
 * private repository as a read-only deploy key and the private half, in OpenSSH's own format, into
 * the instance's `PRIVATE_CONTENT_KEY` Actions secret. Neither is ever written to disk.
 */
import { generateKeyPairSync, randomBytes } from "node:crypto";

export const DEPLOY_KEY_TITLE = "Focus Notes publishing";
const TYPE = "ssh-ed25519";

const u32 = (n: number) => {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n);
  return b;
};
/** An SSH wire-format string: a 32-bit length, then the bytes. */
const str = (b: Buffer | string) => {
  const buf = typeof b === "string" ? Buffer.from(b, "utf8") : b;
  return Buffer.concat([u32(buf.length), buf]);
};

export interface DeployKeyPair {
  /** `ssh-ed25519 <base64> <comment>`, as GitHub's deploy key API takes it. */
  publicKey: string;
  /** The unencrypted `-----BEGIN OPENSSH PRIVATE KEY-----` file, as `ssh -i` reads it. */
  privateKey: string;
}

export function deployKeyPair(comment = "focus-notes-publishing"): DeployKeyPair {
  const { privateKey } = generateKeyPairSync("ed25519");
  const jwk = privateKey.export({ format: "jwk" });
  const seed = Buffer.from(jwk.d!, "base64url");
  const pub = Buffer.from(jwk.x!, "base64url");
  const pubBlob = Buffer.concat([str(TYPE), str(pub)]);
  // openssh-key-v1 (OpenSSH's PROTOCOL.key): no cipher, one key, and a private section padded to 8 bytes.
  const check = randomBytes(4);
  const keys = Buffer.concat([seed, pub]);
  const unpadded = Buffer.concat([check, check, str(TYPE), str(pub), str(keys), str(comment)]);
  const pad = Buffer.from(Array.from({ length: (8 - (unpadded.length % 8)) % 8 }, (_, i) => i + 1));
  const section = Buffer.concat([unpadded, pad]);
  const body = Buffer.concat([Buffer.from("openssh-key-v1\0", "latin1"), str("none"), str("none"), str(""), u32(1), str(pubBlob), str(section)]);
  const lines = body.toString("base64").match(/.{1,70}/g) ?? [];
  for (const b of [seed, keys, unpadded, section, body]) b.fill(0);
  return {
    publicKey: `${TYPE} ${pubBlob.toString("base64")} ${comment}`,
    privateKey: `-----BEGIN OPENSSH PRIVATE KEY-----\n${lines.join("\n")}\n-----END OPENSSH PRIVATE KEY-----\n`,
  };
}
