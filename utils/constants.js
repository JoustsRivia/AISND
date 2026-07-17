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
};

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

const HAZARD_LEVEL = { NORMAL: 'normal', SERIOUS: 'serious', MAJOR: 'major' };

const WARNING_LEVEL = { NOTICE: 'notice', IMPORTANT: 'important', URGENT: 'urgent' };

module.exports = {
  TOOL_STATUS, ROLES, TOOL_CATEGORIES, DICT_TYPE, HAZARD_LEVEL, WARNING_LEVEL,
};
