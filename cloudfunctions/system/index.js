// cloudfunctions/system/index.js —— M13 系统管理（组织/权限/字典/日志，纯业务，只引用 helpers）
const { getOpenid } = require('./helpers/user');
const db = require('./helpers/db');
const _ = db._; // 查询命令（_shared/dbBase 透出的 command，cleanupLogs 用 _.lt）
const ok = (data) => ({ code: 0, data });
const fail = (message, code = 1) => ({ code, message });
const now = () => new Date();

// ── 日志留存策略（item 5：后台可配置）────────────────────────────────────
// 默认留存天数（按日志类型分类型合规留存），可被 system_config / dicts 中的策略覆盖。
const DEFAULT_RETENTION_DAYS = 180;
const DEFAULT_RETENTION = { user: 365, scrap: 365, purchase: 365, store: 365, cert: 730 };
// 60s 内存缓存，避免每条日志都回查配置（配置变更时主动失效）
let __retentionCache = null;
function clearRetentionCache() { __retentionCache = null; }
async function getRetentionPolicy({ useCache = true } = {}) {
  if (useCache && __retentionCache && Date.now() - __retentionCache.ts < 60000) return __retentionCache.value;
  const r = await db.listBy('dicts', { type: 'retention', key: 'policy' }, 1);
  const item = r.data && r.data[0];
  const value = (item && item.data) || DEFAULT_RETENTION;
  __retentionCache = { value, ts: Date.now() };
  return value;
}

// ── 日志写入限流（item 3：按 action 分级）────────────────────────────────
// 同一 operator + 同 action 在窗口内超阈值则拒绝（429）。
// 默认档 60s/30 防刷；管理端批量操作（白名单）使用更高阈值，避免正常批量管理（导入/批量入库）被误伤。
// 默认限流档（item 4：可被 dicts type=rate_limit/key=policy 后台覆盖）
const DEFAULT_RATE = {
  default: { window: 60 * 1000, max: 30 },   // 普通动作防刷
  import: { window: 60 * 1000, max: 200 },   // 批量导入/建档
  batch: { window: 60 * 1000, max: 300 },    // 批量入库/生成
};
const BATCH_ACTIONS = ['importTools', 'batchInbound', 'batchGen', 'batchImport'];
// 60s 内存缓存，避免每条日志都回查配置（配置变更时主动失效）
let __rateCache = null;
function clearRateCache() { __rateCache = null; }
async function getRatePolicy({ useCache = true } = {}) {
  if (useCache && __rateCache && Date.now() - __rateCache.ts < 60000) return __rateCache.value;
  const r = await db.listBy('dicts', { type: 'rate_limit', key: 'policy' }, 1);
  const item = r.data && r.data[0];
  const value = (item && item.data) || DEFAULT_RATE;
  __rateCache = { value, ts: Date.now() };
  return value;
}
// 限流策略配置驱动（item 4）：优先后台配置，回退默认；批量白名单走更高阈值
async function rateLimitFor(action) {
  const policy = await getRatePolicy();
  if (BATCH_ACTIONS.includes(action)) return policy.batch || DEFAULT_RATE.batch;
  if (action && policy[action]) return policy[action];
  return policy.default || DEFAULT_RATE.default;
}

// 与 cloudfunctions/auth/index.js 同源的密码哈希（sha1 + 'tms_' 盐），保证账号在两处校验一致。
const crypto = require('crypto');
function hashPwd(p) { return p ? crypto.createHash('sha1').update('tms_' + p).digest('hex') : ''; }

// ── R02 按组织树级别生成工号 ──────────────────────────────────────────
// 规则：单位级(level 0) → 4 位(0001)；项目部级(level 1) → 6 位(260001，前两位为单位序号)；
// 班组级(level 2) → 8 位(26010001，前两位单位序号 + 中两位项目部序号)。
// 工号在组织树内唯一，注册时自动分配。
async function generateEmployeeId(orgId, orgs) {
  const list = orgs || ((await db.listBy('orgs', {}, 500)).data || []);
  const byId = {};
  list.forEach((o) => { byId[o._id] = o; });

  const node = byId[orgId];
  if (!node) return String(Date.now()).slice(-6);

  // 找到根单位(level 0) → 单位序号
  let unit = node;
  while (unit.parentId && byId[unit.parentId]) unit = byId[unit.parentId];
  const unitList = list.filter((o) => o.level === 0 && !o.parentId);
  const unitIdx = Math.max(0, unitList.findIndex((o) => o._id === unit._id)) + 1;
  const unitSeq = String(unitIdx).padStart(2, '0');

  // 找到项目部(level 1) → 项目部序号
  let projIdx = 0;
  if (node.level >= 1) {
    let proj = node;
    while (proj && proj.level > 1) proj = byId[proj.parentId];
    if (proj) {
      const sibs = list.filter((o) => o.level === 1 && o.parentId === unit._id);
      projIdx = Math.max(0, sibs.findIndex((o) => o._id === proj._id)) + 1;
    }
  }
  const projSeq = String(projIdx).padStart(2, '0');

  // 基于前缀查同组织树已有工号，取最大流水号 +1，保证唯一
  let prefix;
  if (node.level === 0) prefix = '';
  else if (node.level === 1) prefix = unitSeq;
  else prefix = unitSeq + projSeq;

  const len = node.level === 0 ? 4 : (node.level === 1 ? 6 : 8);
  const seqLen = len - prefix.length;

  const allUsers = (await db.listBy('users', {}, 500)).data || [];
  let max = 0;
  const re = new RegExp('^' + prefix + '(\\d{' + seqLen + '})$');
  for (const u of allUsers) {
    if (!u.employeeId) continue;
    const m = (u.employeeId || '').match(re);
    if (m) max = Math.max(max, parseInt(m[1], 10) || 0);
  }
  const seq = String(max + 1).padStart(seqLen, '0');
  return prefix + seq;
}

// ── 默认组织架构（示例）─────────────────────────────────────────────────
// 组织节点字段：{ _id, name, parentId, level, kind }
//   kind: 'unit'(所属单位) | 'project'(项目部/工程部) | 'team'(机构/班组)
// 首次 orgTree 为空时自愈播种；也支持管理员在「恢复默认组织架构」中重新播种。
// 示例：单位[平台, 安装公司, 广安公司, 分包1, 分包2]；
//   安装公司→工程部、调试班(直属)；分包1→工程部→木工班、电工班。
async function seedOrgs() {
  const t0 = now();
  // 单位（level 0）
  const uPlatform = await db.addOrg({ name: '平台', parentId: '', level: 0, kind: 'unit', createdAt: t0 });
  const uAz = await db.addOrg({ name: '安装公司', parentId: '', level: 0, kind: 'unit', createdAt: t0 });
  const uGa = await db.addOrg({ name: '广安公司', parentId: '', level: 0, kind: 'unit', createdAt: t0 });
  const uSub1 = await db.addOrg({ name: '分包1', parentId: '', level: 0, kind: 'unit', createdAt: t0 });
  const uSub2 = await db.addOrg({ name: '分包2', parentId: '', level: 0, kind: 'unit', createdAt: t0 });
  // 安装公司 下级
  await db.addOrg({ name: '工程部', parentId: uAz._id, level: 1, kind: 'project', createdAt: t0 });
  await db.addOrg({ name: '调试班', parentId: uAz._id, level: 1, kind: 'team', createdAt: t0 }); // 安装公司直属调试班
  // 分包1 下级
  const p1 = await db.addOrg({ name: '工程部', parentId: uSub1._id, level: 1, kind: 'project', createdAt: t0 });
  await db.addOrg({ name: '木工班', parentId: p1._id, level: 2, kind: 'team', createdAt: t0 });
  await db.addOrg({ name: '电工班', parentId: p1._id, level: 2, kind: 'team', createdAt: t0 });
}

async function orgTree() {
  await db.ensureCollection('orgs');
  let res = await db.listBy('orgs', {}, 200);
  if (!res.data || !res.data.length) {
    await seedOrgs();
    res = await db.listBy('orgs', {}, 200);
  }
  // R06：返回当前版本号，供前端缓存比对
  let version = 0;
  try {
    const vr = await db.listBy('configs', { key: 'orgTreeVersion' }, 1);
    version = (vr.data && vr.data[0] && Number(vr.data[0].value)) || 0;
  } catch (_) {}
  return ok({ list: res.data || [], version });
}

// ── 组织架构管理（op: add | update | delete | seed）───────────────────
// R09：组织编辑权限按角色档位分发
//   admin → 全部组织树
//   lead（专班负责人） → 本公司(root)及下属所有项目部
//   project_lead（项目部负责人） → 本项目部的班组节点
//   supervisor（安监部管理人员） → 只读
const ROLE_WHITE = ['worker', 'group_lead', 'safety_officer', 'lease_admin', 'project_lead', 'lead', 'supervisor', 'admin'];

// R09：获取当前用户可编辑的 orgId 范围
// 返回 { canEdit: boolean, editableIds: string[] | null }
//   editableIds === null 表示全部可编辑（admin）；空数组表示只读/无权限
async function getOrgEditScope(u, orgs) {
  if (!u) return { canEdit: false, editableIds: [] };
  if (u.role === 'admin') return { canEdit: true, editableIds: null }; // 全部
  if (u.role === 'lead') {
    // 专班负责人：本单位子树全部
    const ids = u.orgId ? db.subtreeIds(orgs, u.orgId) : [];
    return { canEdit: true, editableIds: ids };
  }
  if (u.role === 'project_lead') {
    // 项目部负责人：仅本项目部的班组节点（子树）
    const ids = u.orgId ? db.subtreeIds(orgs, u.orgId) : [];
    return { canEdit: true, editableIds: ids };
  }
  // supervisor / 其他：只读
  return { canEdit: false, editableIds: [] };
}

// R09：校验当前用户是否可操作指定 orgId
async function canEditOrg(u, targetOrgId, orgs) {
  const scope = await getOrgEditScope(u, orgs);
  if (!scope.canEdit) return false;
  if (scope.editableIds === null) return true; // admin 全部
  return scope.editableIds.includes(targetOrgId);
}

async function requireAdmin() {
  const u = await db.getCurrentUser(getOpenid());
  if (!u || u.status === 'disabled') return { err: fail('账号不可用', 403) };
  if (u.role !== 'admin') return { err: fail('仅小程序管理员(admin)可管理组织与用户', 403) };
  return { u };
}

// R09：组织编辑权限守卫（admin/lead/project_lead 可编辑，supervisor 只读）
async function requireOrgEditor() {
  const u = await db.getCurrentUser(getOpenid());
  if (!u || u.status === 'disabled') return { err: fail('账号不可用', 403) };
  if (!['admin', 'lead', 'project_lead'].includes(u.role)) {
    return { err: fail('无组织编辑权限（仅管理员/专班/项目部负责人）', 403) };
  }
  return { u };
}

// 计算新增/修改节点的 level：根节点(level 0) 或 父节点 level+1
async function resolveLevel(parentId) {
  if (!parentId) return 0;
  const p = await db.getById('orgs', parentId);
  return (p && p.data) ? (p.data.level + 1) : 0;
}

async function orgManage(payload) {
  // R09：放宽为 admin/lead/project_lead 可编辑，supervisor 只读
  const g = await requireOrgEditor();
  if (g.err) return g.err;
  const u = g.u;
  const { op = 'add', id, data = {} } = payload;
  const orgs = (await db.listBy('orgs', {}, 500)).data || [];

  // R09：编辑/删除时校验目标 orgId 是否在当前用户可编辑范围内
  if ((op === 'update' || op === 'delete') && id) {
    const can = await canEditOrg(u, id, orgs);
    if (!can) return fail('无权操作该组织节点', 403);
  }
  // R09：新增时校验父节点是否在可编辑范围内（admin 除外）
  if (op === 'add' && data.parentId && u.role !== 'admin') {
    const can = await canEditOrg(u, data.parentId, orgs);
    if (!can) return fail('无权在该组织节点下新增', 403);
  }

  // R06：组织变更后递增 orgTreeVersion，驱动前端缓存失效
  const bumpOrgVersion = async () => {
    try {
      const r = await db.listBy('configs', { key: 'orgTreeVersion' }, 1);
      const cur = r.data && r.data[0];
      const next = (cur && Number(cur.value) || 0) + 1;
      if (cur) await db.update('configs', cur._id, { value: next, updatedAt: now() });
      else await db.add('configs', { key: 'orgTreeVersion', value: next, createdAt: now() });
    } catch (_) { /* 版本号更新失败不阻塞业务 */ }
  };

  if (op === 'seed') {
    // 仅当组织架构为空时允许恢复默认，避免覆盖既有数据
    const cur = await db.listBy('orgs', {}, 1);
    if (cur.data && cur.data.length) return fail('组织架构已存在，无需恢复默认', 409);
    await seedOrgs();
    await bumpOrgVersion();
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
    await bumpOrgVersion();
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
    await bumpOrgVersion();
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
    await bumpOrgVersion();
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
  await db.ensureCollection('users');

  if (op === 'list') {
    // R10：支持按组织/角色/关键字检索 + 分页
    const { orgId, role, keyword, page = 1, pageSize = 50 } = data;
    let list = (await db.listBy('users', {}, 500)).data || [];
    if (orgId) list = list.filter((u) => u.orgId === orgId);
    if (role) list = list.filter((u) => u.role === role);
    if (keyword) {
      const k = String(keyword).toLowerCase();
      list = list.filter((u) =>
        [u.username, u.nickname, u.employeeId].some((f) => f != null && String(f).toLowerCase().includes(k))
      );
    }
    const total = list.length;
    const skip = Math.max(0, (Number(page) - 1) * Number(pageSize));
    list = list.slice(skip, skip + Number(pageSize));
    return ok({ list, total, page: Number(page), pageSize: Number(pageSize) });
  }

  if (op === 'add') {
    if (!data.username) return fail('请填写用户名', 400);
    if (!data.password) return fail('请填写密码', 400);
    if (data.role && !ROLE_WHITE.includes(data.role)) return fail('角色不合法', 403);
    // 用户名唯一性
    const dup = await db.listBy('users', { username: data.username }, 1);
    if (dup.data && dup.data.length) return fail('用户名已存在', 409);
    // R02：自动生成组织树内唯一工号
    const orgs = (await db.listBy('orgs', {}, 500)).data || [];
    const employeeId = await generateEmployeeId(data.orgId || '', orgs);
    const a = await db.add('users', {
      openid: '',                 // 由管理员预建，首次微信登录时绑定当前身份
      username: data.username,
      nickname: data.nickname || data.username,
      password: hashPwd(data.password),
      role: data.role || 'worker',
      unitId: data.unitId || '',
      orgId: data.orgId || '',
      employeeId,                 // R02 工号
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

// ── 字典：增删改查（管理员）──────────────────────────────────────────
// 以 type + key 唯一标识一个字典项，写入 dicts 集合。
// 仅小程序管理员(admin)可维护字典，避免业务角色误改基础数据（S1 越权收口）。
async function dict(payload) {
  const g = await requireAdmin();
  if (g.err) return g.err;
  const { op, type, key, data } = payload;
  await db.ensureCollection('dicts');

  // 列表查询（默认）：按 type / key 过滤
  if (op === 'list' || (!op && !data)) {
    const where = {};
    if (type) where.type = type;
    if (key) where.key = key;
    const res = await db.listBy('dicts', where, 200);
    return ok(res.data || []);
  }
  // 新增
  if (op === 'create' || op === 'add') {
    if (!data || !data.type) return fail('字典项需指定 type', 400);
    if (!data.key) return fail('字典项需指定 key', 400);
    const a = await db.add('dicts', { ...data, createdAt: now() });
    return ok({ _id: a._id });
  }
  // 修改
  if (op === 'update') {
    if (!data || !data._id) return fail('缺少 _id', 400);
    const { _id, ...patch } = data;
    patch.updatedAt = now();
    await db.update('dicts', _id, patch);
    return ok({ _id });
  }
  // 删除
  if (op === 'remove') {
    if (!data || !data._id) return fail('缺少 _id', 400);
    await db.remove('dicts', data._id);
    return ok({ _id: data._id });
  }
  return fail('缺少 type / data 或未知 op');
}

// ── 检查表模板管理：list / add ───────────────────────────────────────
async function checkTemplate(payload) {
  const g = await requireAdmin();
  if (g.err) return g.err;
  const { op = 'list', data } = payload;
  await db.ensureCollection('check_templates');
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
  // 确保集合已存在（生产首写自愈；mock 下幂等无副作用），必须在限流查询前完成，
  // 否则真实环境首次写日志时集合尚未建立会使限流查询抛错。
  await db.ensureCollection('operation_logs');
  // 写入限流（item 3 防刷，按 action 分级）：同一 operator + 同 action 在窗口内超阈值则拒绝（429）。
  // 批量操作（白名单）更高阈值，避免正常批量管理被误伤。
  const action = payload.action || 'unknown';
  const rate = await rateLimitFor(action);
  const rec = Date.now() - rate.window;
  const recent = (await db.collection('operation_logs').where({ operator: openid, action, ts: _.gt(rec) }).get()).data || [];
  if (recent.length >= rate.max) {
    // 限流命中：记录一次拦截（审计/看板用；自身不计入限流窗口，避免递归）
    await db.add('operation_logs', {
      operator: openid, action: 'rate_limited', type: payload.type || 'unknown',
      target: payload.target || '', ts: now(), serverTime: now(), source: 'system',
    }).catch(() => {});
    return fail('操作过于频繁，请稍后再试', 429);
  }
  const t = now();
  // 合规留痕：
  //   - serverTime：服务端落点时刻；与客户端动作时刻 clientTime（api 富化）形成双时间戳，便于合规对账。
  //   - retainedUntil：合规留存到期日（item 5：配置驱动，回退默认 180 天），便于安监留痕周期清理 / 归档。
  //   - source：来源标记。其余字段（operator/operatorName/action/target/clientTime…）由调用方透传。
  const policy = await getRetentionPolicy();
  const retentionDays = policy[payload.type] || DEFAULT_RETENTION_DAYS;
  const a = await db.add('operation_logs', {
    operator: openid,
    ...payload,
    ts: t,
    serverTime: t,
    source: 'client',
    retainedUntil: new Date(t.getTime() + retentionDays * 24 * 3600 * 1000),
  });
  return ok({ _id: a._id });
}

// M13.3 操作日志查询（按时间倒序，支持组合筛选 + 服务端分页 + 字段级权限）
// 入参 payload：
//   limit        返回条数（默认 50，最大 200）
//   skip         偏移（分页用，默认 0）
//   type         类型精确匹配（borrow/scrap/purchase/store/user…）
//   operatorName 操作人署名精确匹配（由 api.logOperation 富化写入）
//   keyword      关键词模糊匹配（命中 action / target / operatorName / operator / type 任一）
//   startTime    时间区间起点（ts 毫秒），含
//   endTime      时间区间终点（ts 毫秒），含
//   scope        'all' | 'mine'：仅管理员可切换；非管理员强制 'mine'（仅见自身 → 字段级权限）
// 返回：{ list, total, hasMore }
async function listLog(payload = {}) {
  // 字段级权限（item 3）：任何已登录用户均可查看日志，但非管理员强制收窄为「仅自身」；
  // 管理员可切换 scope 查看「全部」或「仅我的」。
  const openid = getOpenid();
  const me = await db.getCurrentUser(openid);
  if (!me || me.status === 'disabled') return fail('账号不可用', 403);
  const {
    limit = 50, skip = 0, type = '', operatorName = '', keyword = '',
    startTime = 0, endTime = 0, scope = 'all',
  } = payload;
  await db.ensureCollection('operation_logs');
  const wantMine = scope === 'mine' || me.role !== 'admin';
  const where = {};
  if (wantMine) where.operator = openid;
  if (type) where.type = type;
  if (operatorName) where.operatorName = operatorName;
  // 在「服务端 where 结果」上做时间区间 + 关键词内存过滤（兼容「换掉 wx-server-sdk 即迁移」的任意后端）
  let rows = (await db.collection('operation_logs').where(where).orderBy('ts', 'desc').get()).data || [];
  if (startTime || endTime) {
    rows = rows.filter((r) => {
      const t = r.ts ? new Date(r.ts).getTime() : 0;
      if (startTime && t < startTime) return false;
      if (endTime && t > endTime) return false;
      return true;
    });
  }
  if (keyword) {
    const k = String(keyword).toLowerCase();
    rows = rows.filter((r) =>
      [r.action, r.target, r.operatorName, r.operator, r.type]
        .some((f) => f != null && String(f).toLowerCase().includes(k))
    );
  }
  const total = rows.length;
  const max = Math.min(Number(limit) || 50, 200);
  const off = Number(skip) || 0;
  let list = rows.slice(off, off + max);
  // 字段级脱敏（item 4）：非管理员不返回 operator（openid 私密字段），仅保留可读 operatorName
  if (wantMine) list = list.map(({ operator, ...rest }) => rest);
  return ok({ list, total, hasMore: off + max < total });
}

// M13.3 日志合规留存清理（item 3）：删除 retainedUntil 已到期的操作日志。
// 定时触发器（config.json logCleanup）每日凌晨调用，isTimer=true 时免管理员校验；
// 管理员亦可手动触发（api.cleanupLogs），此时走 requireAdmin 鉴权。
// 可选 before（ts 毫秒）：仅清理该时刻之前的到期记录，便于灰度 / 回溯。
async function cleanupLogs(payload = {}, isTimer = false) {
  if (!isTimer) {
    const g = await requireAdmin();
    if (g.err) return g.err;
  }
  const before = payload && payload.before ? new Date(Number(payload.before)) : new Date();
  const res = await db.collection('operation_logs').where({ retainedUntil: _.lt(before) }).remove();
  const removed = (res && res.stats && res.stats.removed) || 0;
  // 审计：手动清理操作留痕（定时器触发不重复记，避免噪声）
  if (!isTimer) {
    await db.ensureCollection('operation_logs').catch(() => {});
    await db.add('operation_logs', {
      operator: getOpenid(), action: 'cleanup_logs', target: 'operation_logs',
      type: 'system', ts: now(), serverTime: now(), source: 'admin',
      detail: JSON.stringify({ removed, before: before.toISOString() }),
    }).catch(() => {});
  }
  return ok({ removed, before: before.toISOString() });
}

// M13.3 日志留存策略（item 5：后台可配置）
//   op=get ：返回当前生效策略（合并默认），供管理后台展示
//   op=set ：仅管理员；更新策略并持久化到 dicts（type=retention, key=policy），立即失效缓存
async function retention(payload = {}) {
  const { op = 'get', policy } = payload;
  if (op === 'get') {
    const p = await getRetentionPolicy({ useCache: false });
    return ok({ policy: p, defaults: DEFAULT_RETENTION });
  }
  // set：仅管理员可改留存策略（S1 越权收口）
  const g = await requireAdmin();
  if (g.err) return g.err;
  if (!policy || typeof policy !== 'object' || Array.isArray(policy)) return fail('请提供留存策略对象', 400);
  for (const k of Object.keys(policy)) {
    if (!Number.isInteger(policy[k]) || policy[k] < 0) return fail('留存天数必须为非负整数', 400);
  }
  const merged = { ...DEFAULT_RETENTION, ...policy };
  await db.saveDict('retention', 'policy', merged);
  clearRetentionCache();
  // 审计：留存策略变更记入操作日志（配置—执行—留痕闭环，item 3）
  await db.ensureCollection('operation_logs').catch(() => {});
  await db.add('operation_logs', {
    operator: getOpenid(), action: 'retention_set', target: 'retention:policy',
    type: 'system', ts: now(), serverTime: now(), source: 'admin',
    detail: JSON.stringify(merged),
  }).catch(() => {});
  return ok({ policy: merged });
}

// M13.3 日志写入限流策略（item 4：后台可配置）
//   op=get ：返回当前生效策略（合并默认），供管理后台展示
//   op=set ：仅管理员；更新策略并持久化到 dicts（type=rate_limit, key=policy），立即失效缓存，并记入审计日志
async function rateLimit(payload = {}) {
  const { op = 'get', policy } = payload;
  if (op === 'get') {
    const p = await getRatePolicy({ useCache: false });
    return ok({ policy: p, defaults: DEFAULT_RATE });
  }
  const g = await requireAdmin();
  if (g.err) return g.err;
  if (!policy || typeof policy !== 'object' || Array.isArray(policy)) return fail('请提供限流策略对象', 400);
  for (const k of Object.keys(policy)) {
    const v = policy[k];
    if (!v || typeof v !== 'object' || !Number.isInteger(v.window) || !Number.isInteger(v.max) || v.window <= 0 || v.max <= 0) {
      return fail('限流策略每项需为 { window, max } 且为正整数', 400);
    }
  }
  const merged = { ...DEFAULT_RATE, ...policy };
  await db.saveDict('rate_limit', 'policy', merged);
  clearRateCache();
  // 审计：限流策略变更记入操作日志（配置—执行—留痕闭环）
  await db.add('operation_logs', {
    operator: getOpenid(), action: 'rate_limit_set', target: 'rate_limit:policy',
    type: 'system', ts: now(), serverTime: now(), source: 'admin',
    detail: JSON.stringify(merged),
  }).catch(() => {});
  return ok({ policy: merged });
}

// 限流看板统计（item 4）：当前策略 + 拦截次数 + 策略变更次数（仅管理员）
async function rateStats() {
  const g = await requireAdmin();
  if (g.err) return g.err;
  const [policy, denied, sets] = await Promise.all([
    getRatePolicy({ useCache: false }),
    db.collection('operation_logs').where({ action: 'rate_limited' }).count(),
    db.collection('operation_logs').where({ action: 'rate_limit_set' }).count(),
  ]);
  return ok({ policy, denied: (denied && denied.total) || 0, configChanges: (sets && sets.total) || 0 });
}

// R09：返回当前用户的组织编辑权限范围（供前端控制增删改按钮显隐）
async function orgPerm() {
  const u = await db.getCurrentUser(getOpenid());
  if (!u || u.status === 'disabled') return fail('账号不可用', 403);
  const orgs = (await db.listBy('orgs', {}, 500)).data || [];
  const scope = await getOrgEditScope(u, orgs);
  return ok({
    role: u.role,
    canEdit: scope.canEdit,
    canAdd: scope.canEdit,
    canDelete: scope.canEdit && u.role !== 'project_lead', // 项目部负责人不可删除
    editableIds: scope.editableIds, // null=全部可编辑，[]=只读
  });
}

exports.main = async (event) => {
  const ev = event || {};
  // 定时器触发时无 action，由 triggerName 路由（config.json 的 logCleanup → cleanupLogs）
  const action = ev.action || (ev.triggerName === 'logCleanup' ? 'cleanupLogs' : '');
  const { payload = {} } = ev;
  try {
    switch (action) {
      case 'orgTree': return orgTree(payload);
      case 'org': return orgManage(payload);
      case 'orgPerm': return orgPerm();
      case 'user': return userManage(payload);
      case 'dict': return dict(payload);
      case 'checkTemplate': return checkTemplate(payload);
      case 'log': return log(payload);
      case 'listLog': return listLog(payload);
      case 'retention': return retention(payload);
      case 'rateLimit': return rateLimit(payload);
      case 'rateStats': return rateStats();
      case 'cleanupLogs': return cleanupLogs(payload, !!ev.triggerName);
      default: return fail('未知 action: ' + action);
    }
  } catch (e) {
    return fail(e.message || '服务异常');
  }
};
