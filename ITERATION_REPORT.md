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

## 1. 本次迭代完成的功能与修复（对应上轮 §4 七项建议）

**【Item 1 · RBAC 注入剩余业务域闭环 + 通用 scopedList 模板】**（上轮 §4 建议 #1）
- `cert/helpers/db.js`、`check/helpers/db.js`、`performance/helpers/db.js`、`stats/helpers/db.js` 透出 RBAC 原语（`allowedOrgIds`/`roleScope`/`subtreeIds`/`scopeFilter`）+ `listOrgs`。
- 新增通用 `scopedList(coll, filter, opts)` 模板（统一把「服务端 `orgId` 归属 + 列表 `scopeFilter` 按组织子树收窄」沉淀为 helpers 纯函数），`stats` 另增 `scopeWhere`/`scopedCount` 同构原语；业务 `index.js` 列表零重复样板。
- `cert/index.js list`、`check/index.js listHazard/assessList`、`performance/index.js list/rank/summary`、`stats/index.js dashboard/exportReport` 全面改用 `scopedList`/`scopeWhere`；写库（`reportHazard`/`assess`/`score`/`rewardAdd`/`upsert`）统一以服务端 `me.orgId` 归属，防越权挂靠。
- 配套单测 `tests/rbac-domains.test.js`（9 项）：cert/check/performance 四档「全局看全量 / 单位看子树 / 普通仅本机构 / 越权下钻被忽略」全验证。

**【Item 2 · CI 真正全绿观察 + 门禁自检】**（上轮 §4 建议 #2）
- 上轮已接好 Secret 注入（`TCB_ENV_ID`/`SECRET_ID`/`SECRET_KEY`/`TCB_SECRET_ID`/`TCB_SECRET_KEY`）、CloudBase CLI 安装、内存 Mongo 启动脚本；本轮在 CI 新增「前端零直连门禁·自检」步骤（`npm run check:frontend:self`），先验证规则引擎本身未漂移再跑拦截，避免门禁形同虚设（详见 Item 7）。
- 说明：CI 真实全绿依赖仓库在 GitHub 配置上述 Secrets；代码与流水线已就绪，首次全绿待 Secrets 配置后观察。

**【Item 3 · 日志留存后台管理 UI + 操作审计闭环】**（上轮 §4 建议 #3）
- `pkg-system/pages/log` 升级为「操作日志 + 日志策略」综合后台：新增**留存策略编辑卡**（按类型设置 `user/scrap/purchase/store/cert` 留存天数，保存调用 `api.setRetention`）、**手动清理卡**（调用 `api.cleanupLogs` 清理到期日志并显示清理条数）、**策略变更筛选**（类型筛选新增「策略变更」，可查 `retention_set`/`rate_limit_set`/`cleanup_logs`/`rate_limited` 审计日志）。
- 后端审计闭环（上轮收口，本轮随 UI 一并验证）：`retention` op=set 记 `retention_set`、`cleanupLogs` 手动记 `cleanup_logs`、`log` 限流命中记 `rate_limited`、`rateLimit` op=set 记 `rate_limit_set`；形成「配置—执行—留痕」闭环。

**【Item 4 · 限流策略配置化 + 全局限流看板】**（上轮 §4 建议 #4）
- 后端：`system/index.js` 的 `ACTION_RATE`/`BATCH_ACTIONS` 升级为 dicts 配置驱动（`type=rate_limit/key=policy`，60s 缓存，可后台覆盖）；新增 `rateLimit`（get/set，仅管理员）与 `rateStats`（当前策略 + 拦截次数 + 策略变更次数，仅管理员）。
- 前端：log 页新增**限流策略编辑卡**（`api.getRateLimit`/`setRateLimit`，可改 default/import/batch 的窗口与上限）与**限流看板卡**（`api.getRateStats`，展示累计拦截次数、策略变更次数、当前策略摘要），便于识别异常刷量。

**【Item 5 · 权限页深链与组织切换刷新增强】**（上轮 §4 建议 #5）
- 事件总线 `utils/eventBus.js` + `auth.emitProfileChanged/onProfileChanged/refreshProfile` 三处同步：`pages/index`（onShow 订阅 `profile:changed`→`refresh()` 并 `refreshBadges()`）、`pages/profile`（绑定成功后 `emitProfileChanged` 且订阅→`load()`）、`pages/permission`（订阅→`refresh()`）。切换组织 / 被管理员调整角色后统一经 `auth.refreshProfile()` 拉取并广播，首页九宫格徽标、profile、permission 三页同步刷新；onHide/onUnload 清理订阅防泄漏。

**【Item 6 · 迁移契约回归扩展至「写后读」双向】**（上轮 §4 建议 #6）
- `tests/migration-bridge.test.js` 新增 **④ 写后读双向一致**：断言 wx 内存库与 mongo 适配层在 `add → getById → update → getById → remove → count` 全流程返回结构一致（业务 helpers 解构消费的命名导出 + `scopeFilter` 行为一致）。
- 修复真实契约 bug：`_shared/dbBase.mongo.js` 的 `.doc(id).get()` 原返回裸 `doc`，与 wx-server-sdk / wx-mock 的 `{ data: doc }` 不一致；统一为 `{ data: doc }`，使「换掉 wx-server-sdk 即整体迁移」在 `getById` 维度真正等价（同步修正 `migration-drill.test.js` 断言以对齐新契约）。

**【Item 7 · 前端零直连门禁扩展为规则引擎】**（上轮 §4 建议 #7）
- `scripts/check-frontend-decoupled.js` 由固定正则重构为**可配置规则引擎**：规则外置（每条含 `id/severity/pattern/message/allow/dimension`，默认规则可被 `--config=*.json` 或 `FRONTEND_DECOUPLE_CONFIG` 覆盖）；按文件位置归类为 `pages/components/utils/other` **维度分层上报**（components 单独维度，便于 PR 评论按模块定位）；命中输出 **GitHub Actions 注解**（`::error file=…::`）精确到行；新增 **`--self-test` 自检模式**（注入合成违规/豁免样本，验证「该拦的拦、该豁免的豁免」）。
- `package.json` 新增 `check:frontend:self`；CI 新增自检步骤 + 保留拦截步骤；`--json`/`--strict` 便于后续接入 PR 评论机器人。

## 2. 架构遵守情况（解耦规则核查）

守则三大铁律逐条核验：

| 铁律 | 本次改动核查 | 结果 |
|---|---|---|
| ① 前端统一入口：页面禁止直连 `wx.cloud.*` | `pkg-system/pages/log/*` 仅 `require` 语义层 `utils/api`/`auth`/`network`；grep 全仓前端（豁免 `app.js` 的 `wx.cloud.init` 与 `utils/api.js` transport 层）：零新增直连；门禁 `--self-test` 6/6 证明规则引擎有效 | ✅ 合规（规则引擎 + 维度上报 + CI 自检） |
| ② 云函数分层隔离：主逻辑禁止直连 `cloud.database()/getWXContext()` | grep `cloudfunctions/*/index.js`：`system/index.js` 仅 `require('crypto')`（Node 内置）；全部业务 `index.js` 仅引用 `./helpers`；`scopedList`/`scopeWhere` 上提 helpers，主逻辑零破坏 | ✅ 合规 |
| ③ 迁移契约：唯一允许改动点为 `api.js` 与 `helpers/*.js` | 改动落点：`utils/api.js`（新增 retention/rate 语义函数，契约允许）、`helpers/db.js`（RBAC + scopedList，允许）、`_shared/dbBase*.js`（隔离层源，属迁移点）、`pages/*`/`scripts/*`/`ci.yml`/`package.json`（UI/脚本/配置，契约不约束）；业务 `index.js` 仅换用 `scopedList`，零业务逻辑破坏 | ✅ 合规 |

**架构合规率：100%。** 九重验证（详见 §3）全绿；新增 `scopedList`/`scopeWhere`/`scopedCount` 通用模板，RBAC 数据范围在 cert/check/performance/stats 真实列表落地；迁移契约在 `getById`/`update`/`remove`/`count` 维度与 wx 适配层等价。

## 3. 验证通过情况

| 验证项 | 方法 | 结果 |
|---|---|---|
| 云函数单测 | `npm test`（pretest 自动打包隔离层） | ✅ **98 / 98 通过**（含 rbac-domains 9 + rateLimit/rateStats + 迁移双向 + 留存/清理审计） |
| 迁移契约反向校验 | `migration-bridge.test.js` | ✅ wx/mongo 适配层导出接口等价 + RBAC 行为一致 + 写后读双向一致（每提交必跑） |
| 迁移真实演练 | `migration-drill.test.js`（mongo 适配层 + 真实 borrow 业务零改动） | ✅ addBorrow/listBorrow 倒序/过滤/getById/currentUser 行为一致（对齐 `{data:doc}` 契约） |
| helper 注释规范 | `npm run lint:helpers` | ✅ 38 个文件首行均为真实路径 |
| 隔离层单一源 | `npm run lint:db-base` | ✅ 38 副本与 `_shared/*` 逐字节一致（dbBase + userBase） |
| 全量 JS 语法 | `npm run check:syntax` | ✅ 180 个 JS 文件 `node --check` 通过 |
| 可部署产物门禁 | `npm run validate:functions` | ✅ 18 个云函数结构/语法/隔离层自包含全通过 |
| 前端零直连门禁 | `npm run check:frontend` + `--self-test` | ✅ 零直连通过 + 规则引擎自检 6/6（CI 已加自检步骤） |
| CI 部署干跑 | `npm run validate:deploy` | ⏭️ 沙箱无 CLI，优雅跳过（exit 0）；CI 注入 Secret + 安装 CLI 后真正生效 |
| 真实 MongoDB 演练 | `npm run drill:mongo` | ⏭️ 未配置 MONGODB_URI / 未装 mongodb，优雅跳过（exit 0）；CI 起 memory-server 后真正跑全业务域回归 |
| RBAC 剩余域收窄 | rbac-domains.test.js | ✅ cert/check/performance 全局/单位/本机构/越权下钻 四档全验证 |
| 留存/限流后台闭环 | system-log.test.js + rbac-domains | ✅ set 生效 + 审计落 `retention_set`/`rate_limit_set`/`cleanup_logs` + 清理仅删到期 |
| 限流看板 | system-log.test.js | ✅ 拦截次数随限流命中增长、仅管理员可见 |

## 4. 下一次迭代计划建议（≥5 项，按优先级）

1. **【质量】CI 首次全绿验收**：仓库配置 `TCB_ENV_ID`/`SECRET_ID`/`SECRET_KEY`/`TCB_SECRET_ID`/`TCB_SECRET_KEY` 后观察首次全绿，确认 `tcb fn deploy --dry-run` 与 7 域 mongo 回归在 CI 真实生效（本轮代码/流水线已就绪）。
2. **【可观测】限流看板历史化**：当前 `rateStats` 仅为累计计数；建议按 `action` 分维度（default/import/batch）统计拦截趋势、按日聚合，并对单动作短时高频做异常刷量告警，提升安全可观测性。
3. **【可观测】留存策略可视化**：log 页留存策略卡建议补充「按类型留存期环形图 / 到期预测」，让管理员直观看到各类型日志的合规留存覆盖情况。
4. **【架构】迁移契约端到端真驱动**：当前 `migration-drill` 用 mongo 适配层内置内存集合；建议接 `mongodb-memory-server` 真实驱动（替代内存集合），并扩展 command 操作符（neq/in/nin/regexp）全量断言，把「实测可迁移」证据从内存升级到真驱动。
5. **【质量】前端门禁接入 PR 评论机器人**：利用规则引擎的 `--json` 输出，在 PR 检查里汇总违规维度（pages/components/…）并评论到 PR，把架构铁律反馈前置到代码评审环节（§4 #7 收尾）。
6. **【安全】RBAC 注入剩余统计读接口**：ledger/reconcile/training 等统计看板类读接口，建议同样按 `orgId` 子树收窄（复用 `scopedList`/`scopeWhere`），闭环全部「看板型」读接口的数据范围。
7. **【合规】操作审计导出/归档**：管理后台增加 operation_logs 按时间区间导出/归档能力（管理员），满足安监留痕取证与合规归档需求，形成「留存—清理—取证」完整闭环。

## 5. 推送说明

- 目标仓库：`JoustsRivia/AISND`（经用户确认使用授权 token）。
- 本迭代提交（覆盖上轮 §4 全部 7 项目标）：
  - **Item 1 RBAC 全域闭环**：`cert/{index,helpers/db}.js`、`check/{index,helpers/db}.js`、`performance/{index,helpers/db}.js`、`stats/{index,helpers/db}.js`：列表 `scopedList`/`scopeWhere` 按组织子树收窄 + 写库服务端 `orgId` 归属；新增 `tests/rbac-domains.test.js`（9 项）。
  - **Item 3/4 留存/限流后台闭环**：`system/index.js` 限流 `rateLimit`/`rateStats` + 留存/清理审计；`utils/api.js` 新增 `getRateLimit/setRateLimit/getRateStats/getRetention/setRetention`；`pkg-system/pages/log/{log.js,log.wxml,log.wxss}` 留存编辑 + 手动清理 + 限流编辑 + 限流看板 + 策略变更筛选。
  - **Item 5 权限实时刷新**：`pages/index/index.js`（订阅刷新 + 徽标）、`pages/profile/profile.js`（emit + 订阅）、`utils/auth.js`/`utils/eventBus.js`（事件总线）。
  - **Item 6 迁移契约双向**：`shared/dbBase.mongo.js`（`.doc(id).get()` 统一 `{data:doc}`）、`tests/migration-bridge.test.js`（写后读双向）、`migration-drill.test.js`（对齐断言）。
  - **Item 7 门禁规则引擎**：`scripts/check-frontend-decoupled.js`（可配置规则 + 维度上报 + 自检 + CI 注解）、`package.json`（`check:frontend:self`）、`.github/workflows/ci.yml`（自检步骤）。
  - 测试：`system-log.test.js`（+6 限流/看板/审计）、`rbac-domains.test.js`（新增 9）。
  - `ITERATION_REPORT.md`：本报告。
- 架构验证：全仓符合可迁移契约，业务 `index.js` 零破坏；隔离层收口为 `dbBase.js` / `userBase.js` 双单一源 + `dbBase.mongo.js` 同源适配；RBAC 数据范围纯函数（`allowedOrgIds`/`scopeFilter`/`scopedList`）上提为共享层并在 cert/check/performance/stats 真实列表落地；迁移契约在 `getById`/`update`/`remove`/`count` 维度与 wx 适配层等价。
- 注（已更新）：自提交 `d8764d6` 起，隔离层副本 `cloudfunctions/*/helpers/{dbBase,userBase,crypto,employeeId,password,rateLimiter,roles}.js`（共 18 函数 × 7 源 = 126 份）已**纳入版本管理**（修复云端 `Cannot find module './userBase'`）。`scripts/bundle-db-base.js` 的 `SOURCES` 由 2 源扩至 7 源；`npm run pretest` / 部署脚本仍会重写这些副本，提交它们可保证「仓库即部署物」，避免缺副本导致云函数运行失败。

---

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
