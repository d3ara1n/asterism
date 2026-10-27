import { nanoid } from "nanoid";

/** Resource identities are stable handles for storage and tool references; describe resources to users by title. */
export function createResourceId(): string {
  return nanoid(16);
}
