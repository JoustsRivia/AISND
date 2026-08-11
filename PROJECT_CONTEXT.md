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
- **RBAC 纯函数（词表统一 2026-08-08）**：角色唯一词表 = 三级树 14 叶子码（a1/a2, b11-b24, c11-c24）+ `admin`（服务端指派）；树语义单一源 `utils/role-tree.js`（每码带 orgKind/name/desc），注册/绑定时服务端 `auth` 用 `ORG_KIND_MAP` 强制码↔组织节点类型匹配。数据档位 `shared/dbBase.js`：`GLOBAL_ROLES=['admin','a1']`、`UNIT_ROLES=['a2','b11','b12','c11','c12']`、其余树码默认 'org'（绑定节点子树=管辖范围）；动作鉴权统一走 `shared/roles.js` 的角色族（`MGMT` 管理族 / `UNIT_MGMT` 单位级族），替代散点硬编码。权限判定用 `allowedOrgIds / scopeFilter / subtreeIds`（`shared/dbBase.js`，bundle 至各函数 helpers/）；`ROLE_SELF_BINDABLE` 硬编码边界防客户端伪 role 提权。
- **限流中间件**：`createRateLimiter({ getOpenid })` 包裹敏感操作。
- **密码**：`crypto.js` 用 PBKDF2，兼容旧 SHA1 哈希（`sha1("tms_"+明文)`，用于云控制台手动建管理员）。

## 三、代码规范与命名约定

| 维度 | 约定 |
|---|---|
| 文件/目录 | **kebab-case**：`pages/index`、`pkg-ledger`、`attachment-uploader` |
| 页面四件套 | 每页必含 `*.js / *.wxml / *.wxss / *.json` 四个同名文件 |
| JS 标识符 | **camelCase**：`getHomeStatus`、`createRateLimiter` |
| 常量 | **UPPER_SNAKE**：`TOOL_STATUS.QUALIFIED`、`ROLE_FAMILIES.MGMT`、`ROLE_TREE_CODES`；集中放 `utils/constants.js`，禁页面硬编码魔法值（角色中文名统一用 `ROLE_TEXT`，禁页面自建映射表） |
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
│   ├── pkg-ledger 台账/建档/领用/导入/盘点
│   ├── pkg-borrow 领用记录  pkg-scrap 报废  pkg-purchase 采购
│   ├── pkg-barcode 条码生成/打印  pkg-store 库房  pkg-site 点检/规程/交底
│   ├── pkg-maint 维修  pkg-train 培训  pkg-check 检验/隐患/考核
│   ├── pkg-stats 看板(含六化达标)/报表/班组协作  pkg-system 组织/字典/日志
│   └── pkg-cert 资质  pkg-test 试验到期
├── cloudfunctions/                   17 个云函数（每个含 index.js + helpers/ + package.json + config.json）
│   └─ auth/system/tool/borrow/scrap/purchase/check/warning/reconcile/store/
│      site/maintenance/training/cert/test/stats/file
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
- **2026-08-05 功能瘦身（已实施、未推送）**：裁掉绩效模块（`cloudfunctions/performance/` + 页面 + 3 用例，单测 150→147）与租借模块（`pkg-ledger/pages/lease/` + tool `leaseList/leaseCreate`）；每日点检并入现场点检（spot-check 单页「今日概况+表单」，site 云函数零改动）；六化达标并入数据看板（dashboard 内联区块，按 `SENSITIVE_ROLES` 同源角色显隐，stats 云函数零改动）。质量门禁全绿（147/147 单测、17 云函数）。交接记录见 `ITERATION_REPORT.md` §7.14。**本机未装 git，未推送远端**；已选分支名 `feature/feature-slim-20260805`，待装 git + 凭据后按「克隆 main → 覆盖 → 提交 → 推新分支」流程推送。
- **2026-08-08 角色词表统一（已实施、未推送，与瘦身同分支）**：全仓角色词表统一为三级树 14 码 + admin，旧扁平码（lead/project_lead/safety_officer/group_lead/supervisor/worker/lease_admin）全部移除（用户确认无存量用户、不设兼容层）。核心：`shared/dbBase.js` 档位重定义（a1 平台安监入全局档、a2/b11/b12/c11/c12 单位级档）；`shared/roles.js` 新增角色族 MGMT/UNIT_MGMT 收口 10 个云函数的 17 处动作鉴权散点；stats 幽灵码 manager/system 移除（SENSITIVE_ROLES 改单位级及以上管理码）并修复定时快照必失败的 bug（SYSTEM_USER 注入）；auth 默认角色 worker→b24、bindAccount 对齐 register 权威校验（orgKind/orgId 必填/用户名唯一）、userManage 空串绕过白名单修复、org seed 收紧为仅 admin；前端 `utils/constants.js` 新增 ROLE_TEXT/ROLE_FAMILIES 收口 6 处重复角色名表，`utils/modules.js` 九宫格可见性换新码，org.js 可分配/可进入角色补全 14 码。质量门禁全绿（153/153 单测含新增 stats 敏感角色与 a1/b21/b24 档位用例、17 云函数、前端零直连）。交接记录见 `ITERATION_REPORT.md` §7.15。
- **2026-08-08 问题清单修复（已实施、未推送，同分支）**：修复 `问题.txt` 六项——① `utils/org-utils.js` 新增 orgPath/orgPathText 复用函数，profile/identity/scan 核验弹窗/档案页/组织页统一显示组织归属路径（users 无冗余 orgName 字段，旧实现恒空）；② 导入页删除过期云存储签名二维码（过期 URL 导致大空白），改单按钮复制夸克网盘模板地址，并整文件重写修复历史编码损坏（CSV 表头乱码隐藏 bug）；③ 领用归还页加扫码入口（扫码→详情→领用/归还，复用 tool-detail 校验链路）；④ 新建 `pages/archive/archive` 我的档案页（全面信息+权限说明+统计），profile 菜单补「我的档案/我的身份码」入口；⑤ 组织页树行加 kind 标签、用户列表显示组织路径、用户表单组织候选按角色 orgKind 约束（与注册端 ORG_KIND_MAP 同源）、unitIndex 越界修复；⑥ maintenance 云函数 list 富化器具来源信息 + 新增 archive/delete 动作（防审计断裂：删除仅限 pending/rejected），repair 页补来源展示与归档/删除按钮。顺带修复：tool-detail 报修入口断点（跳发起页带 toolId）、profile 证书徽标口径（myCerts 30 天内到期数）、**tool-detail.js 编码截断后按契约重建**。质量门禁全绿（157/157 单测含 maintenance 4 新用例）。交接记录见 `ITERATION_REPORT.md` §7.16。
- **待办（高难度 / 需决策）**：FEAT-08 批量导入导出；NEW-01/02/03/05 多端管理后台 / 消息推送通道 / 审计日志 / 看板深化。属范围与资源决策，需产品+技术负责人确认后排期。另：`lease_admin` 角色 / `source:'lease'` 来源与 `leaseUnit` 字段 / `lease` 器具类别是否二轮清理，需单独决策。
- **资料库归档**：交付物已存入项目资料库 `AISND交付物` 目录——`CODE_REVIEW_REPORT.md`、`IMPROVEMENT_PLAN.md`、`IMPROVEMENT_SUMMARY.md`、`AGENTS.md`。

> 提示：本文件为项目统一上下文入口，建议与 `AGENTS.md`、`DEPLOY.md` 配套阅读。后续状态变更请同步更新「当前状态」一节。
