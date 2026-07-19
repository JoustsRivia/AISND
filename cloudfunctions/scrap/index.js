// cloudfunctions/scrap/index.js
// 业务逻辑层（M8 报废 P0）：只引用 ./helpers，绝不直接 cloud.database()/getWXContext()。
const { getOpenid } = require('./helpers/user');
const {
  findTool, updateTool, addScrap, updateScrap, listScrap, listTools,
  getCurrentUser, add, listBy, _, findUser, listOrgs, allowedOrgIds,
} = require('./helpers/db');

const ok = (data) => ({ code: 0, data });
const fail = (message, code = 1) => ({ code, message });

// 服务端角色鉴权（S1）：仅安全员/项目部负责人/专班可审批报废
const ROLE_APPROVE = ['safety_officer', 'project_lead', 'lead'];
async function requireApprover() {
  const u = await getCurrentUser(getOpenid());
  if (!u || u.status === 'disabled') return { err: fail('账号不可用', 403) };
  if (!ROLE_APPROVE.includes(u.role)) return { err: fail('仅安全员/项目部负责人/专班可审批报废', 403) };
  return { u };
}

// 强制报废 7 项自动判定（M8.1.1）
const SCRAP_RULES = {
  breakdown: '绝缘击穿',
  deformation: '严重变形',
  crack: '裂纹损伤',
  aging: '老化失效',
  over_life: '超过使用年限',
  failed_test: '检验不合格',
  unrepairable: '无法修复',
};
// 各类别使用年限（年）：绝缘/高空/起重从严
const LIFESPAN = { insulation: 5, height: 5, lifting: 8, motor: 5, measure: 6, manual: 10, temp_power: 6, lease: 6 };

async function judge(payload) {
  const { id, symptoms = [] } = payload;
  let t = null;
  if (id) {
    const res = await findTool(id);
    t = res.data || null;
  }
  const hits = [];
  (symptoms || []).forEach((s) => { if (SCRAP_RULES[s]) hits.push(SCRAP_RULES[s]); });
  if (t) {
    if (t.purchaseDate && LIFESPAN[t.category]) {
      const yrs = (Date.now() - new Date(t.purchaseDate).getTime()) / 31536000000;
      if (yrs >= LIFESPAN[t.category]) hits.push(`超过使用年限（${LIFESPAN[t.category]}年）`);
    }
    const last = (t.testRecords || []).slice(-1)[0];
    if (last && last.result === 'fail') hits.push('检验不合格');
    if (t.status === 'forbidden') hits.push('已被禁用');
  }
  const reasons = [...new Set(hits)];
  return ok({ mustScrap: reasons.length > 0, reasons, rules: SCRAP_RULES });
}

// 待审批 + 禁用候选（M8.1.1 自动判定）
async function autoCheck() {
  const res = await listScrap({ status: 'pending' });
  const pending = res.data || [];
  const res2 = await listTools({ status: 'forbidden' }, 200);
  const candidates = (res2.data || []).map((t) => ({ _id: t._id, code: t.code, name: t.name, category: t.category }));
  return ok({ pending, candidates });
}

// 报废申请（M8.1.2）：提交即禁用以待审批
async function submit(payload) {
  const openid = getOpenid();
  const { id, reason, photos, symptoms } = payload;
  const res = await findTool(id);
  if (!res.data) return fail('器具不存在', 404);
  const j = await judge({ id, symptoms: symptoms || [] });
  const jd = j.data || {};
  const rec = await addScrap({
    toolId: id, code: res.data.code, name: res.data.name,
    reason: reason || '', photos: photos || [], symptoms: symptoms || [],
    mustScrap: jd.mustScrap, reasons: jd.reasons || [],
    status: 'pending', applicant: openid, orgId: res.data.orgId, createdAt: new Date(),
  });
  await updateTool(id, { status: 'forbidden', updatedAt: new Date() });
  return ok({ scrapId: rec._id, mustScrap: jd.mustScrap, reasons: jd.reasons || [] });
}

// 报废审批（M8.1.3）：服务端角色校验
async function approve(payload) {
  const g = await requireApprover();
  if (g.err) return g.err;
  const { scrapId, approve: pass } = payload;
  const rec = await getScrap(scrapId);
  if (!pass) {
    // 先落报废记录（数据真相源），再回写器具状态；即使回写失败也不留「记录待审、器具已恢复」的脏数据
    if (rec) {
      await updateScrap(scrapId, { status: 'rejected', updatedAt: new Date() });
      await updateTool(rec.toolId, { status: 'qualified', updatedAt: new Date() });
    } else {
      console.error('[scrap] approve reject: 报废记录不存在', scrapId);
      await updateScrap(scrapId, { status: 'rejected', updatedAt: new Date() });
    }
    return ok({ status: 'rejected' });
  }
  if (!rec) return fail('报废记录不存在', 404);
  // 先更新报废记录为 approved，再同步器具为 scrapped，避免部分失败导致状态不一致
  await updateScrap(scrapId, { status: 'approved', updatedAt: new Date() });
  await updateTool(rec.toolId, { status: 'scrapped', updatedAt: new Date() });
  return ok({ status: 'approved' });
}

// 报废处置（M8.2 回收/销毁/台账同步）+ M8.2.4 外流异动告警
async function disposal(payload) {
  const g = await requireApprover();
  if (g.err) return g.err;
  const { scrapId, method, destroyedAt, handler, photos } = payload;
  const rec = await getScrap(scrapId);
  if (!rec) return fail('报废记录不存在', 404);
  await updateScrap(scrapId, {
    method: method || '', destroyedAt: destroyedAt || new Date(),
    handler: handler || '', photos: photos || [],
    status: 'disposed', updatedAt: new Date(),
  });
  const toolRes = await findTool(rec.toolId);
  const t = toolRes.data || {};
  const op = { type: 'scrap', ts: new Date(), note: '报废处置完成，已不可逆销毁' };
  await updateTool(rec.toolId, {
    status: 'scrapped',
    operations: [...(t.operations || []), op],
    updatedAt: new Date(),
  });
  // M8.2.4：处置完成却仍登记库位/保管人 → 疑似外流，写告警（去重）
  if (t.store || t.keeper) {
    const exist = await listBy('warnings', { type: 'scrap_outflow', refId: rec.toolId, read: _.neq(true) }, 10);
    if (!exist.data || exist.data.length === 0) {
      await add('warnings', {
        level: 'urgent', type: 'scrap_outflow', refId: rec.toolId, toolId: rec.toolId,
        title: '报废器具未完成物理移出',
        content: `${t.name}（${t.code}）已报废处置，但仍登记在「${t.store || '未知库位'}」，请立即物理隔离移出，防止外流`,
        read: false, createdAt: new Date(),
      });
    }
  }
  return ok({ status: 'disposed' });
}

// 待审批/处置列表（审批页、处置页共用）
async function list(payload = {}) {
  const openid = getOpenid();
  let where = { status: payload.status || 'pending' };
  // RBAC 数据范围（item 1）：单位/机构级角色在报废待审列表里强制按组织子树收窄
  const me = await findUser(openid);
  const u = me.data && me.data[0];
  const orgs = (await listOrgs(500)).data || [];
  const ids = allowedOrgIds(u, orgs, { orgId: payload.orgId, unitId: payload.unitId });
  if (ids === null) {
    // 全局角色：看全量（不过滤 orgId）
  } else if (ids.includes('__unbound__')) {
    where.orgId = '__unbound__'; // 无任何可见组织数据 → 命中空集
  } else {
    where.orgId = _.in(ids);
  }
  const res = await listScrap(where);
  return ok(res.data || []);
}

async function getScrap(id) {
  const res = await listScrap({ _id: id });
  return (res.data || [])[0];
}

exports.main = async (event) => {
  const { action, payload = {} } = event;
  try {
    switch (action) {
      case 'judge': return judge(payload);
      case 'autoCheck': return autoCheck();
      case 'list': return list(payload);
      case 'submit': return submit(payload);
      case 'approve': return approve(payload);
      case 'disposal': return disposal(payload);
      default: return fail('未知 action: ' + action);
    }
  } catch (e) { return fail(e.message || '服务异常'); }
};
