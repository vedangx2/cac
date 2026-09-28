// lib/hash.ts
//
// A small, boring string hash (the FNV-1a algorithm), shared by anything that needs "same string
// in, same number out, spread reasonably across a range." This is not security and it is not
// cryptography. FNV-1a is about four lines, has no dependencies, and is easy to explain out loud,
// which matters more here than sophistication.
//
// Originally lived only in lib/forms/index.ts, which uses it to pick a form deterministically from
// a seed string. Moved here 2026-09-27 so lib/shuffle.ts could reuse the exact same technique for a
// deterministic shuffle, instead of a second hash implementation drifting alongside this one.

/**
 * The `>>> 0` keeps the value an unsigned 32-bit integer. Without it JavaScript's bitwise
 * operators would let the number go negative, and a negative index modulo a pool length is also
 * negative, which would index off the front of an array and return undefined.
 */
export function hashString(value: string): number {
  let hash = 0x811c9dc5; // FNV-1a 32-bit offset basis

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0; // multiply by the FNV prime, stay unsigned
  }

  return hash >>> 0;
}
