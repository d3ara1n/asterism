# 接入 PR label 分组与 release CI

> 立案 2026-09-17，暂缓。仓库尚无可运行代码与 CI 基础设施，机制先以本档留存。

## 背景

沿用 TideBar 的发版机制：PR 打 label 进 release note 分组（`feature`/`enhancement` → Features、`bug`/`fix` → Bug Fixes、`documentation` → Documentation），release CI 按合并提交自动计算版本并定期发版，不手动打 tag。

## 前置条件

- roadmap 阶段 1 完成，存在首个可运行里程碑。
- `docs/decisions.md`「实现开始前」中的目标平台与发布方式已拍板。

## 范围

- `.github/release.yml`：label 分组配置。
- release CI：按合并提交计算版本、自动发版。
- 分支保护与 PR 流程细节随实际协作方式一并确定。
