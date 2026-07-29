// utils/role-tree.js
// ★ 三级级联角色树单一源。注册页 cascading-role-picker 组件 + 后端 auth register 共用此文件，
//   确保前端选择器与后端校验始终同源，消除双端漂移。
//
// 角色树架构（三级）：
//   一级：安监人员(a)、总包人员(b)、分包人员(c)
//   二级：由一级决定（a→a1/a2; b→b1/b2; c→c1/c2）
//   三级：由二级决定（a1/a2 无三级；b1→b11/b12; b2→b21/b22/b23/b24; c1→c11/c12; c2→c21/c22/c23/c24）

/**
 * 角色树完整定义。
 * 每个节点含：value(角色码)、name(中文名)、children(子节点，无则空数组)、
 *   unitType(所属单位类型: 'safety'|'contractor'|'subcontractor')、
 *   orgKind(组织节点类型: 'unit'|'project'|'team')、
 *   desc(简要说明，叶子节点有)
 */
const ROLE_TREE = [
  {
    value: 'a', name: '安监人员', unitType: 'safety',
    children: [
      { value: 'a1', name: '平台安监人员', orgKind: 'unit', unitType: 'safety', desc: '平台级安全监督管理' },
      { value: 'a2', name: '总包安监人员', orgKind: 'unit', unitType: 'safety', desc: '总包单位安全监督管理' },
    ],
  },
  {
    value: 'b', name: '总包人员', unitType: 'contractor',
    children: [
      {
        value: 'b1', name: '总包管理人员', unitType: 'contractor',
        children: [
          { value: 'b11', name: '公司负责人', orgKind: 'unit', unitType: 'contractor', desc: '总包公司全局管理' },
          { value: 'b12', name: '部门经理', orgKind: 'unit', unitType: 'contractor', desc: '总包部门业务管理' },
        ],
      },
      {
        value: 'b2', name: '总包现场工作人员', unitType: 'contractor',
        children: [
          { value: 'b21', name: '项目部负责人', orgKind: 'project', unitType: 'contractor', desc: '管辖整个项目部台账' },
          { value: 'b22', name: '项目部专职安全员', orgKind: 'project', unitType: 'contractor', desc: '项目部隐患排查与安全交底' },
          { value: 'b23', name: '自有班组班长/安全员', orgKind: 'team', unitType: 'contractor', desc: '管辖本班组工器具与人员' },
          { value: 'b24', name: '自有作业人员', orgKind: 'team', unitType: 'contractor', desc: '本班组工器具使用' },
        ],
      },
    ],
  },
  {
    value: 'c', name: '分包人员', unitType: 'subcontractor',
    children: [
      {
        value: 'c1', name: '分包管理人员', unitType: 'subcontractor',
        children: [
          { value: 'c11', name: '分包负责人', orgKind: 'unit', unitType: 'subcontractor', desc: '分包单位全局管理' },
          { value: 'c12', name: '分包部门经理', orgKind: 'unit', unitType: 'subcontractor', desc: '分包部门业务管理' },
        ],
      },
      {
        value: 'c2', name: '分包现场工作人员', unitType: 'subcontractor',
        children: [
          { value: 'c21', name: '分包项目部负责人', orgKind: 'project', unitType: 'subcontractor', desc: '管辖分包项目部台账' },
          { value: 'c22', name: '分包项目部专职安全员', orgKind: 'project', unitType: 'subcontractor', desc: '分包项目部隐患排查与安全交底' },
          { value: 'c23', name: '分包班组班长/安全员', orgKind: 'team', unitType: 'subcontractor', desc: '管辖分包班组工器具与人员' },
          { value: 'c24', name: '分包作业人员', orgKind: 'team', unitType: 'subcontractor', desc: '分包班组工器具使用' },
        ],
      },
    ],
  },
];

/**
 * 获取角色树（用于级联选择器初始化）。
 * @returns {Array} ROLE_TREE 完整拷贝（避免调用方意外修改）
 */
function getRoleTree() {
  // 返回浅拷贝即可——调用方只读展示，不修改节点
  return ROLE_TREE;
}

/**
 * 从角色树中查找指定节点的子节点。
 * @param {string|null} parentValue - 父节点角色码；null 表示取第一级
 * @returns {Array<{value, name, desc?}>} 子节点列表
 */
function getChildren(parentValue) {
  if (!parentValue) {
    // 第一级：返回三个顶层节点（不含 children）
    return ROLE_TREE.map((n) => ({ value: n.value, name: n.name }));
  }
  // 递归查找
  const found = findNode(ROLE_TREE, parentValue);
  if (!found || !found.children || !found.children.length) return [];
  return found.children.map((n) => ({ value: n.value, name: n.name }));
}

/**
 * 在树中递归查找节点。
 * @param {Array} nodes - 树节点数组
 * @param {string} value - 目标角色码
 * @returns {Object|null}
 */
function findNode(nodes, value) {
  for (const n of nodes) {
    if (n.value === value) return n;
    if (n.children && n.children.length) {
      const found = findNode(n.children, value);
      if (found) return found;
    }
  }
  return null;
}

/**
 * 获取角色完整元数据（unitType、orgKind、desc）。
 * @param {string} roleValue - 角色码（如 'c24'）
 * @returns {{ value, name, unitType, orgKind, desc, path: string[] }|null}
 */
function getRoleMeta(roleValue) {
  if (!roleValue) return null;
  const path = getRolePath(roleValue);
  if (!path) return null;
  const leaf = path[path.length - 1];
  return {
    value: leaf.value,
    name: leaf.name,
    unitType: leaf.unitType || (path.length >= 2 ? path[1].unitType : path[0].unitType),
    orgKind: leaf.orgKind || null,
    desc: leaf.desc || '',
    path: path.map((n) => n.name),
  };
}

/**
 * 获取从根到指定节点的完整路径（数组）。
 * @param {string} roleValue - 角色码
 * @returns {Array<Object>|null} 路径节点数组；找不到返回 null
 */
function getRolePath(roleValue) {
  if (!roleValue) return null;
  // 递归构建路径
  function find(nodes, target, ancestors) {
    for (const n of nodes) {
      const cur = [...ancestors, { value: n.value, name: n.name, unitType: n.unitType, orgKind: n.orgKind, desc: n.desc }];
      if (n.value === target) return cur;
      if (n.children && n.children.length) {
        const res = find(n.children, target, cur);
        if (res) return res;
      }
    }
    return null;
  }
  return find(ROLE_TREE, roleValue, []);
}

/**
 * 获取所有叶子角色码列表（用于白名单校验）。
 * @returns {string[]} 如 ['a1','a2','b11','b12',...,'c24']
 */
function getLeafRoleCodes() {
  const codes = [];
  function walk(nodes) {
    for (const n of nodes) {
      if (!n.children || !n.children.length) {
        codes.push(n.value);
      } else {
        walk(n.children);
      }
    }
  }
  walk(ROLE_TREE);
  return codes;
}

/**
 * 获取所有有效角色码（含中间节点，用于旧角色兼容映射）。
 * @returns {string[]}
 */
function getAllRoleCodes() {
  const codes = [];
  function walk(nodes) {
    for (const n of nodes) {
      codes.push(n.value);
      if (n.children && n.children.length) walk(n.children);
    }
  }
  walk(ROLE_TREE);
  return codes;
}

/**
 * 判断给定角色码是否为叶子节点（即最终可选角色）。
 * @param {string} roleValue
 * @returns {boolean}
 */
function isLeafRole(roleValue) {
  const node = findNode(ROLE_TREE, roleValue);
  return node ? (!node.children || !node.children.length) : false;
}

module.exports = {
  ROLE_TREE,
  getRoleTree,
  getChildren,
  findNode,
  getRoleMeta,
  getRolePath,
  getLeafRoleCodes,
  getAllRoleCodes,
  isLeafRole,
};
