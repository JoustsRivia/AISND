// cloudfunctions/site/index.js —— M6 现场使用（班前点检/规程/交底，纯业务，只引用 helpers）
const { getOpenid } = require('./helpers/user');
const db = require('./helpers/db');
const ok = (data) => ({ code: 0, data });
const fail = (message, code = 1) => ({ code, message });
const now = () => new Date();

// 身份守卫：非微信环境/未登录时 OPENID 为空，直接拦截返回 401
function requireOpenid() {
  const openid = getOpenid();
  if (!openid) return { err: fail('未登录', 401) };
  return { openid };
}
// 统一封装单文档读取：文档不存在/查询异常都返回 fail('器具不存在',404)，避免 SDK 原始错误泄露
async function safeGetById(name, id) {
  try {
    const r = await db.getById(name, id);
    return r && r.data ? r.data : null;
  } catch (e) {
    return null;
  }
}
async function safeGetTool(id) {
  try {
    const r = await db.getTool(id);
    return r && r.data ? r.data : null;
  } catch (e) {
    return null;
  }
}
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => {
  const dt = d instanceof Date ? d : (d ? new Date(d) : null);
  return dt ? `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}` : '';
};

// 班前点检默认项（实际项目可按器具类型绑定模板）
const DEFAULT_ITEMS = [
  '外观及绝缘是否完好', '标识标签是否清晰', '机械结构有无变形', '功能测试是否正常', '附件是否齐全',
];

// 点检任务（M6.1）
async function checkTask() {
  const g = requireOpenid();
  if (g.err) return g.err;
  // date 以 ymd 字符串返回，避免前端渲染 Date 对象出现英文日期
  return ok({ items: DEFAULT_ITEMS, date: ymd(now()) });
}

// 提交点检（M6.1.2）
async function submitCheck(payload) {
  const g = requireOpenid();
  if (g.err) return g.err;
  const openid = g.openid;
  const { toolId, items = [], abnormal = false, remark = '' } = payload;
  if (toolId) {
    const t = await safeGetTool(toolId);
    if (!t) return fail('器具不存在', 404);
  }
  const me = await db.getCurrentUser(openid);
  const doc = { toolId: toolId || '', items, abnormal, remark, operator: openid, orgId: (me && me.orgId) || '', ts: now() };
  const added = await db.add('spot_checks', doc);
  return ok({ _id: added._id, ...doc });
}

// 操作规程（M6.3）：列表按组织子树收窄
async function opGuide(payload = {}) {
  const { id, orgId } = payload;
  if (id) {
    const r = await safeGetById('op_guides', id);
    return ok(r || null);
  }
  const res = await db.scopedList('op_guides', {}, { orgId, size: 50 });
  return ok(res.data || []);
}

// 班前交底（M6.4）：仅接收白名单字段，杜绝任意字段写入 briefings 集合
async function briefing(payload) {
  const g = requireOpenid();
  if (g.err) return g.err;
  const openid = g.openid;
  const me = await db.getCurrentUser(openid);
  const { team = '', content = '', participants = '', date = '' } = payload || {};
  const doc = { team, content, participants, date, leader: openid, orgId: (me && me.orgId) || '', ts: now() };
  const added = await db.add('briefings', doc);
  return ok({ _id: added._id, ...doc });
}

// 批量点检（api.batchSpotCheck(ids) 调用）
async function batchCheck(payload) {
  const g = requireOpenid();
  if (g.err) return g.err;
  const openid = g.openid;
  const me = await db.getCurrentUser(openid);
  const { ids = [] } = payload;
  if (!ids.length) return fail('请选择器具');
  const tools = await db.listByIds('tools', ids);
  const orgId = (me && me.orgId) || '';
  const docs = (tools.data || []).map((t) => ({
    toolId: t._id, items: [{ name: '批量点检', result: '合格' }], abnormal: false, operator: openid, orgId, ts: now(),
  }));
  for (const d of docs) await db.add('spot_checks', d);
  return ok({ count: docs.length });
}

// 每日点检汇总（M6.1 班组点检看板）：今日已完成项 + 抽样待点检计划（按组织子树收窄）
async function dailyList(payload = {}) {
  const today = ymd(now());
  const [toolRes, checkRes] = await Promise.all([
    db.scopedList('tools', {}, { orgId: payload.orgId, size: 1000 }),
    db.scopedList('spot_checks', {}, { orgId: payload.orgId, size: 500 }),
  ]);
  const tools = (toolRes.data || []).slice(0, 8);
  const todayChecks = (checkRes.data || []).filter((r) => ymd(r.ts) === today);
  const items = tools.map((t) => {
    const c = todayChecks.find((r) => r.toolId && r.toolId === t._id);
    const status = c ? (c.abnormal ? 'abnormal' : 'normal') : 'pending';
    return {
      toolId: t._id, name: t.name, code: t.code, category: t.category,
      status, ts: c ? c.ts : null,
    };
  });
  const done = items.filter((i) => i.status !== 'pending').length;
  return ok({
    date: today,
    total: items.length,
    done,
    rate: items.length ? Math.round((done / items.length) * 100) : 0,
    items,
  });
}

exports.main = async (event) => {
  const { action, payload = {} } = event;
  try {
    switch (action) {
      case 'checkTask': return checkTask(payload);
      case 'submitCheck': return submitCheck(payload);
      case 'opGuide': return opGuide(payload);
      case 'briefing': return briefing(payload);
      case 'batchCheck': return batchCheck(payload);
      case 'dailyList': return dailyList(payload);
      default: return fail('未知 action: ' + action);
    }
  } catch (e) {
    return fail(e.message || '服务异常');
  }
};
