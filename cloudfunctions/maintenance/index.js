// cloudfunctions/maintenance/index.js —— M7 维保报修（纯业务，只引用 helpers）
const { getOpenid } = require('./helpers/user');
const { MGMT, UNIT_MGMT } = require('./helpers/roles');

const { createRateLimiter } = require('./helpers/rateLimiter');
const __limiter = createRateLimiter({ getOpenid });const db = require('./helpers/db');
// RBAC 数据范围原语（来自 _shared/dbBase.js 单一源，迁移零改动）
const { scopeFilter, listOrgs } = db;
const ok = (data) => ({ code: 0, data });
const fail = (message, code = 1) => ({ code, message });
const now = () => new Date();

// 服务端角色鉴权（S1）：仅管理族（MGMT）+ 管理员可审批与变更台账状态
const ROLE_APPROVE = [...MGMT, 'admin'];
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

// 审批报修（M7.3）—— 含状态机前序锁定（D10）
async function approve(payload) {
  const g = await requireApprover();
  if (g.err) return g.err;
  const { id, approve = true, remark = '' } = payload;
  const r = await db.getById('repair_records', id);
  if (!r.data) return fail('报修单不存在', 404);
  // D10：前序状态锁定——仅 pending 不可直接被审批
  if (r.data.status !== 'pending') {
    return fail(`当前状态「${r.data.status}」不可审批，仅待审批(pending)的报修单可操作`, 409);
  }
  const operatorName = g.u ? `${g.u.username || g.u.nickname || ''}${g.u.employeeId ? '（'+g.u.employeeId+'）' : ''}` : '';
  await db.update('repair_records', id, {
    status: approve ? 'approved' : 'rejected',
    approveRemark: remark,
    approver: g.u.openid,
    approverName: operatorName,
    approvedAt: now(),
  });
  return ok({ id, status: approve ? 'approved' : 'rejected' });
}

// 维修登记（M7.4）—— 含状态机前序锁定（D10）
async function record(payload) {
  const g = await requireApprover();
  if (g.err) return g.err;
  const { id, repairDetail = '', cost = 0, parts = [] } = payload;
  const r = await db.getById('repair_records', id);
  if (!r.data) return fail('报修单不存在', 404);
  // D10：仅 approved 状态可登记维修
  if (r.data.status !== 'approved') {
    return fail(`当前状态「${r.data.status}」不可登记维修，仅已审批(approved)的报修单可操作`, 409);
  }
  const operatorName = g.u ? `${g.u.username || g.u.nickname || ''}${g.u.employeeId ? '（'+g.u.employeeId+'）' : ''}` : '';
  await db.update('repair_records', id, {
    status: 'repaired', repairDetail, cost, parts,
    repairOperator: g.u.openid,
    repairOperatorName: operatorName,
    repairedAt: now(),
  });
  return ok({ id, status: 'repaired' });
}

// 报修/维修列表（item 1：RBAC 按组织子树收窄）
// 问题 #7：默认排除已归档记录（显式传 status 可查）；并富化器具来源信息供列表展示
async function list(payload = {}) {
  const { toolId, status } = payload;
  const where = {};
  if (toolId) where.toolId = toolId;
  if (status) where.status = status;
  else where.status = db._.neq('archived'); // 默认不显示归档记录
  Object.assign(where, await scopeOf(payload));
  const res = await db.listBy('repair_records', where, 50);
  const list = res.data || [];
  // 富化器具信息（工具不存在或已删时置 '—'，字段只增不改，兼容旧调用方）
  const enriched = await Promise.all(list.map(async (it) => {
    if (!it.toolId) return it;
    const t = await db.getById('tools', it.toolId).catch(() => null);
    const tool = t && t.data;
    return {
      ...it,
      toolName: (tool && tool.name) || '—',
      toolCode: (tool && tool.code) || '—',
      category: (tool && tool.category) || '',
      source: (tool && tool.source) || '',
      leaseUnit: (tool && tool.leaseUnit) || '',
    };
  }));
  return ok(enriched);
}

// 归档报修记录（问题 #7）：管理族可归档；归档后列表默认隐藏（显式传 status 可查）
async function archive(payload) {
  const g = await requireApprover();
  if (g.err) return g.err;
  const { id } = payload;
  const r = await db.getById('repair_records', id);
  if (!r.data) return fail('报修单不存在', 404);
  if (r.data.status === 'archived') return fail('该记录已归档', 409);
  if (r.data.status === 'pending') return fail('待审批报修不可归档，请先审批或删除', 409);
  await db.update('repair_records', id, { status: 'archived', archivedAt: now(), archivedBy: g.u.openid });
  return ok({ id, status: 'archived' });
}

// 删除报修记录（问题 #7）：管理族可删，仅限未流转状态（pending/rejected），防审计断裂
async function remove(payload) {
  const g = await requireApprover();
  if (g.err) return g.err;
  const { id } = payload;
  const r = await db.getById('repair_records', id);
  if (!r.data) return fail('报修单不存在', 404);
  if (!['pending', 'rejected'].includes(r.data.status)) {
    return fail(`仅待审批/已驳回的报修单可删除，当前状态「${r.data.status}」不可删（防审计断裂）`, 409);
  }
  // 删除报修单：若报修时已把器具置为维修中，回滚为合格（仅当器具当前仍是 maintaining，避免覆盖其他路径状态）
  if (r.data.toolId) {
    try {
      const t = await db.getById('tools', r.data.toolId);
      if (t.data && t.data.status === 'maintaining') {
        await db.updateTool(r.data.toolId, { status: 'qualified' });
      }
    } catch (e) {
      console.error('[maint] remove updateTool failed', e);
    }
  }
  await db.remove('repair_records', id);
  return ok({ id, deleted: true });
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

// 复检（M7.5）：合格则器具回到 qualified —— 含状态机前序锁定（D10）
async function recheck(payload) {
  const g = await requireApprover();
  if (g.err) return g.err;
  const { id, pass = true } = payload;
  const r = await db.getById('repair_records', id);
  if (!r.data) return fail('报修单不存在', 404);
  // D10：仅 repaired 状态可复检
  if (r.data.status !== 'repaired') {
    return fail(`当前状态「${r.data.status}」不可复检，仅已维修(repaired)的报修单可操作`, 409);
  }
  const status = pass ? 'done' : 'repaired';
  const operatorName = g.u ? `${g.u.username || g.u.nickname || ''}${g.u.employeeId ? '（'+g.u.employeeId+'）' : ''}` : '';
  await db.update('repair_records', id, {
    status, recheckAt: now(),
    recheckOperator: g.u.openid,
    recheckOperatorName: operatorName,
  });
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

exports.main = __limiter.wrap(async (event) => {
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
      case 'archive': return archive(payload);
      case 'delete': return remove(payload);
      default: return fail('未知 action: ' + action);
    }
  } catch (e) {
    return fail(e.message || '服务异常');
  }
}, 'maintenance');
