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
async function assign(payload) {
  const g = await requireRole('lead', 'safety_officer', 'project_lead', 'admin');
  if (g.err) return g.err;
  const { userId, courseId } = payload;
  if (!userId || !courseId) return fail('缺少 userId 或 courseId', 400);
  const me = await db.getCurrentUser(getOpenid());
  const doc = { ...payload, orgId: (me && me.orgId) || '', status: 'assigned', createdAt: now() };
  const added = await db.add('training_records', doc);
  return ok({ _id: added._id, ...doc });
}

// 签到考核（M9.3）：完成 + 发证。身份校验：签到人必须为被指派人，杜绝代签发证
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
      case 'signIn': return signIn(payload);
      case 'myRecords': return myRecords(payload);
      default: return fail('未知 action: ' + action);
    }
  } catch (e) {
    return fail(e.message || '服务异常');
  }
};
