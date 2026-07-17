// cloudfunctions/maintenance/index.js —— M7 维保报修（纯业务，只引用 helpers）
const { getOpenid } = require('./helpers/user');
const db = require('./helpers/db');
const ok = (data) => ({ code: 0, data });
const fail = (message, code = 1) => ({ code, message });
const now = () => new Date();

// 保养计划（M7.1）
async function create(payload) {
  const openid = getOpenid();
  const doc = { ...payload, type: 'plan', status: 'planned', creator: openid, createdAt: now() };
  const added = await db.add('maintenance_records', doc);
  return ok({ _id: added._id, ...doc });
}

// 故障报修（M7.2）
async function report(payload) {
  const openid = getOpenid();
  const doc = { ...payload, status: 'pending', reporter: openid, createdAt: now() };
  const added = await db.add('repair_records', doc);
  if (payload.toolId) await db.updateTool(payload.toolId, { status: 'maintaining' }).catch(() => {});
  return ok({ _id: added._id, ...doc });
}

// 审批报修（M7.3）
async function approve(payload) {
  const { id, approve = true, remark = '' } = payload;
  const r = await db.getById('repair_records', id);
  if (!r.data) return fail('报修单不存在', 404);
  await db.update('repair_records', id, { status: approve ? 'approved' : 'rejected', approveRemark: remark });
  return ok({ id, status: approve ? 'approved' : 'rejected' });
}

// 维修登记（M7.4）
async function record(payload) {
  const { id, repairDetail = '', cost = 0, parts = [] } = payload;
  const r = await db.getById('repair_records', id);
  if (!r.data) return fail('报修单不存在', 404);
  await db.update('repair_records', id, { status: 'repaired', repairDetail, cost, parts });
  return ok({ id, status: 'repaired' });
}

// 报修/维修列表
async function list(payload = {}) {
  const { toolId, status } = payload;
  const where = {};
  if (toolId) where.toolId = toolId;
  if (status) where.status = status;
  const res = await db.listBy('repair_records', where, 50);
  return ok(res.data || []);
}

// 复检（M7.5）：合格则器具回到 qualified
async function recheck(payload) {
  const { id, pass = true } = payload;
  const r = await db.getById('repair_records', id);
  if (!r.data) return fail('报修单不存在', 404);
  const status = pass ? 'done' : 'repaired';
  await db.update('repair_records', id, { status, recheckAt: now() });
  if (pass && r.data.toolId) await db.updateTool(r.data.toolId, { status: 'qualified' }).catch(() => {});
  return ok({ id, status });
}

exports.main = async (event) => {
  const { action, payload = {} } = event;
  try {
    switch (action) {
      case 'create': return create(payload);
      case 'report': return report(payload);
      case 'list': return list(payload);
      case 'approve': return approve(payload);
      case 'record': return record(payload);
      case 'recheck': return recheck(payload);
      default: return fail('未知 action: ' + action);
    }
  } catch (e) {
    return fail(e.message || '服务异常');
  }
};
