// shared/roles.js
// ★ 角色白名单单一源（CONS-01 / OPT-06）。云函数侧「可自助绑定 / 可后台分配」角色列表的唯一来源，
// 由 scripts/bundle-db-base.js 同步进各云函数 helpers/roles.js，auth 与 system 统一引用，消除双端漂移。
//
// 注意：本文件是云函数侧白名单（与前端 utils/constants.js 的 ROLES 枚举职责不同，避免运行时跨目录 require）。
//
// 词表统一（2026-08-08）：全仓唯一角色词表 = 三级树 14 叶子码（a1/a2, b11-b24, c11-c24）+ admin。
// 旧扁平码（lead/project_lead/safety_officer/group_lead/supervisor/worker/lease_admin）已移除，
// 语义由 utils/role-tree.js 的树定义承载（服务端不得 require 前端目录，此处仅维护白名单与角色族）。

// ── 三级角色码（唯一业务词表，语义源：utils/role-tree.js）──
// 安监 (a)
const SAFETY_PLATFORM = 'a1';        // 平台安监人员（平台级全量查看）
const SAFETY_CONTRACTOR = 'a2';      // 总包安监人员（总包单位）
// 总包管理人员 (b1)
const CONTRACTOR_HEAD = 'b11';       // 公司负责人（总包单位全局管理）
const CONTRACTOR_MANAGER = 'b12';    // 部门经理（总包部门业务管理）
// 总包现场工作人员 (b2)
const CONTRACTOR_PROJECT_LEAD = 'b21';      // 项目部负责人（管辖项目部台账）
const CONTRACTOR_SAFETY_OFFICER = 'b22';    // 项目部专职安全员
const CONTRACTOR_GROUP_LEAD = 'b23';        // 自有班组班长/安全员
const CONTRACTOR_WORKER = 'b24';            // 自有作业人员
// 分包管理人员 (c1)
const SUBCONTRACTOR_HEAD = 'c11';    // 分包负责人（分包单位全局管理）
const SUBCONTRACTOR_MANAGER = 'c12'; // 分包部门经理
// 分包现场工作人员 (c2)
const SUBCONTRACTOR_PROJECT_LEAD = 'c21';   // 分包项目部负责人
const SUBCONTRACTOR_SAFETY_OFFICER = 'c22'; // 分包项目部专职安全员
const SUBCONTRACTOR_GROUP_LEAD = 'c23';     // 分包班组班长/安全员
const SUBCONTRACTOR_WORKER = 'c24';         // 分包作业人员

const ADMIN = 'admin';               // 小程序系统管理员（服务端指派，不进自助绑定）

// ── 角色族（业务动作鉴权共用；替代各云函数 index.js 里散落的硬编码数组，消除双端漂移）──
// 管理族：单位级 + 项目级管理角色（建档/编辑/审批/评分等业务管理动作）
const MGMT = [
  SAFETY_PLATFORM, SAFETY_CONTRACTOR,
  CONTRACTOR_HEAD, CONTRACTOR_MANAGER, CONTRACTOR_PROJECT_LEAD, CONTRACTOR_SAFETY_OFFICER,
  SUBCONTRACTOR_HEAD, SUBCONTRACTOR_MANAGER, SUBCONTRACTOR_PROJECT_LEAD, SUBCONTRACTOR_SAFETY_OFFICER,
];
// 单位级管理族（注册端 _orgKindMap 强制绑定 unit 节点；数据档位 UNIT_ROLES 同源语义）
const UNIT_MGMT = [
  SAFETY_CONTRACTOR, CONTRACTOR_HEAD, CONTRACTOR_MANAGER, SUBCONTRACTOR_HEAD, SUBCONTRACTOR_MANAGER,
];

// 可自助绑定角色（注册/绑定页）：admin 由系统指派，不在其中；全部为三级树叶子码。
const ROLE_SELF_BINDABLE = [
  SAFETY_PLATFORM, SAFETY_CONTRACTOR,
  CONTRACTOR_HEAD, CONTRACTOR_MANAGER,
  CONTRACTOR_PROJECT_LEAD, CONTRACTOR_SAFETY_OFFICER, CONTRACTOR_GROUP_LEAD, CONTRACTOR_WORKER,
  SUBCONTRACTOR_HEAD, SUBCONTRACTOR_MANAGER,
  SUBCONTRACTOR_PROJECT_LEAD, SUBCONTRACTOR_SAFETY_OFFICER, SUBCONTRACTOR_GROUP_LEAD, SUBCONTRACTOR_WORKER,
];

// 系统管理可分配角色（userManage）：在自助绑定基础上追加 admin（仅后台指派）
const ROLE_ADMIN_ASSIGNABLE = [...ROLE_SELF_BINDABLE, ADMIN];

module.exports = { ROLE_SELF_BINDABLE, ROLE_ADMIN_ASSIGNABLE, MGMT, UNIT_MGMT };
