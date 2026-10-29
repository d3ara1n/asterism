/** Parameter matching ignores routing prefixes; saved and transmitted model IDs stay unchanged. */
export const parameterModelId = (id: string): string => id.slice(id.lastIndexOf("/") + 1);
