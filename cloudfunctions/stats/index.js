// cloudfunctions/stats/index.js —— M12 统计分析（纯业务，只引用 helpers）
const db = require('./helpers/db');
const { getOpenid } = require('./helpers/user');

const ok = (data) => ({ code: 0, data });
const fail = (message, code = 1) => ({ code, message });
const baseFilter = (orgId) => (orgId ? { orgId } : {});

const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// ── 权限守卫 ────────────────────────────────────────────────────────
// 登录态：OPENID 必须非空
function ensureLogin() {
  const openid = getOpenid();
  if (!openid) throw new Error('请先登录');
  return openid;
}
// 角色：敏感汇总/导出需具备指定角色（缺省仅要求登录）
async function ensureRole(roles = []) {
  const openid = ensureLogin();
  const user = await db.getUser(openid);
  if (!user) throw new Error('用户不存在或无权限');
  if (roles.length && (!user.role || !roles.includes(user.role))) {
    throw new Error('无权限：需要管理员/负责人角色');
  }
  return user;
}
// 敏感操作允许的角色
const SENSITIVE_ROLES = ['admin', 'manager', 'system'];

// ── CSV 安全转义（防公式注入 =/+/-/@，及逗号/引号/换行） ─────────────────
function csvCell(v) {
  if (v === null || v === undefined) return '';
  let s = String(v);
  if (/^[=+\-@]/.test(s)) s = "'" + s;            // 公式注入前缀单引号
  if (/[",\n\r]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"'; // 含特殊字符整体引号包裹
  return s;
}
const csvRow = (arr) => arr.map(csvCell).join(',');

// 总览驾驶舱 / 项目部看板（同一口径按组织子树过滤，item 1 RBAC 数据范围）
async function dashboard(payload = {}) {
  ensureLogin();
  // 项目部看板按组织子树收窄：全局角色看全量、单位看整单位子树、机构/班组看本机构子树，越权下钻被忽略
  const scope = await db.scopeWhere({ orgId: payload.orgId });
  const [total, qualified, pending, scrapped, maintaining, missing, expiring, warns] = await Promise.all([
    db.countBy('tools', scope),
    db.countBy('tools', { ...scope, status: 'qualified' }),
    db.countBy('tools', { ...scope, status: 'pending_test' }),
    db.countBy('tools', { ...scope, status: 'scrapped' }),
    db.countBy('tools', { ...scope, status: 'maintaining' }),
    db.countBy('tools', { ...scope, status: 'missing' }),
    db.countBy('tools', { ...scope, status: 'qualified', ...db.expiringSoon(15) }),
    db.countBy('warnings', { read: false, ...scope }),
  ]);
  const growth = {
    total: total.total,
    qualifiedRate: total.total ? Math.round((qualified.total / total.total) * 100) : 0,
    attention: expiring.total + warns.total,
  };
  return ok({
    total: total.total, qualified: qualified.total, pendingTest: pending.total,
    scrapped: scrapped.total, maintaining: maintaining.total, missing: missing.total,
    expiringSoon: expiring.total, warnings: warns.total,
    growth,
  });
}

// 个人工作台统计（我的页）：按组织子树收窄待办计数，个人维度保留按 openid 过滤
async function myStats() {
  const openid = ensureLogin();
  const scope = await db.scopeWhere({});
  const [t, q, pending, warns, checks] = await Promise.all([
    db.scopedCount('tools', scope),
    db.scopedCount('tools', { ...scope, status: 'qualified' }),
    db.scopedCount('tools', { ...scope, status: 'pending_test' }),
    db.scopedCount('warnings', { read: false, ...scope }),
    db.countBy('spot_checks', { operator: openid }),
  ]);
  return ok({
    todo: warns.total + pending.total,
    checkCount: checks.total,
    qualifiedRate: t.total ? Math.round((q.total / t.total) * 100) : 0,
  });
}

// 六化达标（真实口径，按组织子树收窄，不同等级角色看不同范围）
async function sixStandard() {
  await ensureRole(SENSITIVE_ROLES);
  const scope = await db.scopeWhere({});
  const [t, q, c, h, hc, cer, u, tools, scrapped, disposed] = await Promise.all([
    db.scopedCount('tools', scope),
    db.scopedCount('tools', { ...scope, status: 'qualified' }),
    db.scopedCount('spot_checks', scope),
    db.scopedCount('hazards', scope),
    db.scopedCount('hazards', { ...scope, status: 'closed' }),
    db.scopedCount('certificates', { ...scope, status: 'valid' }),
    db.scopedCount('users', scope),
    db.scopedList('tools', scope, { size: 500 }),
    db.scopedCount('tools', { ...scope, status: 'scrapped' }),
    db.scopedCount('scrap_records', { ...scope, status: 'disposed' }),
  ]);
  const pct = (a, b) => (b > 0 ? Math.round((a / b) * 100) : 0);
  // 一物一档完整率：必填字段齐全的器具占比（缺字段/空集合均守护）
  const required = ['name', 'code', 'category', 'expireAt', 'store'];
  const toolsData = (tools && tools.data) || [];
  const complete = toolsData.filter((x) => x && required.every((k) => x[k])).length;
  // 报废处置合规率：已规范处置的报废数 / 报废总数（除零保护）
  const scrapRate = scrapped.total ? pct(disposed.total, scrapped.total) : 100;
  return ok({
    dims: [
      { key: 'test',   name: '器具检测合格率',   done: q.total,  total: t.total, rate: pct(q.total, t.total) },
      { key: 'spot',   name: '班前点检执行率', done: c.total,  total: t.total, rate: pct(c.total, t.total) },
      { key: 'hazard', name: '隐患整改闭环率', done: hc.total, total: h.total, rate: pct(hc.total, h.total) },
      { key: 'cert',   name: '关键岗位持证率', done: cer.total, total: u.total, rate: pct(cer.total, u.total) },
      { key: 'scrap',  name: '报废处置合规率', done: disposed.total, total: scrapped.total, rate: scrapRate },
      { key: 'ledger', name: '一物一档完整率', done: complete, total: t.total, rate: pct(complete, t.total) },
    ],
  });
}

// 报表导出聚合（M12 报表导出）：按组织子树收窄（item 1 RBAC 数据范围）
async function exportReport(payload = {}) {
  await ensureRole(SENSITIVE_ROLES);
  const scope = await db.scopeWhere({ orgId: payload.orgId });
  const statuses = ['qualified', 'pending_test', 'in_use', 'maintaining', 'scrapped', 'missing'];
  const cats = ['insulation', 'motor', 'manual', 'lifting', 'height', 'measure', 'temp_power', 'lease'];
  const total = await db.countBy('tools', scope);
  const byStatus = {}; const byCategory = {};
  await Promise.all(statuses.map(async (s) => { const r = await db.countBy('tools', { ...scope, status: s }); byStatus[s] = r.total; }));
  await Promise.all(cats.map(async (c) => { const r = await db.countBy('tools', { ...scope, category: c }); byCategory[c] = r.total; }));

  // 生成 CSV（含组织维度，orgId 属用户输入需转义，防止公式注入）
  const lines = [];
  lines.push(csvRow(['报表类型', '安全工器具统计分析报表']));
  lines.push(csvRow(['组织ID', payload.orgId != null ? payload.orgId : '全组织']));
  lines.push(csvRow(['生成时间', new Date().toISOString()]));
  lines.push([]);
  lines.push(csvRow(['状态', '数量']));
  statuses.forEach((s) => lines.push(csvRow([s, byStatus[s] || 0])));
  lines.push([]);
  lines.push(csvRow(['类别', '数量']));
  cats.forEach((c) => lines.push(csvRow([c, byCategory[c] || 0])));
  const csv = '﻿' + lines.join('\r\n'); // ﻿BOM 兼容 Excel

  return ok({ total: total.total, byStatus, byCategory, csv });
}

// 每日指标快照（答复4：每日采集一次，支撑趋势与未来分析）
// 由云函数定时器触发（config.json triggers），也可手动调用 action=snapshot
// 注意：定时器无微信用户上下文，此处不强制 requireLogin，否则定时任务会失败。
async function snapshot() {
  const today = ymd(new Date());
  const [d, s] = await Promise.all([dashboard({}), sixStandard()]);
  // P0 守卫：d.data / s.data 可能为 null，避免 Cannot read 'total' of undefined
  const dData = (d && d.data) || {};
  const sData = (s && s.data) || {};
  const doc = {
    date: today,
    total: dData.total, qualified: dData.qualified, pendingTest: dData.pendingTest,
    scrapped: dData.scrapped, maintaining: dData.maintaining, missing: dData.missing,
    expiringSoon: dData.expiringSoon, warnings: dData.warnings,
    dims: (sData && sData.dims) || [],
    createdAt: new Date(),
  };
  // 同日不重复写入
  const exist = await db.listBy('daily_stats', { date: today }, 1);
  const existData = (exist && exist.data) || [];
  if (existData.length) {
    const id = existData[0]._id;
    await db.update('daily_stats', id, doc);
    return ok({ date: today, updated: true });
  }
  const added = await db.add('daily_stats', doc);
  return ok({ _id: added && added._id, date: today, created: true });
}

// 趋势（最近 N 天快照）
async function trend(payload = {}) {
  ensureLogin();
  const n = Math.min(payload.days || 14, 60);
  const res = await db.listBy('daily_stats', {}, 200);
  const list = ((res && res.data) || [])
    .map((x) => ({ date: x.date, total: x.total, qualified: x.qualified, pendingTest: x.pendingTest, scrapped: x.scrapped, expiringSoon: x.expiringSoon }))
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
    .slice(-n);
  return ok(list);
}

// 工作台模块徽标聚合（P0 可视化：让能力被感知）
// 返回各功能模块的待办/积压计数，前端按 module key 渲染状态徽标。
// 按组织子树收窄：全局角色看全量、单位看整单位子树、机构/班组看本机构子树。
async function homeStatus() {
  ensureLogin();
  const scope = await db.scopeWhere({});
  const [warnings, pendingTest, expiring, repairPending, scrapPending, hazardsOpen, purchPending, missing] = await Promise.all([
    db.scopedCount('warnings', { read: false, ...scope }),
    db.scopedCount('tools', { status: 'pending_test', ...scope }),
    db.scopedCount('tools', { status: 'qualified', ...db.expiringSoon(15), ...scope }),
    db.scopedCount('repair_records', { status: 'pending', ...scope }),
    db.scopedCount('scrap_records', { status: 'pending', ...scope }),
    db.scopedCount('hazards', { status: db._.in(['open', 'assigned']), ...scope }),
    db.scopedCount('purchases', { status: 'pending', ...scope }),
    db.scopedCount('tools', { status: 'missing', ...scope }),
  ]);
  const m = (r, tone) => ({ count: (r && r.total) || 0, tone });
  return ok({
    message: m(warnings, 'abnormal'),    // 未读预警
    test: m(pendingTest, 'pending'),     // 待检器具
    ledger: m(expiring, 'pending'),      // 临期器具
    maint: m(repairPending, 'pending'),  // 待审批报修
    scrap: m(scrapPending, 'pending'),   // 待审批报废
    check: m(hazardsOpen, 'abnormal'),   // 待整改隐患
    purchase: m(purchPending, 'pending'),// 待审批采购
    store: m(missing, 'abnormal'),       // 盘亏器具
  });
}

exports.main = async (event) => {
  const { action, payload = {} } = event || {};
  try {
    // 定时器触发（无 action）默认执行快照采集
    if (!action || (event && event.triggerName)) return await snapshot();
    switch (action) {
      case 'dashboard': return await dashboard(payload);
      case 'project': return await dashboard(payload);
      case 'myStats': return await myStats(payload);
      case 'sixStandard': return await sixStandard(payload);
      case 'exportReport': return await exportReport(payload);
      case 'snapshot': return await snapshot();
      case 'trend': return await trend(payload);
      case 'homeStatus': return await homeStatus(payload);
      default: return fail('未知 action: ' + action);
    }
  } catch (e) {
    return fail(e.message || '服务异常');
  }
};
