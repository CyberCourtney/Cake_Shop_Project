// Order references look like KV-7K3QXM: a prefix and six Crockford base32 characters.
// Crockford's alphabet leaves out I, L, O and U, so a reference is easy to read out over
// the phone. 32^6 is about one billion. References are random, not sequential, so nobody
// can guess how many orders exist or step through them.

export const ORDER_REF_PREFIX = "KV-";
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export const ORDER_REF_PATTERN = /^KV-[0-9A-HJKMNP-TV-Z]{6}$/;

export function generateOrderRef(randomBytes: (n: number) => Uint8Array): string {
  const bytes = randomBytes(6);
  let out = "";
  for (const b of bytes) out += ALPHABET[b & 31];
  return ORDER_REF_PREFIX + out;
}

/** Accepts what a person might type ("kv-7k3qxm", "KV 7K3QXM", "7k3qxm") and normalises it. */
export function normaliseOrderRef(input: string): string | null {
  let s = input.trim().toUpperCase().replace(/\s+/g, "");
  if (/^KV-?/.test(s)) s = s.replace(/^KV-?/, "");
  // Crockford decoding: O reads as 0, I and L as 1.
  s = s.replace(/O/g, "0").replace(/[IL]/g, "1");
  const ref = ORDER_REF_PREFIX + s;
  return ORDER_REF_PATTERN.test(ref) ? ref : null;
}
