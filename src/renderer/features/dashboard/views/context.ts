import type { TelemetryGroup } from "../../../../shared/telemetry";
import type { DashboardModel, DashboardState, PageFilter } from "../model";

/** Inputs every dashboard view receives from the page. */
export interface ViewProps {
  model: DashboardModel;
  state: DashboardState;
  page: PageFilter;
  openGroup(group: TelemetryGroup, origin: HTMLElement): void;
  openDay(start: number): void;
  /** `groupId` of the group whose detail island is open, for row selection. */
  openKey: string | null;
}
