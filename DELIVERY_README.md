# 📦 交付产物说明（2026-08-12）

本目录下两个文件是 **AISND 小程序完整源代码快照**，生成时间 2026-08-12 09:30，
包含全部 13 个 git 提交（最新 `247d0da`）。二者等价，任选其一使用。

## 文件清单

| 文件 | 大小 | 内容 | 适用 |
|------|------|------|------|
| `AISND-src-20260812.zip` | 2.2MB | 完整工作区（**含 `.git` 历史**，不含 node_modules） | 直接解压即得可推送的 git 仓库 |
| `AISND-full.bundle` | ~700KB | git bundle（完整 13 提交历史） | 推送/合并到远端 GitHub 的最轻量方式 |

> 旧版 `AISND-src-20260811.zip`（9 提交）已过时，请使用本版。

## 使用方法

### 方式 A：zip 解压（推荐，含完整工作区）

```bash
unzip AISND-src-20260812.zip          # 解出 AISND/ 目录
cd AISND
git log --oneline                      # 可见 13 个提交
```

### 方式 B：bundle 克隆并推送到 GitHub（含历史，最轻量）

```bash
git clone AISND-full.bundle AISND && cd AISND
git remote set-url origin https://github.com/JoustsRivia/AISND.git
git push -u origin main --force
```

> ⚠️ **必须 `--force`**：本地历史与远端 `fe408b0` 不同源（本地库从共享盘快照重建），
> 首次推送会因非快进而被拒，需 force 覆盖。推送前请确认团队无未同步的远端改动。

### 方式 C：整目录拷贝

`/workspace/AISND` 即完整工作区（含 `.git`），可整体拷贝/打包带走，无需解压。

## 本批代码含什么

- **SNDIcon 图标字体**：52 个场景图标子集化（`assets/fonts/snd-icon.ttf` 9.1KB），
  全站 46 处 emoji 已替换；云存储 fileID 已填（`utils/fonts.js`）
- **✅ 图标渲染修复（提交 `247d0da`）**：全站 18 处 `&#x…;` 实体 → 伪元素类
  （修复真机显示 `&#xF0D1;` 字面量的 bug；根因：`<text>` decode 默认 false）
- v3 设计规范落地（2×2 操作网格 / 88rpx 触控 / 组件 embed / 表单统一 / mini 按钮语义化）
- 深蓝科技感设计系统（`app.wxss` + `DESIGN_SYSTEM.md`）
- 台账/消息/审批/采购等完整业务页面（`pages/`）+ 云函数（`cloudfunctions/`）

## 相关文档

- `DESIGN_SYSTEM.md` — 设计系统规范
- `ICON_SYSTEM_DESIGN.md` — 图标体系方案 v4（诊断/规范/用法）
- `BRANCH_CHANGES.md` — v3+ 变更明细索引（公共类定义/改动要点/自检）
- `ITERATION_REPORT.md` — 交接报告（§8 记录图标接入与分发受阻详情）
- `DEPLOY.md` — 部署说明
