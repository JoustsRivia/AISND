// cloudfunctions/system/index.js —— M13 系统管理（组织/权限/字典/日志，纯业务，只引用 helpers）
const { getOpenid } = require('./helpers/user');
const db = require('./helpers/db');
const ok = (data) => ({ code: 0, data });
const fail = (message, code = 1) => ({ code, message });
const now = () => new Date();

// 与 cloudfunctions/auth/index.js 同源的密码哈希（sha1 + 'tms_' 盐），保证账号在两处校验一致。
const crypto = require('crypto');
function hashPwd(p) { return p ? crypto.createHash('sha1').update('tms_' + p).digest('hex') : ''; }

// ── 默认组织架构（单位→项目部→班组）────────────────────────────────────
// 组织节点字段：{ _id, name, parentId, level, kind }
//   kind: 'unit'(所属单位/总分包企业) | 'project'(项目部) | 'team'(机构/班组)
// 首次 orgTree 为空时自愈播种；也支持管理员在「恢复默认组织架构」中重新播种。
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

// ── 组织架构管理（op: add | update | delete | seed）───────────────────
// 服务端角色鉴权（S1）：仅专班负责人/安监部可管理组织，且禁止自建/分配越权角色
const ROLE_WHITE = ['worker', 'group_lead', 'safety_officer', 'lease_admin', 'project_lead'];
async function requireAdmin() {
  const u = await db.getCurrentUser(getOpenid());
  if (!u || u.status === 'disabled') return { err: fail('账号不可用', 403) };
  if (u.role !== 'lead' && u.role !== 'supervisor') return { err: fail('仅专班负责人/安监部可管理用户', 403) };
  return { u };
}

// 计算新增/修改节点的 level：根节点(level 0) 或 父节点 level+1
async function resolveLevel(parentId) {
  if (!parentId) return 0;
  const p = await db.getById('orgs', parentId);
  return (p && p.data) ? (p.data.level + 1) : 0;
}

async function orgManage(payload) {
  const g = await requireAdmin();
  if (g.err) return g.err;
  const { op = 'add', id, data = {} } = payload;

  if (op === 'seed') {
    // 仅当组织架构为空时允许恢复默认，避免覆盖既有数据
    const cur = await db.listBy('orgs', {}, 1);
    if (cur.data && cur.data.length) return fail('组织架构已存在，无需恢复默认', 409);
    await seedOrgs();
    return ok({ seeded: true });
  }

  if (op === 'add') {
    if (!data.name) return fail('请填写组织名称', 400);
    const level = await resolveLevel(data.parentId || '');
    const a = await db.addOrg({
      name: data.name,
      parentId: data.parentId || '',
      level,
      kind: data.kind || (level === 0 ? 'unit' : level === 1 ? 'project' : 'team'),
      createdAt: now(),
    });
    return ok({ _id: a._id });
  }

  if (op === 'update') {
    if (!id) return fail('缺少组织 id', 400);
    if (!data.name) return fail('请填写组织名称', 400);
    const level = await resolveLevel(data.parentId || '');
    await db.update('orgs', id, {
      name: data.name,
      parentId: data.parentId || '',
      level,
      kind: data.kind || (level === 0 ? 'unit' : level === 1 ? 'project' : 'team'),
      updatedAt: now(),
    });
    return ok({ id });
  }

  if (op === 'delete') {
    if (!id) return fail('缺少组织 id', 400);
    // 保护：存在下级组织时禁止删除，需先清理下级，避免产生孤儿节点
    const child = await db.listBy('orgs', { parentId: id }, 1);
    if (child.data && child.data.length) return fail('请先删除该组织下的下级节点', 409);
    // 同时把归属该组织的用户置为未分配，避免登录页/数据范围出现脏引用
    await db.collection('users').where({ orgId: id }).update({ data: { orgId: '', unitId: '' } });
    await db.removeOrg(id);
    return ok({ id });
  }

  return fail('未知 op: ' + op);
}

// ── 用户管理（op: list | add | update | delete）──────────────────────
// 登录信息字段：username / password / nickname / role / unitId / orgId / status
async function userManage(payload) {
  const g = await requireAdmin();
  if (g.err) return g.err;
  const { op = 'list', id, data = {} } = payload;

  if (op === 'list') {
    const res = await db.listBy('users', {}, 200);
    return ok(res.data || []);
  }

  if (op === 'add') {
    if (!data.username) return fail('请填写用户名', 400);
    if (!data.password) return fail('请填写密码', 400);
    if (data.role && !ROLE_WHITE.includes(data.role)) return fail('角色不合法', 403);
    // 用户名唯一性
    const dup = await db.listBy('users', { username: data.username }, 1);
    if (dup.data && dup.data.length) return fail('用户名已存在', 409);
    const a = await db.add('users', {
      openid: '',                 // 由管理员预建，首次微信登录时绑定当前身份
      username: data.username,
      nickname: data.nickname || data.username,
      password: hashPwd(data.password),
      role: data.role || 'worker',
      unitId: data.unitId || '',
      orgId: data.orgId || '',
      bound: true,
      status: 'active',
      createdAt: now(),
    });
    return ok({ _id: a._id });
  }

  if (op === 'update') {
    if (!id) return fail('缺少用户 id', 400);
    const patch = {};
    if (data.username !== undefined) {
      if (!data.username) return fail('用户名不可为空', 400);
      const dup = await db.listBy('users', { username: data.username }, 50);
      if (dup.data && dup.data.some((x) => String(x._id) !== String(id))) return fail('用户名已存在', 409);
      patch.username = data.username;
    }
    if (data.nickname !== undefined) patch.nickname = data.nickname;
    if (data.password) patch.password = hashPwd(data.password); // 仅非空时更新密码
    if (data.role !== undefined) {
      if (data.role && !ROLE_WHITE.includes(data.role)) return fail('不允许分配该角色', 403);
      patch.role = data.role;
    }
    if (data.unitId !== undefined) patch.unitId = data.unitId;
    if (data.orgId !== undefined) patch.orgId = data.orgId;
    if (data.status !== undefined) patch.status = data.status; // active | disabled
    patch.updatedAt = now();
    await db.update('users', id, patch);
    return ok({ id });
  }

  if (op === 'delete') {
    if (!id) return fail('缺少用户 id', 400);
    await db.remove('users', id);
    return ok({ id });
  }

  return fail('未知 op: ' + op);
}

// ── 种子管理员账号（仅需首次，无需已登录）─────────────────────────────
// 创建/绑定当前微信身份为「安监部管理人员(supervisor)」，账号 Jousts / qwer1234。
// 幂等保护：若已存在 lead/supervisor，则拒绝重复播种，防止越权覆盖。
const SEED_USERNAME = 'Jousts';
const SEED_PASSWORD = 'qwer1234';
async function seedAdmin(payload = {}) {
  const openid = getOpenid();
  const username = (payload.username || SEED_USERNAME).trim();
  const password = payload.password || SEED_PASSWORD;
  // 已存在任一管理员则拒绝
  const admins = await db.listBy('users', {}, 200);
  const hasAdmin = admins.data && admins.data.some((u) => u.role === 'lead' || u.role === 'supervisor');
  if (hasAdmin) return fail('管理员账号已存在，请直接使用账号登录', 409);
  const me = await db.getCurrentUser(openid);
  const doc = {
    username,
    nickname: username,
    password: hashPwd(password),
    role: 'supervisor',
    unitId: '',
    orgId: '',
    bound: true,
    status: 'active',
    updatedAt: now(),
  };
  if (me) {
    await db.update('users', me._id, { ...doc, openid });
  } else {
    await db.add('users', { ...doc, openid, createdAt: now() });
  }
  return ok({ username, role: 'supervisor' });
}

// ── 字典：按 type 查询；可选 upsert ───────────────────────────────────
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

// ── 检查表模板管理：list / add ───────────────────────────────────────
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

// ── 操作日志上报 ──────────────────────────────────────────────────────
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
      case 'org': return orgManage(payload);
      case 'user': return userManage(payload);
      case 'seedAdmin': return seedAdmin(payload);
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
