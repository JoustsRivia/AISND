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
