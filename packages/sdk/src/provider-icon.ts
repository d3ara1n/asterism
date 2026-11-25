import { z } from "zod";

/** Presentation key for a host-bundled provider icon, not a URL or a connection identity. */
export const providerIconIdSchema = z.string().min(1).max(160).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u);
