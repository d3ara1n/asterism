# 代理对话时间线虚拟化

立案日期：2026-10-24

## 目标与范围

代理卡片的对话时间线改为虚拟列表，DOM 规模不随对话长度增长，长会话下画布拖动、缩放与流式输出保持流畅。实测：同一长会话代理卡片折叠时页面元素 171 个，展开时 3320 个（不含代码块 shadow DOM），帧数随对话长度明显下降。

前置已完成（`2de6c82`）：Streamdown 只在生成期间及 1 秒排空窗口内挂载；已保存时间线与实时块分开计算，流式增量不重算历史；画布拖动沿用未变化节点的 `data` 身份；`NodeView` memo。

## 已确认的决策

- **块时间入历史**：思考、正文与工具调用块的起止时间写入成型块，重启后照常显示用时，供领域审计。时间不放在视图状态里，视图只读取块数据；进行中的计时由实时块的开始时间推导。
- **采用依赖**：虚拟化使用 `virtua`（动态高度、反向列表、`keepMounted`，LobeHub 同类对话场景在用），不自行实现。引入时锁定确切版本。
- **视图状态跟随对象**：展开／折叠等用户改动过的视图状态按 `timelineKey` 存入对象保留状态（`object.retained`），随对象释放；可从数据推导的不存。
- **插件工具视图契约**：在插件 SDK 文档写明对话时间线是虚拟化的，工具视图会随滚动卸载与重新挂载，状态保持与虚拟化完备由视图实现方负责。
- **不做临时方案**：不先上 `content-visibility` 过渡。

## 待设计与实施

### 1. 块时间持久化

- [x] `modelBlockSchema` 公共块字段增加可选 `startedAt / endedAt`（毫秒时间戳），未结束即收束为 null；工具执行时间仍由 `outcome` 表达。SDK API 15.2、`@atelier/sdk` 0.38.0。
- [x] `emitBlock` 写入 `BufferedBlock` 已有的起止；`ModelBlock` 类型同步，其余构造处字段可选无需改动。
- [x] `ThinkingBlock` 去掉计时组件状态，统一从块数据取时间；新增 `generating()` 只把未落库且未结束的实时块视为生成中，已保存的中断块不再以流式渲染或持续计时。
- [x] 旧记录：字段可选，缺失即不显示用时，不迁移。
- [x] `docs/runtime.md` 补「块生成起止」；`docs/timeline.md` 不涉及。

### 2. 视图状态迁出组件

- [x] SDK 新增 `useRendererViewState`（API 15.2）；`TimelineViewState` 按 `timelineKey` 分条目、随代理对象保留。`ToolCall`、`ThinkingBlock`、`Summary` 展开状态与 `ToolDetails`／`ToolDetailsSwitcher` 选择迁入条目视图状态。
- [x] `MermaidDiagram` 渲染结果按主题与源码模块级缓存（上限 64）；`Files` 预览重挂载时重新读取，短暂显示文件图标，暂不处理。
- [x] 人工验收：展开状态滚动往返、聚焦切换不丢。

### 3. 接入虚拟列表

- [x] `virtua` 0.53.6 锁定于 `packages/builtin`；代理卡片改用 `VirtualConversationTimeline`，诊断面板仍用普通列表。空思考块不进入列表。
- [x] `mountedTimelineIndexes`：未落库的实时块与末项始终挂载；滚动容器关闭浏览器 `overflow-anchor`，由库补偿位置。
- [x] 人工验收：React Flow 缩放下高度测量正确（库以 ResizeObserver `contentRect` 测量布局尺寸，理论上不受 transform 影响）。

### 4. 滚动行为

- [x] `useOutputFollow`：经 `onResize` 贴住末尾；回到末尾即恢复跟随，离开末尾只在用户手势（wheel／touch／pointer／key）时关闭跟随，测量补偿不误关。
- [x] Minimap 按条目序号 `scrollToIndex` 定位。

### 5. 契约与收尾

- [x] `docs/plugin-sdk.md` 与 SDK README 写明工具视图虚拟化契约与 `useRendererViewState`；`docs/workbench.md` 更新时间线说明；`docs/glossary.md` 新增「条目视图状态」。
- [x] `docs/decisions.md` 归档本次取舍，开放问题中长历史性能条目同步。
- [x] 验收：长会话展开后元素数量不随对话长度增长；拖动、缩放、流式输出帧数与短会话接近；重启后思考用时照常显示；跟随最新输出与 Minimap 跳转正常。
- [x] 已知限制写入 `docs/decisions.md` 与 `docs/workbench.md`。
- [x] 收尾重构：会话进度拆为低频运行状态与按对象分组的实时块，流式增量只重渲染生成中的卡片；同一快照内 `records.all()` 按 scope 复用结果；移除仅测试使用的 `conversationTimeline`。

## 参考入口

- [对话时间线投影](../packages/builtin/src/agent/conversation/timeline.ts)
- [对话组件](../packages/builtin/src/agent/conversation/Conversation.tsx)
- [响应块缓冲](../src/execution/response.ts)
- [成型块 schema](../packages/sdk/src/model-records.ts)
- LobeHub 用 `keepMounted` 固定生成中消息：lobehub/lobehub PR #14086
