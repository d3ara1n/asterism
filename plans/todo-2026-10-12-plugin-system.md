# 插件系统

原则见 `docs/decisions.md` 插件相关条目与 `docs/architecture.md#插件`。内置插件与便利设施后端已实现；独立 SDK、具型会话扩展面、源码开发插件、外部加载与管理界面未完成，本计划继续保留。SDK 由 Atelier 与插件共同引用：宿主实现服务接口，插件调用服务并提供贡献实现。

详细 interface、API 清单、作者用例与实施映射见 [SDK 设计草案](draft-2026-10-12-plugin-sdk.md)。配套 [SDK 声明](draft-2026-10-12-plugin-sdk.ts)、[core 领域库](draft-2026-10-12-core-contracts.ts) 和 [作者用例](draft-2026-10-12-plugin-examples.ts) 分文件维护并通过独立类型检查。草案尚未冻结，类型检查不代表运行时实现或交付验证。

## 已完成

- [x] 内置模块装配为 `atelier.core` 插件：两阶段装配、命名空间补全、工具契约覆盖、贡献清单、绑定会话／对象的 context 与 `emit`。
- [x] 插件缺席时保留对象与历史，显示实现缺失并回退原始数据视图。
- [x] 插件便利设施后端：`plugin.config` / `secrets` / `db`。
- [x] `plugin.registry` 开放 agents、roles、models 的只读目录；`plugin.models.stream/run` 按模型目标提供无状态单次请求与代理循环，内置 agent 只经该 API 执行。
- [x] 模型引用为 `<provider>/<model>`，角色与明确覆盖统一解析，不向插件目录暴露端点或凭据。

## 待实施

- [ ] 独立可发布的 SDK 包：抽出共享契约、宿主服务接口与作者侧声明，去除对宿主源码和内部实现类型的引用；Atelier 与内置插件共同消费，明确版本检查、exports 和开发模板。
- [ ] 具型资源与记录契约：提供纯契约导出和运行时契约值，按稳定身份、版本与 schema 识别；支持跨插件消费、SDK 多副本及未知记录回退，不依赖对象引用相等。
- [ ] 泛化的会话扩展面：固定快照上的记录／资源具型查询、提交后观察、进入前准备／拦截；接口不特化为 agent，命名为消费场景之一。具体方法名与记录格式尚未冻结。
- [ ] 领域知识归属：Agent 契约、配置和投影回到 core；SDK stream/run 只消费模型协议及通用执行接口，不导出 Agent 类型。需要知识的消费者显式依赖作者的普通领域库。
- [ ] 跨插件调用：`commands.invoke(Contract, target, input)` 统一承担协作，宿主路由并校验 schema，返回即完成；不提供具名消息通道。
- [ ] 生命周期与异步工作：以会话、资源及宿主运行期组织，明确通知与干预的区别、任务取消、失败与收束契约。
- [ ] 受控会话标题更新 API：明确校验、更新冲突、变更通知与存储归属，使命名插件不直接访问宿主数据库。
- [ ] SDK 打包与发布准备：契约包版本、宿主兼容检查、包内容和外部消费验证；具体包名、registry 与实际发布动作另行确定。
- [ ] 本地包来源：用户添加本地包根（只认含 Atelier 清单的包，不扫描目录），启动时 esbuild 打包 runtime 先行、renderer 随首个外部视图接入；与 npm 来源同一管理与装配流程。
- [ ] 外部加载：npm 安装与版本锁定、用户插件顺序、添加与启用分离且重启生效；renderer 经共享模块白名单、类型化视图插槽、`atelier-plugin://` 资源与按对象二进制流通道加载插件视图。
- [ ] 插件页：身份、版本、贡献与覆盖、占用配置与数据、失败原因。
- [ ] 插件配置的设置页分组：按 Zod schema 渲染表单，接通 renderer 到 runtime 的配置通道；与插件页一同在首个真实外部插件出现后设计。
- [ ] agent 从插件级 `plugin.state` 手传对象 ID 迁到 `plugin.object`，随后移除旧入口。

首页组合入口当前在 `before` 内创建代理并提交首条消息，创建前规整选择，首次模型请求再完整校验；失败以 notice 呈现。这是现有行为，不列作未完成的插件任务。

## 会话命名依赖

- 已确认：命名依据会话第一条消息，由 `utility` 异步生成，经插件生命周期钩子接入；不阻塞会话创建与代理执行。
- 已具备：`plugin.models.stream` 及 `utility` 模型角色解析。
- 尚缺：会话记录成功提交后的泛化生命周期通知、具型记录识别、受控标题更新、宿主管理的异步工作与失败收尾；识别 agent 用户消息的消费方导入 agent 纯契约，通用会话观察模块不依赖 agent。
- 待细化：第一条消息在回溯／分支中的稳定身份、未命名显示状态、手动改名优先级、多插件写标题冲突，以及中断后的补做与重试规则。模型请求不承诺恰好执行一次。
- 命名消费方与界面验收见 [模型接入计划](todo-2026-10-01-model-protocol-storage.md)；钩子和标题 API 的实施真值在本计划。

## 本轮已定（详见草案第 9.4、10、11 节）

- 加载、卸载只在重启时生效；注册表进程内冻结，不做热重载。
- 插件只有一种：包；来源（npm／本地包路径）不分支管理，添加与启用分离。
- esbuild 统一打包 runtime 与 renderer，共享模块白名单外的依赖打进插件 bundle，禁止未声明的跨插件值导入。
- prepare 只挂命令输入，不进首批；跨插件只用命令契约；托管任务仅进程内，补做由插件在启动时自查并靠 title CAS 去重。
- 第一阶段以 adapter 映射现有格式，不改存储。
- 首批不提供模板，SDK 不发布 npm，以仓库内 workspace 包存在。

## SDK、源码开发与具型接口

已确认方向：SDK 是宿主与插件的共识，宿主实现服务接口、插件调用；插件自己的资源／工具／视图实现仍由插件提供。领域知识属于领域，core 的 Agent 契约、配置与行为不进入 SDK。插件单向提供贡献；知识共享由作者的普通库依赖解决，运行时协作只经命令契约。

待评审的包组织：

- 一个 SDK 包按纯契约、runtime、renderer 分入口导出；纯契约入口不依赖 Node、Electron 或 React，renderer 入口不带后台实现。
- 内置插件作为独立消费方提供自己的纯资源／记录契约，第三方可只导入契约取得类型，不因此加载资源实现或启动它。
- 插件包分别导出纯契约、后台与前端入口；源码路径和发布包经过不同来源 adapter，进入同一装配流程。
- SDK 不保有全局当前会话或宿主单例；运行期 context 由宿主绑定身份并注入。
- monorepo 只是推荐开发布局，插件可由任何编辑器开发，加载来源可在当前工作区之外。登记源码并不构成资源授权，打开仓库也不自动启用代码。

待评审的 interface：

- 直接通过契约值进行具型操作：`snapshot.records.first(UserMessage, query)`、`UserMessage.decode(record)`、`snapshot.resources.get(AgentResource, id)`。快照固定到指定位置或当次提交，不在 await 后悄悄切换到最新路径。
- 资源契约关联记录契约；当前 Agent 的 stateSchema 仅校验创建数据，不能推导 message/block，需补充独立版本化的记录定义。
- 识别结果区分匹配且有效、不属于该视图、版本不支持或数据无效；未知记录保留原始数据。资源实现缺席和数据是否可解码是两种状态，消费方已有纯契约时仍可读历史。
- 作者侧通过契约对象调用、识别和推导类型；持久化身份与版本仍必须明确。工具覆盖当前依赖对象引用，SDK 多副本与源码加载下需细化共享契约及覆盖的识别方式。
- 提交后观察消费不可变记录批次，并由宿主承接异步工作；观察者返回值不改写已提交记录。
- 进入前准备针对明确可干预的输入／拟提交事件，返回接受、替换或拒绝；在事务外准备，最终提交前重验路径与状态，拒绝覆盖整个相关业务提交，不能静默跳过一个 append。
- 已发生的模型输出、工具结局与资源副作用必须如实记录；执行前阻断、模型投影和展示转换在各自 seam 设计，不以拒绝结果入树撤销事实。

实施前拍板：公开记录信封与现有 agentId 的泛化方式、SDK 具型视图是否先以 adapter 映射现有格式、可替换／拒绝的输入范围与原始输入审计、通知重启补发、源码编译与共享 React／SDK 的方式。

作者侧写法草案（包名、字段与方法名仅作示意，不是现有 SDK）：

```ts
import { defineModule, observe, Session } from "@example/atelier-sdk/runtime";
import { UserMessage } from "@example/agent/contracts";

export const naming = defineModule(plugin => ({
  contributions: [observe({
    id: "name-session", on: Session.Committed,
    async run({ snapshot, records }) {
      if (!records.some(record => UserMessage.decode(record)?.status === "known")) return;
      const first = await snapshot.records.first(UserMessage, { scope: "session" });
      if (first?.status !== "known" || !records.some(record => record.id === first.id)) return;
      // 首条消息规则属于命名插件，SDK 仅提供通用记录查询。
      // 接着交宿主任务调用 utility 并更新标题。
      plugin.log.info(`First user message committed: ${first.id}`);
    },
  })],
}));
```

不导入领域库的模块仍可观察 Session.Committed 的记录身份和原始数据，也可只用 SDK 的 stream/run。领域库按普通 npm／workspace 包导入，不注册到 SDK；认识某种资源仅增加具型解读能力。观察与命令准备贡献声明为数据，由宿主统一装配和管理，避免模块工厂临时注册监听后在失败路径留下订阅。

## pi 参考事实

核验本机 `@earendil-works/pi-coding-agent@1.1.0` 的 `docs/extensions.md`、`dist/core/extensions/types.d.ts` 与 `runner.js`：

- 事件覆盖 session、agent、turn、message、provider、tool 与 input；通知、转换与阻断各有专用类型。
- `agent_end` 后可能继续恢复或排队工作；`agent_before_settle` 为可操作边界，`agent_settled` 为最终只通知边界。
- 派发前快照处理器，按扩展加载与注册顺序串行 await；处理中取消订阅不改变该次派发。
- 普通处理器异常报告后继续；tool_call 与 user_bash 失败阻断执行。runner 没有处理器级超时，慢处理器会拖延后续派发。
- 会话替换／reload 使旧 context 失效；会话切换与树导航等操作只提供给 command context，避免在生命周期处理器中等待自己而死锁。
- `setSessionName` 追加 session_info 并发出 session_info_changed；首条消息只是选择器标题兜底，pi 没有内置自动命名钩子，插件需自行订阅并调用命名 API。

公开参考：[扩展文档](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/extensions.md)、[事件与 context 类型](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/src/core/extensions/types.ts)、[命名示例](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/examples/extensions/session-name.ts)。链接内容随版本变化，以上事实来自本机 1.1.0。

## 生命周期待评审方案

1. **分别定义通知、后台任务、同步干预。** 通知携带已发生事实，不靠返回值改写它；耗时工作交宿主跟踪与取消，不直接阻塞提交或流消费。请求上下文／提示转换与执行前阻断使用另一类有类型的接口，校验结果并规定错误策略。
2. **按会话与资源分层。** 宿主／插件启动与关闭；会话创建、记录提交、元数据变化、执行路径变化；对象创建／移除、链接变化、活动与收束。agent 的 message/block 经资源契约消费，模型请求与工具执行为对应能力的专用切入面，不定义为所有插件的生命周期。具体事件按实际消费者逐步开放。打开 GUI 会话不是运行时会话启动，关闭卡片也不是对象关闭。
3. **提交后派发。** 会话事实仅在最外层事务成功后入队，回滚不发送；不在同步写入事务内调用或等待插件代码。通知派发不得把后台故障传播为已经提交的用户输入失败。
4. **携带稳定来源。** 事件明确 sessionId、nodeId／路径起点与适用的对象、运行、请求身份；给不可变事件快照，处理器不依赖全局当前窗口或延迟读取时的最新游标。首条消息命名应能定位原始消息，其他代理输入及另起分支不误触发重新命名。
5. **确定性装配与重入。** hook 作为具名贡献参与两阶段装配，失败插件不遗留订阅；冻结后顺序可解释。派发时快照订阅；处理器经公开 API 发出的后续变化进入后续队列，不递归同步派发；约束事件自触发与无限续轮。
6. **管理异步工作与失效。** 区分插件、会话、对象与单次调用的生命周期；UI 导航不取消同会话后台工作，宿主关闭／对象失效时取消适用任务。定义超时、并发上限、错误归属与幂等清理；超时后旧 context 不能提交迟到结果。同进程只提供协作取消，无法强制停止阻塞事件循环或已开始的外部副作用。
7. **明确交付与恢复保证。** 持久事实通知和瞬时进度分开；流式增量不作为可靠业务触发源。是否补发、如何去重、恢复游标与命名任务的持久化位置需在实施前决定，不把内存事件总线宣称为可靠作业队列，也不自动重放未知副作用。
8. **维持宿主不变量。** 插件消费通知、提交新事件或提出转换结果；不能改写旧历史、替换授权判定或改变已固定请求及工具批次的环境。只有会写会话树的受捕获活动参与 settled；标题等元数据工作是否影响收束须明确，不沿用 pi 单一活动会话假设。

会话观察与进入前拦截的扩展方向已确认，接口以会话／资源泛化；具体贡献形式、可干预范围与失败契约仍待评审。干预能力不因此开放旧历史改写、宿主入口替换或授权判定替换。

## 其他待定

- renderer 运行时加载外部视图的方式（与宿主共享 React 实例等）。
- 模型协议适配是否作为插件贡献（属于配置层，不是资源）。
