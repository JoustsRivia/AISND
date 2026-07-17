// cloudfunctions/system/index.js —— M13 系统管理（组织/权限/字典/日志，纯业务，只引用 helpers）
const { getOpenid } = require('./helpers/user');
const db = require('./helpers/db');
const ok = (data) => ({ code: 0, data });
const fail = (message, code = 1) => ({ code, message });
const now = () => new Date();

// 组织架构树（返回扁平列表，前端组装树）
// 首次为空时自动播种默认组织（总包/分包企业 → 项目部 → 班组），实现自愈。
async function seedOrgs() {
  const t0 = now();
  const u1 = await db.addOrg({ name: '总包企业', parentId: '', level: 0, kind: 'unit', createdAt: t0 });
  const u2 = await db.addOrg({ name: '分包企业', parentId: '', level: 0, kind: 'unit', createdAt: t0 });
  const p1 = await db.addOrg({ name: '第一项目部', parentId: u1._id, level: 1, kind: 'project', createdAt: t0 });
  const p2 = await db.addOrg({ name: '第二项目部', parentId: u1._id, level: 1, kind: 'project', createdAt: t0 });
  const p3 = await db.addOrg({ name: '第三项目部', parentId: u2._id, level: 1, kind: 'project', createdAt: t0 });
  await db.addOrg({ name: '一班', parentId: p1._id, level: 2, kind: 'team', createdAt: t0 });
  await db.addOrg({ name: '二班', parentId: p1._id, level: 2, kind: 'team', createdAt: t0 });
  await db.addOrg({ name: '三班', parentId: p2._id, level: 2, kind: 'team', createdAt: t0 });
  await db.addOrg({ name: '四班', parentId: p3._id, level: 2, kind: 'team', createdAt: t0 });
}

async function orgTree() {
  let res = await db.listBy('orgs', {}, 200);
  if (!res.data || !res.data.length) {
    await seedOrgs();
    res = await db.listBy('orgs', {}, 200);
  }
  return ok(res.data || []);
}

// 服务端角色鉴权（S1）：仅专班负责人/安监部可管理用户，且禁止自建/分配越权角色
const ROLE_WHITE = ['worker', 'group_lead', 'safety_officer', 'lease_admin', 'project_lead'];
async function requireAdmin() {
  const u = await db.getCurrentUser(getOpenid());
  if (!u || u.status === 'disabled') return { err: fail('账号不可用', 403) };
  if (u.role !== 'lead' && u.role !== 'supervisor') return { err: fail('仅专班负责人/安监部可管理用户', 403) };
  return { u };
}

// 用户管理：add / update / disable
async function user(payload) {
  const g = await requireAdmin();
  if (g.err) return g.err;
  const { op = 'add', id, data = {} } = payload;
  if (op === 'add') {
    if (data.role === 'lead' || data.role === 'supervisor') return fail('不允许自建专班/安监角色', 403);
    if (data.role && !ROLE_WHITE.includes(data.role)) return fail('角色不合法', 403);
    const a = await db.add('users', { ...data, createdAt: now() });
    return ok({ _id: a._id });
  }
  if (op === 'update') {
    if (data.role && !ROLE_WHITE.includes(data.role)) return fail('不允许分配该角色', 403);
    await db.update('users', id, data);
    return ok({ id });
  }
  if (op === 'disable') {
    await db.update('users', id, { disabled: true });
    return ok({ id });
  }
  return fail('未知 op: ' + op);
}

// 字典：按 type 查询；可选 upsert
async function dict(payload) {
  const { type, data } = payload;
  if (type) {
    const res = await db.listBy('dicts', { type }, 100);
    return ok(res.data || []);
  }
  if (data) {
    const a = await db.add('dicts', { ...data, createdAt: now() });
    return ok({ _id: a._id });
  }
  return fail('缺少 type 或 data');
}

// 检查表模板管理：list / add
async function checkTemplate(payload) {
  const { op = 'list', data } = payload;
  if (op === 'list') {
    const res = await db.listBy('check_templates', {}, 50);
    return ok(res.data || []);
  }
  if (op === 'add') {
    const a = await db.add('check_templates', { ...data, createdAt: now() });
    return ok({ _id: a._id });
  }
  return fail('未知 op: ' + op);
}

// 操作日志上报
async function log(payload) {
  const openid = getOpenid();
  const a = await db.add('operation_logs', { operator: openid, ...payload, ts: now() });
  return ok({ _id: a._id });
}

// M13.3 操作日志查询（按时间倒序）
async function listLog(payload = {}) {
  const { limit = 50, type = '' } = payload;
  const where = {};
  if (type) where.type = type;
  const res = await db.collection('operation_logs').where(where).orderBy('ts', 'desc').limit(limit).get();
  return ok(res.data || []);
}

exports.main = async (event) => {
  const { action, payload = {} } = event;
  try {
    switch (action) {
      case 'orgTree': return orgTree(payload);
      case 'user': return user(payload);
      case 'dict': return dict(payload);
      case 'checkTemplate': return checkTemplate(payload);
      case 'log': return log(payload);
      case 'listLog': return listLog(payload);
      default: return fail('未知 action: ' + action);
    }
  } catch (e) {
    return fail(e.message || '服务异常');
  }
};
