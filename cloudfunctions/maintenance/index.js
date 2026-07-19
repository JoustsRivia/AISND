// cloudfunctions/maintenance/index.js —— M7 维保报修（纯业务，只引用 helpers）
const { getOpenid } = require('./helpers/user');
const db = require('./helpers/db');
// RBAC 数据范围原语（来自 _shared/dbBase.js 单一源，迁移零改动）
const { scopeFilter, listOrgs } = db;
const ok = (data) => ({ code: 0, data });
const fail = (message, code = 1) => ({ code, message });
const now = () => new Date();

// 服务端角色鉴权（S1）：仅工作专班负责人/项目部负责人/专职安全员/安监部/管理员可审批与变更台账状态
const ROLE_APPROVE = ['lead', 'project_lead', 'safety_officer', 'supervisor', 'admin'];
async function requireApprover() {
  const openid = getOpenid();
  if (!openid) return { err: fail('未登录', 401) };
  const u = await db.getCurrentUser(openid);
  if (!u || u.status === 'disabled') return { err: fail('账号不可用', 403) };
  if (!ROLE_APPROVE.includes(u.role)) return { err: fail('仅专班负责人/项目部负责人/安全员/管理员可操作', 403) };
  return { u };
}

// 当前用户的组织子树（item 1：列表按组织范围收窄用）
async function scopeOf(payload = {}) {
  const me = await db.getCurrentUser(getOpenid());
  const orgs = (await listOrgs(500)).data || [];
  return scopeFilter(me, orgs, { orgId: payload.orgId || undefined, unitId: payload.unitId });
}

// 保养计划（M7.1）
async function create(payload) {
  const openid = getOpenid();
  const me = await db.getCurrentUser(openid);
  // 服务端归属：计划归属当前用户组织（防越权挂靠）
  const doc = { ...payload, type: 'plan', status: 'planned', creator: openid, orgId: (me && me.orgId) || '', createdAt: now() };
  const added = await db.add('maintenance_records', doc);
  return ok({ _id: added._id, ...doc });
}

// 故障报修（M7.2）
async function report(payload) {
  const openid = getOpenid();
  const me = await db.getCurrentUser(openid);
  // 服务端归属：报修单归属当前用户组织（防越权挂靠，并支撑列表按组织范围收窄）
  const doc = { ...payload, status: 'pending', reporter: openid, orgId: (me && me.orgId) || '', createdAt: now() };
  const added = await db.add('repair_records', doc);
  if (payload.toolId) {
    try {
      await db.updateTool(payload.toolId, { status: 'maintaining' });
    } catch (e) {
      // 状态同步失败不得静默吞掉：记录日志并向上抛出，由 main 的 catch 转成 fail 返回，
      // 避免「报修单已建、器具状态未变」的不一致。
      console.error('[maint] report updateTool failed', e);
      throw e;
    }
  }
  return ok({ _id: added._id, ...doc });
}

// 审批报修（M7.3）
async function approve(payload) {
  const g = await requireApprover();
  if (g.err) return g.err;
  const { id, approve = true, remark = '' } = payload;
  const r = await db.getById('repair_records', id);
  if (!r.data) return fail('报修单不存在', 404);
  await db.update('repair_records', id, { status: approve ? 'approved' : 'rejected', approveRemark: remark });
  return ok({ id, status: approve ? 'approved' : 'rejected' });
}

// 维修登记（M7.4）
async function record(payload) {
  const g = await requireApprover();
  if (g.err) return g.err;
  const { id, repairDetail = '', cost = 0, parts = [] } = payload;
  const r = await db.getById('repair_records', id);
  if (!r.data) return fail('报修单不存在', 404);
  await db.update('repair_records', id, { status: 'repaired', repairDetail, cost, parts });
  return ok({ id, status: 'repaired' });
}

// 报修/维修列表（item 1：RBAC 按组织子树收窄）
async function list(payload = {}) {
  const { toolId, status } = payload;
  const where = {};
  if (toolId) where.toolId = toolId;
  if (status) where.status = status;
  Object.assign(where, await scopeOf(payload));
  const res = await db.listBy('repair_records', where, 50);
  return ok(res.data || []);
}

// 保养计划列表（M7.1，item 1：RBAC 按组织子树收窄）
async function listPlan(payload = {}) {
  const { status } = payload;
  const where = { type: 'plan' };
  if (status) where.status = status;
  Object.assign(where, await scopeOf(payload));
  const res = await db.listBy('maintenance_records', where, 100);
  return ok(res.data || []);
}

// 保养执行登记（M7.1.2）
async function execPlan(payload = {}) {
  const g = await requireApprover();
  if (g.err) return g.err;
  const { id, detail = '' } = payload;
  const r = await db.getById('maintenance_records', id);
  if (!r.data) return fail('计划不存在', 404);
  await db.update('maintenance_records', id, { status: 'done', execAt: now(), execDetail: detail });
  return ok({ id, status: 'done' });
}

// 复检（M7.5）：合格则器具回到 qualified
async function recheck(payload) {
  const g = await requireApprover();
  if (g.err) return g.err;
  const { id, pass = true } = payload;
  const r = await db.getById('repair_records', id);
  if (!r.data) return fail('报修单不存在', 404);
  const status = pass ? 'done' : 'repaired';
  await db.update('repair_records', id, { status, recheckAt: now() });
  // 状态回写失败不得静默吞掉：记录日志并向上抛出，避免台账与器具状态不一致
  if (pass && r.data.toolId) {
    try {
      await db.updateTool(r.data.toolId, { status: 'qualified' });
    } catch (e) {
      console.error('[maint] recheck updateTool failed', e);
      throw e;
    }
  }
  return ok({ id, status });
}

exports.main = async (event) => {
  const { action, payload = {} } = event;
  try {
    switch (action) {
      case 'create': return create(payload);
      case 'report': return report(payload);
      case 'list': return list(payload);
      case 'listPlan': return listPlan(payload);
      case 'execPlan': return execPlan(payload);
      case 'approve': return approve(payload);
      case 'record': return record(payload);
      case 'recheck': return recheck(payload);
      default: return fail('未知 action: ' + action);
    }
  } catch (e) {
    return fail(e.message || '服务异常');
  }
};
