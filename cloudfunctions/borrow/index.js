// cloudfunctions/borrow/index.js
// 业务逻辑层（M5 领用归还 P0）：只引用 ./helpers，绝不直接 cloud.database()/getWXContext()。
const { getOpenid } = require('./helpers/user');
const { findTool, updateTool, findUser, addBorrow, listBorrow, listBy, addRepair, listOrgs, _, allowedOrgIds, roleScope } = require('./helpers/db');

const ok = (data) => ({ code: 0, data });
const fail = (message, code = 1) => ({ code, message });

// 需持证的器具类别
const SPECIAL = ['lifting', 'height', 'motor', 'lease'];

// 校验领用人是否持有效证件（特种设备）：必须持有与器具类别精确对应的有效证件，
// 杜绝「持任意一种特种证即可领用所有特种设备」的泛判越权。
async function hasValidCert(openid, category) {
  if (!SPECIAL.includes(category)) return true;
  const now = Date.now();
  const res = await listBy('certificates', { openid, status: 'valid' }, 20);
  return (res.data || []).some(
    (c) => new Date(c.expireAt).getTime() > now && (c.category === category || c.category === 'all'),
  );
}

// 领用（M5.1.1~M5.1.3）
// R11：borrow 增加跨组织隔离校验——非全局角色只能领用自身可见组织子树内的器具
async function borrow(payload) {
  const openid = getOpenid();
  const { id } = payload;
  const res = await findTool(id);
  if (!res.data) return fail('器具不存在', 404);
  const t = res.data;

  // R11 跨组织隔离：校验调用者是否有权领用该组织器具
  const me = await findUser(openid);
  const u = me.data && me.data[0];
  if (u && roleScope(u.role) !== 'global') {
    const orgs = (await listOrgs(500)).data || [];
    const ids = allowedOrgIds(u, orgs, {});
    if (ids !== null && !ids.includes('__unbound__') && !ids.includes(t.orgId)) {
      return fail('无权领用其他组织器具', 403);
    }
  }

  // 资格校验：合格且在有效期内
  if (t.status !== 'qualified') return fail('器具不合格，禁止领用');
  if (t.expireAt && new Date(t.expireAt) <= new Date()) return fail('器具已超期，禁止领用');
  if (!(await hasValidCert(openid, t.category))) return fail('缺少有效特种作业证件，禁止领用');

  // 状态流转 + 操作记录
  const operatorName = u ? `${u.username || u.nickname || ''}${u.employeeId ? '（' + u.employeeId + '）' : ''}` : '';
  const op = { type: 'borrow', ts: new Date(), by: operatorName, byOpenid: openid, note: '领用即确认"谁领用、谁保管、谁负责"' };
  const patch = {
    status: 'in_use', borrower: openid,
    operations: [...(t.operations || []), op],
    updatedAt: new Date(),
  };
  await updateTool(id, patch);
  // 记录归属 orgId 随器具（服务端收窄，防越权挂靠）；borrow_records 新增 orgId 字段
  await addBorrow({ toolId: id, code: t.code, name: t.name, type: 'borrow', by: openid, orgId: t.orgId, ts: new Date() });
  return ok({ _id: id, status: 'in_use' });
}

// 归还（M5.2.1~M5.2.3）
async function returnTool(payload) {
  const openid = getOpenid();
  const { id, appearance } = payload; // appearance: normal / damaged
  const res = await findTool(id);
  if (!res.data) return fail('器具不存在', 404);
  const t = res.data;

  const damaged = appearance === 'damaged';
  const me = await findUser(openid);
  const u = me.data && me.data[0];
  const operatorName = u ? `${u.username || u.nickname || ''}${u.employeeId ? '（' + u.employeeId + '）' : ''}` : '';
  const op = { type: 'return', ts: new Date(), by: operatorName, byOpenid: openid, appearance };
  const patch = {
    status: damaged ? 'maintaining' : 'qualified', // 损坏 → 触发报修
    borrower: '',
    operations: [...(t.operations || []), op],
    updatedAt: new Date(),
  };
  if (damaged) patch.note = '归还外观损坏，已转入维修';
  await updateTool(id, patch);
  // 损坏时同步生成报修单，使维修流程（M7）能直接接管，避免「状态变 maintaining 却无人跟进」
  if (damaged) {
    try {
      await addRepair({
        toolId: id, code: t.code, name: t.name,
        fault: '归还外观损坏', desc: '归还时外观检查为损坏，自动转入报修',
        status: 'pending', reporter: openid, auto: true, createdAt: new Date(),
      });
    } catch (e) {
      console.error('[borrow] return auto-create repair failed', e);
    }
  }
  await addBorrow({ toolId: id, code: t.code, name: t.name, type: 'return', by: openid, orgId: t.orgId, appearance, ts: new Date() });
  return ok({ _id: id, status: patch.status, damaged });
}

// 领用/归还记录（M5.1.4 / M5.2.3）
async function records(payload = {}) {
  const openid = getOpenid(); // 服务端身份为准，忽略客户端伪造的 openid
  const { orgId, type } = payload;
  const where = {};
  if (type) where.type = type;

  // RBAC 数据范围（item 1：单位/机构级角色在真实领用列表里强制按组织子树收窄）
  // 复用 _shared/dbBase.js 单一源的 allowedOrgIds 统一推导（全局/单位/机构三档），迁移零改动。
  const me = await findUser(openid);
  const u = me.data && me.data[0];
  const orgs = (await listOrgs(500)).data || [];
  const ids = allowedOrgIds(u, orgs, { orgId: orgId || undefined, unitId: payload.unitId });
  if (ids === null) {
    // 全局角色：看全量（不过滤 orgId）
  } else if (ids.includes('__unbound__')) {
    where.orgId = '__unbound__'; // 无任何可见组织数据 → 命中空集
  } else {
    where.orgId = _.in(ids);
  }

  // 非全局/单位角色：仍仅看本人领用记录（保留原有「领用记录全员不可见」约束，防越权）
  if (!u || (roleScope(u.role) !== 'global' && roleScope(u.role) !== 'unit')) {
    where.by = openid;
  }

  const res = await listBorrow(where, 50);
  return ok(res.data || []);
}

exports.main = async (event) => {
  const { action, payload = {} } = event;
  try {
    switch (action) {
      case 'borrow': return borrow(payload);
      case 'return': return returnTool(payload);
      case 'records': return records(payload);
      default: return fail('未知 action: ' + action);
    }
  } catch (e) { return fail(e.message || '服务异常'); }
};
