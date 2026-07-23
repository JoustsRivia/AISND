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

const ROLES = {
  LEAD: 'lead',                       // 工作专班负责人
  PROJECT_LEAD: 'project_lead',       // 项目部负责人
  SAFETY_OFFICER: 'safety_officer', // 项目部专职安全员
  GROUP_LEAD: 'group_lead',           // 班组长/班组安全员
  SUPERVISOR: 'supervisor',           // 安监部管理人员
  WORKER: 'worker',                   // 普通作业人员
  LEASE_ADMIN: 'lease_admin',         // 租赁机具管理员
  ADMIN: 'admin',                     // 小程序管理员（拥有小程序全部数据管理权限）
};

// 角色展示顺序（单一源）：所有角色选择器（注册页 / 组织成员列表 / 筛选器）统一引用此顺序，
// 避免出现各自硬编码导致顺序不一致。admin 为服务端指派、不在此列表中（注册页亦不展示）。
const ROLE_ORDER = [
  ROLES.WORKER,        // 普通作业人员
  ROLES.GROUP_LEAD,    // 班组长/班组安全员
  ROLES.SAFETY_OFFICER,// 项目部专职安全员
  ROLES.PROJECT_LEAD,  // 项目部负责人
  ROLES.SUPERVISOR,    // 安监部管理人员
  ROLES.LEAD,          // 专班负责人
];

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
  TOOL_STATUS, ROLES, ROLE_ORDER, TOOL_CATEGORIES, DICT_TYPE, HAZARD_LEVEL, WARNING_LEVEL,
  SPECIAL_EQUIP_CATEGORIES, CERT_TYPES, CERT_TO_CATEGORY, SUBSCRIBE_TMPL_ID,
};
