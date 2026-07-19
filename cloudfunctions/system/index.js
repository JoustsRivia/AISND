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
const ACTION_RATE = {
  default: { window: 60 * 1000, max: 30 },
  import: { window: 60 * 1000, max: 200 }, // 批量导入/建档
  batch: { window: 60 * 1000, max: 300 },  // 批量入库/生成
};
const BATCH_ACTIONS = ['importTools', 'batchInbound', 'batchGen', 'batchImport'];
function rateLimitFor(action) {
  if (BATCH_ACTIONS.includes(action)) return ACTION_RATE.batch;
  if (action && ACTION_RATE[action]) return ACTION_RATE[action];
  return ACTION_RATE.default;
}

// 与 cloudfunctions/auth/index.js 同源的密码哈希（sha1 + 'tms_' 盐），保证账号在两处校验一致。
const crypto = require('crypto');
function hashPwd(p) { return p ? crypto.createHash('sha1').update('tms_' + p).digest('hex') : ''; }

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
  return ok(res.data || []);
}

// ── 组织架构管理（op: add | update | delete | seed）───────────────────
// 服务端角色鉴权（S1）：**仅小程序管理员(admin)可管理用户与组织**。
// admin 为最高数据管理权限；专班负责人(lead)/项目部负责人(project_lead)/安监部(supervisor)
// 属业务管理角色，不再具备系统管理员权限，禁止进入系统管理后台。
// 可分配角色：业务角色 + 小程序管理员(admin)。admin 由现有管理员在后台指派，
// 普通用户注册自绑定白名单（cloudfunctions/auth SELF_BINDABLE_ROLES）不包含 admin，杜绝越权自建。
const ROLE_WHITE = ['worker', 'group_lead', 'safety_officer', 'lease_admin', 'project_lead', 'lead', 'supervisor', 'admin'];
async function requireAdmin() {
  const u = await db.getCurrentUser(getOpenid());
  if (!u || u.status === 'disabled') return { err: fail('账号不可用', 403) };
  if (u.role !== 'admin') return { err: fail('仅小程序管理员(admin)可管理组织与用户', 403) };
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
  await db.ensureCollection('users');

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
// 创建/绑定当前微信身份为「小程序管理员(admin)」，拥有小程序全部数据管理权限（最高权限）。
// 幂等保护：若已存在 admin，则拒绝重复播种。
// ★ 安全：凭证仅由后端持有。优先读取环境变量（部署时可覆盖，避免口令进入源码/小程序包），
//   缺省回退到内置默认值，保证未配置环境时行为不变。前端不再硬编码任何口令。
const SEED_USERNAME = process.env.SEED_ADMIN_USERNAME || 'Jousts';
const SEED_PASSWORD = process.env.SEED_ADMIN_PASSWORD || 'qwer1234';
// 是否落回内置默认凭证：仅当两项环境变量均未配置时为真（用于安全告警，不触发任何行为变更）
const USING_DEFAULT_CREDS = !process.env.SEED_ADMIN_USERNAME && !process.env.SEED_ADMIN_PASSWORD;
async function seedAdmin(payload = {}) {
  const openid = getOpenid();
  const username = (payload.username || SEED_USERNAME).trim();
  const password = payload.password || SEED_PASSWORD;
  // 安全可观测性：使用内置默认凭证时输出告警，提示运维在部署环境配置强口令，
  // 但保留回退值以避免「未配置环境变量即无法播种/空口令锁死」的可用性事故。
  if (USING_DEFAULT_CREDS && !payload.password) {
    console.warn('[system.seedAdmin] 正在使用内置默认管理员凭证（SEED_ADMIN_USERNAME / SEED_ADMIN_PASSWORD 均未配置）。'
      + '生产部署前请于云函数环境变量设置强口令，避免默认口令留存源码。');
  }
  await db.ensureCollection('users');
  // 已存在任一管理员(admin)则拒绝
  const admins = await db.listBy('users', {}, 200);
  const hasAdmin = admins.data && admins.data.some((u) => u.role === 'admin');
  if (hasAdmin) return fail('管理员账号已存在，请直接使用账号登录', 409);
  const me = await db.getCurrentUser(openid);
  const doc = {
    username,
    nickname: username,
    password: hashPwd(password),
    role: 'admin',
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
  // 凭证一次性回传前端展示（前端不留存、不硬编码），便于管理员首次登录后妥善保存
  return ok({ username, password, role: 'admin' });
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
  const rate = rateLimitFor(action);
  const rec = Date.now() - rate.window;
  const recent = (await db.collection('operation_logs').where({ operator: openid, action, ts: _.gt(rec) }).get()).data || [];
  if (recent.length >= rate.max) return fail('操作过于频繁，请稍后再试', 429);
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
  return ok({ policy: merged });
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
      case 'user': return userManage(payload);
      case 'seedAdmin': return seedAdmin(payload);
      case 'dict': return dict(payload);
      case 'checkTemplate': return checkTemplate(payload);
      case 'log': return log(payload);
      case 'listLog': return listLog(payload);
      case 'retention': return retention(payload);
      case 'cleanupLogs': return cleanupLogs(payload, !!ev.triggerName);
      default: return fail('未知 action: ' + action);
    }
  } catch (e) {
    return fail(e.message || '服务异常');
  }
};
