/** 桌面身份与窗口几何，不属于任务历史或运行时协议。 */
export const applicationId = "dev.dearain.weft";

export type DesktopPlatform = "darwin" | "win32" | "linux";

// 原生窗口按钮与 renderer 的留白使用同一套几何参数（单位：DIP）。
export const windowGeometry = {
  gutter: 6,
  gap: 6,
  headerHeight: 32,
  // 红绿灯按钮组自身宽度；左右留白按 x 坐标对称计算。
  macControlsWidth: 52,
  // 原生控件的视觉落点，单位为窗口客户区 DIP；不依赖默认位置偏移。
  macControlsPosition: { x: 20, y: 15 },
} as const;
