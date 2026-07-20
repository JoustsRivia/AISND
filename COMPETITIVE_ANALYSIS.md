# 工器具安全管理小程序 — 竞争性比较与残缺功能补全报告

## 一、仓库竞争性比较结论

### 1.1 前端 UI 结构对比

| 维度 | SND（旧版） | AISND（新版） | 结论 |
|---|---|---|---|
| 全局设计系统 `app.wxss` | 422 行 | 422 行 | **逐字一致**，共享同一套"深蓝科技感 + 卡片化层次 + 工业安全仪表盘风"设计语言 |
| 设计文档 `DESIGN_SYSTEM.md` | 133 行 | 133 行 | **逐字一致** |
| 主题系统 `utils/theme.js` | 17 行 | 17 行 | **逐字一致**，支持 auto/light/dark 三模式 + 夜间主题 |
| 字体脚手架 `utils/fonts.js` | 53 行 | 53 行 | **逐字一致**，等宽数字字体 + 静默回退 |
| 首页/台账/扫码/看板 | — | — | **逐字一致** |
| 登录页 | 63 行内联 picker+input | 36 行组件化 + 去注册入口 | **AISND 重构**：form-field + role-org-picker 组件化 |
| 管理员凭证 | 硬编码 `Jousts / qwer1234` | 后端返回，一次性展示 | **AISND 安全增强** |
| 独立注册页 | 无 | 有（密码强度可视化 + 注册成功权限说明弹窗） | **AISND 独有** |
| 常驻权限页 | 无 | 有（服务端实时刷新 + 事件订阅） | **AISND 独有** |
| 事件总线 `utils/eventBus.js` | 无 | 29 行 | **AISND 独有**，档案变更广播 |

**前端结论**：两仓库 UI 美观度持平（共享同一套设计系统），AISND 在工程结构和功能完成度上显著更优。

### 1.2 后端代码质量对比

| 维度 | SND | AISND | 差距 |
|---|---|---|---|
| wx-server-sdk 耦合点 | 18 处（散落在各 helpers） | 1 处（`_shared/dbBase.js` 单一源） | **代差** |
| MongoDB 适配实现 | 无 | `dbBase.mongo.js` 同接口适配 | **代差**（实测可迁移） |
| RBAC 档位 | 2 档（admin/非admin） | 3 档（global/unit/org） | **代差** |
| RBAC 复用 | tool 内联，其他无 | `_shared` 纯函数，全域复用 | **代差** |
| 安全漏洞 | borrow records 可伪造 openid、scrap list 全员可见 | 服务端强制 + 越权防护 | **安全修复** |
| 操作日志合规 | 无 serverTime/retainedUntil/限流 | 双时间戳 + 合规留存 + 分级限流 + 字段脱敏 | **代差** |
| 测试体系 | 0 项 | 98 项全绿（含 RBAC + 迁移契约） | **代差** |
| CI/CD | 无 | 10 步流水线 | **代差** |
| 前端门禁 | 无 | 规则引擎 + 自检 + GitHub Actions 注解 | **代差** |
| 文档 | 无 | ITERATION_REPORT.md + DEPLOY.md | **代差** |

**后端结论**：AISND 在架构抽象、安全合规、可测试性、可迁移性、CI/CD 成熟度上全面碾压 SND。

### 1.3 基线选择

**以 AISND 为基线**，因为 AISND 是 SND 的工程化演进版本，前端 UI 美观度等价，后端架构全面领先。

---

## 二、本次补全的残缺功能

### 2.1 后端 RBAC 补全（P0/P1）

| 云函数 | 改动内容 | 优先级 |
|---|---|---|
| **warning** | helpers/db.js 补 RBAC 原语 + scopedList；list/read/readAll 改用 scopedList + 越权校验；generate 透传 orgId | P0 |
| **reconcile** | helpers/db.js 补 RBAC 原语 + scopedList；list/getTask/diff 改用 scopedList + 越权校验 | P0 |
| **training** | helpers/db.js 补 RBAC 原语 + scopedList；assign 写库补 orgId（courses 保留全量，课程库为全局共享） | P1 |
| **site** | helpers/db.js 补 RBAC 原语 + scopedList；opGuide/dailyList 改用 scopedList；briefing/submitCheck/batchCheck 写库补 orgId | P1 |
| **stats** | myStats/homeStatus/sixStandard 改用 scopedCount（不同等级角色看不同范围）；修复 exportReport 第 135 行 orgId 未定义 bug | P1 |
| **store** | 已正确实现 RBAC，仅验证不改动 | P2 |

### 2.2 前端样式去重（P2）

- 新建 `styles/auth.wxss`，提取 login/register 共享的 14 个公共类定义
- `login.wxss` 和 `register.wxss` 通过 `@import "/styles/auth.wxss"` 引入，消除重复定义

---

## 三、验证结果

| 验证项 | 结果 |
|---|---|
| 全量单测 | ✅ 98 项全绿 |
| 前端零直连门禁 | ✅ 通过 |
| 18 个云函数可部署 | ✅ 全部通过 |
| 180 个 JS 文件语法 | ✅ 全部正确 |
| 38 个隔离层副本一致性 | ✅ 与单一源逐字节一致 |

---

## 四、开发守则遵守情况

| 铁律 | 遵守情况 |
|---|---|
| 前端统一入口 `utils/api.js` | ✅ 本次未改 api.js，RBAC 是服务端收窄，前端调用签名不变 |
| 云函数内部分层 `helpers/` | ✅ 所有改动仅落在 helpers/db.js（隔离层）和 index.js（业务），未出现 `cloud.database()` 或 `cloud.getWXContext()` 原生调用 |
| 分步实施 | ✅ 严格按步骤 1→7 顺序执行，每步只加载必要文件 |
| 迁移契约 | ✅ 不改 `_shared/dbBase.js`（RBAC 原语已完备），仅改各函数 helpers/db.js 业务隔离层 |
