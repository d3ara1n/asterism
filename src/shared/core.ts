/** 宿主内部命名空间与桌面桥身份固定，不使用对外品牌。 */
export const coreNamespace = "core";
export const desktopBridgeKey = "host";

export function coreId<const T extends string>(name: T): `core.${T}` {
  return `${coreNamespace}.${name}`;
}
export function coreChannel<const T extends string>(name: T): `core:${T}` {
  return `${coreNamespace}:${name}`;
}
