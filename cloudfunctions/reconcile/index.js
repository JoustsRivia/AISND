// cloudfunctions/reconcile/index.js —— M1.4 账物核对（纯业务，只引用 helpers）
const { getOpenid } = require('./helpers/user');
const db = require('./helpers/db');
const ok = (data) => ({ code: 0, data });
const fail = (message, code = 1) => ({ code, message });
const now = () => new Date();

// 服务端角色鉴权（仅管理类角色可发起/完成核对）
async function requireMgmt() {
  const u = await db.getCurrentUser(getOpenid());
  if (!u || u.status === 'disabled') return { err: fail('账号不可用', 403) };
  const MGMT = ['lead', 'supervisor', 'project_lead', 'safety_officer', 'admin'];
  if (!MGMT.includes(u.role)) return { err: fail('无操作权限', 403) };
  return { u };
}

// 当前月份 YYYY-MM
function thisMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// 生成账物核对任务：按仓库+类别筛选台账，预置逐项待核对
async function createTask(payload = {}) {
  const g = await requireMgmt();
  if (g.err) return g.err;
  const month = (payload.month || thisMonth()).slice(0, 7);
  const { storeId, storeName, category, note } = payload;

  // 校验：如果指定了 storeId，验证该仓库存在
  if (storeId) {
    const storeCheck = await db.getById('stores', storeId);
    if (!storeCheck.data) return fail('仓库不存在', 400);
  }
  // 校验：如果指定了 category，验证是合法类别
  if (category) {
    const VALID_CATEGORIES = ['insulation', 'motor', 'manual', 'lifting', 'height', 'measure', 'temp_power', 'lease'];
    if (!VALID_CATEGORIES.includes(category)) return fail('器具类别不合法', 400);
  }

  // 避免同一月份+同一仓库+同一类别重复建任务
  const existFilter = { month };
  if (storeId) existFilter.storeId = storeId;
  if (category) existFilter.category = category;
  const exist = await db.listBy('reconcile_tasks', existFilter, 1);
  if (exist.data && exist.data.length) return fail('该年月/仓库/类别已存在核对任务', 409);

  // 按仓库+类别筛选台账器具
  const tools = await db.listBy('tools', storeId ? { store: storeName } : {}, 500);
  let items = (tools.data || []).map((t) => ({
    toolId: t._id,
    code: t.code || '',
    name: t.name || '',
    category: t.category || '',
    status: t.status || '',
    store: t.store || t.storeName || '',
    keeper: t.keeper || '',
    result: 'pending',
    note: '',
  }));

  // 按 storeName 二次匹配（tools.store 为字符串库位，兼容无 storeId 的情形）
  if (storeName) {
    items = items.filter((it) => it.store === storeName);
  }
  // 按 category 二次过滤
  if (category) {
    items = items.filter((it) => it.category === category);
  }

  if (!items.length) return fail('该筛选条件下无匹配器具', 400);

  const doc = {
    month, orgId: g.u.orgId || '', creator: getOpenid(),
    createdAt: now(), status: 'pending', total: items.length, items,
    storeId: storeId || '', storeName: storeName || '',
    category: category || '', note: note || '',
  };
  const added = await db.add('reconcile_tasks', doc);
  return ok({ _id: added._id, items, total: items.length, month, storeName, category });
}

// 任务列表（按组织子树收窄）
async function list(payload = {}) {
  const { month, status, orgId } = payload;
  const filter = {};
  if (month) filter.month = month;
  if (status) filter.status = status;
  const res = await db.scopedList('reconcile_tasks', filter, { orgId, size: 50 });
  const data = (res.data || []).map((t) => ({
    _id: t._id, month: t.month, status: t.status, total: t.total,
    storeName: t.storeName || '', category: t.category || '',
    diff: (t.items || []).filter((i) => i.result && i.result !== 'pending' && i.result !== 'match').length,
    createdAt: t.createdAt,
  }));
  return ok(data);
}

// 任务明细（含逐项，含越权防护）
async function getTask(payload) {
  const { id } = payload;
  const r = await db.getById('reconcile_tasks', id);
  if (!r.data) return fail('任务不存在', 404);
  // 越权防护：校验该 task.orgId 是否在调用者允许范围内
  const me = await db.getCurrentUser(getOpenid());
  const orgs = (await db.listOrgs(500)).data || [];
  const allowed = db.allowedOrgIds(me, orgs, {});
  if (allowed !== null && !allowed.includes('__unbound__') && !allowed.includes(r.data.orgId)) {
    return fail('无权查看该核对任务', 403);
  }
  return ok(r.data);
}

// 逐项确认：match 账实相符 / loss 盘亏 / surplus 盘盈 / abnormal 异常
async function confirmItem(payload) {
  const g = await requireMgmt();
  if (g.err) return g.err;
  const { id, itemId, result, note = '' } = payload;
  if (!['match', 'loss', 'surplus', 'abnormal'].includes(result)) return fail('结果不合法');
  const r = await db.getById('reconcile_tasks', id);
  if (!r.data) return fail('任务不存在', 404);
  const items = (r.data.items || []).map((it) =>
    it.toolId === itemId ? { ...it, result, note } : it
  );
  await db.update('reconcile_tasks', id, { items });
  return ok({ id, itemId, result, diff: items.filter((i) => i.result && i.result !== 'pending' && i.result !== 'match').length });
}

// 完成核对：标记任务完成并统计差异
async function finishTask(payload) {
  const g = await requireMgmt();
  if (g.err) return g.err;
  const { id } = payload;
  const r = await db.getById('reconcile_tasks', id);
  if (!r.data) return fail('任务不存在', 404);
  const diff = (r.data.items || []).filter((i) => i.result && i.result !== 'pending' && i.result !== 'match');
  await db.update('reconcile_tasks', id, { status: 'done', diff: diff.length });
  return ok({ id, status: 'done', diff: diff.length });
}

// 差异清单：跨任务汇总所有非"相符"且已确认的明细（按组织子树收窄）
async function diff(payload = {}) {
  const { month, orgId } = payload;
  const filter = { status: 'done' };
  if (month) filter.month = month;
  const res = await db.scopedList('reconcile_tasks', filter, { orgId, size: 50 });
  const rows = [];
  (res.data || []).forEach((t) => {
    (t.items || []).forEach((it) => {
      if (it.result && it.result !== 'pending' && it.result !== 'match') {
        rows.push({ month: t.month, ...it });
      }
    });
  });
  return ok(rows);
}

exports.main = async (event) => {
  const { action, payload = {} } = event;
  try {
    switch (action) {
      case 'createTask': return createTask(payload);
      case 'list': return list(payload);
      case 'getTask': return getTask(payload);
      case 'confirmItem': return confirmItem(payload);
      case 'finishTask': return finishTask(payload);
      case 'diff': return diff(payload);
      default: return fail('未知 action: ' + action);
    }
  } catch (e) {
    return fail(e.message || '服务异常');
  }
};
