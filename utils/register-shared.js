// utils/register-shared.js
// 注册 / 登录页共享逻辑（消除 pages/register 与 pages/login 的重复实现）：
//   - ROLES_BINDABLE：可自助绑定的角色清单（包含新角色码 a1~c24 + 旧角色码兼容）
//   - ROLE_INFO：每个角色的结构化权限说明（数据范围 / 可用功能 / 审批链路），注册成功弹窗与权限页共用
//   - buildUnits(tree)：把扁平组织树转换为「单位 + 其下级机构/班组（带路径）」结构，
//     供系统管理页等单位/机构选择器使用（注册页不再使用此函数）。

const { getLeafRoleCodes, getRoleMeta } = require('./role-tree');

// 可自助绑定角色清单：全部为三级树叶子码（a1~c24，树序）
// 词表统一（2026-08-08）：旧扁平码已移除，注册/绑定统一走三级树角色
const ROLES_BINDABLE = getLeafRoleCodes().map((code) => {
  const m = getRoleMeta(code);
  return { value: code, name: m ? m.name : code, desc: m ? m.desc : '' };
});

// ── 角色权限说明（三级树 14 叶子码 + admin，与 utils/role-tree.js 语义同源）──
const ROLE_INFO = {
  // ── 新角色码（a1~c24 三级级联角色树）──
  a1: {
    scope: '平台级安全监督管理，全局数据查看权限',
    functions: ['全域安全监督检查', '全量台账与报表', '隐患核销与考核'],
    approval: '平台安监事项自行审批',
  },
  a2: {
    scope: '总包单位安全监督管理，管辖总包单位台账',
    functions: ['总包单位安全监督检查', '总包单位台账查看', '整改跟踪与考核'],
    approval: '总包安监事项自行审批',
  },
  b11: {
    scope: '总包公司全局管理，管辖全部总包单位数据',
    functions: ['总包全量台账与人员管理', '审批 / 归档 / 报表导出', '系统配置'],
    approval: '最高权限，操作即时生效',
  },
  b12: {
    scope: '总包部门业务管理，管辖本部门台账',
    functions: ['本部门台账管理', '部门人员与任务', '部门级报表'],
    approval: '部门内事项自行审批',
  },
  b21: {
    scope: '管辖整个项目部台账',
    functions: ['项目部全量台账', '项目部人员与任务', '项目级报表'],
    approval: '项目部内事项自行审批',
  },
  b22: {
    scope: '项目部隐患排查与安全交底',
    functions: ['项目部全量台账查看', '隐患排查与整改跟踪', '安全交底与培训记录'],
    approval: '项目部内事项自行审批；重大隐患报安监部',
  },
  b23: {
    scope: '管辖本班组工器具与人员',
    functions: ['本班组器具全生命周期管理', '指派本班成员作业任务', '审核本班领用申请'],
    approval: '班组内操作直接生效；跨班/项目部事项报上级',
  },
  b24: {
    scope: '本班组工器具使用',
    functions: ['浏览本班组器具档案与状态', '领用 / 归还本班组器具', '提交个人防护用品需求'],
    approval: '无需审批，操作即时生效',
  },
  c11: {
    scope: '分包单位全局管理，管辖全部分包单位数据',
    functions: ['分包全量台账与人员管理', '审批 / 归档 / 报表导出', '分包系统配置'],
    approval: '最高权限，操作即时生效',
  },
  c12: {
    scope: '分包部门业务管理，管辖本部门台账',
    functions: ['本部门台账管理', '部门人员与任务', '部门级报表'],
    approval: '部门内事项自行审批',
  },
  c21: {
    scope: '管辖分包项目部台账',
    functions: ['分包项目部全量台账', '项目部人员与任务', '项目级报表'],
    approval: '项目部内事项自行审批',
  },
  c22: {
    scope: '分包项目部隐患排查与安全交底',
    functions: ['分包项目部全量台账查看', '隐患排查与整改跟踪', '安全交底与培训记录'],
    approval: '项目部内事项自行审批；重大隐患报安监部/总包',
  },
  c23: {
    scope: '管辖分包班组工器具与人员',
    functions: ['分包班组器具全生命周期管理', '指派本班成员作业任务', '审核本班领用申请'],
    approval: '班组内操作直接生效；跨班/项目部事项报上级',
  },
  c24: {
    scope: '分包班组工器具使用',
    functions: ['浏览分包班组器具档案与状态', '领用 / 归还本班组器具', '提交个人防护用品需求'],
    approval: '无需审批，操作即时生效',
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
