/** A resource link addresses an instance in the displaying session and carries an opaque location. */
export interface ResourceLink { readonly resourceId: string; readonly location: string }

export function resourceLink(resourceId: string, location: string): string {
  return `resource:${encodeURIComponent(resourceId)}?location=${encodeURIComponent(location)}`;
}

export function parseResourceLink(value: string): ResourceLink | null {
  const match = /^resource:([^/?#]+)\?location=([^&#]*)$/u.exec(value);
  if (!match) return null;
  try {
    const resourceId = decodeURIComponent(match[1]!);
    return resourceId ? { resourceId, location: decodeURIComponent(match[2]!) } : null;
  } catch { return null; }
}
