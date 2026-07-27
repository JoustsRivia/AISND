// shared/roles.js
// ★ 角色白名单单一源（CONS-01 / OPT-06）。云函数侧「可自助绑定 / 可后台分配」角色列表的唯一来源，
// 由 scripts/bundle-db-base.js 同步进各云函数 helpers/roles.js，auth 与 system 统一引用，消除双端漂移。
//
// 注意：本文件是云函数侧白名单（与前端 utils/constants.js 的 ROLES 枚举职责不同，避免运行时跨目录 require）。
const ADMIN = 'admin';
const LEAD = 'lead';
const PROJECT_LEAD = 'project_lead';
const SAFETY_OFFICER = 'safety_officer';
const GROUP_LEAD = 'group_lead';
const SUPERVISOR = 'supervisor';
const WORKER = 'worker';
const LEASE_ADMIN = 'lease_admin';

// 可自助绑定角色（注册/绑定页）：admin 由系统指派，不在其中
const ROLE_SELF_BINDABLE = [
  WORKER, GROUP_LEAD, SAFETY_OFFICER, LEASE_ADMIN, PROJECT_LEAD, LEAD, SUPERVISOR,
];

// 系统管理可分配角色（userManage）：在自助绑定基础上追加 admin（仅后台指派）
const ROLE_ADMIN_ASSIGNABLE = [...ROLE_SELF_BINDABLE, ADMIN];

module.exports = { ROLE_SELF_BINDABLE, ROLE_ADMIN_ASSIGNABLE };
