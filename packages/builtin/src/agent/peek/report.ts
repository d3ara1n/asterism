const open = "<peek-report>", close = "</peek-report>";

/** Report boundaries can span body blocks and deltas; retrieval explanations outside them stay only in temporary model exchanges. */
export class PeekReport {
  text = "";
  tagged = false;
  private pending = "";
  private inside = false;
  private ended = false;

  push(delta: string): void {
    if (this.ended) return;
    this.pending += delta;
    const marker = this.inside ? close : open;
    const index = this.pending.indexOf(marker);
    if (index >= 0) {
      if (this.inside) {
        this.text += this.pending.slice(0, index);
        this.pending = ""; this.ended = true;
      } else {
        this.pending = this.pending.slice(index + open.length);
        this.inside = true; this.tagged = true;
        this.push("");
      }
      return;
    }
    let retained = Math.min(marker.length - 1, this.pending.length);
    while (retained > 0 && !marker.startsWith(this.pending.slice(-retained))) retained--;
    const visible = this.pending.slice(0, this.pending.length - retained);
    if (this.inside) this.text += visible;
    this.pending = this.pending.slice(this.pending.length - retained);
  }

  finish(fallback: string): string {
    if (this.inside && !this.ended) this.text += this.pending;
    this.pending = ""; this.ended = true;
    if (!this.tagged) this.text = fallback;
    return this.text.trim();
  }
}
