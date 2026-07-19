// utils/register-shared.js
// 注册 / 登录页共享逻辑（消除 pages/register 与 pages/login 的重复实现）：
//   - ROLES_BINDABLE：可自助绑定的角色清单（与 cloudfunctions/auth register 服务端白名单一致）
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

module.exports = { ROLES_BINDABLE, buildUnits };
