// cloudfunctions/purchase/index.js —— M2 采购验收（纯业务，只引用 helpers）
const { getOpenid } = require('./helpers/user');
const db = require('./helpers/db');
// RBAC 数据范围原语（来自 _shared/dbBase.js 单一源，迁移零改动）
const { scopeFilter, listOrgs } = db;
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
// 服务端必填校验，缺失直接 fail（任务6）
async function create(payload) {
  const openid = getOpenid();
  const me = await db.getCurrentUser(openid);
  const name = (payload && payload.name) || '';
  const qty = payload && payload.qty;
  if (!name) return fail('请填写器具名称', 400);
  if (qty === undefined || qty === null || Number(qty) <= 0) return fail('请填写有效数量', 400);
  if (!me || !me.orgId) return fail('当前账号未归属组织，无法发起采购', 400);
  // orgId 以服务端当前用户归属为准，杜绝客户端越权挂靠
  const doc = { ...payload, status: 'pending', applicant: openid, orgId: me.orgId, createdAt: now() };
  const added = await db.add('purchases', doc);
  return ok({ _id: added._id, ...doc });
}

// 审批（S1：项目部负责人/安全员/专班）
async function approve(payload) {
  const g = await requireRole('project_lead', 'safety_officer', 'lead');
  if (g.err) return g.err;
  // 兼容 api 透传的 pass；同时保留旧的 approve 字段（前端驳回传 pass=false）
  const { id, pass, approve: approveArg, remark = '' } = payload;
  const approve = pass !== undefined ? !!pass : (approveArg !== undefined ? !!approveArg : true);
  const r = await db.getById('purchases', id);
  if (!r.data) return fail('采购单不存在', 404);
  await db.update('purchases', id, {
    status: approve ? 'approved' : 'rejected',
    approveRemark: remark, approvedAt: now(),
  });
  return ok({ id, status: approve ? 'approved' : 'rejected' });
}

// 采购单列表（审批/台账用，支持分页；item 1：RBAC 按组织子树收窄）
async function list(payload = {}) {
  const { status, applicant, page = 0, size = 50 } = payload;
  const openid = getOpenid();
  const me = await db.getCurrentUser(openid);
  const where = {};
  if (status) where.status = status;
  if (applicant) where.applicant = applicant;
  // RBAC 数据范围（item 1）：复用 _shared/dbBase.js 单一源 scopeFilter 按组织子树收窄，
  // 杜绝单位/机构级角色看到越权采购数据；全局角色看全量、单位角色看整单位子树。
  const orgs = (await listOrgs(500)).data || [];
  Object.assign(where, scopeFilter(me, orgs, { orgId: payload.orgId || undefined, unitId: payload.unitId }));
  const skip = page * size;
  const res = await db.listBy('purchases', where, size, skip);
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
    // 验收建档：把采购物资派生写入 tools 台账，打通「采购→台账」闭环（任务1）
    const pu = r.data;
    const openid = getOpenid();
    const me = await db.getCurrentUser(openid);
    const items = (result && Array.isArray(result.items) && result.items.length) ? result.items : null;
    const base = {
      category: pu.category || '',
      name: pu.name || '',
      spec: pu.spec || '',
      orgId: pu.orgId || (me && me.orgId) || '',
      status: 'qualified',
      source: 'purchase',
      purchaseId,
    };
    let toolDocs;
    if (items) {
      toolDocs = items.map((it, i) => ({
        ...base,
        category: it.category || base.category,
        code: it.code || (pu.code ? pu.code + '-' + (i + 1) : 'P-' + purchaseId + '-' + (i + 1)),
        name: it.name || base.name,
        spec: it.spec || base.spec,
        orgId: it.orgId || base.orgId,
        store: '',
      }));
    } else {
      // 无显式条目时，按采购数量 qty 派生多条物资
      const qty = Number(pu.qty) || 1;
      toolDocs = [];
      for (let i = 0; i < qty; i++) {
        toolDocs.push({
          ...base,
          code: pu.code ? pu.code + '-' + (i + 1) : 'P-' + purchaseId + '-' + (i + 1),
          store: '',
        });
      }
    }
    // 先写台账：任一写入失败则抛错，main 的 try/catch 会返回 fail，
    // 且下方更新采购状态不会执行，避免「部分写入却静默成功」（任务7）
    for (const d of toolDocs) {
      await db.add('tools', d);
    }
    await db.update('purchases', purchaseId, { status: 'accepted', acceptedAt: now(), toolCount: toolDocs.length });
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
