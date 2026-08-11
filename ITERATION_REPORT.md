# SND 小程序 · 迭代报告
### 7.16 问题清单修复：6 项问题 + 通用性收口（2026-08-08）

> **背景**：用户提供 `问题.txt`（6 项：角色信息缺归属显示 / 导入页大空白 / 领用归还应走扫码 / 身份码与档案未开发 / 组织页未更新树架构 / 报修页需完善），要求"修复已确定并拓展解决类似功能通用性缺失问题"。计划经批准后实施。

**A. 通用性收口（先做）**
- `utils/org-utils.js` 新增 `orgPath(tree, orgId)` / `orgPathText(tree, orgId)`：组织路径解析单一源，替代各处重复解析与"已分配/未分配"粗显示。调用方：profile、identity、scan 核验弹窗、org 用户列表、新档案页

**B. #2 归属显示**：profile.js/identity.js 的 orgName 改为按 orgId 从组织树解析完整路径（users 无冗余 orgName 字段，旧代码恒空）；scan.js 身份码核验弹窗增加「归属」行（身份码负载新增 `g: orgId` 字段，扫码端用自身组织树解析）

**C. #3 导入模板**：import 页删除过期云存储签名二维码区（`t=1784882928` 已于 2026-07 过期 → 大空白根因），单按钮复制夸克网盘地址 `https://pan.quark.cn/s/83bee6a0863f?pwd=G4Sd`。**顺带治本**：该文件历史编码损坏严重（CSV 表头「检验周期(月)」损坏为乱码导致表头匹配失败、UI 文案乱码）→ 整文件 UTF-8 重写修复

**D. #4 扫码领用/归还**：records 页顶部加「📷 扫码领用 / 归还」→ 扫码校验器具存在 → 跳 tool-detail（复用成熟链路：合格/超期/持证校验 + 领用/归还 + 外观选择）

**E. #5 身份码 + 档案**：新建 `pages/archive/archive`（我的档案·全面：归属路径/基本信息/权限说明 ROLE_INFO/统计卡 myStats/身份码入口）；profile 菜单「我的档案」→ archive、「我的身份码」→ identity（identity 页本已完整但无档案入口 + 缺归属显示）；app.json 注册

**F. #6 组织架构与用户页**：树行加 kind 标签（单位/项目部/班组）；用户列表显示组织完整路径（替代"已分配/未分配"）；用户表单组织候选按角色 orgKind 约束（unit 角色仅单位节点、project 仅项目部、team 仅班组，与注册端 ORG_KIND_MAP 同源语义）；修复 unitIndex 越界时静默丢组织的问题

**G. #7 维保报修**：maintenance 云函数 `list` 富化器具信息（toolName/toolCode/category/source/leaseUnit，helpers/db.js 补 remove 原语）；新增 `archive`（管理族，pending 不可归档，列表默认排除）与 `delete`（管理族，仅 pending/rejected 可删防审计断裂，器具 maintaining 回滚 qualified）；api.js 两方法；repair 页显示来源信息 + 归档/删除按钮（管理族显隐，与服务端 requireApprover 同源）

**H. 顺带修复（同类问题）**
- tool-detail 报修按钮跳 repair **列表页**且不带 toolId（断点）→ 改跳 create 发起页带 toolId
- profile「证书即将到期」徽标原用 s.todo（未读预警+待试验）口径错误 → 改 myCerts 统计 30 天内到期证书数
- **tool-detail.js 因历史编码问题在本次编辑中被截断（0 字节）**，用户提供原件（`原件tool-detail.js`）后按原件恢复，应用两处必要修改：① 词表统一后的角色判定（点检=班组作业层+安全员 b22/b23/b24/c22/c23/c24；编辑=管理族 isLead 或班组长 b23/c23）；② 问题 #7 报修路由改跳 create 发起页带 toolId。顺带修复原件中显示给用户的文案乱码（banner 提示等）

**I. 质量门禁终态**

| 门禁 | 结果 |
|------|------|
| `npm test` | ✅ **157/157**（新增 maintenance archive/delete/list 富化 4 用例） |
| `check:syntax` | ✅ 255 JS |
| `check:frontend` | ✅ 零直连 |
| `lint:helpers` / `lint:db-base` | ✅ 34 helper / ✅ 51 副本 |
| `validate:functions` | ✅ 17 云函数 |
| grep 兜底 | ✅ tplQr/onPreviewQr/onOpenTpl 零命中；pages/archive 已注册 |

**J. 遗留与下一步**
- 与 §7.14/§7.15 同属未推送改动（本机无 git），分支 `feature/feature-slim-20260805` 待推
- 建议真机手测：我的→档案/身份码（归属路径显示）；导入页（无空白+复制网盘地址）；领用归还页（扫码→详情→领用/归还）；组织页（kind 标签+组织候选按角色约束）；报修页（来源信息+归档/删除）
- tool-detail.js 为重建文件，重点回归：扫码→详情、领用/归还、点检/报修/编辑入口显隐

---

### 7.17 主包瘦身：utils/tool-schema.js 移入分包并裁死导出（2026-08-08）

> **背景**：代码质量审查提示「主包未使用的文件 utils/tool-schema.js」。核实：主包内无任何引用（引用者仅 pkg-ledger 分包页面 tool-create 与单测）；且 5 个导出中 3 个功能已被其他文件实现（TOOL_FIELDS→`utils/data-schema.js` ENTITY_SCHEMAS.tool；TOOL_IMPORT_COLS→`pkg-ledger/pages/import/import.js` COLS，且其 label 与 CSV 表头形态不一致；DATE_CONSTRAINTS→`cloudfunctions/tool/index.js` 内联权威副本）。唯一无替代实现的 `calcExpireAt` 与仅剩 UX 预检价值的 `validateDateConstraints` 保留。

**改动**
- 新建 `pkg-ledger/utils/tool-schema.js`：仅保留 `validateDateConstraints` + `calcExpireAt`，注释说明各元数据功能已由哪些文件实现（防未来重新发明双源）
- 删除主包 `utils/tool-schema.js`（主包按需加载瘦身）
- require 路径同步：`pkg-ledger/pages/tool-create/tool-create.js` → `../../utils/tool-schema`；`tests/complex-features.test.js` → `../pkg-ledger/utils/tool-schema`

**门禁**：`npm test` ✅ 157/157 全绿，无残留旧路径引用。

**遗留**：与 §7.14-§7.16 同属未推送改动，分支 `feature/feature-slim-20260805` 待推。

---

### 7.18 BUGLOG 排查：字体加载失败 + getSystemInfoSync 弃用（2026-08-08）

> **背景**：用户提供 `BUGLOG/log1.txt`（微信开发者工具控制台日志），3 项：① `[fonts] SNDNum 字体加载失败`（`cdn.jsdelivr.net` DNS 解析失败 ENOTFOUND，等宽数字字体从未生效）；② `routeDone with a webviewId ... is not found`（开发工具良性路由告警，无代码问题，忽略）；③ `wx.getSystemInfoSync is deprecated`。

**A. 字体治本（SNDNum）**
- 调研结论：`wx.loadFontFace` **不支持包内本地路径**；Data URL 需基础库 ≥3.7.9，项目 libVersion 3.0.0 不满足；网络字体还须后台配 downloadFile 合法域名。
- 方案：改为 **WXSS `@font-face` 内嵌 base64**——新建 `styles/fonts.wxss`（roboto-mono latin 子集 woff 15832B → base64 21112B，family 名保持 `SNDNum`，现有 `--font-num` 令牌/`.font-num` 类零改动），`app.wxss` 顶部 `@import "styles/fonts.wxss"`。免白名单、离线可用，符合弱网/离线设计意图；主包代价 +21KB。
- `utils/fonts.js`：移除 `NUM_URL`/`loadOne('SNDNum')`（避免与 @font-face 双加载），仅保留可选 `SNDIcon`；头注释记录改版原因与再生成步骤。
- `styles/fonts/sndnum.woff` 源文件**不保留在仓库**（会被打进主包成为未引用文件，同 §7.17 教训），再生成步骤已写入 fonts.wxss 注释。

**B. 弃用 API**：3 处 `wx.getSystemInfoSync` 全部改为 `wx.getWindowInfo()`（lib 3.0.0 必有，2.20.1+ 提供）——`components/chart/chart.js` getDpr、`pages/identity/identity.js:69`、`pkg-barcode/pages/gen/gen.js:52`（后两处原「getWindowInfo 优先 + getSystemInfoSync 兜底」双分支简化为单调用）。

**C. 文档同步**：DESIGN_SYSTEM.md 4 处字体描述（约束声明/数字即仪表/字体节/P2 状态）更新为 base64 @font-face 现状。

**门禁**：`npm test` ✅ 157/157；`check:syntax` ✅ 255 文件；`check:frontend` ✅；`getSystemInfoSync` 全仓仅剩注释提及。

**遗留**：① 需在开发者工具/真机确认 SNDNum 生效（仪表盘数字宽度变化）与 BUGLOG 无字体/弃用告警；② 与 §7.14-§7.17 同属未推送改动，分支 `feature/feature-slim-20260805` 待推。

---

### 7.19 待优化问题 15 项全量实施（2026-08-08）

> **背景**：用户提供 `待优化问题.txt`（15 项，附「无需重复获取授权，执行完成后报告」）。全部实施完毕，质量门禁全绿（157/157 单测、256 文件语法、前端零直连、helpers 注释 34 文件）。

**逐项落地**：
1. **消息中心**：`.bar` 改 `flex-wrap` + `.bar-ops` 右对齐换行（「管理」按钮超边界修复）；「生成预警」完善——服务端加 RBAC（admin/a1/单位级管理，与 del 同口径）、返回按类型明细（detail），前端按钮仅管理可见 + 生成后分类明细弹窗 + 403 原因透出。测试 R24 同步补调用者 admin 身份。
2. **_id of undefined**：Explore 代理全仓扫描定位——修复 org.js 提交 `parent._id`（越界无守卫，`|| {}` 兜底）、plan.js onExec / hazard.js / sign-in.js 的 dataset item 未判空、disposal.js find 无命中注入 undefined、auth/index.js 3 处写后重查返回 `ok(undefined)` → `|| null`。
3. **showLoading 配对**：全仓扫描确认全部配对（tool-detail 用 finally，import 双路径 hide）。
4. **身份码**：负载加生成时间戳 `t`，页面展示「刷新于 HH:mm」+ 刷新按钮，扫码核验弹窗显示「码生成于」——防翻拍/旧码辨识。工作台/档案入口经核查均已就绪（§7.16 已建）。
5. **人员显示**：borrow `records` 服务端按 openid 批量映射 `byName`+`byEid`（users 表 `_.in` 查询），前端显示「姓名（工号）」；台账/档案侧已有 keeperDisplay/R18 富化，确认无裸 openid。
6. **领用归还筛选**：服务端按 toolId 批量富化库房/保管人 → 支持 编号/名称/库房/保管人 四选一关键词过滤；默认仅返回最近 20 条（feed 式，不再全量）。前端加筛选条（类型 chips + 输入防抖 300ms + 清空）。
7. **档案删除**：api.js 暴露 `deleteTool`（此前云函数有 del 但前端无入口——这就是 ⑦ 的缺口）；tool-detail 加「删除」按钮（管理族或工具归属本人机构可见，恒定占位最右 + danger 样式），二次确认弹窗（红色删除按钮文案），成功后返回。
8. **导入保管人按工号匹配**：importTools 批量按 employeeId 反查 users → 存 openid；keeper/operator 同机制；未匹配工号回传 `unmatched`，前端导入结果提示核对。导入页 hint 更新。
9. **文件导入导出**：导入页移除 textarea 粘贴——纯文件方式（chooseMessageFile → 读 UTF-8 → 自动导入），提示 XLS/XLSX 先另存 CSV（不引入 xlsx 库控包体积）；导出改为写 USER_DATA_PATH 后「保存到手机文件（saveFileToDisk）/ 发送文件（shareFileMessage）」双通道，替代剪贴板。
10. **台账层级**：档案页新增「台账层级」行（orgId → orgPathText 组织树全路径）；导入自动归属本为既有逻辑（orgId 取操作者），补页面提示说明。
11. **履历时间线**：根因——ops 只存 `type`（borrow/return/scrap），前端却读 action/title → 全部渲染「状态变更」。前端建 OP_LABELS 映射（领用/归还/报废/入库建档）；create 与 importTools 建档即写 `created` 履历（原恒为空）。
12. **编号索引联想**：新建共享组件 `components/code-autocomplete`（输入防抖 300ms → tool.list keyword 联想 → 下拉 code+name+状态 → pick 回传 code），接入现场点检与维保报修两页（替换裸文本输入）；领用归还页已有编号筛选（⑥）、报废页已有扫码。组件可复用。
13. **分类中文**：`utils/display.js` 新增 `catName()` 统一出口；修复 8 处——试验待检列表、试验提交、标识牌生成、打印文件、账物核对范围、规程指引、台账导出 CSV（导出中文）、导入解析兼容中英文类别（反查表）。
14. **编号规则**：去连字符，`{类别前两字拼音缩写}{YY}{5位流水}`（绝缘 JY/手持 SC/通用 TY/起重 QZ/高空 GK/计量 JL/临时 LS/大型 DX，示例 LS2600001）；nextSeq 前缀与新正则同步，旧格式数据不受影响。R15 测试断言全部更新。
15. **组织树编辑**：服务端 manageOrg 加三级树架构校验（kind 与 level 严格对应、unit 挂根/project 挂 unit/team 挂 project、team 为叶子不可下挂）+ 移动子树防环（subtreeIds 检查目标父级不在自身子树）；前端「新增下级」树行快捷入口（按父级类型给默认子类型）、切换上级自动纠正类型、提交前防环预检。

**门禁**：`npm test` ✅ 157/157（含 R15 新规则断言、R24 鉴权身份）；`check:syntax` ✅ 256 文件；`check:frontend` ✅；`lint:helpers` ✅ 34 文件。

**遗留**：① 新编号规则仅影响新建器具，存量旧格式（GL-26-GJ-0001）数据不迁移，继续按原码展示（安全、可读）；② 组件 `code-autocomplete` 待真机验证下拉交互（blur 收起时序）；③ 与 §7.14-§7.18 同属未推送改动，分支 `feature/feature-slim-20260805` 待推。

---

### 7.19 待优化问题 15 项全部实施 + 组织树缓存失效修复（2026-08-08）

> **背景**：用户提供 `待优化问题.txt`（15 项，文件授权「无需重复获取授权，执行完成后报告」）。全部实施完毕，质量门禁 157/157 全绿、256 文件语法通过、前端零直连。之后用户实测反馈「组织架构新增/编辑后数据库已更新但前端不及时刷新」，另修复。

**A. 15 项实施要点**（详见各文件注释「优化#N」）
1. 消息中心：「管理」按钮溢出→`.bar` flex-wrap+`.bar-ops` 右对齐换行；「生成预警」→服务端加 RBAC（admin/a1/单位级管理，与 del 同口径）+返回分类明细，前端仅管理可见+结果明细弹窗
2. `_id of undefined`：全仓扫描（Explore 代理 102 次工具调用）→ 修复 6 处：org.js parent 越界、plan/hazard/sign-in dataset item 空值、disposal find 空结果、auth 写后重查空值（返回 null）
3. showLoading/hideLoading：全仓脚本扫描 9 文件逐处核对，全部严格配对（无遗漏无重复）
4. 身份码页：负载加生成时间戳 t，页面显示「刷新于」+手动刷新按钮，扫码端核验展示码生成时间（旧码/翻拍可辨识）；首页入口与 profile 入口已存在
5. 领用归还记录：`by`(openid) 服务端批量映射为 姓名+工号（byName/byEid），前端展示「姓名（工号）」；台账/档案侧已有 keeperDisplay/R18 富化
6. 领用归还记录筛选：服务端按 toolId 批量富化库房/保管人 → 支持编号/名称/库房/保管人四选一关键词过滤；**默认仅返回最近 20 条**（feed 式）
7. 档案删除：api.js 补暴露 deleteTool（服务端 del 早已存在）；tool-detail 加删除按钮（管理族或本人机构，恒占位最右+danger 样式）+二次确认弹窗
8. 导入保管人按工号匹配：importTools 批量 employeeId→openid 映射（keeper/operator 同机制），未匹配工号回传前端提示；前端提示「保管/操作人列填工号」
9. 导入导出改文件方式：导入页删除 textarea 粘贴，纯「选择 CSV 文件→自动导入」；导出 CSV 落盘后提供「保存到手机文件（saveFileToDisk）/发送文件（shareFileMessage）」双通道，替代剪贴板
10. 台账层级：tool-detail 新增「台账层级」行（orgId→orgPathText）；导入自动归属已实现（orgId=操作者），补提示文案
11. 履历时间线：根因=ops 记录存 `type` 而前端只读 `action/title`→全显示「状态变更」；新增 OP_LABELS 映射（领用/归还/报废/入库建档）；create/importTools 补写「入库建档」首条履历
12. 编号联想：新建共享组件 `components/code-autocomplete`（防抖 300ms→getToolList 联想→点选回传 code），接入 spot-check 与 maint create（替换裸输入）；领用归还已有编号筛选、报废已有扫码
13. 分类中文：`utils/display.js` 新增 `catName()` 单一源；修复 7 处 wxml（due-list/submit/label/print/reconcile/guide）+导出 CSV 中文化 + 导入兼容中英文类别名
14. 编号规则：`{类别前两字拼音缩写}{YY}{5位流水}` 无连字符（临时配电→LS2600001；绝缘JY/手持SC/通用TY/起重QZ/高空GK/计量JL/大型DX）；旧格式保留可读不再生成；R15 测试同步更新
15. 组织树编辑：服务端 add/update 加三级树架构校验（unit 挂根/project 挂 unit/team 挂 project、team 叶子不可下挂、kind 与层级严格对应）+移动防环（subtreeIds 检查目标不在自身子树）；前端树行加「新增下级」快捷入口、上级切换自动纠正类型、提交前防环预检

**B. 组织树缓存失效修复（用户实测反馈）**
- 根因：`utils/api.js getOrgTree` 有缓存时无条件 `resolve(cached)` 返回旧树，后台版本校验发现不一致只写 storage 不更新返回值 → 数据库已变、前端永远旧树
- 修复：缓存分支改为等版本校验——版本一致返回缓存（省传输），不一致返回新树并更新缓存；网络失败回退缓存（保留弱网/离线设计）。org.js 提交后 `await this.load()` 已有，闭环成立
- 所有消费 getOrgTree 的页面（org/ledger/login/register/profile 等）统一受益

**门禁**：`npm test` ✅ 157/157；`check:syntax` ✅ 256 文件；`check:frontend` ✅；`lint:helpers` ✅ 34 文件。

**遗留**：① 需真机手测：组织树新增/编辑后立即刷新、生成预警明细、记录页筛选、档案删除、编号联想、文件导出（saveFileToDisk 权限）；② 与 §7.14-§7.18 同属未推送改动，分支 `feature/feature-slim-20260805` 待推。

---

### 7.20 组织树缓存失效根因治本：版本号改为内容指纹（2026-08-08）

> **背景**：§7.19 修复前端 `getOrgTree` 缓存分支后，用户实机调试仍显示旧组织架构。追查发现**版本号机制本身失效**：`orgTreeVersion` 存于 `configs` 集合，但该集合从未被 `ensureCollection`（orgs/users/dicts/check_templates/operation_logs 均有，唯独 configs 没有）→ 云数据库向不存在集合 add/update 抛错 → `bumpOrgVersion` 的 try/catch 静默吞掉 → 版本恒 0 → 前端缓存比对永远「一致」→ 永远返回缓存旧树。

**修复（治本，不依赖集合可写性）**
- `cloudfunctions/system/index.js` `orgTree()`：版本号改为**树内容指纹**（对每个节点的 _id/parentId/kind/name 做滚动 hash，`>>> 0` 取非负）——树的任意增/删/改都会改变指纹，前端即检测到不一致并拉新树；空树指纹 0 与前端初始缓存版本 0 语义一致
- `bumpOrgVersion` 补 `ensureCollection('configs')`：configs 记录可真正落库（辅助审计），版本比对以指纹为准
- 前端 `getOrgTree`（§7.19 已修）：版本不一致返回新树——闭环完成

**回归守卫**：新增测试「版本号为内容指纹，组织变更后版本变化」（新增节点/重命名 → 版本变；内容未变 → 版本稳定），158/158 全绿。

**部署提示**：真机调试调用的是**线上已部署的云函数**——须重新部署 `cloudfunctions/system` 后指纹机制才生效；前端代码真机调试用本地版本即可。

---

### 7.21 库房管理纳入组织架构页（2026-08-08）

> **背景**：用户要求「库房管理也纳入该架构页中」——组织架构页（pkg-system/pages/org）树节点下直接管理该组织库房，替代仅独立库房注册页的现状。

**改动**
- `cloudfunctions/store/index.js`：
  - `register` 支持显式 `orgId`（架构页给指定组织挂库房），但须在调用者可编辑范围内（`allowedOrgIds` 校验，admin 放行），越权挂靠 403 拒绝——保留原「防越权挂靠」安全边界（原实现静默忽略，改为明确拒绝）
  - 新增 `update` 动作：管理员或库房创建者可改 名称/分区/保管人；orgId 不可改（挂靠变更走删除重建）
- `utils/api.js`：暴露 `updateStore`
- `pkg-system/pages/org/`：树行加「库房」按钮（点击展开该组织库房列表：名称/分区/保管人 + 新增/编辑/删除，删除带二次确认且服务端拒绝「库房下仍有器具」）；新增/编辑表单内联卡片
- 测试：原「忽略越权 orgId」断言改为「越权 403」，新增 显式挂靠成功 / 默认归属 / update 权限 3 例

**门禁**：`npm test` ✅ 161/161（store 4 例）；`check:syntax` ✅；`check:frontend` ✅。

**遗留**：需重新部署 `cloudfunctions/store`（register 放开 orgId + update 新动作）与 `cloudfunctions/system`（§7.20 指纹）；与 §7.14-§7.20 同属未推送改动，分支 `feature/feature-slim-20260805` 待推。

---

### 7.20 台账状态刷新 + status-tag null 告警修复（2026-08-08）

> **背景**：用户反馈「器具合格→待检后，台账页卡片状态不及时更新」，且控制台提示 `[component] property "status" of "components/status-tag" received type-uncompatible value: expected <string> but got null`。

**根因（两个独立问题）**：
- **状态不更新**：`pages/ledger/ledger.js` 的 `onShow` 只做登录拦截、**不 reload**——器具在别的页（消息中心自动标待检/档案页操作）变更后，切回台账 tab 拿到的是 onLoad 时的旧列表（reload 走 cacheThenNetwork，在线时本就每次拉新数据，TTL 只影响离线回退，故非缓存问题）。
- **status null**：老数据器具文档缺 `status` 字段（list rows `status: t.status` 直接透传 undefined → WXML 绑定 null）。组件 `MAP[null]` 回退 `normal`，控制台告警且**把缺状态器具误标为「正常」**——比告警本身更危险。

**修复（组件层治本 + 页面 + 服务端兜底）**：
1. `ledger.js onShow`：首次（onLoad 已 reload）跳过，之后每次切回强制 `reload()`——状态变化即时可见，离线时仍回退缓存。
2. `components/status-tag/status-tag.js`：observers 归一化 `status || ''`，null/空显示「未知」（info 灰标）而非误标「正常」；顺带补 MAP 缺失的 `in_use`（领用中）——此前领用中的器具同样被回退显示「正常」。
3. `cloudfunctions/tool/index.js` list 映射 `status: t.status || ''` 兜底（数据层不再透传 undefined）。

**门禁**：`npm test` ✅ 162/162；`check:syntax` ✅ 256 文件。

**遗留**：与 §7.14-§7.19 同属未推送改动，分支 `feature/feature-slim-20260805` 待推。

---

### 7.21 账物核对三问题修复（2026-08-08）

> **背景**：用户反馈 reconcile 新建核对任务——① 目标仓库/器具类别选择后弹窗自动消失；② 直接提交报「数据库集合不存在」；③ 控制台提示 showLoading/hideLoading 必须配对使用。

**根因与修复**：
1. **弹窗自动消失**：弹层 `mask` 绑了 `bindtap="onHideCreateForm"`（点击遮罩关闭）。picker 是原生组件，选择器弹层关闭瞬间的触摸会穿透到 mask 误触发关闭。修复：mask 移除 tap 关闭（注释说明原因），关闭仅走「取消」按钮。
2. **集合不存在**：`reconcile_tasks`（及可能 `stores`）集合未在云数据库创建——云函数无法动态建集合，写入即报 `-502005 collection not exists`。修复：reconcile 云函数入口 catch 识别该错误码，返回中文指引「请在云开发控制台创建 stores / reconcile_tasks 集合」；**DEPLOY.md 新增 §0 云数据库集合创建清单**（全仓 26 个集合，部署第一件事），根治各功能逐个踩坑。
3. **loading 配对提示**：reconcile.js 各处本有 finally 配对，真正触发是**快速双击「提交」**——两次并发 onSubmitTask 各 show 一次，第一次 finally 已 hide，第二次的 hide 无匹配 show → 微信报「必须配对使用」。修复：`submitting` 防重入标志（提交中忽略重复点击）。

**门禁**：`npm test` ✅ 162/162；`check:syntax` ✅。

**遗留**：① 需要在云开发控制台确认 `reconcile_tasks` / `stores` 集合已创建（reconcile 云函数需重新部署生效中文提示）；② 与 §7.14-§7.20 同属未推送改动，分支 `feature/feature-slim-20260805` 待推。

---

### 7.22 条码生成页：筛选 + 标签图片完整化（2026-08-08）

> **背景**：用户反馈条码生成页（pkg-barcode/pages/gen）——① 无法筛选到目标器具；② 生成的标签图片仅含二维码，缺编号/名称/有效期等文字信息。

**根因**：
1. gen.js `onLoad` 仅加载 `getToolList({ size: 100 })` 前 100 台且页面无任何搜索——器具多时找不到目标。
2. `onSave` 用 `canvasToTempFilePath` 只导出二维码 canvas（#qr 400×400），文字信息仅在页面 DOM（qr-meta）展示，不进图片。

**修复**：
1. 页面加「筛选」输入框（名称/编号关键词，防抖 300ms 走服务端 tool.list keyword 多字段匹配），命中即重置选择器；提供清空按钮。
2. 单 canvas 绘制完整标签：canvas 高度 400rpx→620rpx（二维码区 + 文字区），二维码下方绘制 名称(bold)/编号/类别(中文)/有效期/保管人 五行文字，`onSave` 导出整卡——文字随图保存。行距按最小屏宽（320px）校核不溢出。

**门禁**：`npm test` ✅ 162/162；`check:syntax` ✅ 256 文件；`check:frontend` ✅。

**遗留**：与 §7.14-§7.21 同属未推送改动，分支 `feature/feature-slim-20260805` 待推。
