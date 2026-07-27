// shared/employeeId.js
// ★ 工号生成纯函数（DUP-01）。无外部依赖，orgs / users 由调用方提供，便于单测与迁移。
//
// 规则：单位级(level 0) → 4 位；项目部级(level 1) → 6 位；班组级(level 2) → 8 位。
// 工号在组织树内唯一：前缀(单位序号[+项目部序号]) + 同前缀下最大流水号 +1。
function generateEmployeeId(orgId, orgs = [], users = []) {
  const byId = {};
  orgs.forEach((o) => { byId[o._id] = o; });

  const node = byId[orgId];
  if (!node) return String(Date.now()).slice(-6);

  // 往上找到根单位(level 0) → 单位序号
  let unit = node;
  while (unit.parentId && byId[unit.parentId]) unit = byId[unit.parentId];
  const unitList = orgs.filter((o) => o.level === 0 && !o.parentId);
  const unitIdx = Math.max(0, unitList.findIndex((o) => o._id === unit._id)) + 1;
  const unitSeq = String(unitIdx).padStart(2, '0');

  // 项目部序号(level 1)
  let projIdx = 0;
  if (node.level >= 1) {
    let proj = node;
    while (proj && proj.level > 1) proj = byId[proj.parentId];
    if (proj) {
      const sibs = orgs.filter((o) => o.level === 1 && o.parentId === unit._id);
      projIdx = Math.max(0, sibs.findIndex((o) => o._id === proj._id)) + 1;
    }
  }
  const projSeq = String(projIdx).padStart(2, '0');

  let prefix;
  if (node.level === 0) prefix = '';
  else if (node.level === 1) prefix = unitSeq;
  else prefix = unitSeq + projSeq;

  const len = node.level === 0 ? 4 : (node.level === 1 ? 6 : 8);
  const seqLen = len - prefix.length;

  let max = 0;
  const re = new RegExp('^' + prefix + '(\\d{' + seqLen + '})$');
  for (const u of users) {
    if (!u || !u.employeeId) continue;
    const m = (u.employeeId || '').match(re);
    if (m) max = Math.max(max, parseInt(m[1], 10) || 0);
  }
  return prefix + String(max + 1).padStart(seqLen, '0');
}

module.exports = { generateEmployeeId };
