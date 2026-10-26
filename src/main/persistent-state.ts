/** 主进程偏好在数据准备成功后开放；恢复窗口只使用内存默认值。 */
let prepared = false;
export function enablePersistentState(): void { prepared = true; }
export function persistentStateReady(): boolean { return prepared; }
