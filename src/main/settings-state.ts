/** 外观、语言与更新设置在宿主存储就绪后开放；之前与恢复视图只使用内存默认值。界面状态是缓存，不经此开关。 */
let ready = false;
export function enableSettings(): void { ready = true; }
export function settingsReady(): boolean { return ready; }
