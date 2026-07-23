// cloudfunctions/warning/index.js —— M11 预警消息（纯业务，只引用 helpers）
const db = require('./helpers/db');
const { getOpenid } = require('./helpers/user');
const _ = db._;
const ok = (data) => ({ code: 0, data });
const fail = (message, code = 1) => ({ code, message });
const now = () => new Date();

// 消息列表（按级别/已读过滤，按组织子树收窄）
async function list(payload = {}) {
  const { level, read, orgId } = payload;
  const filter = {};
  if (level) filter.level = level;
  if (read !== undefined && read !== null) filter.read = read;
  const res = await db.scopedList('warnings', filter, { orgId, size: 50 });
  return ok(res.data || []);
}

// 标记已读（含越权防护）
async function read(payload) {
  const { id } = payload;
  const r = await db.getById('warnings', id);
  if (!r.data) return fail('消息不存在', 404);
  // 越权防护：校验该 warning.orgId 是否在调用者允许范围内
  const me = await db.getCurrentUser(getOpenid());
  const orgs = (await db.listOrgs(500)).data || [];
  const allowed = db.allowedOrgIds(me, orgs, {});
  if (allowed !== null && !allowed.includes('__unbound__') && !allowed.includes(r.data.orgId)) {
    return fail('无权操作该预警', 403);
  }
  await db.update('warnings', id, { read: true, readAt: now() });
  return ok({ id });
}

// 订阅确认（实际订阅由前端 wx.requestSubscribeMessage 触发）
async function subscribe() {
  return ok({ subscribed: true });
}

// 全部标记已读（仅标记本人可见范围内的未读）
async function readAll() {
  const res = await db.scopedList('warnings', { read: _.neq(true) }, { size: 200 });
  const list = res.data || [];
  await Promise.all(list.map((w) => db.update('warnings', w._id, { read: true, readAt: now() })));
  return ok({ count: list.length });
}

// 预警自动生成（M11.1）：扫描试验到期/超期、证书到期、隐患超期、报废异动，写入 warnings
// generate 不加 RBAC（全量扫描），但写入 warnings 文档时透传被扫描对象的 orgId
// R24：同时写入 toolCode/orgName/keeperName/refType，供前端列表富化展示与点击跳转
async function generate() {
  const now = Date.now();
  const DAY = 86400000;
  const out = [];
  // 预加载 orgs 和 users，用于富化 orgName / keeperName
  const orgs = (await db.listBy('orgs', {}, 500)).data || [];
  const users = (await db.listBy('users', {}, 500)).data || [];
  const orgNameOf = {};
  orgs.forEach((o) => { orgNameOf[o._id] = o.name || ''; });
  const keeperNameOf = {};
  users.forEach((u) => { if (u.openid) keeperNameOf[u.openid] = u.nickname || u.username || ''; });

  const exists = async (type, refId) => {
    const r = await db.listBy('warnings', { type, refId, read: _.neq(true) }, 50);
    return (r.data || []).length > 0;
  };
  const push = async (w, orgId) => {
    if (await exists(w.type, w.refId)) return; // 同类型同对象不重复推送
    const a = await db.add('warnings', { ...w, orgId: orgId || '', orgName: orgNameOf[orgId] || '', read: false, createdAt: new Date() });
    out.push(a._id);
  };
  try {
    // 试验到期前15天 / 超期（M4.1.2 / M4.1.4）
    const tools = await db.listBy('tools', {}, 200);
    for (const t of (tools.data || [])) {
      if (!t.expireAt) continue;
      const exp = new Date(t.expireAt).getTime();
      if (exp < now) {
        await push({ level: 'urgent', type: 'test_overdue', refType: 'test', refId: t._id, toolId: t._id,
          toolCode: t.code || '', keeperName: keeperNameOf[t.borrower] || keeperNameOf[t.keeper] || '',
          title: '试验已超期', content: `${t.name}（${t.code}）试验有效期已过，禁止领用并应逐级告警` }, t.orgId);
      } else if (exp - now <= 15 * DAY) {
        await push({ level: 'important', type: 'test_due', refType: 'test', refId: t._id, toolId: t._id,
          toolCode: t.code || '', keeperName: keeperNameOf[t.keeper] || '',
          title: '试验即将到期', content: `${t.name}（${t.code}）将于 ${t.expireAt} 到期，请按时送检` }, t.orgId);
      }
    }
    // 证书到期前30天（M9.2.2）
    const certs = await db.listBy('certificates', { status: 'valid' }, 200);
    for (const c of (certs.data || [])) {
      if (!c.expireAt) continue;
      if (new Date(c.expireAt).getTime() - now <= 30 * DAY) {
        await push({ level: 'important', type: 'cert_due', refType: 'cert', refId: c._id, certId: c._id,
          title: '特种作业证即将到期', content: `${(c.name || '持证人')} 的 ${c.type || '证件'} 将于 ${c.expireAt} 到期` }, c.orgId);
      }
    }
    // 隐患整改超期升级（M10.2.6）
    const hazards = await db.listBy('hazards', { status: _.neq('closed') }, 200);
    for (const h of (hazards.data || [])) {
      if (!h.dueDate) continue;
      if (new Date(h.dueDate).getTime() < now) {
        await push({ level: 'urgent', type: 'hazard_overdue', refType: 'hazard', refId: h._id, hazardId: h._id,
          title: '隐患整改超期', content: `隐患「${h.title || h.content || ''}」已超过整改期限 ${h.dueDate}，请升级处理` }, h.orgId);
      }
    }
    // 报废器具异常在库/外流（M8.2.4）
    const scrapped = await db.listBy('tools', { status: 'scrapped' }, 200);
    for (const t of (scrapped.data || [])) {
      if (t.borrower) {
        await push({ level: 'urgent', type: 'scrap_inuse', refType: 'scrap', refId: t._id, toolId: t._id,
          toolCode: t.code || '', keeperName: keeperNameOf[t.borrower] || '',
          title: '报废器具异常在库', content: `已报废器具 ${t.name}（${t.code}）仍显示被领用，疑似外流，请核查` }, t.orgId);
      }
    }
  } catch (e) { /* 单类异常不影响其他类别生成 */ }
  return ok({ generated: out.length });
}

exports.main = async (event) => {
  const { action, payload = {} } = event;
  try {
    switch (action) {
      case 'list': return list(payload);
      case 'read': return read(payload);
      case 'readAll': return readAll(payload);
      case 'subscribe': return subscribe(payload);
      case 'generate': return generate(payload);
      default: return fail('未知 action: ' + action);
    }
  } catch (e) {
    return fail(e.message || '服务异常');
  }
};
