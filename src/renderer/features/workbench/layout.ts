import type { Point } from "../../../shared/workbench";

/** 模块未注册卡片视图时使用的默认尺寸与缩放下限。 */
export const fallbackCardWidth = 340;
export const fallbackCardHeight = 200;
export const minimumCardWidth = 280;
export const minimumCardHeight = 160;
/** 缺少视图行的早期对象按默认可见处理，位置在用户首次移动时保存。 */
export const defaultCardPosition: Point = { x: 48, y: 48 };
/** 相邻卡片之间的水平与垂直空隙。 */
export const placementGap = { x: 60, y: 280 };
