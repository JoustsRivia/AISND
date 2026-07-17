// cloudfunctions/borrow/index.js
// 业务逻辑层（M5 领用归还 P0）：只引用 ./helpers，绝不直接 cloud.database()/getWXContext()。
const { getOpenid } = require('./helpers/user');
const { findTool, updateTool, findUser, addBorrow, listBorrow, listBy } = require('./helpers/db');

const ok = (data) => ({ code: 0, data });
const fail = (message, code = 1) => ({ code, message });

// 需持证的器具类别
const SPECIAL = ['lifting', 'height', 'motor', 'lease'];

// 校验领用人是否持有效证件（特种设备）
async function hasValidCert(openid, category) {
  if (!SPECIAL.includes(category)) return true;
  const now = Date.now();
  const res = await listBy('certificates', { openid, status: 'valid' }, 20);
  return (res.data || []).some((c) => new Date(c.expireAt).getTime() > now);
}

// 领用（M5.1.1~M5.1.3）
async function borrow(payload) {
  const openid = getOpenid();
  const { id } = payload;
  const res = await findTool(id);
  if (!res.data) return fail('器具不存在', 404);
  const t = res.data;

  // 资格校验：合格且在有效期内
  if (t.status !== 'qualified') return fail('器具不合格，禁止领用');
  if (t.expireAt && new Date(t.expireAt) <= new Date()) return fail('器具已超期，禁止领用');
  if (!(await hasValidCert(openid, t.category))) return fail('缺少有效特种作业证件，禁止领用');

  // 状态流转 + 操作记录
  const op = { type: 'borrow', ts: new Date(), by: openid, note: '领用即确认"谁领用、谁保管、谁负责"' };
  const patch = {
    status: 'in_use', borrower: openid,
    operations: [...(t.operations || []), op],
    updatedAt: new Date(),
  };
  await updateTool(id, patch);
  await addBorrow({ toolId: id, code: t.code, name: t.name, type: 'borrow', by: openid, ts: new Date() });
  return ok({ _id: id, status: 'in_use' });
}

// 归还（M5.2.1~M5.2.3）
async function returnTool(payload) {
  const openid = getOpenid();
  const { id, appearance } = payload; // appearance: normal / damaged
  const res = await findTool(id);
  if (!res.data) return fail('器具不存在', 404);
  const t = res.data;

  const damaged = appearance === 'damaged';
  const op = { type: 'return', ts: new Date(), by: openid, appearance };
  const patch = {
    status: damaged ? 'maintaining' : 'qualified', // 损坏 → 触发报修
    borrower: '',
    operations: [...(t.operations || []), op],
    updatedAt: new Date(),
  };
  if (damaged) patch.note = '归还外观损坏，已转入维修';
  await updateTool(id, patch);
  await addBorrow({ toolId: id, code: t.code, name: t.name, type: 'return', by: openid, appearance, ts: new Date() });
  return ok({ _id: id, status: patch.status, damaged });
}

// 领用/归还记录（M5.1.4 / M5.2.3）
async function records(payload = {}) {
  const { openid, orgId, type } = payload;
  const where = {};
  if (openid) where.by = openid;
  if (type) where.type = type;
  const res = await listBorrow(where, 50);
  return ok(res.data || []);
}

exports.main = async (event) => {
  const { action, payload = {} } = event;
  try {
    switch (action) {
      case 'borrow': return borrow(payload);
      case 'return': return returnTool(payload);
      case 'records': return records(payload);
      default: return fail('未知 action: ' + action);
    }
  } catch (e) { return fail(e.message || '服务异常'); }
};
