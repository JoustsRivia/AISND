// cloudfunctions/training/index.js —— M9 培训持证（纯业务，只引用 helpers）
const { getOpenid } = require('./helpers/user');
const db = require('./helpers/db');
const ok = (data) => ({ code: 0, data });
const fail = (message, code = 1) => ({ code, message });
const now = () => new Date();

// 服务端角色鉴权（S1）：仅授权的管理角色可执行敏感操作
async function requireRole(...roles) {
  const openid = getOpenid();
  const u = await db.userByOpenid(openid);
  const user = u.data && u.data[0];
  if (!user || user.status === 'disabled') return { err: fail('账号不可用', 403) };
  if (!roles.includes(user.role)) return { err: fail('无操作权限', 403) };
  return { u: user };
}

// 课程库（M9.1）
async function courses() {
  const res = await db.listBy('training_courses', {}, 50);
  return ok(res.data || []);
}

// 指派培训（M9.2）：仅 lead/safety_officer/project_lead/admin 可指派
// R25：支持多选人员（userIds[]），批量写入 training_records
async function assign(payload) {
  const g = await requireRole('lead', 'safety_officer', 'project_lead', 'admin');
  if (g.err) return g.err;
  const { userId, userIds, courseId, title, type, startAt, endAt, location, content } = payload;
  if (!courseId) return fail('缺少 courseId', 400);
  // 兼容单选 userId 和多选 userIds
  const ids = userIds && userIds.length ? userIds : (userId ? [userId] : []);
  if (!ids.length) return fail('缺少参训人员', 400);
  const me = await db.getCurrentUser(getOpenid());
  const created = [];
  for (const uid of ids) {
    const doc = {
      userId: uid, courseId, title: title || '', type: type || '',
      startAt: startAt || '', endAt: endAt || '', location: location || '', content: content || '',
      orgId: (me && me.orgId) || '', status: 'assigned',
      assignedOpenid: getOpenid(), createdAt: now(),
    };
    const added = await db.add('training_records', doc);
    created.push(added._id);
  }
  return ok({ count: created.length, ids: created });
}

// R25 参训确认：被指派人确认参训
async function confirm(payload) {
  const openid = getOpenid();
  const r = await db.getById('training_records', payload.id);
  if (!r.data) return fail('培训记录不存在', 404);
  const rec = r.data;
  const u = await db.userByOpenid(openid);
  const me = u.data && u.data[0];
  const isAssigned = !!rec.assignedOpenid && rec.assignedOpenid === openid;
  const isSelf = !!rec.userId && (rec.userId === (me && me._id) || rec.userId === openid);
  if (!isAssigned && !isSelf) return fail('非被指派人，不可确认', 403);
  if (rec.status !== 'assigned') return fail('当前状态不可确认参训', 400);
  await db.update('training_records', payload.id, { status: 'confirmed', confirmedAt: now() });
  return ok({ id: payload.id, status: 'confirmed' });
}

// R25 完成培训：管理员或指派人标记完成
async function complete(payload) {
  const g = await requireRole('lead', 'safety_officer', 'project_lead', 'admin');
  if (g.err) return g.err;
  const r = await db.getById('training_records', payload.id);
  if (!r.data) return fail('培训记录不存在', 404);
  await db.update('training_records', payload.id, { status: 'done', completedAt: now() });
  return ok({ id: payload.id, status: 'done' });
}

// R25 培训评价：参训人打分 + 文字评价
async function evaluate(payload) {
  const openid = getOpenid();
  const { id, score = 0, comment = '' } = payload;
  const r = await db.getById('training_records', id);
  if (!r.data) return fail('培训记录不存在', 404);
  const rec = r.data;
  const u = await db.userByOpenid(openid);
  const me = u.data && u.data[0];
  const isSelf = !!rec.userId && (rec.userId === (me && me._id) || rec.userId === openid);
  if (!isSelf) return fail('仅参训人可评价', 403);
  const s = Number(score);
  if (isNaN(s) || s < 0 || s > 100) return fail('分数需为 0~100', 400);
  await db.update('training_records', id, { score: s, comment, evaluatedAt: now() });
  return ok({ id, score: s, comment });
}

// 签到考核（M9.3）：完成 + 发证。身份校验：签到人必须为被指派人，杜绝代签发证
// R25：移除硬编码 score/certified，改为接收真实参数
async function signIn(payload) {
  const { id, score = 0, certified = false } = payload;
  const openid = getOpenid();
  const r = await db.getById('training_records', id);
  if (!r.data) return fail('培训记录不存在', 404);
  const rec = r.data;
  // 身份校验：签到人 openid 须等于记录 assignedOpenid，或本人 userId 与记录 userId 一致
  const u = await db.userByOpenid(openid);
  const me = u.data && u.data[0];
  const meId = me ? me._id : '';
  const isAssigned = !!rec.assignedOpenid && rec.assignedOpenid === openid;
  const isSelf = !!rec.userId && (rec.userId === meId || rec.userId === openid);
  if (!isAssigned && !isSelf) return fail('不可代签', 403);
  await db.update('training_records', id, { status: 'done', score, certified, signedAt: now() });
  if (certified && rec.userId) {
    await db.add('certificates', { userId: rec.userId, courseId: rec.courseId, score, issuedAt: now() }).catch(() => {});
  }
  return ok({ id, certified });
}

// 我的培训档案（M9.4）：按当前 openid 对应 userId 过滤，避免空 userid 查全量
async function myRecords() {
  const openid = getOpenid();
  const u = await db.userByOpenid(openid);
  const userId = u.data && u.data[0] ? u.data[0]._id : '';
  if (!userId) return ok([]); // 无对应用户时返回空，避免误查全量
  const res = await db.listBy('training_records', { userId }, 50);
  return ok(res.data || []);
}

exports.main = async (event) => {
  const { action, payload = {} } = event;
  try {
    switch (action) {
      case 'courses': return courses(payload);
      case 'assign': return assign(payload);
      case 'confirm': return confirm(payload);
      case 'complete': return complete(payload);
      case 'evaluate': return evaluate(payload);
      case 'signIn': return signIn(payload);
      case 'myRecords': return myRecords(payload);
      default: return fail('未知 action: ' + action);
    }
  } catch (e) {
    return fail(e.message || '服务异常');
  }
};
