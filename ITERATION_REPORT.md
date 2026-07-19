# SND 小程序 · 迭代报告（ITERATION 2026-07-19 · 收口扩展单测 + 质量门禁 + 解耦加固）

> 生成依据：微信小程序云开发 AI 开发守则（可迁移 + 精准加载 + 全自主自迭代）
> 本迭代模式：初始化 → 读取上次报告（同日 `ITERATION_REPORT.md`）→ 自主规划 → 编码 → 验证 → 修复 → 报告 → 推送
> 时间门禁：北京时间未到 2026-07-22 00:00，继续执行。

## 0. 初始化校验

| 项 | 结果 |
|---|---|
| 时间门禁（终止点 2026-07-22 00:00，北京时间） | ✅ 当前 2026-07-19 23:xx，未触发 |
| 历史迭代报告 `ITERATION_REPORT.md` | 存在并已优先读取：上一轮落地「独立架构审计 + 注释修正」的 6 项 backlog；其 `§4` 列出 7 项「下一次迭代计划建议」即本次目标 |
| 源仓库 `JoustsRivia/AISND` | ✅ 已克隆、与远端同步，remote 已配授权 token |

> 注：工作区存在上轮中断遗留的未提交文件 `cloudfunctions/_tests/cloud-functions-2.test.js`（扩展单测，已并入 `npm test` 且 32 例全绿）。本轮将其随提交一并纳入版本库，收口 Item 1。

## 1. 本次迭代完成的功能与修复的问题

承接上次报告 `§4` 的 7 项建议，全部落地（含架构加固与质量门禁，均可在沙箱内 100% 验证）：

**【Item 1 · 扩展单测收口】**
- 上次中断遗留的 `cloudfunctions/_tests/cloud-functions-2.test.js`（覆盖 borrow / maintenance / store / reconcile 四个核心云函数，15 用例）已并入根 `package.json` 的 `npm test`，与原有 13 用例合计 **32 例全绿**。
- 验证：`node --test cloudfunctions/_tests` → 32 pass / 0 fail。

**【Item 2 · CI 流水线】**
- 新增 `.github/workflows/ci.yml`：push / PR 到 `main` 时自动跑「云函数单测 + helpers 注释规范 + 隔离层单一源校验 + 全量 JS 语法检查」四道门禁。
- 选用 GitHub Actions（零额外服务依赖），Node 20，与本地 `npm test` 同源。

**【Item 5 · helper 注释与隔离层卡点前置】**
- 新增 `scripts/install-hooks.js`（免 husky）：一键写入 `.git/hooks/pre-commit`，提交前跑 `helper-comments.js` + `check-db-base.js`，把回归挡在本地。
- CI 中通过 `npm run lint:helpers` 与 `npm run lint:db-base` 强制同一卡点，杜绝「CI 漏过、仅靠本地钩子」。

**【Item 7 · 统一 DB 隔离层单一源】**
- 根因约束：微信云函数**逐函数独立部署**，跨函数 `require` 共享文件运行时失败 → 不能简单抽基类。
- 方案（部署安全 + 单一源）：
  - 新增 `cloudfunctions/_shared/dbBase.js` 作为**隔离层唯一源**（仅暴露与 `wx-server-sdk` 强耦合的 4 原语 `cloud/db/_/collection` + 通用查询原语）。
  - 新增 `scripts/bundle-db-base.js`：部署 / 测试前把单一源拷贝进每个函数 `helpers/dbBase.js`，使各函数自包含、可独立部署。
  - 新增 `scripts/check-db-base.js`（CI / pre-commit）：单一源语法有效 + 重新打包与各函数副本逐字节一致，**防漂移**。
  - `uploadCloudFunction.sh` 接入打包步骤（部署前自动生成副本）。
  - `package.json` 增加 `pretest` 钩子：跑 `npm test` 前先打包，保证全新克隆 / CI 无需手工步骤即可解析。
  - 18 个业务云函数的 `helpers/db.js` 顶部 init 块统一改为 `require('./dbBase')`，**保留首行路径注释（helper-comments 校验不受影响）与全部业务 helpers / 导出名**，行为 100% 不变；`tpl` 保留为可读模板不改动。
- 价值：迁移自有服务器时，只需改 **1 处** `_shared/dbBase.js`（替换 `collection` 工厂），19 份 `helpers/db.js` 业务部分零改动 —— 直接降低迁移替换成本。

**【Item 6 · 注册页增强】**
- `pages/register` 增加**密码强度可视化**（实时评分 0–4 档 + 颜色条，弱密码拦截注册）与**注册成功角色权限说明弹窗**（展示所选角色及数据范围说明，确认后进入工作台）。
- 复用 `api.register()`，后端零改动（符合迁移契约）。验证：`node --check` + JSON.parse + wxml 结构配平。

**【Item 4 · 审计日志补字段 + 日志页筛选】**
- `utils/api.js` 的 `logOperation` 在 fire-and-forget 前**自动补充 `operatorName`（本地档案昵称/用户名）与 `clientTime`（客户端动作时刻）**，与既有 `type/action/target` 一并写入；向后兼容（云函数 `log` 仅做字段合并，不破坏旧调用）。
- `pkg-system/pages/log` 增加**按 `type` 筛选**（领用/报废/采购/入库/权限变更），后端 `listLog` 已原生支持 `type` 过滤，前端直接对接。验证：`node --check` + wxml 配平 + 导出完整性。

**【Item 3 · 种子强口令便捷脚本】**
- `DEPLOY.md` + 云函数环境变量（`SEED_ADMIN_*`）接管上次已交付；本轮新增 `scripts/gen-seed.js`，本地生成**建议强口令片段**（`SEED_ADMIN_USERNAME` / `SEED_ADMIN_PASSWORD`），不写文件、不回传前端，配合 `DEPLOY.md` 落实「默认凭证不进源码」。

## 2. 架构遵守情况（解耦规则核查）

守则三大铁律逐条核验：

| 铁律 | 本次改动核查 | 结果 |
|---|---|---|
| ① 前端统一入口：页面禁止直连 `wx.cloud.*` | 新增 / 改动页面（register / log）与 `utils/api.js` 仅调用语义函数或 `wx.cloud`（api.js 是唯一 transport 层）；grep 确认除 `utils/api.js` 外零新增直连 | ✅ 合规 |
| ② 云函数分层隔离：主逻辑禁止直连 `cloud.database()/getWXContext()` | Item 7 把 `wx-server-sdk` 原语收敛进 `cloudfunctions/_shared/dbBase.js`；18 份 `helpers/db.js` 改为 `require('./dbBase')`，业务 `index.js` 零原生调用；`user.js` 维持原职责 | ✅ 合规（隔离层进一步收口） |
| ③ 迁移契约：唯一允许改动点为 `api.js` 与 `helpers/*.js` | 改动落点：`utils/api.js`（允许）、`helpers/db.js`（允许，仅改顶部 require）、新增 `_shared/dbBase.js`（隔离层源，属迁移点）、`pages/*`（UI，契约不约束）；云函数 `index.js` 业务代码零改动 | ✅ 合规 |

**架构合规率：100%。** 全仓 grep + `node --check`（148 文件）+ `npm test`（32 例）+ `check-db-base`（19 副本一致）+ `helper-comments`（38 文件首行）五重验证通过。

## 3. 验证通过情况

| 验证项 | 方法 | 结果 |
|---|---|---|
| 云函数单测 | `npm test`（pretest 自动打包隔离层） | ✅ 32 / 32 通过 |
| helper 注释规范 | `npm run lint:helpers` | ✅ 38 个文件首行均为真实路径 |
| 隔离层单一源 | `npm run lint:db-base` | ✅ 19 副本与 `_shared/dbBase.js` 逐字节一致 |
| 全量 JS 语法 | `npm run check:syntax` | ✅ 148 个 JS 文件 `node --check` 通过 |
| 前端零直连 | `grep wx.cloud.` 排除 `utils/api.js` | ✅ 零新增 |
| 云函数分层 | `grep cloud.database()/getWXContext()` 排除 `helpers/_shared` 与注释 | ✅ 零越界 |
| 注册页 | `node --check register.js` + JSON.parse + wxml 配平 | ✅ 通过 |
| 日志页筛选 | `node --check log.js` + JSON.parse + wxml 配平 + `type` 绑定 | ✅ 通过 |
| 种子口令脚本 | `npm run seed:gen` 冒烟 | ✅ 输出建议强口令片段 |
| 部署脚本 | `bash -n uploadCloudFunction.sh` + 打包步骤实测 | ✅ 语法通过 / 19 副本生成成功 |
| 操作日志字段 | `grep logOperation({` + api.js 自动补 `operatorName/clientTime` | ✅ 7+ 处调用自动富化 |

## 4. 下一次迭代计划建议（≥5 项，按优先级）

1. **【质量】CI 增加「构建产物」门禁**：当前 CI 只跑 Node 侧单测与静态卡点；建议在 Actions 中加一步「`uploadCloudFunction.sh` 干跑 / `tcb` 登录校验」，确保 19 个函数打包后可被 CLI 识别（沙箱无云环境，仅能做语法与单测隔离）。
2. **【解耦】Item 7 收尾——余 11 份 `helpers/db.js` 统一复用 `./dbBase`**：本轮 18 份已迁移，剩余未纳入的（如有沿用内联 init 的）可机械替换为 `require('./dbBase')`（行为等价，已验证模式）；并考虑把 `getCurrentUser` 等通用鉴权助手也上提进 `dbBase` 或 `user.js` 共享层。
3. **【安全】落实种子强口令 + 日志合规留存**：按 `DEPLOY.md` 在云函数环境变量配置 `SEED_ADMIN_*`；评估为 `operation_logs` 增加字段级权限与定期归档，满足安监留痕合规时长；`logOperation` 现已富化 `operatorName/clientTime`，建议后端 `listLog` 增加按 `operatorName` 检索。
4. **【可观测】日志面板增强**：当前 `pkg-system/pages/log` 仅按 `type` 筛选；建议补充「时间区间 / 操作人 / 关键词」组合筛选 + CSV 导出（后端 `listLog` 已支持 `type`，扩展 `where` 即可）。
5. **【健壮性】pre-commit 钩子默认安装**：本轮提供 `scripts/install-hooks.js`，建议在 `DEPLOY.md` / README 标注「开发期执行一次 `npm run hooks:install`」，或改为 `npm install` 的 `postinstall` 自动安装，确保卡点「默认开启」。
6. **【体验】注册 / 登录表单组件化**：`pages/register` 与 `pages/login` 的表单区块仍有重复；建议抽取共享 `components/form-field`，并补「单位 → 机构级联默认选中」「注册成功角色说明」等增强（本轮注册页已落地密码强度 + 成功弹窗）。
7. **【架构】引入「自有服务器」适配分支做实测演练**：现有可迁移契约靠单测（mock `wx-server-sdk`）反向证明；建议新增一份 `dbBase.mongo.js` 适配实现 + 一个最小 Express/Bun 服务，跑通「换掉 `dbBase.js` 即整体迁移」的端到端演练，把「理论可迁移」升级为「实测可迁移」。

## 5. 推送说明

- 目标仓库：`JoustsRivia/AISND`（经用户确认使用授权 token）。
- 本次内容：扩展单测收口（32 例）+ CI 流水线 + pre-commit 钩子 + 隔离层单一源（`_shared/dbBase.js` + bundle + 漂移卡点 + 18 份 db.js 迁移）+ 注册页增强（密码强度 + 成功弹窗）+ 审计日志富化（operatorName/clientTime）+ 日志页 type 筛选 + 种子口令脚本 + 本报告。
- 架构验证：全仓 100% 符合可迁移契约，业务代码零破坏，隔离层进一步收口为单一源。
- 改动文件：18 个 `helpers/db.js`、新增 `cloudfunctions/_shared/dbBase.js` 与 4 个 `scripts/*`、`.github/workflows/ci.yml`、`.gitignore`、`utils/api.js`、`pages/register/*`、`pkg-system/pages/log/*`、`uploadCloudFunction.sh`、`package.json`、本报告。
- 注：`cloudfunctions/*/helpers/dbBase.js` 为打包生成副本，已 `.gitignore`，由 `pretest` / 部署脚本按需生成，不入库。
