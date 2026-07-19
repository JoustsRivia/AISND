// cloudfunctions/tool/index.js
// 业务逻辑层（M1 台账/档案/租赁/条码）：只引用 ./helpers，绝不直接 cloud.database()/getWXContext()。
const { getOpenid } = require('./helpers/user');
const {
  findUser, addTool, updateTool, findTool, listTools, countTools, listOrgs, regExp, _, getCurrentUser,
  allowedOrgIds,
} = require('./helpers/db');

const ok = (data) => ({ code: 0, data });
const fail = (message, code = 1) => ({ code, message });

// 类别前缀（与 utils/constants.js TOOL_CATEGORIES 对应）
const CODE_PREFIX = {
  insulation: 'JY', motor: 'DD', manual: 'SG', lifting: 'ZL',
  height: 'AQ', measure: 'YB', temp_power: 'PD', lease: 'ZL',
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

function genCode(category, seq) {
  const p = CODE_PREFIX[category] || 'QT';
  return `${p}-${new Date().getFullYear()}-${String(seq).padStart(4, '0')}`;
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
  if (keyword) where.name = regExp(keyword, 'i');
  if (highRisk) where.category = _.in(HIGH_RISK_CATS); // M1.3.6 高危专项台账
  where = await scopeWhere(where, { ...payload, orgId: orgId || undefined, unitId: unitId || undefined });
  const skip = Math.max(0, (Number(page) - 1) * Number(size));
  const res = await listTools(where, Number(size), skip);
  const total = await countTools(where);
  return ok({ list: res.data || [], total: total.total, page: Number(page), size: Number(size) });
}

// 器具详情（一物一档：内嵌 operations / testRecords）
async function detail(payload) {
  const { id } = payload;
  const res = await findTool(id);
  if (!res.data) return fail('器具不存在', 404);
  return ok(derive(res.data)); // S2/P0：派生 expired + categoryName
}

// 器具新增录入（M1.3.1）—— 含服务端 RBAC（S5/P1：跨机构建档拦截）
async function create(payload) {
  const openid = getOpenid();
  const u = await getCurrentUser(openid);
  if (!u || u.status === 'disabled') return fail('账号不可用', 403);
  const isAdmin = u.role === 'lead' || u.role === 'supervisor' || u.role === 'admin';
  // 跨机构建档：非管理员只能落到自身绑定机构，显式 orgId 与自身不一致则拒绝
  if (payload.orgId && payload.orgId !== u.orgId && !isAdmin) return fail('无权为其他机构建档', 403);
  const orgId = (isAdmin && payload.orgId) ? payload.orgId : (u.orgId || '');
  if (!orgId) return fail('未绑定机构，无法建档', 403);
  // S5 修复：原 Date.now()%10000 同秒会撞码，违反"一物一码"。改用「时间基+随机后缀」。
  const seq = (Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36)).slice(-8);
  const code = genCode(payload.category, seq);
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
    operations: [],
    testRecords: [],
    createdBy: openid,
    createdAt: new Date(),
  };
  const added = await addTool(doc);
  return ok({ _id: added._id, ...doc });
}

// 器具信息编辑（M1.3.4，记录变更）—— 含服务端 RBAC（S5/P1：跨机构编辑拦截）
async function update(payload) {
  const { id, ...rest } = payload;
  const u = await getCurrentUser(getOpenid());
  if (!u || u.status === 'disabled') return fail('账号不可用', 403);
  const isAdmin = u.role === 'lead' || u.role === 'supervisor' || u.role === 'admin';
  const cur = await findTool(id);
  if (!cur.data) return fail('器具不存在', 404);
  // 非管理员只能编辑自身绑定机构的器具，防止越权改写他人机构档案
  if (!isAdmin && cur.data.orgId !== u.orgId) return fail('无权编辑其他机构器具', 403);
  delete rest.code; delete rest.createdBy; delete rest.createdAt; delete rest.orgId;
  await updateTool(id, { ...rest, updatedAt: new Date() });
  const res = await findTool(id);
  return ok(derive(res.data)); // S2/P0：派生 expired + categoryName
}

// 租赁机具专项列表（M1.3.7）
async function leaseList() {
  const res = await listTools({ source: 'lease' }, 50);
  return ok(res.data || []);
}

// 租赁机具登记（来源固定 lease，含检测合格证）
async function leaseCreate(payload) {
  return create({ ...payload, source: 'lease' });
}

// 台账批量导入（问题5）：按模板解析后的行批量建档，orgId 取当前用户机构（或显式覆盖）
async function importTools(payload) {
  const { rows = [] } = payload;
  if (!Array.isArray(rows) || !rows.length) return fail('缺少导入数据');
  const me = await findUser(getOpenid());
  const u = me.data && me.data[0];
  const orgId = (u && u.orgId) || payload.orgId || '';
  const added = [];
  for (const r of rows) {
    if (!r || !r.name) continue; // 名称必填，跳过空行
    const seq = (Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36)).slice(-8);
    const doc = {
      code: genCode(r.category || 'manual', seq),
      name: r.name,
      category: r.category || 'manual',
      spec: r.spec || '',
      factoryNo: r.factoryNo || '',
      purchaseDate: r.purchaseDate || '',
      testPeriod: Number(r.testPeriod) || 6,
      lastTestDate: r.lastTestDate || '',
      expireAt: r.expireAt || '',
      store: r.store || '',
      keeper: r.keeper || '',
      source: r.source || 'self',
      leaseUnit: r.leaseUnit || '',
      certNo: r.certNo || '',
      operator: r.operator || '',
      status: 'qualified',
      orgId,
      operations: [],
      testRecords: [],
      createdBy: getOpenid(),
      createdAt: new Date(),
    };
    const a = await addTool(doc);
    added.push(a._id);
  }
  return ok({ count: added.length });
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
  if (keyword) where.name = regExp(keyword, 'i');
  if (highRisk) where.category = _.in(HIGH_RISK_CATS);
  where = await scopeWhere(where, payload);
  const res = await listTools(where, 200, 0);
  const LIST = (t) => (t || []);
  const rows = LIST(res.data).map((t) => ({
    code: t.code, name: t.name, category: t.category, spec: t.spec || '',
    status: t.status, source: t.source || 'self', store: t.store || '', keeper: t.keeper || '',
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
  return ok({ code: t.code, qr, name: t.name, expireAt: t.expireAt, store: t.store });
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

exports.main = async (event) => {
  const { action, payload = {} } = event;
  try {
    switch (action) {
      case 'list': return list(payload);
      case 'detail': return detail(payload);
      case 'create': return create(payload);
      case 'update': return update(payload);
      case 'leaseList': return leaseList(payload);
      case 'leaseCreate': return leaseCreate(payload);
      case 'import': return importTools(payload);
      case 'ledgerStats': return ledgerStats(payload);
      case 'export': return exportLedger(payload);
      case 'genBarcode': return genBarcode(payload);
      case 'barcodeFile': return barcodeFile(payload);
      case 'batchGen': return batchGen(payload);
      default: return fail('未知 action: ' + action);
    }
  } catch (e) {
    return fail(e.message || '服务异常');
  }
};
