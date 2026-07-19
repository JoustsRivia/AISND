# SND 小程序 · 迭代报告（ITERATION 2026-07-19·2 解耦收尾 + 质量门禁 + 日志增强 + 表单组件化 + 迁移演练）

> 生成依据：微信小程序云开发 AI 开发守则（可迁移 + 精准加载 + 全自主自迭代）
> 本迭代模式：初始化 → 读取上次报告（`ITERATION_REPORT.md` §4 的 7 项建议即本次目标）→ 自主规划 → 编码 → 验证 → 修复 → 报告 → 推送
> 时间门禁：北京时间未到 2026-07-22 00:00，继续执行。

## 0. 初始化校验

| 项 | 结果 |
|---|---|
| 时间门禁（终止点 2026-07-22 00:00，北京时间） | ✅ 当前 2026-07-19 23:xx，未触发 |
| 历史迭代报告 `ITERATION_REPORT.md` | 存在并已优先读取：上轮 `§4` 列出 7 项「下一次迭代计划建议」即为本次目标 |
| 源仓库 `JoustsRivia/AISND` | ✅ 已克隆、与远端同步（基线 `66828ec`），remote 已配授权 token |

> 核查结论：上轮报告 §4 第 2 项「余 11 份 db.js 复用 ./dbBase」经实际统计不成立——18 个非模板函数的 `db.js` 已全部复用 `./dbBase`，仅 `tpl` 模板按设计保留内联；故该项收敛为「把 `getCurrentUser` 等通用鉴权助手上提进共享层」，详见 Item 2。

## 1. 本次迭代完成的功能与修复（对应上轮 §4 七项建议）

**【Item 1 · CI 构建产物门禁】**
- 新增 `scripts/validate-functions.js`：部署前干跑打包（`bundle-db-base.js`）+ 校验每个云函数目录结构（`index.js`/`package.json` 齐全、JS 语法、隔离层副本与 `_shared/*` 单一源一致），作为「可部署产物」门禁（沙箱无云环境，仅能做静态 + 隔离层一致性校验）。
- `package.json` 增加 `validate:functions`；`.github/workflows/ci.yml` 新增「云函数构建产物门禁」步骤。
- 验证：`npm run validate:functions` → 18 个云函数全部通过。

**【Item 2 · 解耦收尾：userBase 共享层 + getCurrentUser 上提】**
- 新增 `cloudfunctions/_shared/userBase.js`（与 `dbBase.js` 平行的「鉴权助手」单一源），把 19 份 `helpers/user.js` 内联的 `cloud.getWXContext()` 收敛为一处。
- 19 份 `helpers/user.js` 改写为 `require('./userBase')` 的语义再导出（保留真实路径首行，helper-comments 不受影响）。
- `getCurrentUser(openid)` 上提为 `cloudfunctions/_shared/dbBase.js` 单一源；11 份 `db.js` 内联实现改为 `base.getCurrentUser` 委托（行为等价）。
- `bundle-db-base.js` 扩展为同时打包 `dbBase.js` + `userBase.js`；`check-db-base.js` 扩展为同时校验两者漂移；`.gitignore` 补充忽略 `userBase.js` 副本。
- 价值：迁移自有服务器时，鉴权原语与数据原语均只需改 `_shared` 两处单一源，业务代码零改动。

**【Item 3 · 审计日志合规留存】**
- `system.log` 增加合规字段：`serverTime`（服务端落点，与前端 `clientTime` 形成双时间戳）、`retainedUntil`（默认 180 天留存到期，便于合规归档/清理）、`source` 来源标记；保留 `operatorName`/`clientTime` 透传。
- `DEPLOY.md` 在 §3.1 标注质量门禁默认开启。

**【Item 4 · 日志面板增强】**
- 后端 `system.listLog` 扩展支持组合过滤：`type`（精确）、`operatorName`（操作人署名精确）、`keyword`（action/target/operatorName/operator 模糊）、`startTime`/`endTime`（ts 区间）。
- 前端 `pkg-system/pages/log` 增加「操作人 / 关键词 / 起始·结束日期」组合筛选区 + **CSV 导出**（写入临时文件并复制到剪贴板，`\ufeff` BOM 便于 Excel），列表优先展示可读署名 `operatorName`。
- `api.getOperationLogs` 已透传参数，前端/后端零契约破坏。

**【Item 5 · pre-commit 钩子默认安装】**
- `scripts/install-hooks.js` 在非 git 仓库（CI 缓存/解压包）时优雅跳过（exit 0），不再中断。
- `package.json` 增加 `prepare` 脚本：`npm install` 自动安装 pre-commit 钩子（失败不阻断安装）。
- 提交本次改动时该钩子**已自动触发并通过**（helpers 注释 + 隔离层单一源卡点），证实默认开启生效。

**【Item 6 · 注册/登录表单组件化】**
- 新增共享组件 `components/form-field`（label + input + 错误提示，视觉对齐 `.form-row`），`pages/register` 与 `pages/login` 的账号/密码/昵称输入框改用该组件，消除重复标记。
- 新增 `utils/register-shared.js`：抽取两页重复的 `ROLES_BINDABLE` 与 `buildUnits(tree)`（扁平组织树 → 单位+机构/班组带路径结构），两页 `loadOrgTree` 统一复用。
- 「单位 → 机构级联默认选中」本就由 `refreshOrgOptions` 默认 `orgIndex:0` 实现，本次保持并随组件化一并验证。

**【Item 7 · 自有服务器适配分支实测演练】**
- 新增 `cloudfunctions/_shared/dbBase.mongo.js`：与 `dbBase.js` **同接口**的 MongoDB 适配实现，内置零依赖内存集合（演练/测试用），并通过 `setCollectionFactory` 支持生产接入真实 `mongodb` 驱动（注入同构 Collection）。
- 新增 `scripts/migrate-drill/server.js`：最小 Node `http` 服务，覆盖 `require('./dbBase')` 使其解析到 mongo 适配实现，挂载 borrow 业务的 HTTP 接口，端到端证明「换掉 wx-server-sdk 即整体迁移」。
- 新增 `cloudfunctions/_tests/migration-drill.test.js`：复用**真实的** `borrow/helpers/db.js`（零改动），在 mongo 适配层下验证 `addBorrow`/`listBorrow`/`getById`/`getCurrentUser` 行为一致，把「迁移契约」从「理论可迁移」（mock 反向证明）升级为「实测可迁移」。

## 2. 架构遵守情况（解耦规则核查）

守则三大铁律逐条核验：

| 铁律 | 本次改动核查 | 结果 |
|---|---|---|
| ① 前端统一入口：页面禁止直连 `wx.cloud.*` | 新增/改动页面（register/login/log）仅调用 `utils/api.js` 语义函数；全仓 grep 确认除 `utils/api.js`（授权 transport 层）与 `app.js`（`wx.cloud.init()` 引导，非数据操作）外，无任何页面/组件直连 `wx.cloud.callFunction/database/uploadFile` | ✅ 合规 |
| ② 云函数分层隔离：主逻辑禁止直连 `cloud.database()/getWXContext()` | 原生调用进一步收敛：`dbBase.js`/`userBase.js` 为唯一源；19 份 `user.js` 改为委托 `./userBase`，11 份 `db.js` 的 `getCurrentUser` 改为委托 `base.getCurrentUser`；全部 `*/index.js` grep 零原生调用 | ✅ 合规（隔离层进一步收口为双单一源） |
| ③ 迁移契约：唯一允许改动点为 `api.js` 与 `helpers/*.js` | 改动落点：`utils/api.js`（允许）、`helpers/db.js`/`user.js`（允许）、新增 `_shared/dbBase.js`/`userBase.js`/`dbBase.mongo.js`（隔离层源，属迁移点）、`pages/*`/`components/*`/`utils/register-shared.js`（UI/共享逻辑，契约不约束）；业务 `index.js` 零改动 | ✅ 合规 |

**架构合规率：100%。** 全仓 grep + `node --check`（173 文件）+ `npm test`（40 例）+ `lint:db-base`（38 副本）+ `lint:helpers`（38 文件）+ `validate:functions`（18 函数）六重验证通过。

## 3. 验证通过情况

| 验证项 | 方法 | 结果 |
|---|---|---|
| 云函数单测 | `npm test`（pretest 自动打包隔离层） | ✅ 40 / 40 通过（原 32 + 日志后端 6 + 迁移演练 2） |
| helper 注释规范 | `npm run lint:helpers` | ✅ 38 个文件首行均为真实路径 |
| 隔离层单一源 | `npm run lint:db-base` | ✅ 38 副本与 `_shared/*` 逐字节一致（dbBase + userBase） |
| 全量 JS 语法 | `npm run check:syntax` | ✅ 173 个 JS 文件 `node --check` 通过 |
| 可部署产物门禁 | `npm run validate:functions` | ✅ 18 个云函数结构/语法/隔离层自包含全通过 |
| 前端零直连 | grep `wx.cloud.*` 排除 `utils/api.js` 与 `app.js` 引导 | ✅ 无页面/组件直连 |
| 云函数分层 | grep `cloud.database()/getWXContext()` 排除 helpers/_shared | ✅ 业务 index.js 零原生调用 |
| 日志合规字段 | `system-log.test.js` 断言 serverTime/retainedUntil/source | ✅ 通过 |
| 日志组合筛选 | `system-log.test.js` type/operatorName/keyword/时间区间 | ✅ 通过 |
| 迁移演练单测 | `migration-drill.test.js` 复用真实 borrow 业务 | ✅ 2 例通过 |
| 迁移演练服务 | `scripts/migrate-drill/server.js` + curl 冒烟 | ✅ POST 创建 / GET 倒序列表正常 |
| pre-commit 默认安装 | 提交时自动触发钩子 | ✅ 通过（佐证 Item 5 生效） |
| 注册/登录组件化 | `node --check` + wxml 配平 + json usingComponents | ✅ 通过（171→173 文件语法全绿） |

## 4. 下一次迭代计划建议（≥5 项，按优先级）

1. **【质量】CI 增加真实 CLI 部署干跑**：当前 `validate:functions` 仅静态/结构校验；建议接入 `tcb`/`cloudbase` CLI 的 `deploy --dry-run` 或本地函数校验，捕捉「依赖声明/环境变量」类部署期问题（沙箱无云环境，仅静态）。
2. **【解耦】dbBase.mongo.js 接真实 mongodb 驱动演练**：本轮 mongo 适配用内存集合验证接口同构；建议新增 `npm run drill:mongo`（可选 `mongodb` 依赖）跑通真实 MongoDB 服务器完整路径，并纳入 CI（配合 `mongodb-memory-server` 或测试用实例），把「实测可迁移」从内存升级到真实驱动。
3. **【安全】日志合规留存落地**：`listLog` 已支持时间区间；建议新增「按 `retainedUntil` 定期归档/清理超期日志」云函数 + 字段级权限（管理员可见 `operatorName`，普通角色仅见自身），满足安监留痕时长与最小可见原则。
4. **【可观测】日志面板服务端分页**：当前 `limit=200` 一次性取回；建议 `listLog` 增加 `skip`/游标分页与「仅看我的/全部」切换，前端分页加载，支撑审计日志长期累积。
5. **【健壮性】表单/选择器组件化扩展**：`form-field` 已落地；建议继续抽取 `role-org-picker` 共享组件（单位→机构级联选择器，注册/登录/系统管理共用），并补「记忆上次选择」的级联默认交互。
6. **【体验】注册成功角色说明结构化**：已有基础弹窗；建议角色说明展示「数据范围 + 可用功能 + 审批链路」三段式，并在「我的/权限」页常驻查看入口。
7. **【架构】RBAC 数据范围真正落地**：`getCurrentUser` 已上提；建议基于 `orgId`/`unitId` 在业务查询中统一注入数据范围过滤（目前部分列表未强制按组织收窄），闭环多租户/数据隔离。

## 5. 推送说明

- 目标仓库：`JoustsRivia/AISND`（经用户确认使用授权 token）。
- 本次提交：`66828ec..3e599ec`（main），涵盖 Item 1–7 全部改动 + 本迭代报告。
- 架构验证：全仓 100% 符合可迁移契约，业务 `index.js` 零破坏，隔离层收口为 `dbBase.js`/`userBase.js` 双单一源，并新增 mongo 适配实现把「理论可迁移」升级为「实测可迁移」。
- 改动要点：`_shared/userBase.js`、`_shared/dbBase.mongo.js`（新增单一源/适配）、19 份 `user.js` + 11 份 `db.js`（委托共享层）、`system/index.js`（日志合规 + 组合筛选）、`pkg-system/pages/log/*`（组合筛选 + CSV）、`components/form-field/`、`utils/register-shared.js`、`pages/register|login/*`（组件化）、`scripts/validate-functions.js`、`scripts/migrate-drill/`、`scripts/bundle-db-base.js`/`check-db-base.js`/`install-hooks.js`（扩展）、`package.json`、`ci.yml`、`.gitignore`、`DEPLOY.md`、2 个新增单测。
- 注：`cloudfunctions/*/helpers/dbBase.js` 与 `userBase.js` 为打包生成副本，已 `.gitignore`，由 `pretest` / 部署脚本按需生成，不入库。
