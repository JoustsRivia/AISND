# 善工智管（AISND）项目 Context

> 适用对象：新成员 / 接手 Agent。读完即可重建项目上下文。

## 一、基本背景与目标

- **产品名**：善工智管（代号 AISND）｜AppID `wx8380215a68af40b5`｜基础库 `libVersion: 3.0.0`
- **业务领域**：工器具**全生命周期安全管理**——采购、入库、台账、领用、检验、维修、报废、巡检、培训、统计。
- **核心目标**：用一套 **RBAC + 组织树隔离**的台账体系，管住绝缘/电动/起重/高空等工器具的合格、超期、报废等安全红线，做到每一环可追溯、可预警、按组织层级授权。
- **技术形态**：微信小程序原生（WXML/WXSS/JS）+ **微信云开发**；已做「云开发隔离层」，预留可迁移到自有服务器（MongoDB 协议，`shared/dbBase.mongo.js` 已备）。
- **导航**：导航栏标题「善工智管」，主题色 `#1A56DB`；tabBar 五入口：首页 / 台账 / 扫一扫 / 消息 / 我的。

## 二、技术栈与架构

**技术栈**：微信小程序原生、`style: v2`、`lazyCodeLoading: requiredComponents`；微信云开发（`wx.cloud`，`DYNAMIC_CURRENT_ENV`）；云函数运行 `Nodejs18.15`；云数据库（MongoDB 协议）。无第三方前端框架。`package.json` 仅含开发依赖 `mongodb` / `mongodb-memory-server`（单测与迁移演练）。

**三层隔离架构（改动前必读）**：

```
前端 pages/pkg-*  →  utils/api.js（统一出口，绝不直连云）
        ↓  wx.cloud.callFunction
云函数 cloudfunctions/<fn>/index.js  →  只引用 ./helpers，绝不直接调 cloud.database()/getWXContext()
        ↓
helpers/（db / user / rateLimiter / crypto / roles …）平台能力封装，迁移时只换本层
```

- **隔离层单一源**：`shared/*.js`（dbBase、userBase、rateLimiter、crypto、employeeId、roles、password 共 7 个）经 `scripts/bundle-db-base.js` 打包进每个云函数 `helpers/`。原因：微信**逐函数部署**，跨函数 require 共享文件会运行失败；用「单一源 → 多副本」保证一致性又各自自包含。
- **RBAC 纯函数**：`utils/constants.js` 集中定义 `ROLES`；权限判定用 `allowedOrgIds / scopeFilter / subtreeIds`（`utils/org-utils.js`）；服务端另有 `ROLE_SELF_BINDABLE` 硬编码边界防客户端伪 role 提权。
- **限流中间件**：`createRateLimiter({ getOpenid })` 包裹敏感操作。
- **密码**：`crypto.js` 用 PBKDF2，兼容旧 SHA1 哈希（`sha1("tms_"+明文)`，用于云控制台手动建管理员）。

## 三、代码规范与命名约定

| 维度 | 约定 |
|---|---|
| 文件/目录 | **kebab-case**：`pages/index`、`pkg-ledger`、`attachment-uploader` |
| 页面四件套 | 每页必含 `*.js / *.wxml / *.wxss / *.json` 四个同名文件 |
| JS 标识符 | **camelCase**：`getHomeStatus`、`createRateLimiter` |
| 常量 | **UPPER_SNAKE**：`TOOL_STATUS.QUALIFIED`、`ROLES.ADMIN`、`ROLE_ORDER`；集中放 `utils/constants.js`，禁页面硬编码魔法值 |
| 枚举文案 | 中文标签映射集中（`TOOL_STATUS_LABELS`），展示统一走 `utils/display.js` |
| 云函数出口 | 统一 `{ code: 0, data }` / `fail(message, code)` |
| helper 注释 | 首行注释必须是真实路径（被 `scripts/helper-comments.js` 卡点检查） |
| 提交信息 | 中文、写「为什么」：`fix: 19项逻辑缺陷全量整改`、`feat(#13): 工作台身份码入口` |
| 注释风格 | 写「不显然的是什么」；安全修复处注明服务端权威边界理由 |

## 四、目录结构与模块划分

```
AISND/
├── app.js / app.json / app.wxss      全局生命周期、页面与分包注册、主题
├── pages/                            主包页面（10 个：index/ledger/scan/message/profile/login/register/permission/identity/tool-detail）
├── pkg-*/                            13 个业务分包（按需加载）
│   ├── pkg-ledger 台账/建档/借租/导入/盘点
│   ├── pkg-borrow 领用记录  pkg-scrap 报废  pkg-purchase 采购
│   ├── pkg-barcode 条码生成/打印  pkg-store 库房  pkg-site 现场巡检
│   ├── pkg-maint 维修  pkg-train 培训  pkg-check 检验/绩效
│   ├── pkg-stats 看板/班组协作/六定  pkg-system 组织/字典/日志
│   └── pkg-cert 资质  pkg-test 试验到期
├── cloudfunctions/                   18 个云函数（每个含 index.js + helpers/ + package.json + config.json）
│   └─ auth/system/tool/borrow/scrap/purchase/check/warning/reconcile/store/
│      site/maintenance/training/cert/test/stats/performance/file
├── utils/                           前端公共层：api·auth·constants·network·org-utils·display·theme·eventBus…
├── shared/                          隔离层单一源：dbBase·userBase·rateLimiter·crypto·employeeId·roles·password
├── components/                      通用组件：stats-card·status-tag·tool-card·attachment-uploader·search-picker·org-cascading-picker…
├── styles/ scripts/ tests/ scaffolds/
├── AGENTS.md  DEPLOY.md  DESIGN_SYSTEM.md  CODE_REVIEW_REPORT.md  IMPROVEMENT_PLAN.md  ITERATION_REPORT.md  COMPETITIVE_ANALYSIS.md
└── project.config.json  package.json  sitemap.json  uploadCloudFunction.sh
```

`app.json` 关键约定：`preloadRule` 首页预载 `pkg-ledger/pkg-test/pkg-cert/pkg-borrow/pkg-purchase`；分包根目录用 `pkg-*` 前缀。

## 五、开发流程与约定

1. **本地质量门禁**（仓库内可跑，无需云环境）：
   - `npm test` → `node --test tests/*.test.js`（云函数单测、RBAC、迁移演练）
   - `npm run lint:helpers` → `scripts/helper-comments.js`（helper 首行真实路径）
   - `npm run pretest` → `scripts/bundle-db-base.js`（部署前自动打包隔离层单一源）
   - `check:syntax` / `check:frontend`（前端解耦校验）/ `validate:functions` / `validate:deploy`
2. **提交卡点**：`npm install` 的 `prepare` 钩子自动装 pre-commit，提交前跑「helper 注释规范 + 隔离层单一源校验」两道；应急 `git commit --no-verify`。
3. **部署**：`bash uploadCloudFunction.sh <envId> <fn> <projectPath>` 单函数部署；`scaffolds/tpl` 脚手架禁止部署（脚本内置拒绝）。推荐顺序：开通环境 → 控制台手动写首个管理员 → 优先部署 `auth/system/tool` → 上传小程序。
4. **安全约定**：首个管理员**已移除**一键 seed，须云控制台手动写 `users`（`role:admin`、`sha1("tms_"+口令)`）；高权限 `admin` 不开放自注册/自绑定。
5. **协作铁律（AGENTS.md）**：治本不治标 / 为下一次需求设计（通用可演进）/ 仓库即记忆（接手先读提交与文档，收工更新交接）/ 默认推进而非等待许可。闭环 **Sync → Diagnose → Design → Implement → Handoff**。
6. **分支与远端**：主分支 `main`，远端 `github.com/JoustsRivia/AISND`；提交信息中文且写清「为什么」。

## 六、当前状态（截至本次会话）

- **已完成**：中低难度整改已落地并提交（离线缓存 `cacheThenNetwork`、消息跳转带 `refId`、`listAll` 真分页替代 500/200 硬上限、台账 `subtreeIds` 统一算法、班组协作看板、报告状态标记），已 rebase 并推送。
- **待办（高难度 / 需决策）**：FEAT-08 批量导入导出；NEW-01/02/03/05 多端管理后台 / 消息推送通道 / 审计日志 / 看板深化。属范围与资源决策，需产品+技术负责人确认后排期。
- **资料库归档**：交付物已存入项目资料库 `AISND交付物` 目录——`CODE_REVIEW_REPORT.md`、`IMPROVEMENT_PLAN.md`、`IMPROVEMENT_SUMMARY.md`、`AGENTS.md`。

> 提示：本文件为项目统一上下文入口，建议与 `AGENTS.md`、`DEPLOY.md` 配套阅读。后续状态变更请同步更新「当前状态」一节。
