// cloudfunctions/check/index.js —— M10 监督检查隐患（纯业务，只引用 helpers）
const { getOpenid } = require('./helpers/user');
const db = require('./helpers/db');
const ok = (data) => ({ code: 0, data });
const fail = (message, code = 1) => ({ code, message });
const now = () => new Date();

// 服务端角色鉴权（S1）
async function requireRole(...roles) {
  const u = await db.getCurrentUser(getOpenid());
  if (!u || u.status === 'disabled') return { err: fail('账号不可用', 403) };
  if (!roles.includes(u.role)) return { err: fail('无操作权限', 403) };
  return { u };
}

// 检查任务（M10.1）
async function tasks() {
  const openid = getOpenid();
  const res = await db.listBy('inspections', { assignee: openid }, 50);
  return ok(res.data || []);
}

// 现场检查提交（M10.2）
async function submit(payload) {
  const { id, result = {}, remark = '' } = payload;
  const r = await db.getById('inspections', id);
  if (!r.data) return fail('检查任务不存在', 404);
  await db.update('inspections', id, { status: 'submitted', result, remark, submittedAt: now() });
  return ok({ id, status: 'submitted' });
}

// 隐患列表（M10 跟踪/闭环）
async function listHazard(payload = {}) {
  const { status, reporter } = payload;
  const where = {};
  if (status) where.status = status;
  if (reporter) where.reporter = reporter;
  const res = await db.listBy('hazards', where, 50);
  return ok(res.data || []);
}

// 隐患上报（M10.3）
async function reportHazard(payload) {
  const openid = getOpenid();
  const doc = { ...payload, reporter: openid, status: 'open', createdAt: now() };
  const added = await db.add('hazards', doc);
  return ok({ _id: added._id, ...doc });
}

// 隐患指派（M10.4）
async function assignHazard(payload) {
  const g = await requireRole('project_lead', 'supervisor', 'lead');
  if (g.err) return g.err;
  const { id, assignee = '', dueDate = '' } = payload;
  const r = await db.getById('hazards', id);
  if (!r.data) return fail('隐患不存在', 404);
  await db.update('hazards', id, { status: 'assigned', assignee, dueDate });
  return ok({ id, status: 'assigned' });
}

// 整改跟踪（M10.5）
async function trackHazard(payload) {
  const { id, progressNote = '', evidence = [] } = payload;
  const r = await db.getById('hazards', id);
  if (!r.data) return fail('隐患不存在', 404);
  const logs = (r.data.trackLogs || []).concat({ progressNote, evidence, ts: now() });
  await db.update('hazards', id, { trackLogs: logs });
  return ok({ id, trackLogs: logs });
}

// 闭环关闭（M10.6）
async function closeHazard(payload) {
  const g = await requireRole('supervisor', 'lead');
  if (g.err) return g.err;
  const { id, verifyNote = '' } = payload;
  const r = await db.getById('hazards', id);
  if (!r.data) return fail('隐患不存在', 404);
  await db.update('hazards', id, { status: 'closed', closedAt: now(), verifyNote });
  return ok({ id, status: 'closed' });
}

// 考核评比列表（M10 考核）
async function assessList(payload = {}) {
  const { orgId } = payload;
  const where = orgId ? { orgId } : {};
  const res = await db.listBy('assessments', where, 50);
  return ok(res.data || []);
}

// 提交考核评分（M10 考核）
async function assess(payload) {
  const openid = getOpenid();
  const { targetId, targetName, score, dimension, note = '' } = payload;
  if (!targetId || score == null) return fail('缺少考核对象或分数');
  const s = Number(score);
  if (isNaN(s) || s < 0 || s > 100) return fail('分数需为 0~100');
  const doc = {
    targetId, targetName: targetName || '', score: s,
    dimension: dimension || '综合', note, assessor: openid, createdAt: now(),
  };
  const added = await db.add('assessments', doc);
  return ok({ _id: added._id, ...doc });
}

exports.main = async (event) => {
  const { action, payload = {} } = event;
  try {
    switch (action) {
      case 'tasks': return tasks(payload);
      case 'submit': return submit(payload);
      case 'reportHazard': return reportHazard(payload);
      case 'listHazard': return listHazard(payload);
      case 'assignHazard': return assignHazard(payload);
      case 'trackHazard': return trackHazard(payload);
      case 'closeHazard': return closeHazard(payload);
      case 'assessList': return assessList(payload);
      case 'assess': return assess(payload);
      default: return fail('未知 action: ' + action);
    }
  } catch (e) {
    return fail(e.message || '服务异常');
  }
};
