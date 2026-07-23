// utils/tool-schema.js
// R13/R14/R22 共享字段 schema —— 消除录入页与导入页字段双源
// 字段定义：{ key, label, type, required, dateConstraint }
//   type: 'string' | 'number' | 'date' | 'array'
//   dateConstraint: 用于 R13 日期约束校验（如 expireAt >= purchaseDate）

const TOOL_FIELDS = [
  { key: 'code', label: '器具编号', type: 'string', required: false, importable: true },
  { key: 'name', label: '器具名称', type: 'string', required: true, importable: true },
  { key: 'category', label: '类别', type: 'string', required: true, importable: true },
  { key: 'spec', label: '规格型号', type: 'string', required: false, importable: true },
  { key: 'factoryNo', label: '出厂编号', type: 'string', required: false, importable: true },
  { key: 'purchaseDate', label: '采购日期', type: 'date', required: false, importable: true },
  { key: 'testPeriod', label: '检验周期(月)', type: 'number', required: false, importable: true, default: 6 },
  { key: 'lastTestDate', label: '上次试验日期', type: 'date', required: false, importable: true },
  { key: 'expireAt', label: '有效截止日期', type: 'date', required: false, importable: true },
  { key: 'store', label: '存放库房', type: 'string', required: false, importable: true },
  { key: 'keeper', label: '保管责任人', type: 'string', required: false, importable: true },
  { key: 'source', label: '来源', type: 'string', required: false, importable: true, default: 'self' },
  { key: 'leaseUnit', label: '租赁单位', type: 'string', required: false, importable: true },
  { key: 'certNo', label: '合格证编号', type: 'string', required: false, importable: true },
  { key: 'operator', label: '现场操作人', type: 'string', required: false, importable: true },
];

// 导入模板列定义（顺序即 CSV 列顺序）
const TOOL_IMPORT_COLS = TOOL_FIELDS.filter((f) => f.importable);

// R13 日期约束规则：[字段, 不早于字段, 错误提示]
const DATE_CONSTRAINTS = [
  ['lastTestDate', 'purchaseDate', '检验日期不得早于采购日期'],
  ['expireAt', 'purchaseDate', '有效截止日期不得早于采购日期'],
];

// R13 校验日期约束
function validateDateConstraints(form) {
  for (const [field, base, msg] of DATE_CONSTRAINTS) {
    if (form[field] && form[base] && new Date(form[field]) < new Date(form[base])) {
      return msg;
    }
  }
  return null;
}

// R13 根据检验周期 + 上次试验日期 计算有效截止日期
function calcExpireAt(lastTestDate, testPeriod) {
  if (!lastTestDate || !testPeriod) return '';
  const d = new Date(lastTestDate);
  if (isNaN(d.getTime())) return '';
  d.setMonth(d.getMonth() + Number(testPeriod));
  return d.toISOString().slice(0, 10);
}

module.exports = { TOOL_FIELDS, TOOL_IMPORT_COLS, DATE_CONSTRAINTS, validateDateConstraints, calcExpireAt };
