# 事件投递与插件互相调用

## 当前状态与范围

**机制层、会话标题与资源状态 badge 已接入，GUI 待验收。** SDK、宿主总线、来源 stamp、按序投递、latest 合并、跨进程逐条转发与订阅生命周期已经可用；会话标题由宿主发布 SDK 公共契约 `SessionTitleChanged`，外壳订阅更新列表；`session.changed` 合并重读只保留列表结构更新。Agent 经公共 `ResourceStatusChanged` 发布状态，外壳按资源聚合，running 及可选进度持续展示，其他终态查看即清除。

对象关联的插件调用已完成，并由内置 ask_user 验收，见 [实施记录](archived/todo-2026-10-15-plugin-tools-ui.md)。资源通知 toast 等待真实消费者；进度作为 running 的可选数据与 popup 展示已提供，待下载器等真实发布方使用，Agent 不虚构百分比。本计划继续跟踪标题、badge 的独立 GUI 验收和资源通知，全部结束后再归档。

已确认的接口与行为以 [插件 SDK](../docs/plugin-sdk.md#瞬态事件与插件调用) 为准，执行边界见 [运行时](../docs/runtime.md#瞬态通信与执行生命周期)，交互见 [工作台](../docs/workbench.md#会话列表状态与资源通知)。遵循 KISS 与「信任插件，暴露问题」。

## 已完成：会话标题

- [x] 契约：软件本身的公共契约 `SessionTitleChanged` 放 SDK，来源 `null`，宿主登记，插件可订阅。
- [x] 发布：最外层提交成功后按实际标题变化发布；回滚、相同标题不发布，回溯同样发布。
- [x] 外壳：先订阅再读列表，之后以事件为准；重连重新订阅并重读，不依赖补发。
- [x] 来源统一为 SDK `Source`（`{ plugin, resource: ResourceRef | null } | null`），记录与事件共用，`null` 表示软件本身。
- [x] 契约测试覆盖最终值、回滚、相同值与回溯。
- [ ] GUI 由用户确认未打开会话的标题即时更新（需先清理开发数据）。

## 延后：资源通知 toast

- [ ] 出现真实发布方后确定契约归属与载荷（候选：SDK 公共契约，`source: "resource"`，occurrence，`{ text: UiText, level }`），经已校验资源操作柄发布，外壳以 toast 消费，不另设通知 API。
- [ ] 由该发布方验证来源与展示，GUI 由用户验收。

## 已完成：事件机制

- [x] 通用事件接口（最低宿主 API 7.1）：`ns.event`、`ModuleContribution.events`、插件／资源发布、全局具型订阅及前端 prepare.events／useRendererEvents；作者示例包含类型反例。
- [x] 宿主登记领域契约，校验共享实例、声明归属与发布来源；公共契约可以被不同插件使用，不授予资源操作权限。
- [x] 每订阅无界按序队列，snapshot 契约可选 latest 按来源与业务键合并；消费失败只结束该订阅。
- [x] runtime、main、preload 与 renderer 的独立事件协议，逐条转发原始信封，latest 在接收端合并。
- [x] 事件不参与事务，publish 即投递；需确保已生效时在提交成功后发布。事件不追加历史、不移动游标，不改变真实资源活动判定。
- [x] 统一订阅建立、结束与取消状态；后台消费复用 RunLifecycle，取消不等于真实结束，设施等待回调收束后释放。
- [x] 装配失败、窗口导航、关闭、渲染进程退出与运行时失联清理旧订阅；晚订阅和重连不补发。

实现入口：`src/plugins/events.ts` 负责契约与路由，`event-scope.ts` 连接插件装配与运行生命周期，前后台共用 `src/shared/event-queue.ts`（订阅队列与 latest 合并）与 `event-subscription.ts`。模块地图见 [src/README.md](../src/README.md)。

机制层验证已通过：`npm run typecheck`、全量测试与 `npm run build`。测试覆盖来源、契约隔离、按序与 latest 合并、消费失败隔离、取消与收束、装配失败、跨进程 schema 转换和断连清理。真实 Electron GUI 尚未验收。

## 已实现、待 GUI 验收：资源状态与 badge

SDK 0.12.0／宿主 API 7.2 提供 `ResourceStatusChanged`，载荷为 `{ title: UiText, status }`，状态为 running、failed、awaiting、completed；running 可附带 `progress: { value: number }`（0～1），其他状态不接受进度。来源由资源操作柄绑定，应用无须解释插件私有记录。

- [x] 公共资源级 snapshot 契约由宿主登记，key 为空；外部插件经自己的资源操作柄发布，外壳使用 latest，无 reset、撤回或 revision。
- [x] Agent 受理发送／继续时发布 running；整次执行正常结束发布 completed，失败发布 failed；取消或达到请求次数上限发布 awaiting，表示需要用户继续。
- [x] 四种状态统一以最新完整值替换同资源旧状态，不合并字段；不同资源独立聚合，相同展示数据不刷新，组件身份按资源 ID 保持。
- [x] running 外侧显示 spinner，popup 显示资源名称、状态及可选进度条；进度随整个状态被替换，不单独清除。
- [x] 进入会话只清除终态，running 及进度保留；当前会话收到终态时替换后立即消费，原有 running 随之消失。
- [x] 标记只存界面内存，无当前值查询、持久化或重连补发恢复；恢复连接仅重新订阅未来事件。
- [x] 验证 Agent 状态发布、外部插件公共契约来源与 latest、多资源聚合、完整替换、相同数据跳过刷新和终态消费；类型、针对性测试、本地化与构建检查。
- [ ] GUI 由用户验收会话行概要、popup、running 跨导航保留、终态查看即清除与动画连续性。

badge 是会话行独立入口，打开 popup 不切换会话、不消费标记。概要按 failed、awaiting、running、completed 取优先项，多项附资源数量，详情保留每项。展示状态不替代宿主真实活动或影响回溯与资源移除。

自动验证覆盖类型检查、事件／SDK／Agent／外壳控制器的针对性测试、中英文消息检查与构建。进度已由公共契约和外部资源测试覆盖，内置 Agent 只发布不带百分比的状态；真实进度发布方接入与 GUI 交互不以自动测试替代。

## 已实现：对象关联的插件调用

工具／UI 的前后端调用与后台跨插件调用使用同一具型契约和生命周期，已由内置 ask_user 与独立插件用例验证。验收结果见 [实施记录](archived/todo-2026-10-15-plugin-tools-ui.md)，规则见 [具型插件调用](../docs/plugin-sdk.md#具型插件调用)。

- [x] 关联对象定位、输入／输出、失败、后台来源与跨会话校验；独立于资源动作队列。
- [x] 独立请求／结果／取消协议及真实收束，不以事件拼装请求／应答。

调用可以面向未打开会话中的对象，不通过加载前端控制器激活目标。无对象关联的全局服务调用或额外授权能力若有真实消费者，再在同一机制中扩展，不另造平行协议。
