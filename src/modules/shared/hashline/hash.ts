// 移植自 @d3ara1n/pi-hashline-edit 的 MIT 核心；来源与许可见 README.md。
// 哈希绑定行号与内容，用于检测引用行变化；短哈希不保证无碰撞。
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
