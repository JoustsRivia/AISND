// cloudfunctions/store/index.js —— M3 库房（纯业务，只引用 helpers）
const { getOpenid } = require('./helpers/user');
const db = require('./helpers/db');
// RBAC 数据范围原语（来自 _shared/dbBase.js 单一源，迁移零改动）
const { scopeFilter, listOrgs } = db;
const ok = (data) => ({ code: 0, data });
const fail = (message, code = 1) => ({ code, message });
const now = () => new Date();

// 库房注册（M3.1）
async function register(payload) {
  if (!payload || !payload.name) return fail('请填写库房名称', 400);
  const openid = getOpenid();
  const me = await db.getCurrentUser(openid);
  // orgId 一律以服务端当前用户归属为准，忽略前端传入，防止越权挂靠他组织（任务9）
  const doc = { ...payload, orgId: (me && me.orgId) || '', keeperOpenid: openid, status: 'active', createdAt: now() };
  const added = await db.add('stores', doc);
  return ok({ _id: added._id, ...doc });
}

// 入库登记（M3.3）
async function inbound(payload) {
  const openid = getOpenid();
  const me = await db.getCurrentUser(openid);
  const doc = { ...payload, orgId: (me && me.orgId) || '', operator: openid, ts: now() };
  const added = await db.add('inbound_records', doc);
  if (payload.toolId) {
    await db.updateTool(payload.toolId, { status: 'qualified', store: payload.storeName || '' }).catch(() => {});
  }
  return ok({ _id: added._id, ...doc });
}

// 入库记录查询（按组织范围过滤 + 分页，任务5）
async function records(payload = {}) {
  const { storeId, toolId, page = 0, size = 50 } = payload;
  const openid = getOpenid();
  const me = await db.getCurrentUser(openid);
  const where = {};
  if (storeId) where.storeId = storeId;
  if (toolId) where.toolId = toolId;
  // RBAC 数据范围（item 1）：复用 _shared/dbBase.js 单一源 scopeFilter 按组织子树收窄，
  // 杜绝单位/机构级角色看到越权数据；全局角色看全量、单位角色看整单位子树、机构/班组看本机构子树。
  const orgs = (await listOrgs(500)).data || [];
  Object.assign(where, scopeFilter(me, orgs, { orgId: payload.orgId || undefined, unitId: payload.unitId }));
  const skip = page * size;
  const res = await db.listBy('inbound_records', where, size, skip);
  return ok(res.data || []);
}

// 把数组按每批 n 个切分
function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

// 批量入库（api.batchInbound(ids) 调用）。ids>50 时分批，避免云开发单次 limit 截断（任务4）
async function batchInbound(payload) {
  const { ids = [], storeName = '' } = payload;
  if (!Array.isArray(ids) || !ids.length) return fail('请选择器具');
  const openid = getOpenid();
  const me = await db.getCurrentUser(openid);
  const orgId = (me && me.orgId) || '';
  let total = 0;
  for (const idsChunk of chunk(ids, 50)) {
    const tools = await db.listByIds('tools', idsChunk); // listByIds 内部 limit=50，整批 ≤50 不截断
    const docs = (tools.data || []).map((t) => ({
      toolId: t._id, toolName: t.name, code: t.code,
      storeName: storeName || t.store || '', orgId, operator: openid, ts: now(),
    }));
    for (const d of docs) await db.add('inbound_records', d);
    total += docs.length;
  }
  return ok({ count: total });
}

exports.main = async (event) => {
  const { action, payload = {} } = event;
  try {
    switch (action) {
      case 'register': return register(payload);
      case 'inbound': return inbound(payload);
      case 'records': return records(payload);
      case 'batchInbound': return batchInbound(payload);
      default: return fail('未知 action: ' + action);
    }
  } catch (e) {
    return fail(e.message || '服务异常');
  }
};
