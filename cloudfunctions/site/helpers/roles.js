// shared/roles.js
// ★ 角色白名单单一源（CONS-01 / OPT-06）。云函数侧「可自助绑定 / 可后台分配」角色列表的唯一来源，
// 由 scripts/bundle-db-base.js 同步进各云函数 helpers/roles.js，auth 与 system 统一引用，消除双端漂移。
//
// 注意：本文件是云函数侧白名单（与前端 utils/constants.js 的 ROLES 枚举职责不同，避免运行时跨目录 require）。

// ── 旧角色码（向后兼容，系统管理页仍在使用）──
const ADMIN = 'admin';
const LEAD = 'lead';
const PROJECT_LEAD = 'project_lead';
const SAFETY_OFFICER = 'safety_officer';
const GROUP_LEAD = 'group_lead';
const SUPERVISOR = 'supervisor';
const WORKER = 'worker';
const LEASE_ADMIN = 'lease_admin';

// ── 新三级角色码 ──
// 安监 (a)
const SAFETY_PLATFORM = 'a1';
const SAFETY_CONTRACTOR = 'a2';
// 总包管理人员 (b1)
const CONTRACTOR_HEAD = 'b11';
const CONTRACTOR_MANAGER = 'b12';
// 总包现场工作人员 (b2)
const CONTRACTOR_PROJECT_LEAD = 'b21';
const CONTRACTOR_SAFETY_OFFICER = 'b22';
const CONTRACTOR_GROUP_LEAD = 'b23';
const CONTRACTOR_WORKER = 'b24';
// 分包管理人员 (c1)
const SUBCONTRACTOR_HEAD = 'c11';
const SUBCONTRACTOR_MANAGER = 'c12';
// 分包现场工作人员 (c2)
const SUBCONTRACTOR_PROJECT_LEAD = 'c21';
const SUBCONTRACTOR_SAFETY_OFFICER = 'c22';
const SUBCONTRACTOR_GROUP_LEAD = 'c23';
const SUBCONTRACTOR_WORKER = 'c24';

// 可自助绑定角色（注册/绑定页）：
// admin 由系统指派，不在其中；包含所有旧角色码 + 新三级角色码（a1~c24）。
const ROLE_SELF_BINDABLE = [
  // 旧角色码（向后兼容，用户管理页/系统管理仍在使用）
  WORKER, GROUP_LEAD, SAFETY_OFFICER, LEASE_ADMIN, PROJECT_LEAD, LEAD, SUPERVISOR,
  // 新三级角色码（注册页 cascading-role-picker 产生的叶子角色）
  SAFETY_PLATFORM, SAFETY_CONTRACTOR,
  CONTRACTOR_HEAD, CONTRACTOR_MANAGER,
  CONTRACTOR_PROJECT_LEAD, CONTRACTOR_SAFETY_OFFICER, CONTRACTOR_GROUP_LEAD, CONTRACTOR_WORKER,
  SUBCONTRACTOR_HEAD, SUBCONTRACTOR_MANAGER,
  SUBCONTRACTOR_PROJECT_LEAD, SUBCONTRACTOR_SAFETY_OFFICER, SUBCONTRACTOR_GROUP_LEAD, SUBCONTRACTOR_WORKER,
];

// 系统管理可分配角色（userManage）：在自助绑定基础上追加 admin（仅后台指派）
const ROLE_ADMIN_ASSIGNABLE = [...ROLE_SELF_BINDABLE, ADMIN];

module.exports = { ROLE_SELF_BINDABLE, ROLE_ADMIN_ASSIGNABLE };
