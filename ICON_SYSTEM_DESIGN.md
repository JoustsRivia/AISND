# 🎨 AISND 图标体系美术设计方案（SNDIcon v4）

> **文档定位**：本方案供 **Claude CLI（本地）** 直接指导代码修改使用。包含现状诊断、图标体系规划、命名/尺寸/颜色规范、逐文件实施清单与验收标准。
> **适用项目**：AISND 微信小程序（深蓝科技感设计语言，设计 token 见 `app.wxss` / `DESIGN_SYSTEM.md`）。
> **版本**：v4（2026-08-12）　**前置产物**：`assets/fonts/snd-icon.ttf`（52 图标 / 9.1KB）、`snd-icon-map.json`、`snd-icons.wxss`
>
> **⚠️ 配套文档**：Claude CLI 拿到的是**另一条代码支线**（`fe408b0` 系，不含 v3+ 优化）。图标只是差异之一——v3 设计规范落地 / 组件 embed 修复 / 前端收尾（表单统一 + mini 按钮语义化）等页面优化也需重新应用，**完整跨支线变更清单见 `BRANCH_CHANGES.md`**（含公共类完整定义、逐文件改动要点、应用顺序与雷区）。

---

## 1. 现状诊断：为什么页面显示 `&#xF0D1;` 而非图标

### 1.1 现象

真机调试时，本应显示图标的文本位，渲染出字面量 `&#xF0D1;`（HTML 实体编码），而非图标图形。

### 1.2 根因（已定位，唯一主因）

全站 18 处图标全部写成如下形式：

```xml
<text class="iconfont">&#xF0D1;</text>
```

**微信小程序 `<text>` 组件的 `decode` 属性默认 `false`**，即**不解析 HTML 实体**。`&#xF0D1;` 不会在渲染层被转成字符 U+F0D1，而是**原样输出为文本** `&#xF0D1;`。这是当前唯一的、确定性的根因——与字体加载无关（字体即使加载成功，实体文本也不会变成图形）。

> 与 Web 的差异：Web 浏览器会在 DOM 解析期自动把 `&#xF0D1;` 转为字符；微信小程序的 wxml 编译器**不做**这一步，实体解码完全依赖 `<text decode>`，而 `decode` 默认关闭，且官方仅保证 `&nbsp; &lt; &gt; &amp; &apos; &ensp; &emsp;` 七个命名实体，**数字实体 `&#x…;` 在多数基础库不保证解析**。因此该写法在任何情况下都不应使用。

### 1.3 次要因素（修复主因后仍需确认，否则图标显示为"方块"）

| 因素 | 说明 | 验证动作 |
|------|------|----------|
| 字体未加载成功 | `.iconfont { font-family:'SNDIcon' }` 依赖 `wx.loadFontFace` 成功 | 确认云存储 `ICON/snd-icon.ttf` 已覆盖为 **52 图标新版**（旧版 49 图标缺 `moon/eye-off/lock` 三个码位） |
| 云开发未初始化 | `wx.cloud.getTempFileURL` 需 `wx.cloud.init` 已执行 | 确认 `app.js` 先 `wx.cloud.init` 再 `fonts.loadFonts()` |
| 字体加载时序 | `loadFontFace` 是异步的，首帧可能未就绪 | 关键图标位可加 `font-display` 降级；一般可接受首帧短暂空白 |

### 1.4 证据链

- `grep -rn '&#x' pages/ components/` → 10 个文件、18 处，全部位于 `<text class="iconfont">…</text>` 内，**无一设置 `decode`**；
- `utils/fonts.js`：`ICONFONT_FILEID` 已填、`loadSNDIcon()` 走 `getTempFileURL → loadFontFace`，`app.js` onLaunch 已调用 `fonts.loadFonts()` → 字体链路本身完整；
- `snd-icons.wxss`：`.iconfont` 字体族与 `.ri-*-line::before { content:"\F0D1" }` 类均已生成 → 伪元素类方案可用。

### 1.5 结论

> **主因：`<text>` 未解码 `&#x…;` 实体（decode 默认 false）→ 必须替换写法。**
> **次因：云存储字体须为 52 图标新版 + 云开发初始化顺序正确。**

> ✅ **修复状态（2026-08-12 v2）**：确认此前工作区为**旧基线**（07-28 快照），GitHub 远端 `fe408b0`（64 提交）才是最新——已 fetch 后在 fe408b0 上**重新应用全部修改**（提交 `f5a1761`/`43a772e`）：图标基建、全站 40+ 处 emoji→伪元素类（含功能模块九宫格 `utils/modules.js` 19 图标）、v3 公共类、ledger 2×2 网格。UI emoji 残留 0、标签平衡、37 类全命中。

---

## 2. 修复方案（Claude CLI 按此执行）

### 2.1 推荐：静态图标改用「伪元素类」（主方案）

微信小程序 `view` 支持 `::before` 伪元素 + `content`（基础库 ≥ 2.x），`snd-icons.wxss` 已生成全部 52 个类。

```xml
<!-- 之前（错误） -->
<text class="iconfont">&#xF0D1;</text>

<!-- 之后（正确，view 伪元素类） -->
<view class="iconfont ri-search-line"></view>
```

- **优点**：不依赖 decode；类名语义化（改图标只改类名）；CSS 侧统一维护码位；已与密码显隐（`pwd-eye` 用 `ri-eye-line`/`ri-eye-off-line`）方案一致。
- **注意**：`view` 默认块级，图标位样式（`display:inline-flex` 等）由 `.iconfont` 统一提供；若需与文字混排，外层套 `view` 或改用 2.2 的 text 方案。

**需同步补一条全局规则**：`.iconfont` 增加 `display:inline-block; vertical-align:middle;` 以适配 view 混排场景（见 §8 实施清单第 3 步）。

### 2.2 文字混排场景：`text` + 真实 Unicode 字符（非实体）

图标与文字同行时，用 `<text>` 渲染**真实字符**（不是实体）：

```xml
<view class="note"><text class="iconfont">󰃑</text> 小程序管理员由系统后台指派…</view>
```

- 该字符即 `\uF0D1`（`python3 -c "print(chr(0xF0D1))"` 可生成），编辑器需以 UTF-8 保存。
- 若担心私有区字符可读性，可改为 JS 常量方案（见 2.3），或直接对纯图标位用伪元素类。

### 2.3 动态图标（数据驱动列表/JS 生成）：JS `\uXXXX` 转义

```js
// JS 侧定义（不要写 '&#xF0D1;' 字符串！）
const ICONS = { search: '\uF0D1', scan: '\uF0BD' };
```

```xml
<text class="iconfont">{{ ICONS.search }}</text>
```

- `\uF0D1` 在 JS 中即字符 U+F0D1，绑定输出真实字符，无需 decode。
- **明确禁止**：JS 数据中出现 `'&#x…;'` 字符串——它会被原样渲染。

### 2.4 明确废弃的写法

| 写法 | 原因 |
|------|------|
| `<text class="iconfont">&#xXXXX;</text>` | text 默认不 decode，字面输出（本次 bug 根因） |
| `<text decode="{{true}}" class="iconfont">&#xXXXX;</text>` | decode 仅保证 7 个命名实体，数字实体解析不可靠，跨基础库有风险 |
| JS 中写 `'&#xXXXX;'` 字符串 | 动态绑定原样输出 |

---

## 3. 图标库选型

### 3.1 为什么选 Remix Icon

| 维度 | Remix Icon | TDesign Icons | 结论 |
|------|-----------|---------------|------|
| 字体产物 | ✅ 官方 ttf/woff/woff2（2800+ 图标） | ❌ 仅 SVG 体系，无官方字体 | Remix 胜 |
| 风格 | 中性圆润线性（2px 方线帽），深蓝科技感适配好 | 企业 2px 方线帽，风格更硬 | 平手，Remix 更通用 |
| 许可 | Apache 2.0（免费商用） | MIT | 均合规 |
| 子集化 | ✅ 已产出 52 图标 9.1KB | 需 SVG→font 自建 | Remix 胜 |
| 映射文档 | ✅ 官方 css 提供类名↔码位 | — | Remix 胜 |

**决策**：锁定 Remix Icon v4.5.0，**子集化**（只打包项目用到的图标）而非全量字体，弱网友好（9.1KB vs 563KB）。

### 3.2 子集化与再生成方法（后续增删图标时用）

```bash
# 1) 全量 ttf + 官方映射已存：assets/fonts/remixicon-full.ttf、/tmp/remix-map.json
# 2) 改 assets/fonts/snd-icon-map.json 增加/删除条目
# 3) 用 fontTools subset 重新子集化（见 git 提交 2f98b46 脚本模式）→ 覆盖 snd-icon.ttf
# 4) 重新生成 snd-icons.wxss（.ri-*-line::before { content:"\XXXX" }）
# 5) 重新上传云存储 ICON/snd-icon.ttf（覆盖，fileID 不变）
```

> ⚠️ 每次增删图标后，**必须覆盖上传云存储**，否则真机显示方块。

---

## 4. 图标分类体系（线性 / 填充）

### 4.1 分类原则

| 类型 | 命名后缀 | 用途 | 视觉规则 |
|------|---------|------|----------|
| **线性（outline）** | `-line` | 常规功能图标、导航、操作、信息展示（**默认**） | 1.5–2px 描边，透明底，主色/中性色 |
| **填充（fill）** | `-fill` | 强调态：tab 选中、状态点亮、主按钮内图标、空态主图 | 实心，品牌色/语义色，视觉权重高于线性 |

**现状**：52 个图标**全部为线性**（`-line`）。填充图标为规划项（P2），当前阶段以线性为主、用**颜色+权重**表达层级，不强制补 fill。

### 4.2 规划：需补充的填充图标（P2，可选）

| 场景 | 填充图标 | 用途 | 优先级 |
|------|---------|------|--------|
| 首页 tab 选中 | `ri-home-5-fill` / `ri-home-fill` | 底部 tab 选中态（若 tab 用图标+颜色区分） | P2 |
| 消息 tab 选中 | `ri-notification-3-fill` | 同上 | P2 |
| 我的 tab 选中 | `ri-user-fill` | 同上 | P2 |
| 成功确认 | `ri-checkbox-circle-fill` | 完成态、审批通过弹窗 | P1 |
| 预警强提示 | `ri-alarm-warning-fill` | 高危/预警弹窗主图 | P1 |
| 扫描强调 | `ri-qr-scan-2-fill` | 首页扫码主按钮 | P2 |

> P1 = 建议本轮一并做（影响体验）；P2 = 后续迭代。填充图标同样走子集化流程。

---

## 5. 命名规范

### 5.1 类名命名

- 统一前缀 `ri-`，语义名小写连字符，后缀区分类型：`ri-<name>-line` / `ri-<name>-fill`。
- **禁止**自造码位/自定义 content；类名↔码位唯一对应，存于 `assets/fonts/snd-icon-map.json`。
- 例外：Remix 官方个别无 `-line` 后缀的类（如 `ri-link`）沿用官方命名，但**新增图标一律带后缀**。
- 场景别名索引：`assets/fonts/scene-index.json`（中文场景 → 类名），供跨文件引用保持一致。

### 5.2 码位规范

- 全部位于 **Unicode 私有区 U+F000–U+F3FF**（Remix 官方分配区间），与系统字体无冲突。
- 映射文件 `snd-icon-map.json` 结构：`{"ri-search-line": {"scene":"搜索","unicode":"\\uf0d1","char":"…","hex":"f0d1"}}`。
- 修改码位 = 修改映射 + 重新子集化 + 重新生成 wxss，三处同步，缺一不可。

### 5.3 命名示例（52 图标全表）

| 类名 | 场景 | 码位 | 建议尺寸 | 建议颜色 |
|------|------|------|----------|----------|
| ri-home-line | 首页 | U+EE2B | 44 | primary |
| ri-dashboard-line | 工作台 | U+EC14 | 40 | primary |
| ri-search-line | 搜索 | U+F0D1 | 32 | text-sub |
| ri-scan-line | 扫码 | U+F0BD | 48 | invert(主按钮底) |
| ri-barcode-line | 条码 | U+EAA2 | 32 | text-sub |
| ri-notification-3-line | 消息 | U+EF94 | 40 | text-sub |
| ri-user-line | 我的 | U+F264 | 40 | text-sub |
| ri-settings-3-line | 设置 | U+F0E6 | 32 | text-sub |
| ri-add-line | 添加 | U+EA13 | 32 | primary |
| ri-user-add-line | 添加用户 | U+F25E | 32 | text-sub |
| ri-delete-bin-line | 删除 | U+EC2A | 32 | danger |
| ri-edit-line | 编辑 | U+EC86 | 32 | text-sub |
| ri-more-2-line | 更多 | U+EF77 | 32 | text-muted |
| ri-menu-line | 菜单 | U+EF3E | 32 | text-sub |
| ri-archive-line | 库房 | U+EA48 | 40 | primary |
| ri-file-list-3-line | 档案 | U+ECEF | 40 | primary |
| ri-folder-line | 文件夹 | U+ED6A | 32 | text-sub |
| ri-checkbox-circle-line | 合格 | U+EB81 | 32 | success |
| ri-time-line | 时间 | U+F20F | 32 | text-sub |
| ri-calendar-line | 日历 | U+EB27 | 32 | text-sub |
| ri-alarm-line | 试验 | U+EA1B | 32 | text-sub |
| ri-alarm-warning-line | 预警 | U+EA1D | 40 | warning |
| ri-map-pin-line | 位置 | U+EF14 | 32 | text-sub |
| ri-money-cny-circle-line | 预算 | U+EF61 | 40 | success |
| ri-shopping-cart-line | 采购 | U+F120 | 40 | primary |
| ri-graduation-cap-line | 培训 | U+F333 | 40 | primary |
| ri-building-line | 组织 | U+EB0F | 40 | primary |
| ri-key-line | 权限 | U+EE71 | 32 | text-sub |
| ri-shield-check-line | 安全 | U+F100 | 40 | success |
| ri-download-2-line | 导出 | U+EC54 | 32 | primary |
| ri-upload-2-line | 上传 | U+F24A | 32 | primary |
| ri-bar-chart-line | 统计 | U+EA9E | 40 | primary |
| ri-filter-line | 筛选 | U+ED27 | 28 | text-sub |
| ri-refresh-line | 刷新 | U+F064 | 28 | text-sub |
| ri-eye-line | 眼睛 | U+ECB5 | 32 | text-muted |
| ri-eye-off-line | 隐藏密码 | U+ECB7 | 32 | text-muted |
| ri-wifi-line | 网络 | U+F2C0 | 32 | text-sub |
| ri-pen-nib-line | 笔 | U+EFDE | 28 | text-sub |
| ri-swap-line | 领用 | U+F1CB | 32 | primary |
| ri-tools-line | 工具 | U+F21B | 32 | text-sub |
| ri-award-line | 证书 | U+EA8A | 40 | primary |
| ri-logout-box-r-line | 退出 | U+EEDA | 32 | danger |
| ri-close-line | 关闭 | U+EB99 | 32 | text-muted |
| ri-link | 链接 | U+EEB2 | 28 | text-sub |
| ri-flag-line | 标记 | U+ED3B | 28 | text-sub |
| ri-arrow-right-s-line | 箭头 | U+EA6E | 28 | text-muted |
| ri-forbid-line | 禁用 | U+ED95 | 32 | danger |
| ri-camera-line | 照片 | U+EB31 | 32 | text-sub |
| ri-search-eye-line | 检查 | U+F0CF | 32 | text-sub |
| ri-moon-line | 夜间 | U+EF75 | 32 | text-sub |
| ri-printer-line | 打印 | U+F029 | 32 | text-sub |
| ri-lock-line | 锁定 | U+EECE | 32 | text-muted |

---

## 6. 使用场景矩阵

| 场景组 | 使用图标 | 用法 | 尺寸 | 颜色 |
|--------|---------|------|------|------|
| 底部/主导航 | home / dashboard / notification / user | 伪元素类 | 40–44 | 选中 primary / 未选 text-muted |
| 首页 Hero/九宫格 | scan / barcode / archive / file-list / alarm-warning… | 伪元素类，圆底 tint | 48 图标 / 96 圆底 | primary 系 |
| 工具栏操作 | add / edit / delete / download / upload / filter / refresh | 伪元素类 | 32 | 语义色 |
| 表单/行内 | eye / eye-off / calendar / time / map-pin / arrow-right | text 真实字符（混排）或伪元素类 | 28–32 | text-sub/muted |
| 状态/结果 | checkbox-circle / alarm-warning / shield-check | text 真实字符或伪元素类 | 32–40 | 语义色 |
| 空态 | file-list / notification / archive / folder（配合引导文案） | 伪元素类 | 64–96（大图标） | text-faint |
| 标题/分组 | sec-h 前导图标：map-pin / tools / link / lock | text 真实字符 | 28–32 | primary |

---

## 7. 尺寸规范

### 7.1 图标字号阶梯（建议新增 token 到 `app.wxss`）

| Token | 值 | 适用 |
|-------|-----|------|
| `--icon-xs` | 24rpx | 角标、小装饰、链接箭头 |
| `--icon-sm` | 28rpx | 行内辅助、表单内、筛选/刷新 |
| `--icon-md` | 32rpx | **默认**：列表项、操作按钮、状态图标 |
| `--icon-lg` | 40rpx | 标题前导、tab 图标、卡片主图 |
| `--icon-xl` | 48rpx | 九宫格、Hero、主按钮内图标 |
| `--icon-hero` | 96rpx | 空态大图标（置于 96rpx 圆底时图标本身 48rpx） |

> 图标尺寸用 `font-size` 控制（iconfont 是字体）；**不得**用 width/height 拉伸字体图标（会失真）。

### 7.2 触控规范（与 DESIGN_SYSTEM 一致）

- 可点图标位（眼睛、刷新、筛选、关闭）：**触控热区 ≥ 88rpx × 88rpx**，图标视觉 32rpx 居中，padding 补齐热区；
- 图标+文字按钮：整体高度 ≥ 88rpx。

---

## 8. 颜色规范

### 8.1 图标颜色继承规则

图标默认 `color: currentColor`（继承文字色），语义色通过父容器/类显式指定，与 `app.wxss` 设计 token 联动：

| 语义 | Token | 用途 |
|------|-------|------|
| 主文字 | `--c-text` | 默认图标 |
| 次文字 | `--c-text-sub` | 常规功能图标 |
| 弱化 | `--c-text-muted` | 辅助、箭头、眼睛 |
| 极弱 | `--c-text-faint` / `--c-text-weak` | 空态大图标、禁用 |
| 品牌强调 | `--c-primary` | 导航选中、主操作、Hero 圆底图标 |
| 成功 | `--c-success` | 合格、通过、安全 |
| 警告 | `--c-warning` | 预警、高危 |
| 危险 | `--c-danger` | 删除、退出、禁用 |
| 反白 | `--c-text-invert` | 主按钮内图标（蓝底白图标） |

### 8.2 图标底（可选增强）

- 九宫格/卡片主图标：置于 `--c-primary-soft` / `--c-tint-*` 圆角底（96rpx 圆角 24–32rpx），图标 48rpx；
- 深色模式：图标颜色跟随 token（tint 底透明度适配），**禁止硬编码色值**（DESIGN_SYSTEM 已有规则）。

---

## 9. 正确用法规范（Claude CLI 必读）

1. **静态纯图标位** → `<view class="iconfont ri-<name>-line"></view>`（伪元素类）；
2. **图标+文字混排** → `<text class="iconfont">真实字符</text>`（真实 U+F0D1 字符，**不是 `&#x…;` 实体**）；
3. **JS 动态图标** → JS 侧 `'\uF0D1'`，wxml `{{…}}` 绑定；
4. **切换图标** → 改类名（伪元素类）或改 JS 码位，**禁止**直接编辑 `content`；
5. **新增图标** → 改 `snd-icon-map.json` → 重新子集化 → 重新生成 `snd-icons.wxss` → **覆盖上传云存储**；
6. **字体依赖**：所有 iconfont 依赖 `SNDIcon` 字体加载成功；`app.js` 必须先 `wx.cloud.init` 再 `fonts.loadFonts()`；云存储文件必须是 52 图标新版。

---

## 10. 实施清单（给 Claude CLI 的逐文件修改指引）

> 目标：修复 18 处 `&#x…;` 渲染问题 + 建立规范。按序执行，每步可独立验证。

### 第 1 步：全局样式补齐（`app.wxss` / `assets/fonts/snd-icons.wxss`）

1. `snd-icons.wxss` 的 `.iconfont` 增加布局属性：
   ```css
   .iconfont { font-family:'SNDIcon',-apple-system,sans-serif; font-style:normal;
     -webkit-font-smoothing:antialiased; display:inline-block; vertical-align:middle; }
   ```
2. `app.wxss` 增加图标尺寸/颜色 token（§7.1 表）与语义类：
   ```css
   :root 追加 --icon-xs…--icon-hero（见 §7.1）
   .ico-primary { color: var(--c-primary); } …（或按需仅用内联 color）
   ```
3. 修复 `snd-icons.wxss` 顶部注释中的错误示例（`&#xEE2B;` → 真实字符说明）。

### 第 2 步：全站 18 处实体替换（10 个文件）

| 文件 | 处数 | 建议改法 |
|------|------|----------|
| pages/index/index.wxml | 1 | 空态图标 → 伪元素类（`<view class="empty-icon iconfont ri-checkbox-circle-line"></view>`） |
| pages/ledger/ledger.wxml | 4 | s-ico/act-ico/空态 → 伪元素类 |
| pages/login/login.wxml | 1 | 文字混排（锁图标+文案）→ text 真实字符 |
| pages/message/message.wxml | 1 | 空态 → 伪元素类 |
| pages/permission/permission.wxml | 4 | sec-h 前导图标（混排）→ text 真实字符 |
| pages/profile/profile.wxml | 1 | tr-ico → 伪元素类 |
| pages/register/register.wxml | 2 | 混排锁图标 + 弹窗成功 → text 真实字符 / 伪元素类 |
| pages/scan/scan.wxml | 1 | sb-ico（扫码图标）→ 伪元素类 |
| pages/tool-detail/tool-detail.wxml | 2 | 危险标记 + 空态 → 伪元素类 |
| components/db-picker/db-picker.wxml | 1 | 下拉箭头 → 伪元素类或 text 真实字符 |

- **替换规则**：外层样式挂 `view`/`text` 上时，图标类挂同一元素即可（`<view class="empty-icon iconfont ri-xxx-line">`）；纯 text 图标位用 text 真实字符方案；**任何情况下不再出现 `&#x`**。
- 真实字符生成：`python3 -c "print(chr(0xF0D1))"` 等；或统一用伪元素类避免私有区字符进源码。

### 第 3 步：动态图标核对（JS）

- 全库搜索 `&#x`（不限 wxml）：确认无 JS 字符串含 `'&#x…;'`；有则改 `'\uXXXX'`。
- 密码显隐已是伪元素类方案（`ri-eye-line`/`ri-eye-off-line`），仅需确认类名存在。

### 第 4 步：字体链路验证

1. 确认云存储 `ICON/snd-icon.ttf` 已覆盖为 **52 图标新版**（9.1KB；对比旧 49 图标 8.5KB）；
2. 确认 `app.js` 顺序：`wx.cloud.init(...)` 在 `fonts.loadFonts()` **之前**；
3. 开发者工具 Network 面板确认 `loadFontFace` 成功（无 404/域名拦截）。

### 第 5 步：回归验收

按 §11 清单逐项勾验。

---

## 11. 验收标准

- [ ] 全站无 `&#x` 字面量残留（`grep -rn '&#x' --include="*.wxml" pages/ components/` 返回空）；
- [ ] 真机预览：搜索/扫码/预警/空态/锁图标等 **52 图标全部渲染为图形**，无方块、无实体文本；
- [ ] 密码显隐点击切换正常（eye ↔ eye-off）；
- [ ] 图标+文字混排垂直居中对齐；
- [ ] 深色模式下图标颜色正确（跟随 token，无硬编码色）；
- [ ] 弱网/字体加载失败时，页面不报错、无白屏（降级为空白可接受，不得出现实体文本）；
- [ ] `snd-icon-map.json` / `snd-icons.wxss` / `snd-icon.ttf` 三者码位一致；
- [ ] 云存储字体为 52 图标新版（`fileID` 不变）。

---

## 12. 风险与雷区

- **`&#x…;` 实体的诱惑**：与 HTML 直觉相反，小程序 text 默认不解析——**永远不要用**；
- **字体未覆盖上传**：云存储里若是旧 49 图标版，`moon/eye-off/lock` 三个码位会显示方块；
- **私有区字符进源码**：真实字符方案可读性差，若团队在意，静态图标一律用伪元素类（推荐默认）；
- **`::before` 兼容性**：基础库 ≥ 2.x 支持 view 伪元素；若遇老安卓真机异常，回退 text 真实字符方案；
- **填充图标**：P1（checkbox-circle-fill / alarm-warning-fill）本轮建议补，P2 项勿阻塞主流程。

---

*文档结束。Claude CLI 可直接按 §2 修复 + §10 清单实施，§5/§7/§8 为长期规范。*
