// pkg-ledger/utils/tool-schema.js
// 台账录入页专用工具函数（原 utils/tool-schema.js，2026-08-08 移入分包）
// 背景：字段元数据已由 utils/data-schema.js（ENTITY_SCHEMAS.tool）实现，
//       导入列已由 pkg-ledger/pages/import/import.js 的 COLS 实现（与 CSV 表头一致），
//       日期约束服务端权威副本在 cloudfunctions/tool/index.js（客户端仅做 UX 预检），
//       故仅保留录入页独有的两个函数，避免主包携带仅分包使用的代码。

// R13 日期约束校验（UX 预检；服务端 cloudfunctions/tool/index.js 有权威副本）
function validateDateConstraints(form) {
  // 规则：[字段, 不早于字段, 错误提示]
  const DATE_CONSTRAINTS = [
    ['lastTestDate', 'purchaseDate', '检验日期不得早于采购日期'],
    ['expireAt', 'purchaseDate', '有效截止日期不得早于采购日期'],
  ];
  for (const [field, base, msg] of DATE_CONSTRAINTS) {
    if (form[field] && form[base] && new Date(form[field]) < new Date(form[base])) {
      return msg;
    }
  }
  return null;
}

// R13 根据检验周期 + 上次试验日期 计算有效截止日期（仅录入页前端计算，服务端直接存传入值）
function calcExpireAt(lastTestDate, testPeriod) {
  if (!lastTestDate || !testPeriod) return '';
  const d = new Date(lastTestDate);
  if (isNaN(d.getTime())) return '';
  d.setMonth(d.getMonth() + Number(testPeriod));
  return d.toISOString().slice(0, 10);
}

module.exports = { validateDateConstraints, calcExpireAt };
