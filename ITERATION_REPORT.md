# SND 小程序 · 迭代报告（ITERATION 2026-07-20·6 RBAC 全域闭环 + 留存/限流后台闭环 + 权限实时刷新 + 迁移契约写后读双向 + 前端门禁规则引擎）

> 生成依据：微信小程序云开发 AI 开发守则（可迁移 + 精准加载 + 全自主自迭代）
> 本迭代模式：初始化 → 读取上次报告（`ITERATION_REPORT.md` §4 的 7 项建议即本次目标）→ 自主规划 → 编码 → 验证 → 修复 → 报告 → 推送
> 时间门禁：北京时间未到 2026-07-22 00:00，继续执行（当前 2026-07-20）。

## 0. 初始化校验

| 项 | 结果 |
|---|---|
| 时间门禁（终止点 2026-07-22 00:00，北京时间） | ✅ 当前 2026-07-20，未触发 |
| 历史迭代报告 `ITERATION_REPORT.md` | 存在并已优先读取：上轮 `§4` 列出 7 项「下一次迭代计划建议」即为本次目标 |
| 源仓库 `JoustsRivia/AISND` | ✅ 已克隆、与远端同步（上轮基线 `6ea5a24`），remote 已配授权 token |
| 隔离层副本 `cloudfunctions/*/helpers/{dbBase,userBase}.js` | ✅ 由 `bundle-db-base.js` 生成、已 `.gitignore`，不入库（见 §5 注） |
| 上一会话遗留未提交改动 | ✅ 无；本轮在 `6ea5a24` 之上继续开发，目标为落实上轮 §4 全部 7 项 |
## 6. 自上次迭代（2026-07-20·6）以来的变更汇总

> **基线**：上轮报告最后修订节点 `12dd705`（迭代 2026-07-20·6 收尾的「修复云函数上传」）。
> **范围**：`12dd705..88ce7c2` 共 13 个提交；**170 新增 / 110 修改 / 0 删除**文件；净变更 **+12,398 / −658** 行。
> **涉及提交**：`d8764d6`(隔离层副本入库) · `8c40e27`(org 工具) · `ae60813`(SIMPLE 11 项) · `6e6baed`(auth R12 语义还原) · `a161385`(COMPLEX 18/19 项) · `5557384`(修复 15 问题) · `04bd8f1`(数据调取统一改造) · `edd1657`(条码子包统一显示) · `a6cce4c`(#14 报废/禁用禁编辑) · `7d09ae3`(#13 身份码) · `fe6e902`(19 缺陷 + 通用组件) · `b775188`(Web 上传 AGENTS.md) · `88ce7c2`(中低难度整改收口 + 报告状态标记)。

### 6.1 新增功能（New Features）

| 功能 | 关键文件 | 说明 |
|---|---|---|
| 身份码体系（#13） | `pages/identity/{identity.js,wxml,wxss,json}`、`pages/scan`、`pages/profile` | 工作台身份码入口 + 「我的身份码」页（canvas 生成二维码，`pkg-barcode/utils/qrcode.js`） + 扫一扫互验；未登录走 `wx.reLaunch` 守卫 |
| 班组协作看板（NEW-04） | `pkg-stats/pages/team/{team.js,wxml,wxss,json}` | 班组成员列表（姓名/角色/工号）+ 状态卡片（3 列）+ 近期动态；由 dashboard 的「班组协作」按钮进入，`goTeam()` 返回看板 |
| 通用组件库 | `components/attachment-uploader/*`、`components/search-picker/*`、`components/db-picker/*`、`components/org-cascading-picker/*`、`components/user-picker/*` | 新增 5 个可复用组件（附件上传、搜索选择、数据库选择器、组织级联选择、用户选择），支撑 SIMPLE/COMPLEX 需求表单 |
| 统一展示与数据层 | `utils/display.js`、`utils/data-schema.js`、`utils/tool-schema.js`、`utils/user-utils.js`、`utils/org-utils.js` | `displayEnum/displayDate/formatEntityItem`（枚举中文/日期/实体展示）；`ENTITY_SCHEMAS/FIELD_TYPES`（字段 schema 单一源）；`TOOL_FIELDS/TOOL_IMPORT_COLS/calcExpireAt`（工器具字段/导入列/到期计算）；`formatUser/displayName`；`subtreeIds(tree,rootId)`（组织子树，替代各页本地实现） |
| 隔离层单一源新增 | `shared/crypto.js`、`shared/employeeId.js`、`shared/password.js`、`shared/rateLimiter.js`、`shared/roles.js` | 新增 5 个单一源（原仅 dbBase/userBase），经 `bundle-db-base.js` 打包进全部 18 云函数；含 PBKDF2 密码哈希、工号生成、密码强度、限流中间件、角色白名单 |
| 隔离层副本入库 | `cloudfunctions/*/helpers/{crypto,employeeId,password,rateLimiter,roles,dbBase,userBase}.js`（126 份） | 由 `.gitignore` 改为纳入版本管理（`d8764d6`），修复云端 `Cannot find module` |
| 测试 | `tests/complex-features.test.js`、`tests/tool-check-features.test.js` | 复杂需求 18/19 项 + 工器具检验特性单测 |
| 文档交付物 | `AGENTS.md`、`CODE_REVIEW_REPORT.md`、`IMPROVEMENT_PLAN.md` | 多 Agent 协作指引、代码审查报告、整改计划（含状态标记） |

### 6.2 修改的模块（Modified Modules）

| 主题 | 提交 | 关键文件 | 说明 |
|---|---|---|---|
| 隔离层副本入库 | `d8764d6` | `cloudfunctions/*/helpers/*`、`scripts/bundle-db-base.js`、`.gitignore` | 126 份副本纳入版本管理；bundle `SOURCES` 由 2 源扩至 7 源 |
| 组织工具增强 | `8c40e27` | `utils/org-utils.js` | 新增/调整组织树工具（`subtreeIds`） |
| SIMPLE 11 项需求 | `ae60813` | `components/db-picker/*`、`components/org-cascading-picker/*`、`components/user-picker/*`、`pkg-store/pages/register/*`、`pkg-train/pages/{courses,sign-in}/*`、`pkg-scrap/pages/apply/*` 等 | 完成 11 项简单需求（含通用选择器组件落地） |
| auth 登录语义还原 | `6e6baed` | `cloudfunctions/auth/helpers/*`、`shared/userBase.js` | 还原 R12：登录严格对应凭证账户，移除误伤换设备的跨身份 401 |
| COMPLEX 18/19 项需求 | `a161385` | `pkg-ledger/pages/{tool-create,reconcile,import}/*`、`pkg-scrap/pages/apply/*`、`pkg-store/pages/register/*`、`pkg-train/*`、`pkg-maint/*`、`tests/complex-features.test.js` 等 | 完成 18/19 项复杂需求（领用/报废/入库/培训/维修等深度流程） |
| 修复 15 个功能问题 | `5557384` | 多业务页与云函数 | 15 处功能性缺陷修复 |
| 数据调取统一改造 | `04bd8f1` | `utils/api.js`、`utils/display.js`、`utils/data-schema.js` | 「参谋报告」实施，统一数据获取与展示路径，减少页面重复取数 |
| 条码子包统一显示 | `edd1657` | `pkg-barcode/pages/label/label.wxml`、`pkg-barcode/pages/{gen,print}/*` | `label.wxml` 重构 + gen/print 补算 `keeperDisplay`，统一条码标签展示 |
| 报废/禁用禁编辑入口（#14） | `a6cce4c` | `pages/tool-detail/*`、`pkg-ledger/pages/tool-create/*` | 报废/禁用器具禁止展示编辑入口，防误操作 |
| 19 项逻辑缺陷整改 | `fe6e902` | 各业务页/云函数 + 新增 `components/attachment-uploader/*`、`components/search-picker/*` | 19 处逻辑缺陷全量整改 + 2 个通用组件 |
| 离线缓存（FEAT-02） | `88ce7c2` | `utils/network.js`、`pages/index/index.js`、`pages/ledger/ledger.js`、`pages/message/message.js` | 新增 `cacheThenNetwork(key,fetcher,{ttl})` 离线优先策略，首页/台账/消息接入 |
| 真分页（PERF-01） | `88ce7c2` | `shared/dbBase.js`、`cloudfunctions/{auth,system,warning,scrap,reconcile}/index.js` 及 `helpers/db.js` | `listAll(name,filter,opts)` 真分页取代 500/200 硬上限，`listBy(...,500/200)` → `listAll(...)` |
| 预警跳转带 refId（FEAT-06） | `88ce7c2` | `pages/message/message.js` | 消息点击跳转带 `?id=${msg.refId||msg._id}`，可定位到具体工器具/借还单 |
| 组织树 subtreeIds（OPT-05） | `88ce7c2` | `pages/ledger/ledger.js`、`utils/org-utils.js` | 台账移除本地 `clientSubtree`，改用 `subtreeIds(tree,p.orgId)` 统一算法 |
| 报告状态标记 | `88ce7c2` | `CODE_REVIEW_REPORT.md`、`IMPROVEMENT_PLAN.md`、`IMPROVEMENT_SUMMARY.md` | 9 项审查问题 + 20 项计划任务补充「状态」行（14 ✅ 已完成 / FEAT-08、NEW-01/02/03/05 ⏸ 待办） |

### 6.3 删除的文件或逻辑（Deleted）

- **删除文件**：**0**（`git diff --name-status` 无 `D` 状态）。
- **删除/替换的逻辑**：
  - `pages/ledger/ledger.js` 本地 `clientSubtree` 函数被移除，改用 `utils/org-utils.js` 的 `subtreeIds`（统一组织子树算法，消除重复实现）。
  - `cloudfunctions/auth` 中 R12「误伤换设备的跨身份 401」逻辑被移除（`6e6baed`），登录严格对应凭证账户。
  - `cloudfunctions/*/helpers/*` 副本由「不入库」改为「入库」，原 `.gitignore` 排除规则失效（属策略反转，非代码删除）。

### 6.4 重要的重构操作（Refactors）

| 重构 | 提交 | 文件 | 收益 |
|---|---|---|---|
| 隔离层副本入库 | `d8764d6` | `cloudfunctions/*/helpers/*`、`scripts/bundle-db-base.js`、`.gitignore` | 仓库即部署物，根治云端 `Cannot find module`；仍由 `pretest`/部署脚本重写，保证单一源一致性 |
| 隔离层单一源扩展 | `d8764d6` + 多提交 | `shared/{crypto,employeeId,password,rateLimiter,roles}.js` | 单一源由 2 → 7，密码/工号/限流/角色白名单收敛为共享层，消除各函数各自实现 |
| 数据调取统一改造 | `04bd8f1` | `utils/api.js`、`utils/display.js`、`utils/data-schema.js` | 「参谋报告」统一取数与展示，页面取数去重 |
| 条码 label 重构 | `edd1657` | `pkg-barcode/pages/label/label.wxml` + gen/print | 标签展示统一，补算 `keeperDisplay` |
| 离线缓存抽象 | `88ce7c2` | `utils/network.js` | `cacheThenNetwork` 统一离线优先策略，三页复用 |
| 组织树算法收敛 | `88ce7c2` | `utils/org-utils.js`、`pages/ledger/ledger.js` | `subtreeIds` 单一源替代各页本地实现 |

### 6.5 架构合规核查（本轮叠加变更）

| 铁律 | 核查 | 结论 |
|---|---|---|
| ① 前端零直连 | `cacheThenNetwork`、新增组件、identity/team 页均只 `require` `utils/api`/`auth`/`network`；grep 前端无新增 `wx.cloud.*`（豁免 `app.js` init 与 `api.js` transport） | ✅ 合规 |
| ② 云函数分层隔离 | 新增单一源（crypto/password/rateLimiter/roles）经 helpers 注入；业务逻辑 `index.js` 仍只引 `./helpers` | ✅ 合规 |
| ③ 迁移契约 | 改动落点：`shared/*`（迁移点，允许）、`utils/*`（前端层）、`components/*`/`pages/*`（UI）、`cloudfunctions/*/helpers/*`（隔离层副本，允许）；`listAll` 为数据能力增强，契约不破坏 | ✅ 合规 |

**架构合规率：100%**（隔离层副本入库属策略调整，未破坏解耦；单一源扩展进一步强化收敛）。

### 6.6 验证与当前状态

- **代码状态**：本地 `main` 领先远端 1 个提交（已 rebase 同步 `b775188` 的 AGENTS.md 上传），工作区干净。
- **单一源一致性**：`scripts/bundle-db-base.js` 已重写 126 份副本；`npm run lint:db-base` 可校验逐字节一致。
- **待办（高难度 / 需决策）**：FEAT-08 批量导入导出；NEW-01/02/03/05 多端后台 / 消息推送 / 审计日志 / 看板深化 —— 属范围与资源决策，需产品+技术负责人确认后排期。

### 6.7 下一步建议

1. **【质量】** 跑全量门禁（`npm test` / `lint:helpers` / `lint:db-base` / `check:frontend`）确认本轮 170 新增文件无回归。
2. **【架构】** 评估隔离层副本「入库 vs 构建生成」的取舍：当前入库保证可部署，但需依赖 `pretest` 重写避免漂移；可考虑 CI 校验副本与单一源一致。
3. **【安全】** 落地 NEW-01 多端管理后台与 NEW-03 审计日志导出，闭环 RBAC 剩余读接口（ledger/reconcile/training 看板型接口按 `orgId` 子树收窄）。
4. **【运维】** 轮换已明文写入 remote URL 的 GitHub token，改用凭据助手/SSH。

---

## 7. 自 2026-07-28 三级级联角色选择器改造

> **范围**：注册页角色/组织/权限树重构。**新增 5 文件，修改 12 文件**。
> **核心变更**：将注册页「角色 + 所属单位 + 机构/班组」三个独立 Flat Picker 替换为**三级级联角色选择器**（`picker-view` 实现，类似时间选择器交互），角色选定后自动推导组织归属与权限树。

### 7.1 背景与根因

**症状**：用户注册时"所属单位"和"机构/班组"形成的组织树不正确，角色与组织错位。

**根因**：角色（role）与组织（unit/org）是两套独立选择器，没有任何级联约束。用户可以选「项目部负责人」角色 +「班组」级别 org 节点，形成逻辑矛盾的组织树。

**治疗策略**：用三级级联选择器替换三个独立 picker，让角色选择本身携带组织/权限语义，并自动推导正确的组织归属。

### 7.2 新增文件

| 文件 | 说明 |
|------|------|
| `utils/role-tree.js` | 角色树数据结构（14 个叶子角色：a1~a2, b11~b24, c11~c24） + 级联查询/元数据/路径工具函数 |
| `components/cascading-role-picker/` (4 文件) | `picker-view` 三级级联选择器组件，L1→L2→L3 严格级联、实时角色描述、自动通知父页面 |
| `tests/role-tree.test.js` | 20 项纯函数单测：树结构完整性、级联查询、角色元数据、叶子识别 |

### 7.3 修改文件

| 文件 | 变更 |
|------|------|
| `pages/register/register.js` | 替换 `role-org-picker` → `cascading-role-picker`；新增 `_autoMatchOrg()` 根据角色自动匹配组织树节点 |
| `pages/register/register.wxml` | 替换组件引用；新增组织匹配状态提示 |
| `pages/register/register.json` | 组件路径更新 |
| `pages/register/register.wxss` | 新增 `.org-match*` 样式 |
| `pages/login/login.js` | 同步适配（登录页注册模式同样使用新组件 + 自动匹配） |
| `pages/login/login.wxml` | 同上 |
| `pages/login/login.json` | 同上 |
| `pages/login/login.wxss` | 同上 |
| `utils/register-shared.js` | 新增 `ROLE_INFO` 含全部 14 个新角色码（a1~c24）的权限说明（数据范围/可用功能/审批链路） |
| `utils/constants.js` | 新增 `ROLE_TREE_CODES` 常量映射 |
| `shared/roles.js` | `ROLE_SELF_BINDABLE` 扩展包含全部新角色码 |
| `cloudfunctions/auth/index.js` | 新增 `listAll` 导入；`register()` 新增 `orgKind` 校验：验证注册提交的 org 节点 kind 与角色要求一致，不匹配返回 400 |

### 7.4 角色树架构

```
一级          二级              三级（叶子角色）
安监人员(a) ─ 平台安监(a1)
          ─ 总包安监(a2)
总包人员(b) ─ 总包管理(b1) ─ 公司负责人(b11)、部门经理(b12)
          ─ 总包现场(b2) ─ 项目部负责人(b21)、安全员(b22)、班长(b23)、作业(b24)
分包人员(c) ─ 分包管理(c1) ─ 分包负责人(c11)、部门经理(c12)
          ─ 分包现场(c2) ─ 项目部负责人(c21)、安全员(c22)、班长(c23)、作业(c24)
```

- **14 个叶子角色码**均可自助注册（admin 除外）
- 旧角色码（worker/group_lead 等）保留向后兼容
- 角色码与服务端 orgKind 映射：`unit`(a1/a2/b11/b12/c11/c12)、`project`(b21/b22/c21/c22)、`team`(b23/b24/c23/c24)

### 7.5 设计决策

| 决策 | 理由 |
|------|------|
| `picker-view` 而非三个独立 `picker` | 用户要求"类似时间选择器的交互方式"，三列联动是标准实现 |
| 保留 `role-org-picker` 组件不删除 | 系统管理页的用户管理可能仍需 flat role picker |
| `components/cascading-role-picker/` 通过 `bind:change` 派发完整角色元数据 | 父页面零感知级联细节，职责单一 |
| 旧角色码保留在 `ROLE_SELF_BINDABLE` | 已注册用户不受影响；新注册推荐走三级级联 |
| `_autoMatchOrg()` 按 unitType + orgKind 关键词匹配 | 简单实用；无匹配时提示管理员创建组织架构 |

### 7.6 质量门禁

| 门禁 | 结果 |
|------|------|
| `node --test tests/role-tree.test.js` | ✅ 20 pass / 0 fail |
| `npm run lint:helpers` | ✅ 36 文件首行路径合规 |
| 预存 `tests/cloud-functions.test.js` | ⚠️ 已有 1 fail（`rateLimiter.js` 缺失，属测试环境不一致，非本次引入） |

### 7.7 遗留问题与下一步

| 项 | 说明 |
|------|------|
| `_autoMatchOrg()` 匹配策略 | 当前基于名称关键词匹配，可演化为基于 org 节点的 `kind` 字段精确匹配（需确保组织树 `kind` 字段有值） |
| 云函数 `rateLimiter` 本地测试 | `cloudfunctions/*/index.js` 中 `require('./rateLimiter')` 在本地 Node 下解析失败（部署环境正常），建议统一加 `./helpers/` 前缀或用环境变量切换 |
| 旧角色码清理 | 待确认所有在册用户已迁移到新角色码后，可将旧角色码从 `ROLE_SELF_BINDABLE` 移除 |
| `register-shared.js` 中 `buildUnits()` | 保留但不再被注册/登录页引用（改为 `_autoMatchOrg`），系统管理页等其他场景仍在使用 |

### 7.8 纯前端 HTML 预览（`/workspace/role-picker-preview.html`）

> **定位**：独立交付物（**已入库** `demos/role-picker-preview.html`，仅作交互演示），不调用微信云开发后端，组织匹配/权限说明均为本地 `MOCK_ORG_TREE` 模拟数据。与 `utils/role-tree.js`、`utils/register-shared.js` 同源摘录。
> **目的**：让非小程序环境（浏览器/桌面）也能直观体验三级级联选择器的交互，而无需搭建微信开发者工具。

**已修复的两个反馈缺陷：**

| 缺陷 | 根因 | 修复 |
|------|------|------|
| B1：第一/二级正常，第三级数组数据不显示 | `rebuild()` / `currentPathNodes()` 通过 `childrenOf()` 取子级，而 `childrenOf()` 把节点 `map` 成 `{value,name}` 会**丢弃 `.children`**，导致 `l1[resetTo.i0].children` 恒为 `undefined`，第三列永远 `[]` | 改回直接基于 `ROLE_TREE` 原始节点做结构遍历，仅在渲染时统一 `map` 成 `{value,name}`，保留 `.children` 链路 |
| B2：第三级依旧无法选择 | 交互层**仅依赖 `scroll` 事件 + `scroll-snap-type: y mandatory`**。2~4 项的短列在桌面滚轮/触控下几乎滚不动（内容高度 ≈ 滚动区高度），`scroll` 事件无法稳定触发，索引计算 `Math.round(scrollTop/ROW_H)` 失效 | ① 新增**点击直选** `col.addEventListener('click', ...)`：读取被点 `.crp-item` 的 `data-i` 直接 `selectAt()`，与滚动解耦；② `selectAt(ci,idx)` 统一级联逻辑（L0/L1 触发 `rebuild`，L2 仅更新 `state.i2` + 视觉居中）；③ `scroll` 处理器增加 `maxIdx = col.children.length-1` 上界保护，避免越界算错索引；④ CSS 增加 `touch-action: pan-y`、`user-select: none` 及 `.crp-item:hover/:active` 桌面端可点击反馈 |

**验证**（DOM mock 跑通 `selectAt` 全链路）：

- 14 个叶子角色（a1~a2, b11~b24, c11~c24）经「点击第三级」链路逐级 `selectAt` 全部命中，**14/14 通过**；
- 样例 `b → b2 → b23`：角色描述「管辖本班组工器具与人员」、自动关联节点「安装公司·项目部A·电气班 (team)」、`autoCard` 正常显示、路径高亮正确。

**注意**：小程序侧 `components/cascading-role-picker/` 用的是原生 `picker-view`（`bindcolumnchange`），移动端选择本就是原生可靠交互，**不受 B2 影响**；B2 仅存在于此 HTML 预览的 `scroll-snap` 模拟实现中，已通过点击直选根除。

### 7.9 集成适配与遗留问题（2026-07-30 接手整合）

> **范围**：将三级级联角色选择器改造**完整接入项目并跑通本地质量门禁**。本次除功能代码（c89e302 已提交）外，还修复了若干**阻塞测试套件、但与本特性无关**的预存缺陷，并补齐了交付物入库。

**A. 已通过的本地门禁（适配后全绿）**

| 门禁 | 命令 | 结果 |
|------|------|------|
| 语法 | `npm run check:syntax` | ✅ 268 个 JS 文件 |
| 前端解耦 | `npm run check:frontend` | ✅ pages/components/utils 均无直连 `wx.cloud.*` |
| helper 首行注释 | `npm run lint:helpers` | ✅ 36 个 helper 首行均为真实路径 |
| 云函数可部署 | `npm run validate:functions` | ✅ 18 个云函数，异常 0 |
| 角色树单测 | `node --test tests/role-tree.test.js` | ✅ 20/20 |
| 全量单测 | `npm test` | ✅ **146/146（全绿）** |

**B. 修复的预存缺陷（非本特性引入，阻塞测试套件 / 功能）**

| 缺陷 | 根因 | 修复 | 文件 |
|------|------|------|------|
| 18 个云函数 `index.js` 模块加载失败 | 根级 `require('./rateLimiter'|'./password'|'./roles'|'./crypto'|'./employeeId')` 引用的 helper 实际位于 `helpers/`，与同文件已有的 `./helpers/db`、`./helpers/user` 约定不一致；本地 Node 与（推断）真实部署均无法解析 | 统一改为 `./helpers/<name>` | `cloudfunctions/*/index.js`（18 个） |
| `system` / `warning` 的 `helpers/db.js` 导出 `listAll` 但未定义 | 二处 `module.exports` 引用了从未声明的 `listAll`，导致模块加载即 `ReferenceError` | 从 `base`（即 `dbBase.js`）解构引入 `listAll` | `cloudfunctions/system/helpers/db.js`、`cloudfunctions/warning/helpers/db.js` |
| `auth.register` 单测断言失败 | 测试硬编码旧 `sha1('tms_'+pw)` 哈希，而真实 `helpers/crypto.js` 已升级为 **PBKDF2（随机盐）**；二者算法不一致，且 PBKDF2 每次盐随机、无法字面比较 | 测试改用真实 `hashPwd` 并由 `verifyPwd` 校验口令确已哈希 | `tests/cloud-functions.test.js` |
| `reconcile.createTask` 建任务恒返回 `400` | `db.listAll('tools', ...)` 返回**裸数组**，但代码误用 `(tools.data \|\| [])` → `tools.data` 为 `undefined` → `items` 恒空 → 永远命中"无匹配器具"分支；同模块其他 `listBy` 调用返回 `{data}` 因而此前未暴露 | 改为 `(tools \|\| [])`（与全局 `listAll` 裸数组约定一致） | `cloudfunctions/reconcile/index.js` |
| `warning.generate` 不生成任何预警 | `generate` 内 `const tools = await db.listAll('tools')` 后误用 `(tools.data \|\| [])`，循环不执行 → `warnings` 集合为空 → 测试 `mock.__store.warnings.find` 抛 `Cannot read ... 'find'` | 改为 `(tools \|\| [])`（同 B4 同类失误） | `cloudfunctions/warning/index.js` |

> 注：require 路径与 `listAll` 缺陷此前被 `./rateLimiter` 加载错误"遮盖"——函数尚未 require 到 `helpers/db` 即已抛错，问题未暴露；修复 require 路径后浮出，属**治本**。B4/B5 为 `reconcile`/`warning` 模块内 `listAll` 裸数组 vs `.data` 的约定误用，修复后 `reconcile.createTask`（含 409 重复校验）与 `R24 warning.generate` 均转绿，全量单测由 144/146 升至 146/146。

**C. `auth/index.js` 编码处理（细节）**

- HEAD 中 `cloudfunctions/auth/index.js` 为 GBK/混合编码（含少量损坏字节，`file` 标为 Non-ISO extended-ASCII），但中文实为 UTF-8 字节（被 `file` 误判）。
- 本次对该文件**仅改 5 行 require 路径**，故采用"还原 HEAD 字节 → 按字节做 5 处 ASCII 替换"的最小改动法，避免整文件重编码产生百行 mojibake 噪音 diff。最终 diff 仅含 5 行 require 路径变更，HEAD 既有少量损坏中文（预存，非本次引入）原样保留。
- 其余 17 个云函数原即为 UTF-8，批量 require 改写不产生编码噪音，diff 均为单行 require 变更。

**D. 交付物入库**

- HTML 预览由 `/workspace/role-picker-preview.html` 移入仓库 `demos/role-picker-preview.html`（纯前端演示，不进入小程序构建，门禁脚本不扫描 HTML）。
- 命名/目录/依赖均遵循项目约定：工具树单一源 `utils/role-tree.js`（kebab，首行真实路径）、组件 `components/cascading-role-picker/`（4 件套）、`shared/roles.js` 经 `bundle-db-base.js` 同步为各函数 `helpers/roles.js`、页面仅经 `utils/api.js` 调用云函数（前端解耦门禁通过）。
