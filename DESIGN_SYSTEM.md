# SND 小程序设计系统（扩展规范 v2）

> 本文档在既有 `app.wxss` 统一设计系统（"深蓝科技感 + 卡片化层次"）基础上**拓展为更完整、更有意图的工业安全语言**。
> 设计方向：**工业安全仪表盘风**——稳重、可信、状态可读；把"后端能力"翻译成用户一眼能懂的视觉信号。
> 适用约束：小程序 WXSS 为 CSS 子集（支持 CSS 变量、渐变、关键帧动画、`tabular-nums`；**不支持** `container query` / `clamp()` 流体 / 部分 `oklch`；自定义字体走 `@font-face` base64（见 `styles/fonts.wxss`）或可选 `wx.loadFontFace`）。

---

## 1. 设计原则

1. **状态即信息**：颜色首先服务"安全状态语义"（合格/在用/待检/异常/停用），而非品牌装饰。每个卡片/列表项用**左侧状态轨**表达状态。
2. **拒绝 emoji 图标**：emoji 是第一 AI-slop 标志。统一使用线性图标（Iconfont 字体或内联 SVG 组件），九宫格与工具栏立即高级。
3. **数字即仪表**：指标/计数使用等宽数字（`tabular-nums`）+ 展示字体（SNDNum，`styles/fonts.wxss` 包内 base64 `@font-face`），呈现"仪表盘"质感。
4. **克制动效**：状态切换用 `ease-out-quart/expo`，不回弹；进场错峰 `fadeIn`。绝不动画化布局属性（width/height/top/left）。
5. **节奏而非堆砌**：用变化的间距创造呼吸感，避免"万物皆卡片、卡片套卡片"。分区之间用更大留白与细分隔线。
6. **可见即可用**：高频任务首屏可达；任何需要后端数据的入口都显示实时状态，让用户感知"系统在干活"。

---

## 2. 设计令牌（Design Tokens）

### 2.1 色彩

| 类别 | 令牌 | 值 | 用途 |
|---|---|---|---|
| 品牌 | `--c-primary` | `#1A56DB` | 主操作、强调 |
| 品牌 | `--c-primary-2` | `#2563EB` | 渐变收尾 |
| 品牌 | `--c-hero-grad` | `160deg, #0F2B5B→#1A56DB→#2563EB` | 首页 Hero / 顶部 |
| 表面 | `--c-bg` | `#F5F7FA` | 页面底 |
| 表面 | `--c-card` / `--c-surface` / `--c-surface-2` | `#FFF` / `#F3F4F6` / `#F8FAFC` | 卡片/次级/凹陷 |
| 表面 | `--c-border` / `--c-divider` | `#E5E7EB` / `#EEF1F5` | 描边/分隔 |
| 文字 | `--c-text` / `-sub` / `-muted` / `-weak` | `#1F2937`/`#374151`/`#6B7280`/`#9CA3AF` | 主/次/弱/占位 |
| **状态-合格** | `--c-qualified` `#059669` / `-bg` `#E6F7EE` / `-tint` `#E7F8EC` | 合格、在用、正常 |
| **状态-在用** | `--c-inuse` `#2563EB` / `-bg` `#E8F0FE` / `-tint` `#EAF3FB` | 领用中、进行中 |
| **状态-待检** | `--c-pending` `#D97706` / `-bg` `#FFF7ED` / `-tint` `#FFF3E0` | 待审批、待检、临期 |
| **状态-异常** | `--c-abnormal` `#DC2626` / `-bg` `#FEF2F2` / `-tint` `#FFE9E7` | 异常、禁用、逾期 |
| **状态-维保** | `--c-maint` `#7C3AED` / `-bg` `#F5F3FF` / `-tint` `#EFEAFD` | 维修/保养中 |
| **状态-报废** | `--c-scrapped` `#6B7280` / `-bg` `#F3F4F6` / `-tint` `#ECEEF1` | 已报废、停用 |

> 与既有 `--c-success/-warning/-danger/-info` 并存（向后兼容）；新增 `--c-qualified/-inuse/-pending/-abnormal/-maint/-scrapped` 用于"器具/任务状态"语义，避免滥用 brand 蓝。

### 2.2 圆角 / 间距 / 阴影 / 字号
沿用既有 `--r-*`、`--sp-*`、`--sh-*`、`--fs-*`，新增：

| 令牌 | 值 | 用途 |
|---|---|---|
| `--r-2xl` | `40rpx` | 大卡片 / 面板 |
| `--sp-7` | `80rpx` | 分区大留白 |
| `--sh-rail` | `inset 3rpx 0 0` 状态色 | 卡片左侧状态轨 |
| `--ease-out` | `cubic-bezier(0.22,1,0.36,1)` | 指数缓出（替代 bounce） |
| `--dur-fast/-base/-slow` | `160ms`/`280ms`/`420ms` | 动效时长 |

### 2.3 字体
- 正文：沿用系统字体栈（`PingFang SC`）。
- 展示/数字：`.t-display`（等宽数字字体，`styles/fonts.wxss` 内嵌 SNDNum），配合 `.t-num` 的 `tabular-nums`。
- 字号新增 `--fs-hero` `72rpx`（Hero 大数）、`--fs-display` `56rpx`（看板指标）。

---

## 3. 组件规范

### 3.1 卡片（带状态轨）
```css
.card--status { position: relative; }
.card--status::before {
  content:''; position:absolute; left:0; top:0; bottom:0; width:6rpx;
  border-radius: var(--r-md) 0 0 var(--r-md); background: var(--rail, var(--c-inuse));
}
```
状态由 `data-status`（`qualified/inuse/pending/abnormal/maint/scrapped`）驱动 `--rail` 取值。

### 3.2 九宫格模块 tile
- 图标：线性图标字体（非 emoji），48rpx，置于 96rpx 圆角底（tint 色）。
- 标签：28rpx 中等字重。
- **状态徽标**：tile 右上角红点/数字徽标（见 3.3），数据来自后端聚合。
- 选中/按压：底色 `--c-primary-soft` + 轻微 `scale(0.97)`（`--ease-out`）。

### 3.3 徽标 / 药丸（Badge / Pill）
- `.badge`：右上角圆形数字（待办数），>99 显示 `99+`。
- `.pill--{qualified|inuse|pending|abnormal|maint|scrapped}`：状态文字标签。
- 红点 `.dot`：`width:16rpx;height:16rpx;border-radius:50%;background:var(--c-abnormal)`。

### 3.4 流程时间线（Stepper / Timeline）
```css
.flow { /* 纵向左轨 + 节点 */ }
.flow-node { width:40rpx;height:40rpx;border-radius:50%;border:4rpx solid var(--c-border); }
.flow-node--done { border-color:var(--c-qualified); background:var(--c-qualified); }
.flow-node--active { border-color:var(--c-inuse); box-shadow:0 0 0 6rpx var(--c-inuse-tint); }
.flow-node--wait { border-color:var(--c-pending); }
.flow-line { width:4rpx; background:linear-gradient(var(--c-qualified),var(--c-border)); }
```
用于：领用→归还、报修→维修→复检、采购→验收→入库、报废→审批→处置。每节点对应一个云函数动作，当前态上色。

### 3.5 图表（看板）
- 使用 `ec-canvas`（ECharts 小程序版）绘制：状态分布（饼）、领用归还趋势（线）、隐患趋势（柱）、临期清单（列表+进度环）。
- 图表配色取自状态令牌，禁用"青+紫蓝渐变"AI 配色。

### 3.6 空 / 错误 / 加载态
- 空态：图标（线性）+ 一句引导文案 + 主操作（渐进式披露，不重复已有信息）。
- 加载：`fadeIn` + 骨架屏（shimmer 用 `--c-surface-2` 渐变，禁用发光）。

---

## 4. 可访问性（户外 / 戴手套场景）
- **对比度**：正文 `#1F2937` on `#FFF` 达标；状态色文字需配 `-bg` 底，避免浅色字直接压浅底。
- **最小触控**：按钮/可点项 ≥ `88rpx` 高（沿用 `.btn` 88rpx）。
- **弱网/强光**：Hero 与关键指标用高对比；状态用色+形状双编码（色块+文字/图标），不仅靠颜色区分。

---

## 5. 主题与夜间
- 所有令牌定义在 `page` 上，预留 `page.dark` 覆盖集（深色作业终端风可选）：仅覆盖 `--c-bg/--c-card/--c-text/--c-border` 与状态 `-bg`，其余令牌复用。
- 切换：在 `app.js` 全局 `data.theme` 控制 `page` 类，组件不各自硬编码颜色。

---

## 6. 落地清单（按优先级）
1. **[标准]** 本文档 + `app.wxss` 增强 tokens/工具类（本版交付）。
2. **[P0 可视化]** 九宫格模块 tile 实时状态徽标（后端聚合 `homeStatus` → 前端渲染）。**已完成**：`cloudfunctions/stats` 新增 `homeStatus` action（8 个模块待办计数，tone 仅表语义）；`utils/api.js` 导出 `getHomeStatus`；`pages/index` 取数并 `attachBadges` 挂到 tile，`index.wxml` 渲染 `.badge.badge--{tone}`（>99 显示 `99+`），`index.wxss` 定位 + 白边隔离。

> 映射：消息预警=未读预警(abnormal) / 周期试验=待检器具(pending) / 器具台账=临期器具(pending) / 维保报修=待审批报修(pending) / 报废管理=待审批报废(pending) / 监督检查=待整改隐患(abnormal) / 采购验收=待审批采购(pending) / 库房管理=盘亏器具(abnormal)。仅在有积压时显示徽标（节奏而非堆砌）。
3. **[P1]** 四个核心流程时间线组件（领用归还/报修复检/采购入库/报废处置）。**已完成**：`utils/flow.js` 新增 `FLOWS` 映射（四流程 `labels` + `current(status)` 推导）与 `buildFlow(type, status, meta)`（驳回态 `rejected` 将 current 钳到 0）；`components/flow-steps` 纯 CSS 令牌 stepper 组件（done/active/wait/reject 节点 + 连接线，✓/! 标记，无外部依赖）。接入四处：
   - `pkg-maint/pages/repair` → 报修复检（标题"处理进度"，select-to-expand）；
   - `pkg-scrap/pages/approve` → 报废处置（标题"处置进度"，点击行展开）；
   - `pkg-purchase/pages/approve` → 采购入库（标题"采购进度"，保留原 `record-timeline` 操作日志）；
   - `pages/tool-detail` → 领用→归还（独立"使用状态"卡片，置于时间线前）。
4. **[P1]** 统计驾驶舱图表化。**已完成（实现与原文偏差）**：原文指定 ec-canvas，但为规避其 ~1MB 依赖 + 外链网络/离线风险（现场弱网工具不宜引入），改用**原生 canvas 2d 自建 `components/chart` 组件**（支持 bar/line/pie，配色取自状态令牌，无第三方依赖）。`pkg-stats/pages/dashboard` 用 `getDashboard()` 状态分布 → pie（合格/待检/维修中/缺失/报废），近 7 日 `getTrend()` → line；移除旧 CSS 趋势占位。
5. **[P2]** 图标字体替换 emoji；展示字体加载；夜间主题。**已完成**：
   - 夜间主题：`utils/theme.js`（`auto`/`dark` 持久化）+ `@media (prefers-color-scheme: dark)`（自动，覆盖全部页面）与 `.theme-dark` 手动类（profile 开关持久化，覆盖 opted-in 页面根视图）；`app.wxss` 双份令牌块（内容与作用域一致）。
   - 字体脚手架：`SNDNum` 等宽数字由 `app.wxss` `@import styles/fonts.wxss` 以包内 base64 `@font-face` 提供（2026-08-08 改版：原 jsdelivr 网络加载在国内 DNS 不可达，且 `wx.loadFontFace` 不支持包内路径、Data URL 需基础库 ≥3.7.9；base64 免合法域名白名单、离线可用，代价为主包 +21KB），失败自动回退系统等宽栈；`utils/fonts.js` 现仅保留可选 `SNDIcon`（图标字体，`ICONFONT_URL` 留空即跳过）；`app.onLaunch` 调用；`app.wxss` 已有 `--font-num` 令牌与 `.font-num`/`.font-display`/`.iconfont` 类。**emoji 图标暂保留**，图标字体接入路径见 `utils/fonts.js` 顶部注释（iconfont.cn 导出 .ttf → 填 URL → wxml 改 `.iconfont` 文本）。

> 所有页面/组件只引用令牌与工具类，**禁止硬编码色值**（除一次性渐变），换肤/调性只需改 `app.wxss`。
