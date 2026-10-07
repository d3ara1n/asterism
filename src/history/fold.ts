import type {
  BindingAction,
  HistoryPosition,
  StoredEvent,
} from "./schema.ts";

export type Binding = {
  resource_id: string;
  permissions: string[];
};

export type AgentBindings = {
  binding_version: number;
  resources: Binding[];
};

export type InFlightTurn = {
  turn_id: string;
  agent_id: string;
  binding_version: number;
  rules_version: number;
  tool_catalog_version: number;
  history_position: HistoryPosition;
  /** 本轮开始时冻结的有效绑定，不含之后的 pending */
  bindings: Binding[];
};

export type PendingBinding = {
  event_id: string;
  agent_id: string;
  resource_id: string;
  action: BindingAction;
  permissions: string[];
};

export type Projection = {
  position: HistoryPosition;
  task_ids: string[];
  agent_ids: string[];
  resource_ids: string[];
  bindings_by_agent: Record<string, AgentBindings>;
  in_flight_turns: InFlightTurn[];
  pending: PendingBinding[];
};

type InternalState = {
  task_ids: Set<string>;
  agent_ids: Set<string>;
  resource_ids: Set<string>;
  bindings: Map<string, Map<string, string[]>>;
  binding_version: Map<string, number>;
  in_flight: Map<string, InFlightTurn>;
  requested: Map<string, PendingBinding>;
  applied_request_ids: Set<string>;
};

function emptyState(): InternalState {
  return {
    task_ids: new Set(),
    agent_ids: new Set(),
    resource_ids: new Set(),
    bindings: new Map(),
    binding_version: new Map(),
    in_flight: new Map(),
    requested: new Map(),
    applied_request_ids: new Set(),
  };
}

function snapshotBindings(state: InternalState, agent_id: string): Binding[] {
  const resources = state.bindings.get(agent_id);
  if (!resources) {
    return [];
  }
  return [...resources.entries()].map(([resource_id, permissions]) => ({
    resource_id,
    permissions: [...permissions],
  }));
}

function applyBinding(state: InternalState, request: PendingBinding): void {
  let resources = state.bindings.get(request.agent_id);
  if (!resources) {
    resources = new Map();
    state.bindings.set(request.agent_id, resources);
  }
  if (request.action === "attach") {
    resources.set(request.resource_id, [...request.permissions]);
  } else {
    resources.delete(request.resource_id);
  }
}

function applyEvent(state: InternalState, event: StoredEvent): void {
  switch (event.type) {
    case "task_created":
      state.task_ids.add(event.payload.task_id);
      return;
    case "branch_created":
      return;
    case "agent_created":
      state.agent_ids.add(event.payload.agent_id);
      state.bindings.set(event.payload.agent_id, new Map());
      state.binding_version.set(event.payload.agent_id, 0);
      return;
    case "resource_created":
      state.resource_ids.add(event.payload.resource_id);
      return;
    case "binding_requested":
      state.requested.set(event.event_id, {
        event_id: event.event_id,
        ...event.payload,
      });
      return;
    case "bindings_applied": {
      for (const id of event.payload.applied_event_ids) {
        const request = state.requested.get(id);
        if (!request) {
          continue;
        }
        applyBinding(state, request);
        state.requested.delete(id);
        state.applied_request_ids.add(id);
      }
      state.binding_version.set(event.payload.agent_id, event.payload.binding_version);
      return;
    }
    case "turn_started":
      state.in_flight.set(event.payload.turn_id, {
        turn_id: event.payload.turn_id,
        agent_id: event.payload.agent_id,
        binding_version: event.payload.binding_version,
        rules_version: event.payload.rules_version,
        tool_catalog_version: event.payload.tool_catalog_version,
        history_position: event.payload.history_position,
        bindings: snapshotBindings(state, event.payload.agent_id),
      });
      return;
    case "turn_ended":
      state.in_flight.delete(event.payload.turn_id);
      return;
    case "operation_started":
    case "operation_finished":
    case "subagent_result_delivered":
    case "config_applied":
    case "conversation_event":
    case "execution_failed":
      return;
  }
}

export function foldEvents(events: StoredEvent[]): Projection | null {
  if (events.length === 0) {
    return null;
  }
  const state = emptyState();
  for (const event of events) {
    applyEvent(state, event);
  }
  const last = events[events.length - 1];
  const in_flight_turns = [...state.in_flight.values()];
  const inFlightAgents = new Set(in_flight_turns.map((turn) => turn.agent_id));
  const pending = [...state.requested.values()].filter((request) =>
    inFlightAgents.has(request.agent_id),
  );
  const bindings_by_agent: Record<string, AgentBindings> = {};
  for (const agent_id of state.agent_ids) {
    bindings_by_agent[agent_id] = {
      binding_version: state.binding_version.get(agent_id) ?? 0,
      resources: snapshotBindings(state, agent_id),
    };
  }
  return {
    position: {
      branch_id: last.branch_id,
      event_id: last.event_id,
      seq: last.seq,
    },
    task_ids: [...state.task_ids],
    agent_ids: [...state.agent_ids],
    resource_ids: [...state.resource_ids],
    bindings_by_agent,
    in_flight_turns,
    pending,
  };
}

export function turnBindings(projection: Projection, turn_id: string): Binding[] {
  const turn = projection.in_flight_turns.find((item) => item.turn_id === turn_id);
  if (!turn) {
    throw new Error(`turn not in flight: ${turn_id}`);
  }
  return turn.bindings;
}
