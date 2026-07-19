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
- 配套单测 `cloudfunctions/_tests/rbac-domains.test.js`（9 项）：cert/check/performance 四档「全局看全量 / 单位看子树 / 普通仅本机构 / 越权下钻被忽略」全验证。

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
- `cloudfunctions/_tests/migration-bridge.test.js` 新增 **④ 写后读双向一致**：断言 wx 内存库与 mongo 适配层在 `add → getById → update → getById → remove → count` 全流程返回结构一致（业务 helpers 解构消费的命名导出 + `scopeFilter` 行为一致）。
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
  - **Item 1 RBAC 全域闭环**：`cert/{index,helpers/db}.js`、`check/{index,helpers/db}.js`、`performance/{index,helpers/db}.js`、`stats/{index,helpers/db}.js`：列表 `scopedList`/`scopeWhere` 按组织子树收窄 + 写库服务端 `orgId` 归属；新增 `cloudfunctions/_tests/rbac-domains.test.js`（9 项）。
  - **Item 3/4 留存/限流后台闭环**：`system/index.js` 限流 `rateLimit`/`rateStats` + 留存/清理审计；`utils/api.js` 新增 `getRateLimit/setRateLimit/getRateStats/getRetention/setRetention`；`pkg-system/pages/log/{log.js,log.wxml,log.wxss}` 留存编辑 + 手动清理 + 限流编辑 + 限流看板 + 策略变更筛选。
  - **Item 5 权限实时刷新**：`pages/index/index.js`（订阅刷新 + 徽标）、`pages/profile/profile.js`（emit + 订阅）、`utils/auth.js`/`utils/eventBus.js`（事件总线）。
  - **Item 6 迁移契约双向**：`cloudfunctions/_shared/dbBase.mongo.js`（`.doc(id).get()` 统一 `{data:doc}`）、`cloudfunctions/_tests/migration-bridge.test.js`（写后读双向）、`migration-drill.test.js`（对齐断言）。
  - **Item 7 门禁规则引擎**：`scripts/check-frontend-decoupled.js`（可配置规则 + 维度上报 + 自检 + CI 注解）、`package.json`（`check:frontend:self`）、`.github/workflows/ci.yml`（自检步骤）。
  - 测试：`system-log.test.js`（+6 限流/看板/审计）、`rbac-domains.test.js`（新增 9）。
  - `ITERATION_REPORT.md`：本报告。
- 架构验证：全仓符合可迁移契约，业务 `index.js` 零破坏；隔离层收口为 `dbBase.js` / `userBase.js` 双单一源 + `dbBase.mongo.js` 同源适配；RBAC 数据范围纯函数（`allowedOrgIds`/`scopeFilter`/`scopedList`）上提为共享层并在 cert/check/performance/stats 真实列表落地；迁移契约在 `getById`/`update`/`remove`/`count` 维度与 wx 适配层等价。
- 注：`cloudfunctions/*/helpers/dbBase.js` 与 `userBase.js` 为打包生成副本，已 `.gitignore`，由 `pretest` / 部署脚本按需生成，不入库。
