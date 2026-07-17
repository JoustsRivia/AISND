// cloudfunctions/training/index.js —— M9 培训持证（纯业务，只引用 helpers）
const { getOpenid } = require('./helpers/user');
const db = require('./helpers/db');
const ok = (data) => ({ code: 0, data });
const fail = (message, code = 1) => ({ code, message });
const now = () => new Date();

// 课程库（M9.1）
async function courses() {
  const res = await db.listBy('training_courses', {}, 50);
  return ok(res.data || []);
}

// 指派培训（M9.2）
async function assign(payload) {
  const doc = { ...payload, status: 'assigned', createdAt: now() };
  const added = await db.add('training_records', doc);
  return ok({ _id: added._id, ...doc });
}

// 签到考核（M9.3）：完成 + 发证
async function signIn(payload) {
  const { id, score = 0, certified = false } = payload;
  const r = await db.getById('training_records', id);
  if (!r.data) return fail('培训记录不存在', 404);
  await db.update('training_records', id, { status: 'done', score, certified, signedAt: now() });
  if (certified && r.data.userId) {
    await db.add('certificates', { userId: r.data.userId, courseId: r.data.courseId, score, issuedAt: now() }).catch(() => {});
  }
  return ok({ id, certified });
}

// 我的培训档案（M9.4）
async function myRecords() {
  const openid = getOpenid();
  const u = await db.userByOpenid(openid);
  const userId = u.data && u.data[0] ? u.data[0]._id : '';
  const res = await db.listBy('training_records', userId ? { userId } : {}, 50);
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
