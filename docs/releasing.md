# 发布操作说明

发布、签名、更新通道与数据目录契约见 [技术架构](architecture.md#发布与自动更新)。本页记录维护者操作，实施进度见 [发布计划](../plans/todo-2026-09-17-release-ci.md)。

## GitHub 准备

仓库为 `d3ara1n/asterism`，公开的 Release 资产供客户端匿名检查与下载。客户端不包含 GitHub 凭据。仓库公开前核对提交历史中的凭据与真实运行数据。

在仓库 Settings → Secrets and variables → Actions 配置：

| Secret | 内容 |
| --- | --- |
| `MAC_SIGNING_P12` | 固定自签代码证书与私钥导出的 P12 文件，经 base64 编码 |
| `MAC_SIGNING_P12_PASSWORD` | 导出 P12 时使用的密码 |

各次发布使用同一份证书与私钥；CI 从导入证书取得身份名称。私钥由维护者保存，CI 在临时钥匙串中导入、构建结束后清理。普通 PR 检查不使用签名秘密。

## 预发布

1. 通过 PR 将已检查的改动 squash 合入 `main`，标题使用 Conventional Commits，例如 `feat: 添加搜索`、`fix: 修复输入`、`refactor(storage)!: 调整存储格式`。
2. Release 工作流每周一 UTC 02:00（北京时间 10:00）检查新 PR；需要提前发布时，在 Actions → Release → Run workflow 选择 `main`。
3. 没有新的有效 PR 时，工作流在 `npm ci` 前结束。有有效变更才计算版本、生成说明、执行检查，并分别构建 macOS arm64、Windows x64、Linux x64。
4. 全部构建成功后创建 draft Release 并上传完整产物，上传成功才公开为 Prerelease。版本和 tag 由工作流生成。

类型影响、累计基线和 Release Notes 范围见 [发布契约](architecture.md#发布与自动更新)。版本脚本为 `scripts/collect-release.ts`（轻量收集与跳过）、`scripts/release-version.ts`（版本计算）、`scripts/release-prs.ts`（PR 分类与说明）。

## 正式版晋级

在 Actions → Promote Release → Run workflow 选择 `main`，填写已试用的预发布标签，如 `v0.1.0-prerelease.3`。工作流从该标签对应的提交重建正式安装包，重新汇总正式版说明。所选标签须为该目标版本的最新预发布候选，晋级后的正式版本须高于已有正式版。

晋级使用已有候选，不要求新的 PR，也不读取当前主干的新功能。版本号、签名、构建与发布全部自动完成；没有按月自动晋级任务。

构建失败不会发布 Release。若上传失败留下 draft，维护者检查并删除该次未完成草稿后再重试。当前没有用户，内部测试 Release 可直接删除；首次面向用户分发后，已公开版本使用新版本发布修复，保留原有产物。兼容边界见[数据准备与迁移](architecture.md#数据准备与迁移)。

## 首包验收

正式对外发布前，通过 prerelease 内测迭代完成真实安装、启动界面、跨版本迁移恢复及自动更新验收。实现提交以代码复核和自动检查为依据；尚未完成的人工验收在对应活动计划保留待办，取得实际结果后再关闭，不以提交完成代替验收。

从 Release 手动下载安装一个预发布，macOS 按 README 处理首次启动的隔离标记。建立一段测试会话后，用下一次预发布检查下载、重启安装、版本变化和会话保留。macOS 需在未导入开发者证书的用户环境验收固定自签更新；本地 ad-hoc 包不能替代该验收。

关闭「包含预发布版本」后确认当前版本保留，后续正式版本按正常版本序列接续。升级数据格式的规则见[数据准备与迁移](architecture.md#数据准备与迁移)，GUI 验收由[存储演进计划](../plans/todo-2026-10-12-storage-migration.md)跟踪。
