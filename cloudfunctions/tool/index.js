// cloudfunctions/tool/index.js
// 业务逻辑层（M1 台账/档案/租赁/条码）：只引用 ./helpers，绝不直接 cloud.database()/getWXContext()。
const { getOpenid } = require('./helpers/user');
const { MGMT, UNIT_MGMT } = require('./helpers/roles');
// 台账管理操作角色：管理族 + 管理员（含项目部负责人 b21/c21）
const TOOL_MGMT = [...MGMT, 'admin'];

const { createRateLimiter } = require('./helpers/rateLimiter');
const __limiter = createRateLimiter({ getOpenid });
const {
  findUser, addTool, updateTool, removeTool, findTool, listTools, countTools, listOrgs, regExp, _, getCurrentUser,
  allowedOrgIds, listBy,
} = require('./helpers/db');

const ok = (data) => ({ code: 0, data });
const fail = (message, code = 1) => ({ code, message });

// R15 器具编号自动生成：GL-{年度末两位}-{类别缩写}-{4位流水}，如 GL-26-GJ-0001
// 类别缩写映射（与 utils/constants.js TOOL_CATEGORIES 对应）
// 优化#14：改为「类别名称前两字拼音缩写」（临时配电配套 → LS），替代旧的 GL/类别字母混排
const CAT_ABBR = {
  insulation: 'JY', motor: 'SC', manual: 'TY', lifting: 'QZ',
  height: 'GK', measure: 'JL', temp_power: 'LS', lease: 'DX',
};
// 高危专项类别：绝缘 / 高空 / 起重承压
const HIGH_RISK_CATS = ['insulation', 'height', 'lifting'];

// 类别中文名映射（与 utils/constants.js TOOL_CATEGORIES 对应；detail 派生 categoryName 用）
const CAT_NAME = {
  insulation: '绝缘安全工器具',
  motor: '手持电动机具',
  manual: '通用手动工具',
  lifting: '起重承压类',
  height: '高空防护器具',
  measure: '计量检测器具',
  temp_power: '临时配电配套',
  lease: '大型租赁机具',
};

// 是否超期：expireAt 为空/非法 → 不超期；否则与当前时间比较
function isExpired(t) {
  if (!t || !t.expireAt) return false;
  const e = new Date(t.expireAt).getTime();
  if (isNaN(e)) return false;
  return e < Date.now();
}

// 派生前端依赖字段（expired / categoryName），detail/update 返回前统一注入
function derive(t) {
  if (!t) return t;
  return { ...t, expired: isExpired(t), categoryName: CAT_NAME[t.category] };
}

// 类别缩写（未知类别回退「其他 QT」）
function catAbbr(category) { return CAT_ABBR[category] || 'QT'; }

// 正则转义（用于按 code 前缀统计/查重）
function escapeRegExp(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

// 某类别下当前最大流水号（基于现有 code 前缀），保证同类自增且不重复
// 优化#14：前缀 = {缩写}{YY}（如 LS26），5 位流水（00001）；旧格式 GL-26-GJ-0001 不再生成但保留可读
async function nextSeq(category) {
  const yy = String(new Date().getFullYear()).slice(-2);
  const prefix = `${catAbbr(category)}${yy}`;
  const re = new RegExp('^' + escapeRegExp(prefix) + '(\\d{5})$');
  const res = await listTools({ code: regExp('^' + escapeRegExp(prefix)) }, 200, 0);
  let max = 0;
  for (const t of (res.data || [])) {
    const m = (t.code || '').match(re);
    if (m) max = Math.max(max, parseInt(m[1], 10) || 0);
  }
  return max + 1;
}

// R15 生成器具编号：{类别缩写}{YY}{5位流水}（示例 LS2600001），无连字符；
// 流水号在同类别下自增，从 00001 起。防并发碰撞：若生成码已存在则顺延至下一个空闲号。
async function generateToolCode(category) {
  const yy = String(new Date().getFullYear()).slice(-2);
  const abbr = catAbbr(category);
  let seq = await nextSeq(category);
  // 防碰撞顺延
  for (let guard = 0; guard < 99999; guard++) {
    const code = `${abbr}${yy}${String(seq).padStart(5, '0')}`;
    const exist = await listTools({ code }, 1, 0);
    if (!exist.data || !exist.data.length) return code;
    seq++;
  }
  return `${abbr}${yy}${String(seq).padStart(5, '0')}`;
}

// 数据范围过滤（S2 / 问题4 RBAC）：
//   复用 _shared/dbBase.js 单一源的 allowedOrgIds 统一推导（全局/单位/机构三档），
//   业务函数无需各自实现子树逻辑——「统一注入」数据范围，迁移零改动。
//   全局角色看全部；单位级看整单位子树；机构/班组级仅看本机构子树；
//   并允许在自身子树内用 picker 进一步下钻收窄（越权 orgId 一律忽略，保证不越界）。
async function scopeWhere(where, payload = {}) {
  const me = await findUser(getOpenid());
  const u = me.data && me.data[0];
  const orgs = (await listOrgs(500)).data || [];
  const ids = allowedOrgIds(u, orgs, { orgId: payload.orgId, unitId: payload.unitId });
  if (ids === null) return where;                       // 全局：不过滤（全量）
  if (ids.includes('__unbound__')) { where.orgId = '__unbound__'; return where; } // 无可见数据
  where.orgId = _.in(ids);
  return where;
}

// 列表（总/分台账下钻、筛查、高危专项、分页 skip）M1.1.1 / M1.1.2 / M1.3.6
async function list(payload = {}) {
  const { status, category, source, keyword, orgId, unitId, size = 20, page = 1, highRisk } = payload;
  let where = {};
  if (status) where.status = status;
  if (category) where.category = category;
  if (source) where.source = source;
  if (keyword) {
    // FEAT-03：关键词搜索扩展为 名称/编号/库房/保管人/出厂编号 多字段 OR 匹配，便于现场按任一已知信息检索
    const kw = regExp(keyword, 'i');
    where = _.and([
      where,
      _.or([
        { name: kw },
        { code: kw },
        { store: kw },
        { keeper: kw },
        { factoryNo: kw },
      ]),
    ]);
  }
  if (highRisk) where.category = _.in(HIGH_RISK_CATS); // M1.3.6 高危专项台账
  where = await scopeWhere(where, { ...payload, orgId: orgId || undefined, unitId: unitId || undefined });
  const skip = Math.max(0, (Number(page) - 1) * Number(size));
  const res = await listTools(where, Number(size), skip);
  const total = await countTools(where);
  return ok({ list: res.data || [], total: total.total, page: Number(page), size: Number(size) });
}

// R18 履历操作人姓名：优先使用 write 时已写入的 operatorName（由 borrow/return 同步写入），
// 若无则回退到通过 byOpenid / by(openid) 查 users 表映射（兼容历史数据）。
// 优化#17：同时富化领用责任人 borrowerName（borrower 为 openid → 姓名+工号，供档案「使用状态」展示）
async function enrichOperatorNames(t) {
  const ops = (t && t.operations) || [];
  // 过滤出需要回退查询的操作记录（无 operatorName）
  const needLookup = ops.filter((o) => !o.operatorName);
  // 收集需要查询的 openid：优先 byOpenid，回退 by（历史数据存 openid）
  const ids = [...new Set(needLookup.map((o) => o.byOpenid || o.by).filter(Boolean))];
  if (t && t.borrower) ids.push(t.borrower); // 领用责任人一并解析
  if (!ids.length) return;
  // 拉取关联用户
  const users = (await listBy('users', {}, 200)).data || [];
  const nameOf = {};
  users.forEach((u) => { nameOf[u.openid] = u.nickname || u.username || ''; });
  needLookup.forEach((o) => { o.operatorName = nameOf[o.byOpenid || o.by] || ''; });
  if (t && t.borrower) {
    const u = users.find((x) => x.openid === t.borrower);
    t.borrowerName = u ? `${u.nickname || u.username || ''}${u.employeeId ? '（' + u.employeeId + '）' : ''}` : '';
  }
}

// 器具详情（一物一档：内嵌 operations / testRecords）
// R11：detail 增加跨组织隔离校验——非全局角色只能查看自身可见组织子树内的器具
async function detail(payload) {
  const { id } = payload;
  const res = await findTool(id);
  if (!res.data) return fail('器具不存在', 404);
  // R11 跨组织隔离：校验调用者是否有权查看该器具
  const me = await getCurrentUser(getOpenid());
  if (me && !TOOL_MGMT.includes(me.role)) {
    const orgs = (await listOrgs(500)).data || [];
    const ids = allowedOrgIds(me, orgs, {});
    if (ids !== null && !ids.includes('__unbound__') && !ids.includes(res.data.orgId)) {
      return fail('无权查看该组织器具', 403);
    }
  }
  await enrichOperatorNames(res.data); // R18：履历操作人姓名富化
  return ok(derive(res.data)); // S2/P0：派生 expired + categoryName
}

// R13 日期约束校验（服务端权威）：检验日期/有效截止不得早于采购日期
function validateDateConstraints(p) {
  const { purchaseDate, lastTestDate, expireAt } = p;
  if (purchaseDate && lastTestDate && new Date(lastTestDate) < new Date(purchaseDate)) {
    return '检验日期不得早于采购日期';
  }
  if (purchaseDate && expireAt && new Date(expireAt) < new Date(purchaseDate)) {
    return '有效截止日期不得早于采购日期';
  }
  return null;
}

// 器具新增录入（M1.3.1）—— 含服务端 RBAC（S5/P1：跨机构建档拦截）
async function create(payload) {
  const openid = getOpenid();
  const u = await getCurrentUser(openid);
  if (!u || u.status === 'disabled') return fail('账号不可用', 403);
  const isAdmin = TOOL_MGMT.includes(u.role);
  // 跨机构建档：非管理员只能落到自身绑定机构，显式 orgId 与自身不一致则拒绝
  if (payload.orgId && payload.orgId !== u.orgId && !isAdmin) return fail('无权为其他机构建档', 403);
  const orgId = (isAdmin && payload.orgId) ? payload.orgId : (u.orgId || '');
  if (!orgId) return fail('未绑定机构，无法建档', 403);
  // R13 日期约束校验
  const dateErr = validateDateConstraints(payload);
  if (dateErr) return fail(dateErr, 400);
  // R15 器具编号自动生成：未传 code 时按类别自增（GL-{YY}-{缩写}-{0001}）
  const code = payload.code || await generateToolCode(payload.category);
  const createdByName = u ? `${u.username || u.nickname || ''}${u.employeeId ? '（' + u.employeeId + '）' : ''}` : '';
  const doc = {
    code,
    name: payload.name,
    category: payload.category,
    spec: payload.spec || '',
    factoryNo: payload.factoryNo || '',
    purchaseDate: payload.purchaseDate || '',
    testPeriod: payload.testPeriod || 6,
    lastTestDate: payload.lastTestDate || '',
    expireAt: payload.expireAt || '',
    store: payload.store || '',
    keeper: payload.keeper || '',
    source: payload.source || 'self',
    // M1.3.7 租赁字段落库
    leaseUnit: payload.leaseUnit || '',
    certNo: payload.certNo || '',
    operator: payload.operator || '',
    operatorCert: payload.operatorCert || '', // S5/P1：现场操作人持证编号落库
    status: 'qualified',
    orgId,
    // 优化#11：建档即写履历「入库建档」记录（原 operations 恒为空，时间线看不到源头）
    operations: [{ type: 'created', ts: new Date(), by: createdByName, note: '台账建档录入' }],
    testRecords: [],
    createdBy: createdByName,
    createdByOpenid: openid,
    createdAt: new Date(),
  };
  const added = await addTool(doc);
  return ok({ _id: added._id, ...doc });
}

// 器具信息编辑（M1.3.4，记录变更）—— 含服务端 RBAC（S5/P1：跨机构编辑拦截）+ 报废锁（D14）
async function update(payload) {
  const { id, ...rest } = payload;
  const u = await getCurrentUser(getOpenid());
  if (!u || u.status === 'disabled') return fail('账号不可用', 403);
  const isAdmin = TOOL_MGMT.includes(u.role);
  const cur = await findTool(id);
  if (!cur.data) return fail('器具不存在', 404);
  // D14：已报废器具不可再编辑（仅管理员可例外修改 status/备注字段）
  if (cur.data.status === 'scrapped' && !isAdmin) {
    return fail('已报废器具不支持编辑', 403);
  }
  // 非管理员只能编辑自身绑定机构的器具，防止越权改写他人机构档案
  if (!isAdmin && cur.data.orgId !== u.orgId) return fail('无权编辑其他机构器具', 403);
  // R13 日期约束校验：合并已有字段后校验
  const merged = { ...cur.data, ...rest };
  const dateErr = validateDateConstraints(merged);
  if (dateErr) return fail(dateErr, 400);
  delete rest.code; delete rest.createdBy; delete rest.createdAt; delete rest.orgId;
  await updateTool(id, { ...rest, updatedAt: new Date() });
  const res = await findTool(id);
  return ok(derive(res.data)); // S2/P0：派生 expired + categoryName
}

// 台账批量导入（问题5）：按模板解析后的行批量建档，orgId 取当前用户机构（或显式覆盖）
async function importTools(payload) {
  const { rows = [] } = payload;
  if (!Array.isArray(rows) || !rows.length) return fail('缺少导入数据');
  const me = await findUser(getOpenid());
  const u = me.data && me.data[0];
  const orgId = (u && u.orgId) || payload.orgId || '';
  // 优化#8：保管责任人/现场操作人按工号匹配——CSV 对应列填工号，
  // 批量映射为该用户 openid（档案页解析显示姓名+工号），匹配不到则原样保存并提示
  const eids = [...new Set(rows.flatMap((r) => [(r.keeper || '').trim(), (r.operator || '').trim()]).filter(Boolean))];
  const byEid = {};
  const unmatched = [];
  if (eids.length) {
    const users = await listBy('users', { employeeId: _.in(eids) }, Math.min(eids.length, 100));
    (users.data || []).forEach((x) => { if (x && x.employeeId && x.openid) byEid[x.employeeId] = x.openid; });
    eids.forEach((e) => { if (!byEid[e]) unmatched.push(e); }); // 未匹配工号回传前端提示
  }
  const added = [];
  for (const r of rows) {
    if (!r || !r.name) continue; // 名称必填，跳过空行
    const doc = {
      code: r.code || await generateToolCode(r.category || 'manual'),
      name: r.name,
      category: r.category || 'manual',
      spec: r.spec || '',
      factoryNo: r.factoryNo || '',
      purchaseDate: r.purchaseDate || '',
      testPeriod: Number(r.testPeriod) || 6,
      lastTestDate: r.lastTestDate || '',
      expireAt: r.expireAt || '',
      store: r.store || '',
      keeper: (r.keeper && byEid[r.keeper.trim()]) || r.keeper || '',
      source: r.source || 'self',
      leaseUnit: r.leaseUnit || '',
      certNo: r.certNo || '',
      operator: (r.operator && byEid[r.operator.trim()]) || r.operator || '',
      status: 'qualified',
      orgId,
      // 优化#11：批量导入同样写「入库建档」履历
      operations: [{ type: 'created', ts: new Date(), by: u ? `${u.username || u.nickname || ''}${u.employeeId ? '（' + u.employeeId + '）' : ''}` : '', note: '批量导入建档' }],
      testRecords: [],
      createdBy: u ? `${u.username || u.nickname || ''}${u.employeeId ? '（' + u.employeeId + '）' : ''}` : '',
      createdByOpenid: getOpenid(),
      createdAt: new Date(),
    };
    const a = await addTool(doc);
    added.push(a._id);
  }
  return ok({ count: added.length, unmatched });
}

// 台账统计卡（M1.1.4）—— 复用 RBAC 范围推导，支持管理员按 unitId/orgId 下钻分台账
async function ledgerStats(payload) {
  const where = await scopeWhere({}, {
    orgId: payload.orgId || undefined,
    unitId: payload.unitId || undefined,
  });
  const [total, qualified, pending, scrapped, maintaining, missing, inUse, highRisk] = await Promise.all([
    countTools({ ...where }),
    countTools({ ...where, status: 'qualified' }),
    countTools({ ...where, status: 'pending_test' }),
    countTools({ ...where, status: 'scrapped' }),
    countTools({ ...where, status: 'maintaining' }),
    countTools({ ...where, status: 'missing' }),
    countTools({ ...where, status: 'in_use' }),
    countTools({ ...where, category: _.in(HIGH_RISK_CATS) }),
  ]);
  return ok({
    total: total.total, qualified: qualified.total, pendingTest: pending.total,
    scrapped: scrapped.total, maintaining: maintaining.total, missing: missing.total,
    inUse: inUse.total, highRisk: highRisk.total,
  });
}

// 台账导出（M1.1.3）：服务端聚合明细，前端落盘/复制
async function exportLedger(payload = {}) {
  const { status, category, source, keyword, orgId, highRisk } = payload;
  let where = {};
  if (status) where.status = status;
  if (category) where.category = category;
  if (source) where.source = source;
  if (keyword) {
    // FEAT-03：关键词搜索扩展为 名称/编号/库房/保管人/出厂编号 多字段 OR 匹配，便于现场按任一已知信息检索
    const kw = regExp(keyword, 'i');
    where = _.and([
      where,
      _.or([
        { name: kw },
        { code: kw },
        { store: kw },
        { keeper: kw },
        { factoryNo: kw },
      ]),
    ]);
  }
  if (highRisk) where.category = _.in(HIGH_RISK_CATS);
  where = await scopeWhere(where, payload);
  const res = await listTools(where, 200, 0);
  const LIST = (t) => (t || []);
  const rows = LIST(res.data).map((t) => ({
    code: t.code, name: t.name, category: t.category, spec: t.spec || '',
    status: t.status || '', source: t.source || 'self', store: t.store || '', keeper: t.keeper || '',
    expireAt: t.expireAt || '', lastTestDate: t.lastTestDate || '', purchaseDate: t.purchaseDate || '',
  }));
  return ok({ count: rows.length, rows });
}

// 编码/二维码生成（M1.3.2 / M14.1.1）
async function genBarcode(payload) {
  const { id } = payload;
  const res = await findTool(id);
  if (!res.data) return fail('器具不存在', 404);
  const t = res.data;
  const qr = (t.code || '').replace(/-/g, '');
  return ok({ code: t.code, qr, name: t.name, expireAt: t.expireAt, store: t.store, keeper: t.keeper });
}

// 条码打印文件元数据（M14.1.2，PDF/标签生成由前端完成）
async function barcodeFile(payload) {
  const { id } = payload;
  const res = await findTool(id);
  if (!res.data) return fail('器具不存在', 404);
  const t = res.data;
  return ok({
    fileType: 'label',
    fields: { code: t.code, name: t.name, expireAt: t.expireAt, store: t.store, keeper: t.keeper },
    generatedAt: new Date(),
  });
}

// 批量生成条码（M14 批量操作）：对一组器具生成二维码明文
async function batchGen(payload) {
  const { ids = [] } = payload;
  if (!Array.isArray(ids) || ids.length === 0) return fail('缺少器具 ID 列表');
  const res = await listTools({ _id: _.in(ids) }, ids.length);
  const list = (res.data || []).map((t) => ({
    _id: t._id, code: t.code, name: t.name,
    qr: (t.code || '').replace(/-/g, ''), expireAt: t.expireAt,
  }));
  return ok({ count: list.length, list });
}

// 器具删除：仅 admin/lead/supervisor 可删除；非管理员只能删除自身绑定机构的器具
// 已领用中(in_use)的器具禁止删除
async function del(payload) {
  const openid = getOpenid();
  const { id } = payload;
  const res = await findTool(id);
  if (!res.data) return fail('器具不存在', 404);
  const t = res.data;

  // 鉴权：仅 admin/lead/supervisor 可删除
  const me = await getCurrentUser(openid);
  if (!me || me.status === 'disabled') return fail('账号不可用', 403);
  const isAdmin = TOOL_MGMT.includes(me.role);

  // 非管理员只能删除自身绑定机构的器具
  if (!isAdmin && t.orgId !== me.orgId) return fail('无权删除其他机构器具', 403);

  // 删除前校验：已领用中禁止删除
  if (t.status === 'in_use') return fail('请先归还');

  // 删除操作：从 tools 表 remove
  await removeTool(id);
  return ok({ _id: id });
}

exports.main = __limiter.wrap(async (event) => {
  const { action, payload = {} } = event;
  try {
    switch (action) {
      case 'list': return list(payload);
      case 'detail': return detail(payload);
      case 'create': return create(payload);
      case 'update': return update(payload);
      case 'import': return importTools(payload);
      case 'ledgerStats': return ledgerStats(payload);
      case 'export': return exportLedger(payload);
      case 'genBarcode': return genBarcode(payload);
      case 'barcodeFile': return barcodeFile(payload);
      case 'batchGen': return batchGen(payload);
      case 'delete': return del(payload);
      default: return fail('未知 action: ' + action);
    }
  } catch (e) {
    return fail(e.message || '服务异常');
  }
}, 'tool');
