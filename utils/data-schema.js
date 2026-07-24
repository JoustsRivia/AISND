// utils/data-schema.js
// 数据 Schema 注册中心：统一描述实体字段的类型语义
// 与 display.js / tool-schema.js 配合使用，为 form-renderer 等组件提供字段类型元数据

// 字段类型枚举
const FIELD_TYPES = {
  USER: 'USER',           // 用户标识（openid），显示时需转可读姓名
  ORG: 'ORG',             // 组织标识（orgId），显示时需转组织名称
  ENUM: 'ENUM',           // 枚举值，需配合 enumMap 转中文
  ROLE_ORG: 'ROLE_ORG',   // 角色+组织联合标识
  TEXT: 'TEXT',           // 普通文本
  TEXTAREA: 'TEXTAREA',   // 长文本
  NUMBER: 'NUMBER',       // 数字
  DATE: 'DATE',           // 日期
  SEARCH: 'SEARCH',       // 搜索类型（仅用于 form 交互）
};

// 实体 Schema 定义
const ENTITY_SCHEMAS = {
  tool: {
    code:            { type: FIELD_TYPES.TEXT,     label: '器具编号' },
    name:            { type: FIELD_TYPES.TEXT,     label: '器具名称' },
    category:        { type: FIELD_TYPES.ENUM,     label: '类别',       enumMap: 'TOOL_CATEGORIES' },
    spec:            { type: FIELD_TYPES.TEXT,     label: '规格型号' },
    factoryNo:       { type: FIELD_TYPES.TEXT,     label: '出厂编号' },
    purchaseDate:    { type: FIELD_TYPES.DATE,     label: '采购日期' },
    testPeriod:      { type: FIELD_TYPES.NUMBER,   label: '检验周期(月)' },
    lastTestDate:    { type: FIELD_TYPES.DATE,     label: '上次试验日期' },
    expireAt:        { type: FIELD_TYPES.DATE,     label: '有效截止日期' },
    store:           { type: FIELD_TYPES.ORG,      label: '存放库房' },
    keeper:          { type: FIELD_TYPES.USER,     label: '保管责任人' },
    source:          { type: FIELD_TYPES.ENUM,     label: '来源',       enumMap: 'TOOL_SOURCES' },
    leaseUnit:       { type: FIELD_TYPES.TEXT,     label: '租赁单位' },
    certNo:          { type: FIELD_TYPES.TEXT,     label: '合格证编号' },
    operator:        { type: FIELD_TYPES.USER,     label: '现场操作人' },
    status:          { type: FIELD_TYPES.ENUM,     label: '状态',       enumMap: 'TOOL_STATUS_LABELS' },
  },

  store: {
    name:            { type: FIELD_TYPES.TEXT,     label: '库房名称' },
    orgId:           { type: FIELD_TYPES.ORG,      label: '所属组织' },
    keeper:          { type: FIELD_TYPES.USER,     label: '管理员' },
    zone:            { type: FIELD_TYPES.TEXT,     label: '分区' },
  },

  user: {
    username:        { type: FIELD_TYPES.TEXT,     label: '用户名' },
    nickname:        { type: FIELD_TYPES.TEXT,     label: '昵称' },
    employeeId:      { type: FIELD_TYPES.TEXT,     label: '工号' },
    role:            { type: FIELD_TYPES.ENUM,     label: '角色',       enumMap: 'ROLES' },
    orgId:           { type: FIELD_TYPES.ORG,      label: '所属组织' },
  },

  org: {
    name:            { type: FIELD_TYPES.TEXT,     label: '组织名称' },
    parentId:        { type: FIELD_TYPES.TEXT,     label: '上��组织' },
    level:           { type: FIELD_TYPES.NUMBER,   label: '层级' },
    kind:            { type: FIELD_TYPES.ENUM,     label: '类型',       enumMap: 'ORG_KINDS' },
  },

  borrow_record: {
    toolId:          { type: FIELD_TYPES.TEXT,     label: '器具ID' },
    userId:          { type: FIELD_TYPES.USER,     label: '领用人' },
    borrowTime:      { type: FIELD_TYPES.DATE,     label: '领用时间' },
    returnTime:      { type: FIELD_TYPES.DATE,     label: '归还时间' },
    appearance:      { type: FIELD_TYPES.ENUM,     label: '外观检查',   enumMap: 'APPEARANCE' },
  },
};

function getEntitySchema(entityName) {
  return ENTITY_SCHEMAS[entityName] || null;
}

function getFieldSchema(entityName, fieldKey) {
  const schema = ENTITY_SCHEMAS[entityName];
  return (schema && schema[fieldKey]) || null;
}

function getFieldType(entityName, fieldKey) {
  const field = getFieldSchema(entityName, fieldKey);
  return field ? field.type : null;
}

module.exports = {
  FIELD_TYPES,
  ENTITY_SCHEMAS,
  getEntitySchema,
  getFieldSchema,
  getFieldType,
};
