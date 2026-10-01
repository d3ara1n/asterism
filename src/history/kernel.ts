import { DatabaseSync } from "node:sqlite";
import { foldEvents, type Projection } from "./fold.ts";
import { newId, nowIso } from "./ids.ts";
import {
  storedEventSchema,
  type BindingAction,
  type Capability,
  type EventBody,
  type HistoryPosition,
  type StoredEvent,
  type TurnStatus,
} from "./schema.ts";

export type View = {
  view_id: string;
  object_id: string;
};

export type RealityStore = {
  read(resource_id: string): string | undefined;
  write(resource_id: string, content: string): void;
};

export class MemoryReality implements RealityStore {
  private values = new Map<string, string>();

  read(resource_id: string): string | undefined {
    return this.values.get(resource_id);
  }

  write(resource_id: string, content: string): void {
    this.values.set(resource_id, content);
  }
}

const migrateSql = `
CREATE TABLE IF NOT EXISTS events (
  event_id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  recorded_at TEXT NOT NULL,
  type TEXT NOT NULL,
  payload TEXT NOT NULL,
  UNIQUE (branch_id, seq)
);
`;

export class HistoryKernel {
  private views = new Map<string, View[]>();

  constructor(
    private readonly db: DatabaseSync,
    readonly reality: RealityStore = new MemoryReality(),
  ) {
    this.db.exec(migrateSql);
  }

  static memory(reality?: RealityStore): HistoryKernel {
    return new HistoryKernel(new DatabaseSync(":memory:"), reality);
  }

  static open(path: string, reality?: RealityStore): HistoryKernel {
    return new HistoryKernel(new DatabaseSync(path), reality);
  }

  close(): void {
    this.db.close();
  }

  createTask(title?: string): { task_id: string; branch_id: string; position: HistoryPosition } {
    const task_id = newId();
    const branch_id = newId();
    return this.transact(() => {
      this.append(branch_id, {
        type: "task_created",
        payload: { task_id, title },
      });
      const branch = this.append(branch_id, {
        type: "branch_created",
        payload: { branch_id, task_id },
      });
      return { task_id, branch_id, position: positionOf(branch) };
    });
  }

  createAgent(
    branch_id: string,
    options: { parent_agent_id?: string; title?: string } = {},
  ): { agent_id: string; position: HistoryPosition } {
    const agent_id = newId();
    const event = this.append(branch_id, {
      type: "agent_created",
      payload: {
        agent_id,
        parent_agent_id: options.parent_agent_id,
        title: options.title,
      },
    });
    return { agent_id, position: positionOf(event) };
  }

  createResource(
    branch_id: string,
    input: { type: string; capabilities?: Partial<Capability>; title?: string; content_ref?: string },
  ): { resource_id: string; position: HistoryPosition } {
    const resource_id = newId();
    const event = this.append(branch_id, {
      type: "resource_created",
      payload: {
        resource_id,
        type: input.type,
        title: input.title,
        content_ref: input.content_ref,
        capabilities: {
          history_viewing: input.capabilities?.history_viewing ?? false,
          state_restore: input.capabilities?.state_restore ?? false,
        },
      },
    });
    return { resource_id, position: positionOf(event) };
  }

  requestBinding(
    branch_id: string,
    input: {
      agent_id: string;
      resource_id: string;
      action: BindingAction;
      permissions?: string[];
    },
  ): { position: HistoryPosition; pending: boolean } {
    const permissions =
      input.permissions ?? (input.action === "attach" ? ["read"] : []);
    return this.transact(() => {
      const projection = this.reconstructHead(branch_id);
      const inFlight = projection.in_flight_turns.some(
        (turn) => turn.agent_id === input.agent_id,
      );
      const requested = this.append(branch_id, {
        type: "binding_requested",
        payload: {
          agent_id: input.agent_id,
          resource_id: input.resource_id,
          action: input.action,
          permissions,
        },
      });
      if (inFlight) {
        return { position: positionOf(requested), pending: true };
      }
      const applied = this.applyPending(branch_id, input.agent_id, [requested.event_id]);
      return { position: positionOf(applied), pending: false };
    });
  }

  startTurn(
    branch_id: string,
    input: {
      agent_id: string;
      input?: unknown;
      rules_version?: number;
      tool_catalog_version?: number;
    },
  ): { turn_id: string; position: HistoryPosition } {
    const projection = this.reconstructHead(branch_id);
    if (projection.in_flight_turns.some((turn) => turn.agent_id === input.agent_id)) {
      throw new Error(`agent already in flight: ${input.agent_id}`);
    }
    const turn_id = newId();
    const event = this.append(branch_id, {
      type: "turn_started",
      payload: {
        agent_id: input.agent_id,
        turn_id,
        history_position: projection.position,
        binding_version: projection.bindings_by_agent[input.agent_id]?.binding_version ?? 0,
        rules_version: input.rules_version ?? 0,
        tool_catalog_version: input.tool_catalog_version ?? 0,
        input: input.input ?? null,
      },
    });
    return { turn_id, position: positionOf(event) };
  }

  endTurn(
    branch_id: string,
    input: { turn_id: string; status?: TurnStatus },
  ): { position: HistoryPosition } {
    return this.transact(() => {
      const projection = this.reconstructHead(branch_id);
      const turn = projection.in_flight_turns.find((item) => item.turn_id === input.turn_id);
      if (!turn) {
        throw new Error(`turn not in flight: ${input.turn_id}`);
      }
      this.append(branch_id, {
        type: "turn_ended",
        payload: {
          turn_id: input.turn_id,
          status: input.status ?? "completed",
        },
      });
      const pendingIds = this.unappliedRequestIds(branch_id, turn.agent_id);
      if (pendingIds.length === 0) {
        return { position: this.head(branch_id) };
      }
      const applied = this.applyPending(branch_id, turn.agent_id, pendingIds);
      return { position: positionOf(applied) };
    });
  }

  writeResource(resource_id: string, content: string): void {
    this.reality.write(resource_id, content);
  }

  openView(object_id: string): View {
    const view = { view_id: newId(), object_id };
    const existing = this.views.get(object_id) ?? [];
    existing.push(view);
    this.views.set(object_id, existing);
    return view;
  }

  viewsOf(object_id: string): View[] {
    return [...(this.views.get(object_id) ?? [])];
  }

  reconstruct(position: HistoryPosition): Projection {
    const events = this.eventsThrough(position);
    const projection = foldEvents(events);
    if (!projection) {
      throw new Error("no events to reconstruct");
    }
    return projection;
  }

  head(branch_id: string): HistoryPosition {
    return this.reconstructHead(branch_id).position;
  }

  eventCount(branch_id?: string): number {
    if (branch_id) {
      const row = this.db
        .prepare("SELECT COUNT(*) AS count FROM events WHERE branch_id = ?")
        .get(branch_id) as { count: number };
      return row.count;
    }
    const row = this.db.prepare("SELECT COUNT(*) AS count FROM events").get() as {
      count: number;
    };
    return row.count;
  }

  private reconstructHead(branch_id: string): Projection {
    const events = this.eventsOn(branch_id);
    const projection = foldEvents(events);
    if (!projection) {
      throw new Error(`branch has no events: ${branch_id}`);
    }
    return projection;
  }

  private applyPending(
    branch_id: string,
    agent_id: string,
    applied_event_ids: string[],
  ): StoredEvent {
    const current = this.reconstructHead(branch_id);
    const binding_version = (current.bindings_by_agent[agent_id]?.binding_version ?? 0) + 1;
    return this.append(branch_id, {
      type: "bindings_applied",
      payload: { agent_id, applied_event_ids, binding_version },
    });
  }

  private unappliedRequestIds(branch_id: string, agent_id: string): string[] {
    const events = this.eventsOn(branch_id);
    const applied = new Set<string>();
    for (const event of events) {
      if (event.type === "bindings_applied" && event.payload.agent_id === agent_id) {
        for (const id of event.payload.applied_event_ids) {
          applied.add(id);
        }
      }
    }
    const pending: string[] = [];
    for (const event of events) {
      if (
        event.type === "binding_requested" &&
        event.payload.agent_id === agent_id &&
        !applied.has(event.event_id)
      ) {
        pending.push(event.event_id);
      }
    }
    return pending;
  }

  eventsOn(branch_id: string): StoredEvent[] {
    const rows = this.db
      .prepare(
        "SELECT event_id, branch_id, seq, recorded_at, type, payload FROM events WHERE branch_id = ? ORDER BY seq ASC",
      )
      .all(branch_id) as EventRow[];
    return rows.map(rowToEvent);
  }

  private eventsThrough(position: HistoryPosition): StoredEvent[] {
    const rows = this.db
      .prepare(
        "SELECT event_id, branch_id, seq, recorded_at, type, payload FROM events WHERE branch_id = ? AND seq <= ? ORDER BY seq ASC",
      )
      .all(position.branch_id, position.seq) as EventRow[];
    const events = rows.map(rowToEvent);
    const last = events[events.length - 1];
    if (!last || last.event_id !== position.event_id) {
      throw new Error(
        `history position not found: ${position.branch_id}@${position.event_id}`,
      );
    }
    return events;
  }

  private append(branch_id: string, body: EventBody): StoredEvent {
    const seq = this.nextSeq(branch_id);
    const event: StoredEvent = {
      event_id: newId(),
      branch_id,
      seq,
      recorded_at: nowIso(),
      ...body,
    };
    this.db
      .prepare(
        "INSERT INTO events (event_id, branch_id, seq, recorded_at, type, payload) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(
        event.event_id,
        event.branch_id,
        event.seq,
        event.recorded_at,
        event.type,
        JSON.stringify(event.payload),
      );
    return event;
  }

  private nextSeq(branch_id: string): number {
    const row = this.db
      .prepare("SELECT COALESCE(MAX(seq), 0) AS max_seq FROM events WHERE branch_id = ?")
      .get(branch_id) as { max_seq: number };
    return row.max_seq + 1;
  }

  private transact<T>(fn: () => T): T {
    // 保存点允许应用元数据与历史事件处于同一个外层事务。
    this.db.exec("SAVEPOINT history_command");
    try {
      const result = fn();
      this.db.exec("RELEASE SAVEPOINT history_command");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK TO SAVEPOINT history_command");
      this.db.exec("RELEASE SAVEPOINT history_command");
      throw error;
    }
  }
}

type EventRow = {
  event_id: string;
  branch_id: string;
  seq: number;
  recorded_at: string;
  type: string;
  payload: string;
};

function rowToEvent(row: EventRow): StoredEvent {
  return storedEventSchema.parse({
    event_id: row.event_id,
    branch_id: row.branch_id,
    seq: row.seq,
    recorded_at: row.recorded_at,
    type: row.type,
    payload: JSON.parse(row.payload) as unknown,
  });
}

function positionOf(event: StoredEvent): HistoryPosition {
  return {
    branch_id: event.branch_id,
    event_id: event.event_id,
    seq: event.seq,
  };
}
