import { join } from "node:path";
import { applicationStorage } from "../shared/application.ts";

/** Current format identities shared by preparation and runtime. History belongs to the migration steps. */
export const configurationVersion = 18;
export const workspaceDatabaseVersion = 36;
export const telemetryDatabaseVersion = 3;
export const packageListVersion = 2;

export const workspaceDatabasePath = (root: string) => join(root, applicationStorage.databaseDirectory, applicationStorage.databaseFile);
export const telemetryDatabasePath = (root: string) => join(root, applicationStorage.telemetryDirectory, applicationStorage.telemetryDatabaseFile);
