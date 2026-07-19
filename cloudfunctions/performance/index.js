// cloudfunctions/performance/index.js —— M10.3 人员考核管理（评分/排行榜/奖惩，纯业务）
const { getOpenid } = require('./helpers/user');
const db = require('./helpers/db');
const ok = (data) => ({ code: 0, data });
const fail = (message, code = 1) => ({ code, message });
const now = () => new Date();

async function requireMgmt() {
  const u = await db.getCurrentUser(getOpenid());
  if (!u || u.status === 'disabled') return { err: fail('账号不可用', 403) };
  const MGMT = ['lead', 'supervisor', 'project_lead', 'safety_officer', 'admin'];
  if (!MGMT.includes(u.role)) return { err: fail('无操作权限', 403) };
  return { u };
}

function thisMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// 月度人员评分（M10.3.1）：写库补服务端 orgId（item 1 写库带 orgId）
async function score(payload) {
  const g = await requireMgmt();
  if (g.err) return g.err;
  const { personId, personName, dimension = '综合', score: s, note = '' } = payload;
  if (!personId) return fail('请填写被考核人');
  const score = Number(s);
  if (isNaN(score) || score < 0 || score > 100) return fail('分数需为 0~100');
  const me = await db.getCurrentUser(getOpenid());
  const doc = {
    personId, personName: personName || '', dimension,
    score, note, month: (payload.month || thisMonth()).slice(0, 7),
    assessor: getOpenid(), orgId: (me && me.orgId) || '', createdAt: now(),
  };
  const added = await db.add('performance_scores', doc);
  return ok({ _id: added._id, ...doc });
}

// 评分记录：RBAC 数据范围统一收窄（item 1）
async function list(payload = {}) {
  const { month, personId } = payload;
  const filter = {};
  if (month) filter.month = month;
  if (personId) filter.personId = personId;
  const res = await db.scopedList('performance_scores', filter, { orgId: payload.orgId, size: 100 });
  return ok(res.data || []);
}

// 排行榜：按人聚合月度平均分，降序（数据范围按组织子树收窄）
async function rank(payload = {}) {
  const { month } = payload;
  const res = await db.scopedList('performance_scores', month ? { month } : {}, { size: 500 });
  const map = {};
  (res.data || []).forEach((r) => {
    const p = map[r.personId] || { personId: r.personId, personName: r.personName, sum: 0, cnt: 0 };
    p.sum += Number(r.score) || 0;
    p.cnt += 1;
    p.personName = r.personName || p.personName;
    map[r.personId] = p;
  });
  const rows = Object.values(map).map((p) => ({
    personId: p.personId, personName: p.personName,
    avg: p.cnt ? Math.round((p.sum / p.cnt) * 10) / 10 : 0, cnt: p.cnt,
  })).sort((a, b) => b.avg - a.avg);
  rows.forEach((r, i) => { r.rank = i + 1; });
  return ok(rows);
}

// 月度汇总（数据范围按组织子树收窄）
async function summary(payload = {}) {
  const month = (payload.month || thisMonth()).slice(0, 7);
  const res = await db.scopedList('performance_scores', { month }, { size: 500 });
  const data = res.data || [];
  const map = {};
  data.forEach((r) => {
    const p = map[r.personId] || { sum: 0, cnt: 0, name: r.personName };
    p.sum += Number(r.score) || 0; p.cnt += 1; p.name = r.personName || p.name;
    map[r.personId] = p;
  });
  const persons = Object.values(map);
  const avg = persons.length ? Math.round((persons.reduce((a, p) => a + p.sum / p.cnt, 0) / persons.length) * 10) / 10 : 0;
  const ranked = persons.map((p) => ({ name: p.name, avg: Math.round((p.sum / p.cnt) * 10) / 10 }))
    .sort((a, b) => b.avg - a.avg);
  return ok({ month, personCount: persons.length, scoreCount: data.length, avg, top: ranked[0] || null });
}

// 奖惩记录（M10.3.2）：写库补服务端 orgId（item 1 写库带 orgId）
async function rewardAdd(payload) {
  const g = await requireMgmt();
  if (g.err) return g.err;
  const { personId, personName, type, reason = '', amount = 0 } = payload;
  if (!personId || !['reward', 'penalty'].includes(type)) return fail('参数不合法');
  const me = await db.getCurrentUser(getOpenid());
  const doc = {
    personId, personName: personName || '', type,
    reason, amount: Number(amount) || 0,
    month: (payload.month || thisMonth()).slice(0, 7),
    creator: getOpenid(), orgId: (me && me.orgId) || '', createdAt: now(),
  };
  const added = await db.add('performance_rewards', doc);
  return ok({ _id: added._id, ...doc });
}

async function rewardList(payload = {}) {
  const { month, type } = payload;
  const where = {};
  if (month) where.month = month;
  if (type) where.type = type;
  const res = await db.listBy('performance_rewards', where, 100);
  return ok(res.data || []);
}

exports.main = async (event) => {
  const { action, payload = {} } = event;
  try {
    switch (action) {
      case 'score': return score(payload);
      case 'list': return list(payload);
      case 'rank': return rank(payload);
      case 'summary': return summary(payload);
      case 'rewardAdd': return rewardAdd(payload);
      case 'rewardList': return rewardList(payload);
      default: return fail('未知 action: ' + action);
    }
  } catch (e) {
    return fail(e.message || '服务异常');
  }
};
