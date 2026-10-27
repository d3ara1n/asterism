const RAW_CHARACTERS = 1024 * 1024;
const highSurrogate = (value: number) => value >= 0xd800 && value <= 0xdbff;
const lowSurrogate = (value: number) => value >= 0xdc00 && value <= 0xdfff;

/** Retains a bounded tail of raw output in chunks; read ranges and text align together to Unicode character boundaries. */
export class RawBuffer {
  private chunks: string[] = [];
  private size = 0;
  private start = 0;

  constructor(private readonly capacity = RAW_CHARACTERS) {}

  get end() { return this.start + this.size; }

  push(data: string) {
    if (!data) return;
    this.chunks.push(data);
    this.size += data.length;
    while (this.size > this.capacity) {
      const first = this.chunks[0]!;
      const dropped = Math.min(first.length, this.size - this.capacity);
      if (dropped === first.length) this.chunks.shift();
      else this.chunks[0] = first.slice(dropped);
      this.size -= dropped;
      this.start += dropped;
    }
    // When an eviction boundary splits a surrogate pair, the remaining low surrogate also belongs to the evicted character.
    if (lowSurrogate(this.chunks[0]?.charCodeAt(0) ?? NaN)) {
      if (this.chunks[0]!.length === 1) this.chunks.shift();
      else this.chunks[0] = this.chunks[0]!.slice(1);
      this.size--;
      this.start++;
    }
  }

  read(offset?: number, limit = 16384) {
    const requested = offset ?? Math.max(this.start, this.end - limit);
    let from = Math.max(this.start, Math.min(requested, this.end));
    if (this.splitsCharacter(from)) from--;
    let to = Math.min(this.end, from + limit);
    // Read at most one extra code unit; even limit=1 can read a complete character and advance.
    if (this.splitsCharacter(to)) to++;
    return {
      text: this.slice(from, to),
      offset: from,
      nextOffset: to,
      truncated: requested < this.start || to < this.end,
    };
  }

  private splitsCharacter(offset: number): boolean {
    if (offset <= this.start || offset >= this.end) return false;
    const pair = this.slice(offset - 1, offset + 1);
    return highSurrogate(pair.charCodeAt(0)) && lowSurrogate(pair.charCodeAt(1));
  }

  private slice(from: number, to: number): string {
    const parts: string[] = [];
    let offset = this.start;
    for (const chunk of this.chunks) {
      const next = offset + chunk.length;
      if (next > from && offset < to) parts.push(chunk.slice(Math.max(0, from - offset), Math.min(chunk.length, to - offset)));
      offset = next;
      if (offset >= to) break;
    }
    return parts.join("");
  }
}
