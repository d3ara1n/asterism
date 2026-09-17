# 织台 Weft 项目规范

以对象为中心的个人 agent 工作台：代理、资源与操作以卡片和连线呈现，任务过程可查看、分叉，资源支持时可恢复。定位与边界见 `docs/product.md`。当前处于文档孵化阶段：仓库只有文档，没有实现代码、依赖与 CI。

## 心智模型

实现取舍与文档修订以此为准。

- **授权先于能力**：资源操作凭显式资源身份加执行层授权完成。Workspace 存储目录、卡片与连线的可见性、工具出现在目录中，都只是视图，不构成授权。
- **历史是事件，永不改写**：任务历史由织台拥有，不以某个 provider 或 agent 框架的会话格式作为唯一存储。查看历史不改变现实；detach 以生效事件表达而非删除旧消息；不可恢复资源不宣称回滚。
- **绑定在轮次交界生效**：普通 attach/detach 在执行轮次交界处应用，运行期间显示 pending，本轮按原授权完成。
- **稳定上下文优先**：初版全量暴露稳定工具目录，资源变化作为消息事件进入上下文；缓存优化不破坏授权与历史语义。

## 环境

- 文档孵化阶段：资产为 `README.md`、`AGENTS.md`、`docs/`、`plans/`；无构建、无依赖、无 CI。
- 实现期基线（已定、未开工）：Electron + React + TypeScript，SQLite 与本地对象存储，独立 Node.js 任务运行时；具体版本待 `docs/decisions.md` 拍板后回填 `docs/architecture.md`。

## 验证职责

- 文档阶段：agent 的验证止于新内容与既有 docs/ 语义一致、术语与 `docs/glossary.md` 一致。
- 实现期：agent 的验证止于 typecheck、单元与契约测试；GUI 交互验证由用户操作确认；不做「启动→等待→杀掉」式自动冒烟。

## 文档地图

先读 `README.md`，按任务读对应文档；未决设计查 `docs/decisions.md`，产品词汇查 `docs/glossary.md`。

| 文档 | 内容 | 生命周期 |
| --- | --- | --- |
| `docs/product.md` | 定位、核心体验、边界、成功标准 | 极稳定 |
| `docs/glossary.md` | 产品词汇的中英对照与含义 | 随命名与含义同步 |
| `docs/object-model.md` | Workspace、Task、资源、操作、视图语义 | 最终状态真值 |
| `docs/runtime.md` | 执行轮次、绑定、工具目录、授权 | 最终状态真值 |
| `docs/timeline.md` | 事件、检查点、历史查看、分叉、恢复 | 最终状态真值 |
| `docs/workbench.md` | 卡片、连线、执行段、时间导航 | 最终状态真值 |
| `docs/architecture.md` | 技术栈、进程职责、存储、安全边界 | 随技术决策同步 |
| `docs/decisions.md` | 已定原则、初版取舍、开放问题 | 最终状态真值，演进看 git log |
| `docs/roadmap.md` | 实现顺序与验收场景 | 随实施推进更新 |
| `docs/mcp-caching.md` | MCP 延迟加载与提示缓存调研 | 时点固化，接入时重新核验 |
| `plans/` | 立案任务 | 见下方 plans 纪律 |

## plans 纪律

- `plans/todo-<日期>-<主题>.md`：立案任务，当前要做什么的唯一真值；完成即移入 `plans/archived/`，有留存价值的结论转 docs/。
- `plans/archived/`：已结束的计划，只进不出。
- **延后即立案**：不做或暂不做的事落到 plans/；聊天即焚，未入档的决策视为未发生。
- 文件名即性质，从名字直接读出生命周期；新类型前缀按需增设（常驻手册用全大写），但必须能一句话说清其生命周期。

## 决策边界

- **agent 自主**：文档措辞与结构、仓库内文件组织；（实现期）内部拆分、命名、代码组织、实现层参数。
- **必须拍板**：产品定位与交互范式、对象模型语义、provider 与消息/工具协议、存储格式、依赖引入、授权模型、对外行为。
- 拍板结果更新 `docs/decisions.md` 与对应设计文档；文档描述最终约定，过程追溯看 git log。

## 操作边界

- 实施前说明范围与关键取舍并获得确认；已确认范围内的细节自行决定。
- 真实会话、资源快照与任何凭据不进入源码仓库。
- 提交前展示 diff 或摘要并获得明确许可；提交许可不含 push、发布与远端操作。

## 约定

### 分支与提交

- 主干 `main`。文档孵化阶段直接提交 `main`；实现期按 type 开分支（`feat/`、`fix/`、`docs/`…），经 PR squash merge 回 `main`，一个 PR 对应一个合并提交。
- 提交信息用 Conventional Commits：type 英文小写（feat/fix/docs/chore/refactor…），主题中文。
- AI 辅助的提交加 `Co-Authored-By: <模型名> <邮箱>` trailer；模型身份查 `PI_*` 环境变量，无对应邮箱用 `noreply@pi.dev`，不伪造 provider 域名。
- PR label 分组与 release CI 暂缓，已立案 `plans/`；首个可运行里程碑后接入。

### 语言规范

- 开发文档（docs/、plans/、代码注释、提交主题）用中文；词汇的中英对照以 `docs/glossary.md` 为准。
- 对外文案双语、英文为主；孵化期 README 中文先行，对外发布前补英文。
- 运行时日志用正式英文，保证可 grep。
