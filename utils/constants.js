// utils/constants.js
// 全局枚举：状态 / 角色 / 器具类别 / 字典类型。集中维护，避免页面硬编码魔法值。

const TOOL_STATUS = {
  QUALIFIED: 'qualified',     // 合格
  PENDING_TEST: 'pending_test', // 待检
  IN_USE: 'in_use',            // 领用中
  MAINTAINING: 'maintaining',  // 维修中
  SCRAPPED: 'scrapped',       // 已报废
  FORBIDDEN: 'forbidden',     // 禁用（不合格/超期/报废外流）
};

// 器具来源枚举（单一源：tool-create 录入页 + CSV导入页共用）
const TOOL_SOURCES = [
  { value: 'self', name: '自购' },
  { value: 'lease', name: '租赁' },
];

// 器具状态 → 中文标签（供 display.js / WXML 状态展示使用）
const TOOL_STATUS_LABELS = {
  [TOOL_STATUS.QUALIFIED]: '合格',
  [TOOL_STATUS.PENDING_TEST]: '待检',
  [TOOL_STATUS.IN_USE]: '领用中',
  [TOOL_STATUS.MAINTAINING]: '维修中',
  [TOOL_STATUS.SCRAPPED]: '已报废',
  [TOOL_STATUS.FORBIDDEN]: '已禁用',
};

// 三级角色树角色码（唯一业务词表，2026-08-08 统一：旧扁平码已移除）：
// 一级：安监 a / 总包 b / 分包 c；二级：管理 / 现场；三级：具体岗位。
// 树的层级与 orgKind 语义由 utils/role-tree.js 的 ROLE_TREE 单一源定义，此处仅声明常量映射供引用。
// 服务端白名单/档位同源见 shared/roles.js 与 shared/dbBase.js。
const ROLE_TREE_CODES = {
  // 安监 (a)
  SAFETY_PLATFORM: 'a1',        // 平台安监人员
  SAFETY_CONTRACTOR: 'a2',      // 总包安监人员
  // 总包管理人员 (b1)
  CONTRACTOR_HEAD: 'b11',       // 公司负责人
  CONTRACTOR_MANAGER: 'b12',    // 部门经理
  // 总包现场工作人员 (b2)
  CONTRACTOR_PROJECT_LEAD: 'b21',     // 项目部负责人
  CONTRACTOR_SAFETY_OFFICER: 'b22',   // 项目部专职安全员
  CONTRACTOR_GROUP_LEAD: 'b23',       // 自有班组班长/安全员
  CONTRACTOR_WORKER: 'b24',           // 自有作业人员
  // 分包管理人员 (c1)
  SUBCONTRACTOR_HEAD: 'c11',    // 分包负责人
  SUBCONTRACTOR_MANAGER: 'c12', // 分包部门经理
  // 分包现场工作人员 (c2)
  SUBCONTRACTOR_PROJECT_LEAD: 'c21',     // 分包项目部负责人
  SUBCONTRACTOR_SAFETY_OFFICER: 'c22',   // 分包项目部专职安全员
  SUBCONTRACTOR_GROUP_LEAD: 'c23',       // 分包班组班长/安全员
  SUBCONTRACTOR_WORKER: 'c24',           // 分包作业人员
};

// 角色引用常量（兼容旧 ROLES.* 语法；值为三级树码 + admin）
const ROLES = { ...ROLE_TREE_CODES, ADMIN: 'admin' };

// 角色族（与 shared/roles.js 的 MGMT / UNIT_MGMT 同源语义）：
// 前端权限判定统一用族判定，避免散点硬编码单个角色码。
const ROLE_FAMILIES = {
  // 管理族：单位级 + 项目级管理角色（建档/编辑/审批/评分等业务管理动作）
  MGMT: ['a1', 'a2', 'b11', 'b12', 'b21', 'b22', 'c11', 'c12', 'c21', 'c22'],
  // 单位级管理族（注册端强制绑定 unit 节点；数据档位 UNIT_ROLES 同源）
  UNIT_MGMT: ['a2', 'b11', 'b12', 'c11', 'c12'],
  // 全部三级叶子码（模块全员可见等场景用）
  ALL: Object.values(ROLE_TREE_CODES),
};

// 角色中文名（唯一前端角色名映射，替代各页面重复的 ROLE_TEXT 表）
const ROLE_TEXT = {
  a1: '平台安监人员',
  a2: '总包安监人员',
  b11: '公司负责人',
  b12: '部门经理',
  b21: '项目部负责人',
  b22: '项目部专职安全员',
  b23: '自有班组班长/安全员',
  b24: '自有作业人员',
  c11: '分包负责人',
  c12: '分包部门经理',
  c21: '分包项目部负责人',
  c22: '分包项目部专职安全员',
  c23: '分包班组班长/安全员',
  c24: '分包作业人员',
  admin: '小程序管理员',
};

// 角色展示顺序（单一源）：所有角色选择器（组织成员列表 / 筛选器）统一引用此顺序。
// 按三级树深度优先顺序。admin 为服务端指派、不在此列表中。
const ROLE_ORDER = Object.values(ROLE_TREE_CODES);

const TOOL_CATEGORIES = [
  { code: 'insulation', name: '绝缘安全工器具' },
  { code: 'motor', name: '手持电动机具' },
  { code: 'manual', name: '通用手动工具' },
  { code: 'lifting', name: '起重承压类' },
  { code: 'height', name: '高空防护器具' },
  { code: 'measure', name: '计量检测器具' },
  { code: 'temp_power', name: '临时配电配套' },
  { code: 'lease', name: '大型租赁机具' },
];

const DICT_TYPE = {
  TOOL_CATEGORY: 'tool_category',
  FAULT: 'fault',
  TEST_PERIOD: 'test_period',
  OP_GUIDE: 'op_guide',
  CHECK_TEMPLATE: 'check_template',
  TEST_ORG: 'test_org',
};

// 需强制持证的器具类别（领用校验见 cloudfunctions/borrow/index.js SPECIAL）
const SPECIAL_EQUIP_CATEGORIES = ['lifting', 'height', 'motor', 'lease'];

// 特种作业证书类型（M9.2 持证管理）
const CERT_TYPES = [
  { code: 'welder', name: '焊接与热切割作业' },
  { code: 'hoist', name: '起重机械作业' },
  { code: 'height', name: '高处作业' },
  { code: 'electric', name: '电工作业' },
  { code: 'pressure', name: '压力容器作业' },
  { code: 'other', name: '其他特种设备作业' },
];

// 证书类型 → 可领用器具类别（与 cloudfunctions/borrow SPECIAL 对应）
const CERT_TO_CATEGORY = {
  welder: 'motor',
  hoist: 'lifting',
  height: 'height',
  electric: 'motor',
  pressure: 'lease',
  other: 'all', // 其他特种设备作业覆盖全部特种类别
};

// 微信订阅消息模板 ID（M11.2.1）。在微信公众平台「订阅消息」申请"预警通知"模板后填入；
// 为空时前端仅记录订阅意图（api.subscribeWarning），不弹授权窗。
const SUBSCRIBE_TMPL_ID = '';

const HAZARD_LEVEL = { NORMAL: 'normal', SERIOUS: 'serious', MAJOR: 'major' };

const WARNING_LEVEL = { NOTICE: 'notice', IMPORTANT: 'important', URGENT: 'urgent' };

module.exports = {
  TOOL_STATUS, TOOL_STATUS_LABELS, TOOL_SOURCES, ROLES, ROLE_ORDER, ROLE_TREE_CODES,
  ROLE_FAMILIES, ROLE_TEXT,
  TOOL_CATEGORIES, DICT_TYPE, HAZARD_LEVEL, WARNING_LEVEL,
  SPECIAL_EQUIP_CATEGORIES, CERT_TYPES, CERT_TO_CATEGORY, SUBSCRIBE_TMPL_ID,
};
