// utils/display.js
// 统一展示工具：枚举转换 / 日期格式化 / 实体一键格式化
// 依赖 user-utils.js 处理用户字段，依赖 constants.js + data-schema.js 处理枚举字段

const { resolveUser, formatUser, displayName } = require('./user-utils');
const { TOOL_CATEGORIES, TOOL_STATUS_LABELS, TOOL_SOURCES, ROLES } = require('./constants');
const { getEntitySchema, FIELD_TYPES } = require('./data-schema');

// 枚举字典注册表：enumMap 名 → 枚举列表 [{ code/value, name }]
const ENUM_MAPS = {
  TOOL_CATEGORIES,
  TOOL_STATUS_LABELS: Object.entries(TOOL_STATUS_LABELS).map(([code, name]) => ({ code, name })),
  TOOL_SOURCES,
  ROLES: Object.entries(ROLES).map(([, code]) => ({ code, name: code })),
};

/**
 * displayEnum(enumKey, value)
 * 枚举值转中文名称
 */
function displayEnum(enumKey, value) {
  if (value == null || value === '') return '';
  const map = ENUM_MAPS[enumKey];
  if (!map) return String(value);
  const item = Array.isArray(map)
    ? map.find((m) => m.code === value || m.value === value)
    : null;
  return item ? (item.name || String(value)) : String(value);
}

/**
 * displayDate(date)
 * 统一日期格式 YYYY-MM-DD
 */
function displayDate(date) {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return String(date);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * formatEntityItem(entityName, item)
 * 同步版本：为 ENUM/DATE 类型字段自动补充 XXXDisplay
 */
function formatEntityItem(entityName, item) {
  if (!item) return item;
  const schema = getEntitySchema(entityName);
  if (!schema) return item;

  const result = { ...item };
  for (const [fieldKey, fieldDef] of Object.entries(schema)) {
    const rawValue = item[fieldKey];
    if (rawValue == null || rawValue === '') continue;

    if (fieldDef.type === FIELD_TYPES.ENUM && fieldDef.enumMap) {
      result[fieldKey + 'Display'] = displayEnum(fieldDef.enumMap, rawValue);
    } else if (fieldDef.type === FIELD_TYPES.DATE) {
      result[fieldKey + 'Display'] = displayDate(rawValue);
    }
  }
  return result;
}

/**
 * formatEntityItemAsync(entityName, item)
 * 异步版本：额外处理 USER 字段（resolveUser 异步查询）
 */
async function formatEntityItemAsync(entityName, item) {
  if (!item) return item;
  const schema = getEntitySchema(entityName);
  if (!schema) return item;

  const result = { ...item };
  const userPromises = [];

  for (const [fieldKey, fieldDef] of Object.entries(schema)) {
    const rawValue = item[fieldKey];
    if (rawValue == null || rawValue === '') continue;

    switch (fieldDef.type) {
      case FIELD_TYPES.USER:
        userPromises.push(
          resolveUser(rawValue).then((name) => ({ fieldKey, display: name }))
            .catch(() => ({ fieldKey, display: rawValue }))
        );
        break;
      case FIELD_TYPES.ENUM:
        if (fieldDef.enumMap) {
          result[fieldKey + 'Display'] = displayEnum(fieldDef.enumMap, rawValue);
        }
        break;
      case FIELD_TYPES.DATE:
        result[fieldKey + 'Display'] = displayDate(rawValue);
        break;
    }
  }

  if (userPromises.length > 0) {
    const userResults = await Promise.all(userPromises);
    for (const { fieldKey, display } of userResults) {
      result[fieldKey + 'Display'] = display;
    }
  }

  return result;
}

module.exports = {
  displayEnum,
  displayDate,
  formatEntityItem,
  formatEntityItemAsync,
  ENUM_MAPS,
};
