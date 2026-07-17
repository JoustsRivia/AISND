// cloudfunctions/stats/index.js —— M12 统计分析（纯业务，只引用 helpers）
const db = require('./helpers/db');
const { getOpenid } = require('./helpers/user');
const ok = (data) => ({ code: 0, data });
const fail = (message, code = 1) => ({ code, message });
const baseFilter = (orgId) => (orgId ? { orgId } : {});

// 总览驾驶舱 / 项目部看板（同一口径按 orgId 过滤）
async function dashboard(payload = {}) {
  const { orgId } = payload;
  const b = baseFilter(orgId);
  const [total, qualified, pending, scrapped, maintaining, missing, expiring, warns] = await Promise.all([
    db.countBy('tools', b),
    db.countBy('tools', { ...b, status: 'qualified' }),
    db.countBy('tools', { ...b, status: 'pending_test' }),
    db.countBy('tools', { ...b, status: 'scrapped' }),
    db.countBy('tools', { ...b, status: 'maintaining' }),
    db.countBy('tools', { ...b, status: 'missing' }),
    db.countBy('tools', { ...b, status: 'qualified', ...db.expiringSoon(15) }),
    db.countBy('warnings', orgId ? { orgId, read: false } : { read: false }),
  ]);
  // 环比/趋势：项目尚未采集历史快照集合，此处以实时聚合近似（合格率 + 待关注负载）。
  // 如需真实「较昨日/较上周」环比，后续接入 daily_stats 快照集合后替换即可。
  const growth = {
    total: total.total,
    qualifiedRate: total.total ? Math.round((qualified.total / total.total) * 100) : 0,
    attention: expiring.total + warns.total, // 临期 + 未读预警 = 待关注负载
  };
  return ok({
    total: total.total, qualified: qualified.total, pendingTest: pending.total,
    scrapped: scrapped.total, maintaining: maintaining.total, missing: missing.total,
    expiringSoon: expiring.total, warnings: warns.total,
    growth,
  });
}

// 个人工作台统计（我的页）：待办 / 点检次数 / 达标率
async function myStats() {
  const openid = getOpenid();
  const [t, q, pending, warns, checks] = await Promise.all([
    db.countBy('tools', {}),
    db.countBy('tools', { status: 'qualified' }),
    db.countBy('tools', { status: 'pending_test' }),
    db.countBy('warnings', { read: false }),
    db.countBy('spot_checks', { operator: openid }),
  ]);
  return ok({
    todo: warns.total + pending.total,
    checkCount: checks.total,
    qualifiedRate: t.total ? Math.round((q.total / t.total) * 100) : 0,
  });
}

// 六化达标（部分维度来自实时聚合；缺源数据的维度以 100 占位，待接入）
async function sixStandard() {
  const [t, q, c, h, hc, cer, u] = await Promise.all([
    db.countBy('tools', {}),
    db.countBy('tools', { status: 'qualified' }),
    db.countBy('spot_checks', {}),
    db.countBy('hazards', {}),
    db.countBy('hazards', { status: 'closed' }),
    db.countBy('certificates', {}),
    db.countBy('users', {}),
  ]);
  const pct = (a, b) => (b > 0 ? Math.round((a / b) * 100) : 0);
  return ok({
    dims: [
      { key: 'test',   name: '器具检测合格率',   done: q.total,  total: t.total, rate: pct(q.total, t.total) },
      { key: 'spot',   name: '班前点检执行率', done: c.total,  total: t.total, rate: pct(c.total, t.total) },
      { key: 'hazard', name: '隐患整改闭环率', done: hc.total, total: h.total, rate: pct(hc.total, h.total) },
      { key: 'cert',   name: '关键岗位持证率', done: cer.total, total: u.total, rate: pct(cer.total, u.total) },
      { key: 'scrap',  name: '报废处置合规率', done: t.total,  total: t.total, rate: 100 },
      { key: 'ledger', name: '一物一档完整率', done: t.total,  total: t.total, rate: 100 },
    ],
  });
}

// 报表导出聚合（M12 报表导出）：按状态 / 类别分组计数，供前端导出
async function exportReport(payload = {}) {
  const { orgId } = payload;
  const b = baseFilter(orgId);
  const statuses = ['qualified', 'pending_test', 'in_use', 'maintaining', 'scrapped', 'missing'];
  const cats = ['insulation', 'motor', 'manual', 'lifting', 'height', 'measure', 'temp_power', 'lease'];
  const total = await db.countBy('tools', b);
  const byStatus = {};
  const byCategory = {};
  await Promise.all(statuses.map(async (s) => {
    const r = await db.countBy('tools', { ...b, status: s });
    byStatus[s] = r.total;
  }));
  await Promise.all(cats.map(async (c) => {
    const r = await db.countBy('tools', { ...b, category: c });
    byCategory[c] = r.total;
  }));
  return ok({ total: total.total, byStatus, byCategory });
}

exports.main = async (event) => {
  const { action, payload = {} } = event;
  try {
    switch (action) {
      case 'dashboard': return dashboard(payload);
      case 'project': return dashboard(payload);
      case 'myStats': return myStats(payload);
      case 'sixStandard': return sixStandard(payload);
      case 'exportReport': return exportReport(payload);
      default: return fail('未知 action: ' + action);
    }
  } catch (e) {
    return fail(e.message || '服务异常');
  }
};
