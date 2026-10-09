import type { Point } from "../../../shared/workbench";

/** 画布卡片尺寸与放置间距的设计常量；模块未注册视图时使用兜底尺寸。 */
export const fallbackCardWidth = 340;
/** 缺少视图行的早期对象按默认可见处理，位置在用户首次移动时保存。 */
export const defaultCardPosition: Point = { x: 48, y: 48 };
/** 新卡片的估计高度，仅用于放置时的碰撞判断。 */
export const placementCardHeight = 200;
/** 相邻卡片之间的水平与垂直空隙。 */
export const placementGap = { x: 60, y: 280 };
