import type { DeadlineServices } from "@asterism-app/sdk/runtime";

export interface SleepCandidate { id: string; lastOpenedAt: string }

/** Only user opens renew the deadline; runtime traffic does not count as attention. */
export function planSessionSleep(candidates: readonly SleepCandidate[], sleepDays: number | null, now: number): { due: string[]; nextAt: number | null } {
  if (sleepDays === null) return { due: [], nextAt: null };
  const due: string[] = [];
  let nextAt: number | null = null;
  for (const candidate of candidates) {
    const deadline = Date.parse(candidate.lastOpenedAt) + sleepDays * 86_400_000;
    if (deadline <= now) due.push(candidate.id);
    if (nextAt === null || deadline < nextAt) nextAt = deadline;
  }
  return { due, nextAt };
}

export interface SleepHost {
  readonly deadlines: DeadlineServices;
  sleepDays(): number | null;
  /** Running sessions automatic sleep may affect: not viewed, not kept awake, and not already deactivating. */
  candidates(): readonly SleepCandidate[];
  settled(sessionId: string): boolean;
  sleep(sessionId: string): Promise<void>;
  failed(error: unknown): void;
}

/** One pending deadline for the earliest automatic sleep; overdue sessions with unsettled work wait until they settle. */
export class SessionSleepPolicy {
  private cancel: (() => void) | undefined;
  private waiting = new Set<string>();
  private readonly failed = new Set<string>();
  private closed = false;
  constructor(private readonly host: SleepHost) {}

  private candidates(): readonly SleepCandidate[] { return this.host.candidates().filter(candidate => !this.failed.has(candidate.id)); }
  due(now = Date.now()): string[] { return planSessionSleep(this.candidates(), this.host.sleepDays(), now).due; }
  /** A successful user open starts a new inactivity interval after a failed attempt. */
  opened(sessionId: string): void { this.failed.delete(sessionId); }
  /** Overdue sessions held back by unsettled work; their settling is the only progress signal that matters here. */
  isWaiting(sessionId: string): boolean { return this.waiting.has(sessionId); }

  refresh(): void {
    if (this.closed) return;
    this.cancel?.();
    this.cancel = undefined;
    const now = Date.now(), candidates = this.candidates(), days = this.host.sleepDays();
    this.waiting = new Set(planSessionSleep(candidates, days, now).due.filter(id => !this.host.settled(id)));
    const { nextAt } = planSessionSleep(candidates.filter(candidate => !this.waiting.has(candidate.id)), days, now);
    if (nextAt !== null) this.cancel = this.host.deadlines.schedule(nextAt, () => this.fire());
  }

  close(): void {
    this.closed = true;
    this.cancel?.();
    this.cancel = undefined;
  }

  private async fire(): Promise<void> {
    this.cancel = undefined;
    if (this.closed) return;
    const ready = this.due().filter(id => this.host.settled(id));
    const results = await Promise.allSettled(ready.map(id => this.host.sleep(id)));
    for (const [index, result] of results.entries()) {
      if (result.status === "rejected") {
        this.failed.add(ready[index]!);
        this.host.failed(result.reason);
      }
    }
    this.refresh();
  }
}
