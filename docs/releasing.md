# 发布操作说明

发布、签名、更新通道与数据目录契约见 [技术架构](architecture.md#发布与自动更新)。本页记录维护者操作，实施进度见 [发布计划](../plans/todo-2026-09-17-release-ci.md)。

## GitHub 准备

仓库为 `d3ara1n/atelier`，公开的 Release 资产供客户端匿名检查与下载。客户端不包含 GitHub 凭据。仓库公开前核对提交历史中的凭据与真实运行数据。

在仓库 Settings → Secrets and variables → Actions 配置：

| Secret | 内容 |
| --- | --- |
| `MAC_SIGNING_P12` | 固定自签代码证书与私钥导出的 P12 文件，经 base64 编码 |
| `MAC_SIGNING_P12_PASSWORD` | 导出 P12 时使用的密码 |

各次发布使用同一份证书与私钥；CI 从导入证书取得身份名称。私钥由维护者保存，CI 在临时钥匙串中导入、构建结束后清理。普通 PR 检查不使用签名秘密。

## 发布

1. 将已检查的改动合入 `main`。
2. 在 Actions → Release → Run workflow 选择 `main`，`mode` 默认 `prerelease`；正式发布时选择 `release`。
3. 工作流执行类型、单元与翻译检查，计算版本，分别构建 macOS arm64、Windows x64、Linux x64。
4. 全部构建成功后创建 draft Release 并上传完整产物，上传成功才公开 Release。手动触发不需要手动指定版本或创建 tag。

无 tag 时首个版本为 `0.1.0-beta.1`；预发布期间依次递增 beta 序号，正式发布去掉预发布后缀。已有正式版后，Conventional Commits 中破坏性变更、`feat`、`fix/perf/refactor` 分别决定 major、minor、patch。仅文档等无可发布变更时跳过；已验证的 beta 可在没有新提交时发布为正式版。

构建失败不会发布 Release。若上传失败留下 draft，维护者检查并删除该次未完成草稿后再重试；已公开版本使用新版本发布修复，保留原有产物。

## 首包验收

从 Release 手动下载安装 beta.1，macOS 按 README 处理首次启动的隔离标记。建立一段测试会话后发布 beta.2，检查下载、重启安装、版本变化和会话保留。macOS 需在未导入开发者证书的用户环境验收固定自签更新；本地 ad-hoc 包不能替代该验收。

关闭「包含预发布版本」后确认当前版本保留，后续正式版本按正常版本序列接续。升级数据格式的规则见 [存储演进计划](../plans/todo-2026-10-12-storage-migration.md)。
