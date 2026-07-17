// cloudfunctions/tool/index.js
// 业务逻辑层（M1 台账/档案/租赁/条码）：只引用 ./helpers，绝不直接 cloud.database()/getWXContext()。
const { getOpenid } = require('./helpers/user');
const {
  findUser, addTool, updateTool, findTool, listTools, countTools, listOrgs, regExp, _,
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

function genCode(category, seq) {
  const p = CODE_PREFIX[category] || 'QT';
  return `${p}-${new Date().getFullYear()}-${String(seq).padStart(4, '0')}`;
}

// 组织子树推导：返回 rootId 及其全部后代 ID（含自身），用于按角色收窄数据范围
async function subtreeIds(rootId) {
  if (!rootId) return [];
  const res = await listOrgs(500);
  const all = res.data || [];
  const ids = [rootId];
  const queue = [rootId];
  while (queue.length) {
    const cur = queue.shift();
    all.forEach((o) => {
      if (o.parentId === cur && !ids.includes(o._id)) {
        ids.push(o._id);
        queue.push(o._id);
      }
    });
  }
  return ids;
}

// 数据范围过滤（S2 / 问题4 RBAC）：
//   管理员（lead/supervisor）看全部；可显式 orgId 下钻，或 unitId 下钻整单位子树。
//   普通角色按自身 orgId 推导子树——绑到「班组」只看本班，绑到「项目部」看整个项目部；
//   并允许在自身子树内用 picker 进一步收窄（越权 orgId 一律忽略，保证不越界）。
async function scopeWhere(where, payload = {}) {
  const me = await findUser(getOpenid());
  const u = me.data && me.data[0];
  const isAdmin = u && (u.role === 'lead' || u.role === 'supervisor');
  if (isAdmin) {
    if (payload.orgId) {
      const ids = await subtreeIds(payload.orgId); // 支持单位/项目部/班组任意节点下钻
      if (ids.length) where.orgId = _.in(ids);
      return where;
    }
    if (payload.unitId) {
      const ids = await subtreeIds(payload.unitId);
      if (ids.length) where.orgId = _.in(ids);
      return where;
    }
    return where; // 全量
  }
  const base = (u && u.orgId) ? await subtreeIds(u.orgId) : [];
  if (!base.length) {
    where.orgId = '__unbound__'; // 无机构 → 查不到任何数据
    return where;
  }
  // 子树内下钻收窄；若传入 orgId 不在允许范围内则忽略（防越权）
  let scope = base;
  if (payload.orgId && base.includes(payload.orgId)) {
    scope = await subtreeIds(payload.orgId);
  }
  where.orgId = _.in(scope);
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
  return ok(res.data);
}

// 器具新增录入（M1.3.1）
async function create(payload) {
  const openid = getOpenid();
  // S5 修复：原 Date.now()%10000 同秒会撞码，违反"一物一码"。改用「时间基+随机后缀」。
  const seq = (Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36)).slice(-8);
  const code = genCode(payload.category, seq);
  const me = await findUser(openid);
  const orgId = (me.data && me.data[0] && me.data[0].orgId) || payload.orgId || '';
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

// 器具信息编辑（M1.3.4，记录变更）
async function update(payload) {
  const { id, ...rest } = payload;
  delete rest.code; delete rest.createdBy; delete rest.createdAt;
  await updateTool(id, { ...rest, updatedAt: new Date() });
  const res = await findTool(id);
  return ok(res.data);
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
