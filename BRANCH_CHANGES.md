# 🔀 AISND v3+ 变更记录（页面优化全量清单）

> **文档定位**：AISND 微信小程序 **v3 设计规范落地以来全部代码变更**的逐项记录，供代码走查、回归验证与后续开发参照。
> **背景更正（2026-08-12）**：此前误判为"另一条支线需重建"；经确认 **支线相同、版本连续**，v3+ 优化已直接落入当前工作区（提交 `85d526c`→`e9925dc`），无需跨支线重建。本清单保留为**变更明细索引**（公共类定义、逐文件改动要点、依赖与雷区）。
> **配套文档**：图标体系/修复见 `ICON_SYSTEM_DESIGN.md`（v4）；设计规范总纲见 `DESIGN_SYSTEM.md`。

---

## 1. 变更范围

| 来源 | 说明 |
|------|------|
| 基线 | 共享盘快照 `1af9360`（2026-07-28 版本）导入 |
| 增量 | v3 设计规范 `85d526c` → 组件 embed 修复 `245b2b3` → 前端收尾 `e9bdaf2` → 图标基建 `2f98b46` → 图标替换 `f3cbcb7`（→ `bf0e522` 后已修正为伪元素类） |

**目标**：CLI 在支线 B 上，按本清单 + `ICON_SYSTEM_DESIGN.md`，把 A 的全部增量重新应用，最终达到与 A 等价的效果。

---

## 2. 变更总览

| # | 提交 | 类型 | 文件数 | 一句话 |
|---|------|------|--------|--------|
| 1 | `85d526c` | UI 规范 | 27 | **v3 设计规范落地**：布局/触控/可见性/一致性 |
| 2 | `245b2b3` | Fix | 6 | 组件 embed 属性补齐 properties + 显式布尔传值 |
| 3 | `e9bdaf2` | UI 收尾 | 24 | 4 表单页统一全局类 + 12 页 mini 按钮语义化 |
| 4 | `2f98b46` | 图标基建 | ~60 | SNDIcon 图标字体（49 图标）+ 云存储 fileID 加载 |
| 5 | `f3cbcb7` | 图标替换 | 20 | 全站 46 处 emoji → iconfont（52 图标） |
| — | `148b5df/ad9e21a/39f3f8e/8b22ba7/2c0bc8a/e9925dc` | 文档 | — | 交接/方案文档（§6 摘要） |

> ⚠️ **关于 #5 的重要提醒**：`f3cbcb7` 当时用的是 `<text>&#xXXXX;</text>` 写法，**在真机上有渲染 bug**（`<text>` 默认不 decode 实体，见 `ICON_SYSTEM_DESIGN.md §1`）。CLI 在支线 B 上应用图标替换时，**不要照抄该写法的 `&#x…;`**，直接采用 `ICON_SYSTEM_DESIGN.md §2` 的正确方案（静态→伪元素类、混排→真实字符、动态→JS `\uXXXX`）。

---

## 3. 变更 1：v3 设计规范落地（`85d526c`，27 文件）

### 3.1 背景（全站 UI 审查发现的四类问题）

1. **排列混乱**：操作按钮挤一行、卡片套卡片+双外边距；
2. **交互不直观**：触控 < 88rpx、纯文字操作；
3. **内容不可见**：硬编码色值深色模式失效、弱化灰承载必读值；
4. **不美观/不一致**：emoji 图标、重复样式。

### 3.2 `app.wxss` 新增公共类（完整定义，直接复制到支线 B 的 app.wxss）

```css
/* ============ v3 设计系统工具类（DESIGN_SYSTEM §7-§10） ============ */
.act-grid {                       /* 操作区 2×2 网格 */
  display: grid; grid-template-columns: 1fr 1fr; gap: var(--sp-2);
}
.act-cell {                       /* 网格单元格（88rpx 触控） */
  display: flex; align-items: center; justify-content: center; gap: 8rpx;
  height: 88rpx; border-radius: var(--r-md);
  background: var(--c-card); color: var(--c-text-sub);
  font-size: var(--fs-md); font-weight: 600;
  box-shadow: var(--sh-card); border: 2rpx solid transparent; box-sizing: border-box;
}
.act-cell:active { transform: scale(0.98); }
.act-cell--on      { background: var(--c-warning-soft); color: var(--c-warning); border-color: var(--c-warning); }
.act-cell--primary { background: var(--c-primary-soft); color: var(--c-primary); }

.chip-group { display: flex; align-items: center; flex-wrap: wrap; gap: var(--sp-2); }
.chip-btn {                       /* 胶囊按钮（≥88rpx 触控） */
  display: inline-flex; align-items: center; justify-content: center; gap: 6rpx;
  min-height: 88rpx; padding: 0 var(--sp-4); border-radius: var(--r-pill);
  background: var(--c-surface); color: var(--c-text-sub);
  font-size: var(--fs-sm); font-weight: 600; box-sizing: border-box;
}
.chip-btn:active { opacity: 0.7; }
.chip-btn--primary { background: var(--c-primary-soft); color: var(--c-primary); }
.chip-btn--success { background: var(--c-success-bg); color: var(--c-success); }
.chip-btn--danger  { background: var(--c-danger-bg); color: var(--c-danger); }
.chip-btn--on      { background: var(--c-primary-soft); color: var(--c-primary); border: 2rpx solid var(--c-primary); }

.panel {                          /* 卡片内面板（禁止卡片套卡片） */
  background: var(--c-surface-2); border-radius: var(--r-sm); padding: var(--sp-3);
}

.btn-sm {                         /* 小按钮（语义化替代 size="mini"） */
  display: inline-flex; align-items: center; justify-content: center; gap: 6rpx;
  height: 72rpx; padding: 0 var(--sp-3); border-radius: var(--r-pill);
  font-size: var(--fs-sm); font-weight: 600; border: none; line-height: 1;
  background: var(--c-surface); color: var(--c-text-sub);
}
.btn-sm::after { border: none; }
.btn-sm-primary { background: var(--c-primary-grad); color: #fff; }
.btn-sm-outline { background: transparent; color: var(--c-primary); border: 2rpx solid var(--c-primary); }

.form-row { display: flex; align-items: center; padding: 24rpx 0; border-bottom: 1rpx solid var(--c-divider); }
.form-row:last-of-type { border-bottom: none; }
.form-label { width: 168rpx; color: var(--c-text-sub); font-size: var(--fs-md); flex-shrink: 0; }
.form-value { flex: 1; color: var(--c-text); font-size: var(--fs-md); }
.form-input { flex: 1; text-align: right; font-size: var(--fs-md); color: var(--c-text); }

.input-box {                      /* 搜索/输入容器 */
  display: flex; align-items: center; gap: var(--sp-2);
  min-height: 80rpx; padding: 0 var(--sp-3);
  background: var(--c-surface); border-radius: var(--r-sm);
  border: 2rpx solid transparent; box-sizing: border-box;
}
.input-box:focus-within { background: var(--c-card); border-color: var(--c-primary); }
.input-box input { flex: 1; font-size: var(--fs-md); color: var(--c-text); min-width: 0; }

/* size="mini" 全局兜底：只提触控，不覆盖页面自定义 padding/字号 */
button[size="mini"] {
  min-height: 88rpx; display: inline-flex; align-items: center; justify-content: center; box-sizing: border-box;
}
```

### 3.3 页面改动要点

| 文件 | 改动 |
|------|------|
| `pages/ledger/ledger.wxml/.wxss` | 台账 4 操作按钮：`.actions`+`.act` → `.act-grid`+`.act-cell`（2×2 网格）；`➕` emoji → `＋`；「高危」用 `.act-cell--on`（warning 强调） |
| `pages/message/message.wxml/.wxss` | 操作组 chip 化：`.chip-group`+`.chip-btn`（筛选/全部已读等） |
| `components/filter-bar/filter-bar.wxss` | tab / chip 触控提至 88rpx |
| `components/user-picker/user-picker.wxss` | 硬编码色值 → 令牌（深色模式修复，50 行改） |
| `components/db-picker/db-picker.wxss` | 同上令牌迁移（65 行改） |
| `components/org-cascading-picker/org-cascading-picker.wxss` | 同上令牌迁移 + 可点行 88rpx |
| `pages/identity/identity.wxss` | 令牌迁移；二维码容器保留白底（功能优先） |
| `components/flow-steps/flow-steps.wxml/.wxss` | 新增 `embed` 内嵌模式：去卡片化，消除"卡片套卡片+双外边距" |
| `components/record-timeline/record-timeline.wxml/.wxss` | 同上新增 `embed` |
| `pages/tool-detail/tool-detail.wxml/.wxss` | 底部操作栏白条令牌化；危险标记 |
| `pages/login/register.wxss` | 少量令牌化 |
| `pkg-purchase/pages/approve`、`pkg-scrap/pages/approve` | mini 按钮提升触控 |
| `pkg-stats/pages/dashboard/dashboard.wxml` | stats-card 外层重复 `.card` 去除 |
| `pkg-store/pages/inbound/inbound.wxss` | 表单样式统一走全局类 |

> **embed 机制说明**：组件**默认保持卡片形态**（records/hazard 独立使用依赖它），仅在调用方传 `embed` 时去卡片化。调用处示例：`<flow-steps embed="{{true}}" />`。详见变更 2。

---

## 4. 变更 2：组件 embed 属性补齐（`245b2b3`，6 文件）

- `components/flow-steps/flow-steps.js`、`components/record-timeline/record-timeline.js`：`properties` 新增 `embed: { type: Boolean, value: false }`；
- 5 处调用点由无值属性 `embed` 改为**显式** `embed="{{true}}"`（微信小程序无值 Boolean 属性解析不统一，显式传值最稳）：
  - `pages/tool-detail/tool-detail.wxml`（4 处）
  - `pkg-maint/pages/repair/repair.wxml`
  - `pkg-purchase/pages/approve/approve.wxml`
  - `pkg-scrap/pages/approve/approve.wxml`

---

## 5. 变更 3：前端收尾（`e9bdaf2`，24 文件）

### 5.1 4 表单页统一全局类（DESIGN_SYSTEM §10.2/§11.7 收口）

| 页面 | 改动 |
|------|------|
| `pkg-purchase/pages/apply/apply.wxml/.wxss` | 表单行走 `.form-row/.form-label/.form-value/.form-input`，删除本地重复定义；保留 `.form-row.col` 纵向变体、`.form-input.left` |
| `pkg-ledger/pages/tool-create/tool-create.wxml/.wxss` | 同上统一（60 行 wxml 重排）；保留 photo/lease/zones/area 特有 |
| `pkg-scrap/pages/disposal/disposal.wxml/.wxss` | 同上统一 |
| `pkg-store/pages/register/register.wxml/.wxss` | 同上统一 |

### 5.2 12 页 mini 按钮语义化（§8.1/§11.6 收口）

- 全站清除 `size="mini"`：无自定义 class 的 → `.btn-sm` / `.btn-sm-primary` / `.btn-sm-danger`；有自定义 class 的（log `.f-btn/.p-btn/.save-btn`、plan `.mini` 等）去 `size`，由全局 `button[size="mini"]` 兜底触控；
- `app.wxss` 补 `.btn-sm-danger` 变体；
- `pkg-maint/pages/plan/plan.wxss`：硬编码色迁移令牌（`#1A56DB/#fff` → `--c-primary-grad/--c-card`）。

**涉及 wxml**：print、query、hazard、lease、reconcile、tool-create、plan、repair、apply、disposal、project、register、dict、log、courses、sign-in 等。

---

## 6. 变更 4/5：图标体系（`2f98b46` + `f3cbcb7`）

**详见 `ICON_SYSTEM_DESIGN.md`**（v4，含诊断、正确用法、52 图标全表、实施清单、验收）。此处列出图标体系相关的**文件清单**（已在工作区，供核对）：

### 6.1 新增文件（支线 B 没有，需创建）

| 文件 | 内容 | 获取方式 |
|------|------|----------|
| `assets/fonts/snd-icon.ttf` | 52 图标子集字体（9.1KB，**二进制**） | 从项目共享盘下载，或按 `ICON_SYSTEM_DESIGN.md §3.2` 用 fontTools 重新子集化 |
| `assets/fonts/remixicon-full.ttf` | 全量源字体（563KB，**二进制**） | 同上（仅重新子集化时需要） |
| `assets/fonts/snd-icon-map.json` | 类名/场景/Unicode 映射（52 条） | 从共享盘下载或按文档重建 |
| `assets/fonts/snd-icons.wxss` | 图标类（`.iconfont` + 52 个 `.ri-*-line::before`） | 同上 |
| `assets/fonts/scene-index.json` | 中文场景 → 类名索引 | 同上 |
| `assets/icons/*.svg`（50 个） | TDesign SVG 备用 | 从共享盘下载（非必需，仅备用） |

### 6.2 修改文件

| 文件 | 改动 |
|------|------|
| `utils/fonts.js` | 新增 `ICONFONT_FILEID` 常量（云存储 fileID）+ `loadSNDIcon()`（`wx.cloud.getTempFileURL` → `loadFontFace`，失败静默回退）；`loadFonts()` 并发加载 `SNDNum` + `SNDIcon` |
| `app.wxss` | 顶部 `@import "./assets/fonts/snd-icons.wxss";`（全局图标类生效） |
| 19 个 wxml | emoji → iconfont（**用正确方案**，见 `ICON_SYSTEM_DESIGN.md §2`，勿用 `&#x…;`） |

### 6.3 依赖前置（重要）

1. `app.js`：`wx.cloud.init(...)` 必须在 `fonts.loadFonts()` **之前**（`getTempFileURL` 依赖云初始化）；
2. 云存储 `ICON/snd-icon.ttf` 必须为 **52 图标新版**（9.1KB；旧 49 图标版缺 `moon/eye-off/lock` 码位 → 显示方块）；
3. 图标替换**已按 `ICON_SYSTEM_DESIGN.md §2` 正确写法落地**（提交 `iconfix`：全站 18 处 `&#x…;` → 伪元素类），新增图标时同样遵循该写法，勿用 `&#x…;`。

---

## 7. 文档类变更

| 文件 | 说明 |
|------|------|
| `DESIGN_SYSTEM.md` | 新增 v3 规范（§7 布局对齐 / §8 交互触控 / §9 可见性 / §10 一致性 / §11 落地清单）；§11.5 图标替换状态 |
| `ICON_SYSTEM_DESIGN.md` | 图标体系方案 v4（本清单的图标专项，必读） |
| `ITERATION_REPORT.md` | §8 会话交接（图标接入 + 分发受阻详情） |
| `DELIVERY_README.md` | 交付产物说明 |

---

## 8. 回归自检清单

v3+ 全部变更已在当前工作区落地，发布/交接前按此清单验证：

- [ ] `app.wxss` 公共类（act-grid/chip-group/panel/btn-sm/form-*）存在且 WXSS 括号平衡；
- [ ] ledger 操作区为 2×2 网格、88rpx 触控；
- [ ] 4 表单页走全局表单类、无残留 `size="mini"`（`grep -rn 'size="mini"'` 应为空）；
- [ ] 组件 `embed` 在 js properties 声明且调用点显式传 `{{true}}`；
- [ ] 图标：全站无 `&#x` 字面量（`grep -rn '&#x' --include="*.wxml' pages/ components/` 为空）；
- [ ] 图标 52 个全部渲染为图形（无方块/无实体文本），密码显隐切换正常；
- [ ] 深色模式无硬编码色失效（重点 user-picker/db-picker/identity/plan）。

---

## 9. 雷区清单

- **图标写法**：`&#x…;` 实体在 `<text>` 中默认不解析（本轮 bug 根因），**永远不要用**；
- **二进制字体**：`snd-icon.ttf` 无法从 git 恢复（支线 B 无此文件），必须从共享盘下载或重新子集化；
- **embed 默认形态**：组件默认仍是卡片（records/hazard 独立使用依赖），内嵌处必须传 `embed="{{true}}"`；
- **云存储覆盖**：图标字体若增删，须重新上传云存储同路径（fileID 不变），否则真机方块；
- **二维码白底**：identity 二维码容器保持 `#fff`（扫码识别需要），深色模式不跟随，属有意设计；
- **git 不同源**：支线 A 与支线 B 历史不同源，若未来合并需处理冲突或 `--force` 覆盖（推送前确认团队无未同步远端改动）。

---

*文档结束。CLI 按 §8 顺序执行，配合 `ICON_SYSTEM_DESIGN.md` 可完成支线 B 与支线 A 的等价对齐。*
