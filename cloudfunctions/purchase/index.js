// cloudfunctions/purchase/index.js —— M2 采购验收（纯业务，只引用 helpers）
const { getOpenid } = require('./helpers/user');
const db = require('./helpers/db');
const ok = (data) => ({ code: 0, data });
const fail = (message, code = 1) => ({ code, message });
const now = () => new Date();

// 服务端角色鉴权（S1）：项目部负责人/安全员/专班可审批采购
async function requireRole(...roles) {
  const u = await db.getCurrentUser(getOpenid());
  if (!u || u.status === 'disabled') return { err: fail('账号不可用', 403) };
  if (!roles.includes(u.role)) return { err: fail('无操作权限', 403) };
  return { u };
}

// 采购申请：pending -> approved -> accepted
async function create(payload) {
  const openid = getOpenid();
  const doc = { ...payload, status: 'pending', applicant: openid, createdAt: now() };
  const added = await db.add('purchases', doc);
  return ok({ _id: added._id, ...doc });
}

// 审批（S1：项目部负责人/安全员/专班）
async function approve(payload) {
  const g = await requireRole('project_lead', 'safety_officer', 'lead');
  if (g.err) return g.err;
  const { id, approve = true, remark = '' } = payload;
  const r = await db.getById('purchases', id);
  if (!r.data) return fail('采购单不存在', 404);
  await db.update('purchases', id, {
    status: approve ? 'approved' : 'rejected',
    approveRemark: remark, approvedAt: now(),
  });
  return ok({ id, status: approve ? 'approved' : 'rejected' });
}

// 采购单列表（审批/台账用）
async function list(payload = {}) {
  const { status, applicant } = payload;
  const where = {};
  if (status) where.status = status;
  if (applicant) where.applicant = applicant;
  const res = await db.listBy('purchases', where, 50);
  return ok(res.data || []);
}

// 三步验收：arrive(到货登记) -> unpack(开箱检验) -> archive(入库建档)
async function accept(payload) {
  const { purchaseId, step, result = {}, inspector = '' } = payload;
  const r = await db.getById('purchases', purchaseId);
  if (!r.data) return fail('采购单不存在', 404);
  const doc = { purchaseId, step, result, inspector, createdAt: now() };
  const added = await db.add('acceptances', doc);
  if (step === 'archive') {
    await db.update('purchases', purchaseId, { status: 'accepted', acceptedAt: now() });
  }
  return ok({ _id: added._id, ...doc });
}

exports.main = async (event) => {
  const { action, payload = {} } = event;
  try {
    switch (action) {
      case 'create': return create(payload);
      case 'list': return list(payload);
      case 'approve': return approve(payload);
      case 'accept': return accept(payload);
      default: return fail('未知 action: ' + action);
    }
  } catch (e) {
    return fail(e.message || '服务异常');
  }
};
