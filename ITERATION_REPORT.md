# SND 小程序 · 迭代报告（ITERATION 2026-07-19 · 落地上次迭代 backlog 六项目标）

> 生成依据：微信小程序云开发 AI 开发守则（可迁移 + 精准加载 + 全自主自迭代）
> 本迭代模式：初始化 → 读取上次报告（同日 22:32 `c478b28`）→ 自主规划 → 编码 → 验证 → 修复 → 报告 → 推送
> 时间门禁：北京时间未到 2026-07-22 00:00，继续执行。

## 0. 初始化校验

| 项 | 结果 |
|---|---|
| 时间门禁（终止点 2026-07-22 00:00，北京时间） | ✅ 当前 2026-07-19 22:xx，未触发 |
| 历史迭代报告 `ITERATION_REPORT.md` | 存在并已优先读取：上一轮为「独立架构审计 + 注释修正」，其 `§4` 列出 6 项 backlog 即本次目标 |
| 源仓库 `JoustsRivia/AISND` | ✅ 已克隆、与远端同步，remote 已配授权 token |

## 1. 本次迭代完成的功能与修复的问题

> 背景：承接上次迭代 `§4` 六项目标（①②③④⑤⑥），全部落地。其中 ① 为云平台部署动作（沙箱无法配置环境变量），改为提供部署手册 + 代码已原生支持。

**【Item 6 · helper 注释规范】全量更正误注首行 + CI 校验脚本。**
- 上次迭代仅修了 `reconcile/performance` 两处；本次全面排查发现 **19 个** helper 首行仍误注为 `cloudfunctions/tpl/helpers/...`（auth/cert/check/file/performance/purchase/reconcile/site/stats/store/system/test/tool/training/warning）。
- 新增 `scripts/helper-comments.js`：支持「仅检查（CI 退出码 1）」与 `--fix`（就地把首行重写为真实路径）两种模式。已运行 `--fix`，**38/38** helper 首行均为真实路径，校验通过。

**【Item 2 · 云函数单测】建立可运行的单测体系（零依赖）。**
- 新增 `cloudfunctions/_tests/mock-cloud.js`：拦截任意云函数内部的 `require('wx-server-sdk')`，提供内存态数据库 + 可注入 `WXContext`（`__setOpenid` / `__reset` / `__store`），使业务云函数在 Node 下脱离微信环境直接运行——反向证明「换掉 wx-server-sdk 即可复用」。
- 新增 `cloudfunctions/_tests/cloud-functions.test.js`：覆盖上次点名的三处高风险逻辑，**13 用例全绿**：
  - `auth`：register 拒绝越权角色 `admin`（403）、合法角色建档且口令哈希（非明文）、用户名重复（409）、缺机构（400）、signin 密码错误（401）/ 正确返回档案。
  - `purchase`：`approve pass=false → rejected`、`pass=true → approved`、非授权角色（403）、create 缺名称（400）—— 守住「驳回不再恒变通过」回归。
  - `scrap`：`autoCheck` 返回 pending + forbidden 候选、`judge` 超期自动判定、非授权角色审批（403）。

**【Item 3 · 操作日志闭环】关键业务动作补写审计日志。**
- `utils/api.js` 在 7 处语义函数成功后 fire-and-forget 调 `logOperation`（对接 `system/log`，写入 `operation_logs`，失败不影响主流程）：领用 `borrowTool`、归还 `returnTool`、验收入库 `createAcceptance`、报废申请 `submitScrap`、报废审批 `approveScrap`、采购审批 `approvePurchase`、入库 `inbound`，以及用户权限变更 `manageUser`（仅 add/update/delete）。满足安监场景留痕要求。

**【Item 5 · tpl 显式化】脚手架模板防误部署。**
- 新增 `cloudfunctions/tpl/README.md`，明确其为不可部署的复制模板、缺 `index.js`、首行归属 tpl。
- 加固 `uploadCloudFunction.sh`：`FUNC_NAME=tpl` 时直接拒绝部署（语法检查 + 拒绝逻辑均已验证）。

**【Item 1 · 种子强口令】提供部署手册。**
- 新增 `DEPLOY.md`：说明在云函数环境变量配置 `SEED_ADMIN_USERNAME` / `SEED_ADMIN_PASSWORD` 强口令（代码 `system/seedAdmin` 已原生支持，配置后不再触发默认凭证告警）。沙箱无法配置云环境，故以手册交付，待部署时落实。

**【Item 4 · 独立注册页】新增 `pages/register`（可选·产品项，本次一并实现）。**
- 新增 `pages/register/`（js/json/wxml/wxss），镜像登录页注册分支、**复用 `api.register()`**（后端零改动，符合迁移契约）。
- `app.json` 注册该页面；`pages/login` 增加「没有账号？去注册」入口（`goRegister`）。
- 新增根 `package.json` 封装 `npm test` 与 `npm run lint:helpers`，并在 `DEPLOY.md` 引用。

## 2. 架构遵守情况（解耦规则核查）

守则三大铁律逐条核验：

| 铁律 | 本次改动核查 | 结果 |
|---|---|---|
| ① 前端统一入口：页面禁止直连 `wx.cloud.*` | 新增 `pages/register` 与改动 `pages/login` 均只调用 `utils/api.js` / `utils/auth.js`；全仓 grep 确认除 `utils/api.js`、`app.js` 外零 `wx.cloud.*` 直连 | ✅ 合规 |
| ② 云函数分层隔离：主逻辑禁止直连 `cloud.database()/getWXContext()` | 仅修正 helper **注释**（属允许改动点）；`index.js` 业务逻辑零新增原生调用；`_tests/` 为测试目录不部署 | ✅ 合规 |
| ③ 迁移契约：唯一允许改动点为 `api.js` 与 `helpers/*.js` | 改动落点：`utils/api.js`（允许）、`helpers/*.js`（仅注释，允许）、`app.json`/`login.*`（UI，契约不约束）；新增页面复用既有 `api.register()`，云函数 index.js 业务零改动 | ✅ 合规 |

**架构合规率：100%。** 全仓 grep + `node --check`（全部云函数脚本）+ `_tests` 单测（13/13）三重验证通过。

## 3. 验证通过情况

| 验证项 | 方法 | 结果 |
|---|---|---|
| 前端零直连 | `grep wx.cloud.` 排除 `utils/api.js`、`app.js` | ✅ 零命中 |
| 云函数分层 | `grep cloud.database()/getWXContext()` 排除 `helpers/` 与注释 | ✅ 零越界 |
| helper 注释规范 | `node scripts/helper-comments.js` | ✅ 38/38 真实路径 |
| 云函数单测 | `node --test cloudfunctions/_tests/cloud-functions.test.js` | ✅ 13/13 通过 |
| 全仓云函数语法 | `node --check` 于全部 index.js + helpers | ✅ 全过 |
| api.js 语法 | `node --check utils/api.js` | ✅ 通过 |
| 日志接入点 | `grep logOperation({ type:` | ✅ 7 处 |
| 部署脚本 | `bash -n` + `tpl` 拒绝逻辑实测 | ✅ 语法通过 / 退出码 1 |
| 新页面配置 | `node --check` register.js/login.js + JSON.parse app.json/register.json/login.json | ✅ 全过 |

## 4. 下一次迭代计划建议（≥5 项，按优先级）

1. **【质量】扩展单测覆盖率**：把 `_tests` 体系扩展到 `borrow`（领用/归还外观损坏触发报修）、`maintenance`（报修审批流转）、`reconcile`（差异核对）、`store`（入库）等核心动作，目标覆盖全部 19 个云函数的关键分支与异常路径。
2. **【质量】CI 强制卡点**：在仓库引入 GitHub Actions / 云函数构建流水线，提交即跑 `npm test` + `npm run lint:helpers`，把本次两个质量门禁固化为合并前强制检查，防止回归。
3. **【安全】落实种子强口令 + 日志合规**：按 `DEPLOY.md` 在云函数环境变量配置 `SEED_ADMIN_*`；评估为 `operation_logs` 增加字段级权限与定期归档，满足安监留痕的合规时长要求。
4. **【可观测】补全审计日志字段与查询面板**：当前 `logOperation` 仅记 `type/action/target`；建议补充 `operator` 昵称、`before/after` 快照、客户端时间，并在 `pkg-system/pages/log` 增加按类型/时间筛选与导出。
5. **【健壮性】helper 注释规范前置**：已具备 `scripts/helper-comments.js`，建议加 pre-commit hook 或 PR 检查，杜绝再次出现跨函数复制粘贴注释（本次一次性修正了 19 处）。
6. **【体验】注册页增强**：增加密码强度提示、单位→机构级联搜索/默认选中、注册成功角色说明弹窗；并考虑将 `login` 与 `register` 的表单区块抽取为共享组件，减少重复。
7. **【架构】统一 DB 适配基类**：目前 19 份 `helpers/db.js` 重复实现 `collection`/`db.command`，可抽象共享 `baseDb`，进一步降低迁移替换成本、减少复制粘贴风险。

## 5. 推送说明

- 目标仓库：`JoustsRivia/AISND`（经用户确认使用授权 token）。
- 本次内容：helper 注释全量修正（19 文件）+ CI 校验脚本 + 云函数单测（mock + 13 用例）+ 操作日志闭环（api.js 7 处）+ tpl 显式化（README + 部署脚本加固）+ 种子强口令部署手册（DEPLOY.md）+ 独立注册页（pages/register）+ 根 package.json + 本报告。
- 架构验证：全仓 100% 符合可迁移契约，业务代码零破坏，helpers 隔离层仅改注释。
- 改动文件：19 个 helper（各 1 行注释）、`utils/api.js`、`app.json`、`pages/login/{js,wxml}`、`uploadCloudFunction.sh`（+ 报告与新增目录）。
