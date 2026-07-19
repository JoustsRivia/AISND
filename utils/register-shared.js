// utils/register-shared.js
// 注册 / 登录页共享逻辑（消除 pages/register 与 pages/login 的重复实现）：
//   - ROLES_BINDABLE：可自助绑定的角色清单（与 cloudfunctions/auth register 服务端白名单一致）
//   - ROLE_INFO：每个角色的结构化权限说明（数据范围 / 可用功能 / 审批链路），注册成功弹窗与权限页共用
//   - buildUnits(tree)：把扁平组织树转换为「单位 + 其下级机构/班组（带路径）」结构，
//     供单位 / 机构两级 picker 使用（注册、登录页逻辑完全一致，统一此处）。
const { ROLES } = require('./constants');

const ROLES_BINDABLE = [
  { value: ROLES.WORKER, name: '普通作业人员', desc: '仅可查看本班组工器具' },
  { value: ROLES.GROUP_LEAD, name: '班组长/班组安全员', desc: '仅可查看本班组工器具' },
  { value: ROLES.SAFETY_OFFICER, name: '项目部专职安全员', desc: '可管辖整个项目部台账' },
  { value: ROLES.LEASE_ADMIN, name: '租赁机具管理员', desc: '管理租赁机具台账' },
  { value: ROLES.LEAD, name: '专班负责人', desc: '全局台账与全部管理权限' },
  { value: ROLES.PROJECT_LEAD, name: '项目部负责人', desc: '可管辖整个项目部台账' },
  { value: ROLES.SUPERVISOR, name: '安监部管理人员', desc: '安监督查与系统管理' },
];

// 角色 → 结构化权限说明（迭代 Item 6）：注册成功弹窗三段式 + 权限页常驻查看
const ROLE_INFO = {
  [ROLES.WORKER]: {
    scope: '仅可查看本班组（机构）工器具台账',
    functions: ['浏览本班组器具档案与状态', '领用 / 归还本班组器具', '提交个人防护用品需求'],
    approval: '无需审批，操作即时生效',
  },
  [ROLES.GROUP_LEAD]: {
    scope: '管辖本班组全部工器具与人员操作',
    functions: ['本班组器具全生命周期管理', '指派本班成员作业任务', '审核本班领用申请'],
    approval: '班组内操作直接生效；跨班 / 项目部事项报上级',
  },
  [ROLES.SAFETY_OFFICER]: {
    scope: '管辖整个项目部台账与隐患排查',
    functions: ['项目部全量台账查看', '隐患排查与整改跟踪', '安全交底与培训记录'],
    approval: '项目部内事项自行审批；重大隐患报安监部',
  },
  [ROLES.LEASE_ADMIN]: {
    scope: '管理全单位租赁机具台账',
    functions: ['租赁机具登记录入', '租赁合格证与操作人持证管理', '租赁器具状态跟踪'],
    approval: '租赁业务自行审批',
  },
  [ROLES.LEAD]: {
    scope: '全局台账与全部管理权限',
    functions: ['全部工器具与人员数据', '系统管理后台', '审批 / 归档 / 报表导出'],
    approval: '最高权限，操作即时生效',
  },
  [ROLES.PROJECT_LEAD]: {
    scope: '管辖整个项目部台账',
    functions: ['项目部全量台账', '项目部人员与任务', '项目级报表'],
    approval: '项目部内事项自行审批',
  },
  [ROLES.SUPERVISOR]: {
    scope: '安监督查与系统管理',
    functions: ['全域监督检查', '隐患核销与考核', '字典与系统配置'],
    approval: '安监事项自行审批',
  },
};

// tree: 扁平组织节点数组（{_id, name, parentId, level, kind}）
// 返回：单位（level 0）数组，每项含 options（该单位下全部后代机构/班组，label 带路径）
function buildUnits(tree) {
  const list = tree || [];
  const byId = {};
  list.forEach((o) => { byId[o._id] = o; });
  return list
    .filter((o) => o.level === 0)
    .map((u) => {
      const options = [];
      list.forEach((o) => {
        if (o._id === u._id) return;
        let p = o.parentId, ok = false;
        while (p) { if (p === u._id) { ok = true; break; } p = byId[p] ? byId[p].parentId : null; }
        if (!ok) return;
        const path = [];
        let cur = o;
        while (cur) { path.unshift(cur.name); cur = byId[cur.parentId]; }
        options.push({ _id: o._id, label: path.join(' / '), unitId: u._id });
      });
      return { ...u, options };
    });
}

module.exports = { ROLES_BINDABLE, ROLE_INFO, buildUnits };
