// cloudfunctions/store/index.js —— M3 库房（纯业务，只引用 helpers）
const { getOpenid } = require('./helpers/user');
const db = require('./helpers/db');
const ok = (data) => ({ code: 0, data });
const fail = (message, code = 1) => ({ code, message });
const now = () => new Date();

// 库房注册（M3.1）
async function register(payload) {
  const openid = getOpenid();
  const me = await db.getCurrentUser(openid);
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

// 入库记录查询
async function records(payload) {
  const { storeId, toolId } = payload;
  const where = {};
  if (storeId) where.storeId = storeId;
  if (toolId) where.toolId = toolId;
  const res = await db.listBy('inbound_records', where, 50);
  return ok(res.data || []);
}

// 批量入库（api.batchInbound(ids) 调用）
async function batchInbound(payload) {
  const { ids = [], storeName = '' } = payload;
  if (!ids.length) return fail('请选择器具');
  const tools = await db.listByIds('tools', ids);
  const openid = getOpenid();
  const me = await db.getCurrentUser(openid);
  const docs = (tools.data || []).map((t) => ({
    toolId: t._id, toolName: t.name, code: t.code,
    storeName: storeName || t.store || '', orgId: (me && me.orgId) || '', operator: openid, ts: now(),
  }));
  for (const d of docs) await db.add('inbound_records', d);
  return ok({ count: docs.length });
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
