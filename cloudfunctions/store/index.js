// cloudfunctions/store/index.js —— M3 库房（纯业务，只引用 helpers）
const { getOpenid } = require('./helpers/user');
const { MGMT, UNIT_MGMT } = require('./helpers/roles');

const { createRateLimiter } = require('./helpers/rateLimiter');
const __limiter = createRateLimiter({ getOpenid });const db = require('./helpers/db');
// RBAC 数据范围原语（来自 _shared/dbBase.js 单一源，迁移零改动）
const { scopeFilter, listOrgs } = db;
const ok = (data) => ({ code: 0, data });
const fail = (message, code = 1) => ({ code, message });
const now = () => new Date();

// 库房注册（M3.1）
// 优化#16（架构页挂库房）：默认 orgId 取服务端当前用户归属（防越权挂靠）；
// 组织架构页管理员可显式传 orgId，但须在本人可编辑范围内（admin 放行）
async function register(payload) {
  if (!payload || !payload.name) return fail('请填写库房名称', 400);
  const openid = getOpenid();
  const me = await db.getCurrentUser(openid);
  if (!me || me.status === 'disabled') return fail('账号不可用', 403);
  let orgId = (me && me.orgId) || '';
  if (payload.orgId) {
    const orgs = (await listOrgs(500)).data || [];
    const allowed = db.allowedOrgIds(me, orgs, {});
    const inScope = me.role === 'admin' || allowed === null
      || allowed.includes('__unbound__') || allowed.includes(payload.orgId);
    if (!inScope) return fail('无权在该组织下注册库房', 403);
    orgId = payload.orgId;
  }
  const doc = { ...payload, orgId, keeperOpenid: openid, status: 'active', createdAt: now() };
  const added = await db.add('stores', doc);
  return ok({ _id: added._id, ...doc });
}

// 库房编辑（优化#16）：管理员或库房创建者可改 名称/分区/保管人；orgId 不可改（挂靠变更走删除重建）
async function update(payload = {}) {
  const { id } = payload;
  if (!id) return fail('缺少库房ID', 400);
  const s = await db.getById('stores', id);
  if (!s.data) return fail('库房不存在', 404);
  const openid = getOpenid();
  const me = await db.getCurrentUser(openid);
  if (!me || me.status === 'disabled') return fail('账号不可用', 403);
  const isAdmin = me.role === 'admin' || MGMT.includes(me.role);
  if (!isAdmin && s.data.keeperOpenid !== openid) return fail('仅管理员或库房创建者可编辑', 403);
  const patch = {};
  if (payload.name !== undefined && payload.name !== '') patch.name = payload.name;
  if (payload.zone !== undefined) patch.zone = payload.zone;
  if (payload.keeper !== undefined) patch.keeper = payload.keeper;
  if (!Object.keys(patch).length) return fail('无更新内容', 400);
  await db.update('stores', id, { ...patch, updatedAt: now() });
  return ok({ id });
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

// 库房列表（R14：供器具录入页选择存放库房）—— 按当前用户组织范围过滤
async function list(payload = {}) {
  const openid = getOpenid();
  const me = await db.getCurrentUser(openid);
  const orgs = (await listOrgs(500)).data || [];
  const where = {};
  Object.assign(where, scopeFilter(me, orgs, { orgId: payload.orgId || undefined }));
  const res = await db.listBy('stores', where, 200);
  return ok(res.data || []);
}

// 库房删除（D7）：仅库房管理员/系统管理员可删除；如库房下仍有器具则不可删除
async function del(payload = {}) {
  const { id } = payload;
  if (!id) return fail('缺少库房ID', 400);
  const openid = getOpenid();
  const me = await db.getCurrentUser(openid);
  if (!me || me.status === 'disabled') return fail('账号不可用', 403);
  const isAdmin = me.role === 'admin' || MGMT.includes(me.role);
  const s = await db.getById('stores', id);
  if (!s.data) return fail('库房不存在', 404);
  if (!isAdmin && s.data.keeperOpenid !== openid) return fail('仅管理员或库房创建者可删除', 403);
  // 检查库房下是否有器具
  const tools = await db.listBy('tools', { store: s.data.name }, 1);
  if (tools.data && tools.data.length) return fail('该库房下仍有器具，请先转移或处理', 409);
  await db.remove('stores', id);
  return ok({ id });
}

exports.main = __limiter.wrap(async (event) => {
  const { action, payload = {} } = event;
  try {
    switch (action) {
      case 'register': return register(payload);
      case 'update': return update(payload);
      case 'inbound': return inbound(payload);
      case 'records': return records(payload);
      case 'batchInbound': return batchInbound(payload);
      case 'list': return list(payload);
      case 'delete': return del(payload);
      default: return fail('未知 action: ' + action);
    }
  } catch (e) {
    return fail(e.message || '服务异常');
  }
}, 'store');
