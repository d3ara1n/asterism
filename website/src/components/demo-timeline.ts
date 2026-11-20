/**
 * Demo playback script. Times are milliseconds within one loop.
 * Each cue adds (+) or removes (-) state names; the state at any time is the replay of every earlier cue,
 * so playback can start at any chapter. Elements opt into state through expressions (see `matches`).
 */
export const chapterStarts = [0, 6600, 14200, 23000];
export const loopLength = 32000;

export const cues: [number, string][] = [
  // Workbench: resources join the Writer's session from the Add menu.
  [500, "+menu"],
  [1050, "+hover-dir"],
  [1200, "-menu -hover-dir +dir"],
  [1700, "+menu"],
  [2200, "+hover-note"],
  [2300, "-menu -hover-note +note"],
  [2800, "+menu"],
  [3300, "+hover-term"],
  [3400, "-menu -hover-term +term"],
  [3800, "+term-focus"],
  [4900, "+term-out"],
  // Links: access is granted per resource; the terminal stays unlinked.
  [7000, "-term-focus +access"],
  [7700, "+link-dir"],
  [8300, "+link-note"],
  [8900, "+c1"],
  [10000, "-c1 +prompt +working"],
  [10500, "+tool1"],
  [11000, "+tool1-done +tool2"],
  [11500, "+tool2-done +reply"],
  [13400, "-working"],
  // Handoffs: a second Agent with its own context, reached through a link.
  [14400, "-access"],
  [14900, "+menu"],
  [15400, "+hover-agent"],
  [15500, "-menu -hover-agent +rev"],
  [16400, "+link-rev +link-dir-rev"],
  [16900, "+working +wsend"],
  [17400, "+wsend-done -working +rin +rworking"],
  [17800, "+rtool"],
  [18200, "+rtool-done +rreply"],
  [20200, "+rsend"],
  [20700, "+rsend-done -rworking +win"],
  // History: continue from an earlier turn on a new branch.
  [23500, "+hist"],
  [24300, "+hsel"],
  [25000, "-hsel +branch -rev -link-rev -link-dir-rev -wsend -wsend-done -win -rin -rtool -rtool-done -rreply -rsend -rsend-done"],
  [26000, "+c2"],
  [27300, "-c2 +b2prompt +working"],
  [27900, "+b2reply"],
  [29700, "-working"],
  [31300, "+fade"],
];

/** Pointer path: [time, data-cursor target, click]. The pointer eases toward the latest target. */
export const cursorCues: [number, string, boolean?][] = [
  [0, "rest"],
  [200, "add"],
  [500, "add", true],
  [800, "menu-dir"],
  [1200, "menu-dir", true],
  [1450, "add"],
  [1700, "add", true],
  [1950, "menu-note"],
  [2300, "menu-note", true],
  [2550, "add"],
  [2800, "add", true],
  [3050, "menu-term"],
  [3400, "menu-term", true],
  [3650, "term"],
  [3800, "term", true],
  [5400, "rest"],
  [6600, "access"],
  [7000, "access", true],
  [7350, "sw-dir"],
  [7700, "sw-dir", true],
  [8000, "sw-note"],
  [8300, "sw-note", true],
  [8600, "composer"],
  [8900, "composer", true],
  [9700, "send"],
  [10000, "send", true],
  [10500, "rest"],
  [14100, "access"],
  [14400, "access", true],
  [14650, "add"],
  [14900, "add", true],
  [15200, "menu-agent"],
  [15500, "menu-agent", true],
  [15800, "writer-port"],
  [16050, "writer-port", true],
  [16100, "rev-port"],
  [16700, "rest"],
  [23000, "history"],
  [23500, "history", true],
  [23900, "hrow"],
  [24300, "hrow", true],
  [24650, "hcont"],
  [25000, "hcont", true],
  [25650, "composer"],
  [26000, "composer", true],
  [27000, "send"],
  [27300, "send", true],
  [27800, "rest"],
];

/** Text revealed character by character: [start, duration]. */
export const typing: Record<string, [number, number]> = {
  command: [3900, 800],
  compose1: [9000, 800],
  reply: [11500, 1700],
  review: [18200, 1800],
  compose2: [26100, 900],
  revised: [27900, 1600],
};

export function stateAt(time: number): Set<string> {
  const state = new Set<string>();
  for (const [at, ops] of cues) {
    if (at > time) break;
    for (const op of ops.split(" ")) {
      if (op.startsWith("+")) state.add(op.slice(1));
      else state.delete(op.slice(1));
    }
  }
  return state;
}

/**
 * State expression: comma-separated alternatives of space-separated terms; `!name` negates.
 * For example "tool1 !tool1-done, rtool !rtool-done".
 */
export function matches(expression: string, state: ReadonlySet<string>): boolean {
  return expression.split(",").some(group =>
    group
      .trim()
      .split(/\s+/)
      .every(term => (term.startsWith("!") ? !state.has(term.slice(1)) : state.has(term))),
  );
}

export function chapterAt(time: number): number {
  let index = 0;
  chapterStarts.forEach((start, i) => {
    if (time >= start) index = i;
  });
  return index;
}
