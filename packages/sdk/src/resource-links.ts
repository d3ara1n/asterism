/** A resource link is a URL with scheme `resource`, authority as the resource ID, and a path the resource interprets. */
export interface ResourceLink { readonly resourceId: string; readonly location: string }

/** Encode a path location: percent-encode each segment, preserve `/` as a path separator. */
function encodeLocation(location: string): string {
  return location.split("/").map(encodeURIComponent).join("/");
}

/** Decode a path location: percent-decode each segment, preserving `/` separators. */
function decodeLocation(encoded: string): string {
  return encoded.split("/").map(decodeURIComponent).join("/");
}

export function resourceLink(resourceId: string, location: string): string {
  return `resource:${encodeURIComponent(resourceId)}/${encodeLocation(location)}`;
}

export function parseResourceLink(value: string): ResourceLink | null {
  const match = /^resource:([^/?#]+)\/(.*)$/u.exec(value);
  if (!match) return null;
  try {
    const resourceId = decodeURIComponent(match[1]!);
    return resourceId ? { resourceId, location: decodeLocation(match[2]!) } : null;
  } catch { return null; }
}
