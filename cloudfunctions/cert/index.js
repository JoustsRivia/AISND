// cloudfunctions/cert/index.js —— M9.2 持证管理（纯业务，只引用 helpers）
// 证书数据由特种设备机具领用人自行维护（前端 pkg-cert 录入）。
const { getOpenid } = require('./helpers/user');
const db = require('./helpers/db');
const ok = (data) => ({ code: 0, data });
const fail = (message, code = 1) => ({ code, message });
const now = () => new Date();

// 证书类型 → 可领用器具类别（与 borrow SPECIAL 对应；'all' 覆盖全部特种类别）
const CERT_TO_CATEGORY = {
  welder: 'motor', hoist: 'lifting', height: 'height', electric: 'motor', pressure: 'lease', other: 'all',
};

// 服务端角色鉴权：仅小程序管理员(admin)可查看/管理全部证书
async function requireAdmin() {
  const u = await db.getCurrentUser(getOpenid());
  if (!u) return { err: fail('未登录', 401) };
  if (u.role !== 'admin') return { err: fail('无权限', 403) };
  return { u };
}

// 列表：RBAC 数据范围统一收窄（item 1）—— 全局角色看全量、单位看整单位子树、
// 机构/班组看本机构子树，越权下钻被忽略；写库已带服务端 orgId 防止挂靠。
async function list(payload = {}) {
  const { type, status, orgId } = payload;
  const filter = {};
  if (type) filter.type = type;
  if (status) filter.status = status;
  const res = await db.scopedList('certificates', filter, { orgId, size: 100 });
  return ok(res.data || []);
}

// 我的证书（首页/领用校验用）
async function myCerts() {
  const res = await db.listBy('certificates', { openid: getOpenid() }, 50);
  return ok(res.data || []);
}

// 新增 / 编辑
async function upsert(payload = {}) {
  const openid = getOpenid();
  const me = await db.getCurrentUser(openid);
  const { id, type, name, no, expireAt, issuer, photos = [] } = payload;
  const valid = expireAt && new Date(expireAt).getTime() > Date.now();
  const doc = {
    openid, orgId: (me && me.orgId) || '', type, name, no, expireAt, issuer, photos,
    category: CERT_TO_CATEGORY[type] || '',
    status: valid ? 'valid' : 'expired', updatedAt: now(),
  };
  if (id) {
    await db.update('certificates', id, doc);
    return ok({ _id: id, ...doc });
  }
  const added = await db.add('certificates', { ...doc, createdAt: now() });
  return ok({ _id: added._id, ...doc });
}

// 删除
async function remove(payload = {}) {
  const { id } = payload;
  if (!id) return fail('缺少证书ID', 400);
  const me = await db.getCurrentUser(getOpenid());
  const r = await db.getById('certificates', id);
  if (!r.data) return fail('证书不存在', 404);
  // 仅本人或管理员可删
  if (r.data.openid !== getOpenid() && !(me && me.role === 'admin')) {
    return fail('无权限删除', 403);
  }
  await db.update('certificates', id, { status: 'deleted', deletedAt: now() });
  return ok({ id });
}

// 持证校验：openid 是否持有 category 对应有效证件
async function check(payload = {}) {
  const { openid, category } = payload;
  const res = await db.listBy('certificates', { openid, status: 'valid' }, 20);
  const valid = (res.data || []).filter((c) => new Date(c.expireAt).getTime() > Date.now());
  // 持证校验：证书 category 命中器具类别，或证书覆盖 'all'
  const has = valid.some((c) => !category || c.category === 'all' || c.category === category);
  return ok({ openid, category, has, certs: valid });
}

exports.main = async (event) => {
  const { action, payload = {} } = event;
  try {
    switch (action) {
      case 'list': return list(payload);
      case 'myCerts': return myCerts();
      case 'upsert': return upsert(payload);
      case 'remove': return remove(payload);
      case 'check': return check(payload);
      default: return fail('未知 action: ' + action);
    }
  } catch (e) {
    return fail(e.message || '服务异常');
  }
};
