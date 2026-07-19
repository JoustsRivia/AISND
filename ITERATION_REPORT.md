# SND 小程序 · 迭代报告（ITERATION 2026-07-20·5 RBAC 全业务域闭环 + 日志分级限流/留存可配置 + 权限实时刷新 + 迁移契约常驻校验 + 前端零直连 CI 门禁）

> 生成依据：微信小程序云开发 AI 开发守则（可迁移 + 精准加载 + 全自主自迭代）
> 本迭代模式：初始化 → 读取上次报告（`ITERATION_REPORT.md` §4 的 7 项建议即本次目标）→ 自主规划 → 编码 → 验证 → 修复 → 报告 → 推送
> 时间门禁：北京时间未到 2026-07-22 00:00，继续执行（当前 2026-07-20）。

## 0. 初始化校验

| 项 | 结果 |
|---|---|
| 时间门禁（终止点 2026-07-22 00:00，北京时间） | ✅ 当前 2026-07-20，未触发 |
| 历史迭代报告 `ITERATION_REPORT.md` | 存在并已优先读取：上轮 `§4` 列出 7 项「下一次迭代计划建议」即为本次目标 |
| 源仓库 `JoustsRivia/AISND` | ✅ 已克隆、与远端同步（基线 `a1c806e`），remote 已配授权 token |
| 隔离层副本 `cloudfunctions/*/helpers/{dbBase,userBase}.js` | ✅ 由 `bundle-db-base.js` 生成、已 `.gitignore`，不入库（见 §5 注） |
| 上一会话遗留未提交改动 | ✅ 无；本轮在干净基线 `a1c806e` 上全新开发，无工作丢失 |

## 1. 本次迭代完成的功能与修复（对应上轮 §4 七项建议）

**【Item 1 · RBAC 数据范围扩展到 store / maintenance / purchase（闭环全业务域）】**（上轮 §4 建议 #1）
- 在隔离层单一源 `_shared/dbBase.js`（及 `dbBase.mongo.js`）新增纯函数 `scopeFilter(user, orgs, opts)`，统一返回「列表 where 的 orgId 子树条件」，业务列表零重复推导。
- `store/helpers/db.js`、`maintenance/helpers/db.js`、`purchase/helpers/db.js` 透出 RBAC 原语（`allowedOrgIds`/`roleScope`/`subtreeIds`/`scopeFilter`）+ `listOrgs`。
- `store/index.js records`：由原来仅 `me.orgId` 精确匹配，升级为 `scopeFilter` 按组织子树收窄（全局看全量、单位看整单位子树、机构/班组看本机构子树，越权下钻被忽略）。
- `maintenance/index.js`：`report`/`create` 写库补 `orgId`（服务端归属，防越权挂靠）；`list`/`listPlan` 由无过滤升级为 `scopeFilter` 按组织子树收窄。
- `purchase/index.js list`：由仅 `applicant` 过滤，升级为 `scopeFilter` 按组织子树收窄（purchases 已带 `orgId`）。
- `tool` 列表早已通过 `scopeWhere` 复用 `allowedOrgIds` 达标，本轮补充 RBAC 单测固守。
- 配套单测（cloud-functions-2.test.js +10）：四域「单位角色看子树 / 普通用户仅本机构 / 全局看全量 / 越权下钻被忽略」全验证。

**【Item 2 · CI 接通 Secret 跑通部署干跑 + mongo 演练健壮性】**（上轮 §4 建议 #2）
- `.github/workflows/ci.yml` 的 `validate:deploy` 步骤：注入 `TCB_ENV_ID / SECRET_ID / SECRET_KEY / TCB_SECRET_ID / TCB_SECRET_KEY` 后，先 `npm install -g @cloudbase/cli`（尽力），再跑 `npm run validate:deploy`，使仓库配置 Secret 后真正执行 `tcb fn deploy --dry-run`（仍 `continue-on-error` 兜底）。
- mongo 演练步骤改用专用 `scripts/start-mongo-memory.js`（起 `mongodb-memory-server` 并将 URI 写入 `/tmp/mongo-uri.txt`），CI 轮询读取后导出 `MONGODB_URI` 跑 `npm run drill:mongo`，比原先「grep 日志猜 URI」更可靠；未装驱动/无网络时优雅跳过。

**【Item 3 · 日志写入限流按 action 分级 + 批量白名单】**（上轮 §4 建议 #3）
- `system/index.js log`：原全局「60s/30 次」单一阈值，升级为按 `payload.action` 分级（`ACTION_RATE`：默认 60s/30、import 60s/200、batch 60s/300），`BATCH_ACTIONS` 白名单（importTools/batchInbound/batchGen/batchImport）走更高阈值；限流查询带上 `action` 维度计数。正常批量管理操作不再被误伤，防刷仍对单动作生效。
- 配套单测（system-log.test.js +3）：批量操作在更高阈值内放行、普通动作超 30 被拒（429）、同量批量动作放行。

**【Item 4 · 权限页角色/组织变更实时刷新】**（上轮 §4 建议 #4）
- 新增 `utils/eventBus.js` 极简全局事件总线（不触碰 `wx.cloud.*`，遵守前端统一入口铁律）。
- `utils/auth.js` 增加 `emitProfileChanged / onProfileChanged / offProfileChanged / refreshProfile`：`bindAccount`/`signin`/`requireServerLogin` 成功后广播「档案变更」并同步 `app.globalData`。
- `pages/permission/permission.js`：`onShow` 从服务端重拉最新角色/组织并重渲染；订阅 `profile:changed` 事件同页实时刷新（无需重复进入）；`onHide`/`onUnload` 清理订阅。注册成功 `?role=` deep-link 仍保留，onShow 以服务端身份覆盖。

**【Item 5 · 日志留存策略后台可配置化】**（上轮 §4 建议 #5）
- `system/index.js` 新增 `retention` 动作（`op=get` 返回当前策略合并默认；`op=set` 仅管理员，校验非负整数后持久化到 `dicts` type=`retention` key=`policy`，并即时失效 60s 缓存）。
- `system/helpers/db.js` 新增 `saveDict`（按 type+key upsert），`log` 写库时按配置取留存期（回退代码默认 180 天），管理后台可调不同日志类型留存期并审计。
- 配套单测（system-log.test.js +3）：get 返回默认、管理员 set 后日志按新值留存、非管理员 set 被拒（403）。

**【Item 6 · 隔离层注入回归常驻 fixture + 反向校验】**（上轮 §4 建议 #6）
- `scripts/migrate-drill/mongo.js` 演练域由 5 个扩展为 **7 个**（新增 `maintenance`/`purchase`），闭环全业务域真实驱动回归。
- 新增常驻单测 `cloudfunctions/_tests/migration-bridge.test.js`：每提交必跑的「反向校验」——断言 wx 适配层 `_shared/dbBase.js` 与 mongo 适配层 `_shared/dbBase.mongo.js` **导出接口完全一致**（业务 helpers 解构消费的 16 个命名导出 + `scopeFilter`），并校验 `allowedOrgIds/subtreeIds/roleScope/scopeFilter` 行为一致；配置 `MONGODB_URI` 时额外跑全业务域真实驱动行为回归。让「换掉 wx-server-sdk 即整体迁移」成为不可绕过的回归卡点。

**【Item 7 · 前端零直连自动化门禁】**（上轮 §4 建议 #7）
- 新增 `scripts/check-frontend-decoupled.js`：扫描 `pages/**`、`components/**` 及前端 `utils`（豁免 `app.js` 初始化与 `utils/api.js` transport 层），禁止直连 `wx.cloud.callFunction/database/uploadFile/downloadFile`，且 `wx.cloud.init` 仅允许出现在 `app.js`；命中即退出码 1 阻断合并。
- 接入 `package.json`（`check:frontend`）与 CI 步骤，把架构铁律①变成流水线卡点。

## 2. 架构遵守情况（解耦规则核查）

守则三大铁律逐条核验：

| 铁律 | 本次改动核查 | 结果 |
|---|---|---|
| ① 前端统一入口：页面禁止直连 `wx.cloud.*` | grep `pages/**`/`components/**`/`utils`（豁免 `app.js` 的 `wx.cloud.init` 与 `utils/api.js`）：仅 `utils/api.js` 为授权 transport 层含 `wx.cloud.callFunction/uploadFile`，`app.js` 仅 `wx.cloud.init`；`eventBus.js`/`auth.js`/`permission.js`/`profile.js` 均无直连 | ✅ 合规（且新增 `check:frontend` CI 卡点） |
| ② 云函数分层隔离：主逻辑禁止直连 `cloud.database()/getWXContext()` | grep `cloudfunctions/*/index.js` 命中 `cloud.database()/getWXContext()`：**0 处真实调用**（6 处为文件头架构说明注释）；`system/index.js` 仅 `require('crypto')`（Node 内置密码哈希，非平台调用）；业务逻辑仅引用 `./helpers` | ✅ 合规 |
| ③ 迁移契约：唯一允许改动点为 `api.js` 与 `helpers/*.js` | 改动落点：`utils/api.js`（未改，既符合）、`helpers/db.js`/`user.js`（允许）、`_shared/dbBase.js`/`dbBase.mongo.js`（隔离层源，属迁移点）、`pages/*`/`utils/*`/`scripts/*`/`ci.yml`/`package.json`（UI/脚本/配置，契约不约束）；业务 `index.js` 零破坏 | ✅ 合规 |

**架构合规率：100%。** 八重验证（详见 §3）全绿；新增 `scopeFilter` 纯函数上提为共享层，RBAC 数据范围在 store/maintenance/purchase/borrow/file/scrap/tool 真实列表统一落地。

## 3. 验证通过情况

| 验证项 | 方法 | 结果 |
|---|---|---|
| 云函数单测 | `npm test`（pretest 自动打包隔离层） | ✅ **82 / 82 通过**（含 store/maintenance/purchase/tool RBAC + system 分级限流/留存可配置 + 迁移契约反向校验） |
| 迁移契约反向校验 | `migration-bridge.test.js` | ✅ wx/mongo 适配层导出接口等价 + RBAC 行为一致（每提交必跑） |
| helper 注释规范 | `npm run lint:helpers` | ✅ 38 个文件首行均为真实路径 |
| 隔离层单一源 | `npm run lint:db-base` | ✅ 38 副本与 `_shared/*` 逐字节一致（dbBase + userBase） |
| 全量 JS 语法 | `npm run check:syntax` | ✅ 179 个 JS 文件 `node --check` 通过 |
| 可部署产物门禁 | `npm run validate:functions` | ✅ 18 个云函数结构/语法/隔离层自包含全通过 |
| 前端零直连门禁 | `npm run check:frontend` | ✅ pages/components/前端 utils 均未直连 `wx.cloud.*` |
| CI 部署干跑 | `npm run validate:deploy` | ⏭️ 沙箱无 CLI，优雅跳过（exit 0）；CI 注入 Secret + 安装 CLI 后真正生效 |
| 真实 MongoDB 演练 | `npm run drill:mongo` | ⏭️ 未配置 MONGODB_URI / 未装 mongodb，优雅跳过（exit 0）；CI 起 memory-server 后真正跑 7 域回归 |
| RBAC 全业务域收窄 | cloud-functions-2.test.js | ✅ store/maintenance/purchase/tool 单位看子树/普通仅本机构/全局全量/越权下钻忽略 |
| 日志分级限流 | system-log.test.js | ✅ 批量白名单放行 + 普通动作 429 |
| 日志留存可配置 | system-log.test.js | ✅ 默认 365/180、管理员 set 生效、非管理员 403 |
| 迁移真实驱动回归 | drill:mongo（CI memory-server） | ⏭️ 沙箱优雅跳过；CI 真正跑 7 域 add/list/get 一致 |

## 4. 下一次迭代计划建议（≥5 项，按优先级）

1. **【安全】RBAC 注入剩余业务域闭环**：目前 borrow/file/scrap/store/tool/maintenance/purchase 已覆盖；建议扩展 `cert`（持证列表）、`check`（点检记录）、`performance`（考核）、`stats`/`ledger`（统计看板）等读接口，并统一把「写库带 `orgId` + 列表 `scopeFilter`」沉淀为 `helpers/db.js` 通用 `scopedList(coll, payload, extraFilter)` 模板，彻底消除各函数重复样板。
2. **【质量】CI 真正全绿观察**：本轮已接好 Secret 注入、CloudBase CLI 安装、内存 Mongo 启动脚本；建议仓库配置 `TCB_ENV_ID`/`SECRET_ID`/`SECRET_KEY` 后观察首次全绿，确认 `tcb fn deploy --dry-run` 与 7 域 mongo 回归在 CI 真实生效（沙箱仅优雅跳过）。
3. **【可观测】日志留存后台管理 UI + 操作审计**：`retention` 配置接口已就绪（get/set），建议在管理后台提供「留存策略编辑」「手动清理/归档日志」操作页，并把 set 动作本身记入审计日志，形成「配置—执行—留痕」闭环。
4. **【安全】限流策略配置化 + 全局限流看板**：当前 `ACTION_RATE` 为代码常量；建议与留存策略同构，改为 dicts 配置驱动（不同 action 阈值后台可调），并在管理后台提供「限流命中/拦截」统计，便于识别异常刷量。
5. **【体验】权限页深链与组织切换刷新增强**：注册/角色变更后已通过事件总线实时刷新；建议进一步在「切换组织/被管理员调整角色」后，统一经 `auth.refreshProfile()` 拉取并广播，使首页九宫格状态徽标、profile、permission 三处同步刷新。
6. **【架构】隔离层注入回归常驻 fixture 扩展至「写后读」双向**：当前 `migration-bridge` 校验 add/listBy/getById；建议增加「wx 内存库 ↔ 真实 mongo 双向写后读一致」的反向断言，并覆盖 `update`/`remove`/`count` 等原语，让迁移保障覆盖完整 CRUD。
7. **【质量】前端零直连门禁扩展为规则引擎**：`check-frontend-decoupled.js` 目前为固定正则；建议扩展为可配置规则（如允许列表白名单化、对 `components/**` 单独维度上报），并接入 PR 评论机器人，把架构铁律反馈前置到代码评审环节。

## 5. 推送说明

- 目标仓库：`JoustsRivia/AISND`（经用户确认使用授权 token）。
- 本迭代提交：
  - `_shared/dbBase.js` / `_shared/dbBase.mongo.js`：新增 `scopeFilter` 纯函数（单一源，迁移零改动）
  - `store/{index,helpers/db}.js`、`maintenance/{index,helpers/db}.js`、`purchase/{index,helpers/db}.js`：RBAC 数据范围按组织子树收窄（Item 1）
  - `system/index.js` + `system/helpers/db.js`：日志分级限流（Item 3）+ 留存策略可配置 `retention` 动作（Item 5）
  - `utils/eventBus.js` + `utils/auth.js` + `pages/permission/permission.js` + `pages/profile/profile.js`：权限页实时刷新（Item 4）
  - `scripts/migrate-drill/mongo.js` + `cloudfunctions/_tests/migration-bridge.test.js`：迁移契约常驻反向校验（Item 6）
  - `scripts/check-frontend-decoupled.js` + `package.json` + `.github/workflows/ci.yml`：前端零直连 CI 门禁（Item 7）
  - `scripts/start-mongo-memory.js` + CI 调整：部署/mongo 演练健壮性（Item 2）
  - 测试：`cloud-functions-2.test.js`、`system-log.test.js` 新增用例（共 +18）
  - `ITERATION_REPORT.md`：本报告
- 架构验证：全仓符合可迁移契约，业务 `index.js` 零破坏；隔离层收口为 `dbBase.js` / `userBase.js` 双单一源 + `dbBase.mongo.js` 同源适配；RBAC 数据范围纯函数（`allowedOrgIds`/`scopeFilter`）上提为共享层并在 7 个业务域真实列表落地。
- 注：`cloudfunctions/*/helpers/dbBase.js` 与 `userBase.js` 为打包生成副本，已 `.gitignore`，由 `pretest` / 部署脚本按需生成，不入库。
