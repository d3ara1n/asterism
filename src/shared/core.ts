/** Host internal namespaces and desktop bridge identities are fixed independently of public branding. */
export const coreNamespace = "core";
export const desktopBridgeKey = "host";

export function coreId<const T extends string>(name: T): `core.${T}` {
  return `${coreNamespace}.${name}`;
}
export function coreChannel<const T extends string>(name: T): `core:${T}` {
  return `${coreNamespace}:${name}`;
}
