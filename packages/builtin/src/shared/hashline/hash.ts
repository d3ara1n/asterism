// Ported from the MIT core of @d3ara1n/pi-hashline-edit; see README.md for source and license.
// Hashes bind line numbers and content to detect changes to referenced lines; short hashes do not guarantee freedom from collisions.
const BASE32 = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function fnv1a32(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function toBase32(n: number, len: number): string {
  let s = "";
  for (let i = 0; i < len; i++) {
    s = BASE32[n & 31] + s;
    n = Math.floor(n / 32);
  }
  return s;
}

export function computeLineHash(line: number, content: string, len = 4): string {
  return toBase32(fnv1a32(`${line}\n${content}`), len);
}

export function hashFileLines(lines: readonly string[], len = 4): string[] {
  return lines.map((content, i) => computeLineHash(i + 1, content, len));
}
