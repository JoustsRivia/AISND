// cloudfunctions/test/index.js
// 业务逻辑层（M4 周期试验 P0）：只引用 ./helpers，绝不直接 cloud.database()/getWXContext()。
const { getOpenid } = require('./helpers/user');
const { findTool, updateTool, listTools, regExp } = require('./helpers/db');

const ok = (data) => ({ code: 0, data });
const fail = (message, code = 1) => ({ code, message });

const DAY = 86400000;
// 计算到期日：上次试验 + 周期(月)
function expireFrom(lastTestDate, periodMonths) {
  const d = new Date(lastTestDate || Date.now());
  d.setMonth(d.getMonth() + Number(periodMonths || 6));
  return d;
}

// 待检清单（M4.1.3 / M4.1.4：到期前15天归集，超期标记禁用）
async function dueList(payload = {}) {
  const { orgId } = payload;
  const where = orgId ? { orgId } : {};
  const res = await listTools(where, 100);
  const now = Date.now();
  const list = (res.data || []).filter((t) => {
    const exp = t.expireAt ? new Date(t.expireAt).getTime() : 0;
    const diff = (exp - now) / DAY;
    return diff <= 15; // 15天内（含超期）
  }).map((t) => {
    const exp = t.expireAt ? new Date(t.expireAt).getTime() : 0;
    const diff = Math.round((exp - now) / DAY);
    return {
      _id: t._id, code: t.code, name: t.name, category: t.category,
      expireAt: t.expireAt, overdue: diff < 0, daysLeft: diff,
      status: diff < 0 ? 'forbidden' : t.status,
    };
  });
  return ok(list);
}

// 送检登记 + 结果录入（M4.2）
async function submit(payload) {
  const openid = getOpenid();
  const { id, testOrg, result, reportFileId, testDate } = payload;
  const toolRes = await findTool(id);
  if (!toolRes.data) return fail('器具不存在', 404);
  const t = toolRes.data;

  const record = {
    ts: new Date(), testOrg: testOrg || '',
    result: result, reportFileId: reportFileId || '', testDate: testDate || new Date(),
  };

  const passed = result === 'qualified';
  const lastTestDate = testDate || new Date();
  const period = t.testPeriod || 6;
  const expireAt = expireFrom(lastTestDate, period);

  const patch = {
    lastTestDate,
    expireAt,
    status: passed ? 'qualified' : 'scrapped',
    testRecords: [...(t.testRecords || []), record],
    updatedAt: new Date(),
  };
  // 不合格 → 自动转入报废（M4.2.4）
  if (!passed) patch.status = 'scrapped';

  await updateTool(id, patch);
  const fresh = await findTool(id);
  return ok(fresh.data);
}

// 标识真伪核验（M4.3.1）：扫码查真实试验记录
async function verifyTag(payload) {
  const { code } = payload;
  const res = await listTools({ code: regExp('^' + (code || '').replace(/[-]/g, '') + '$', 'i') }, 1);
  const t = (res.data || [])[0];
  if (!t) return fail('未匹配到器具', 404);
  return ok({
    code: t.code, name: t.name, status: t.status,
    lastTestDate: t.lastTestDate, expireAt: t.expireAt,
    valid: t.status === 'qualified' && new Date(t.expireAt) > new Date(),
    testRecords: t.testRecords || [],
  });
}

exports.main = async (event) => {
  const { action, payload = {} } = event;
  try {
    switch (action) {
      case 'dueList': return dueList(payload);
      case 'submit': return submit(payload);
      case 'verifyTag': return verifyTag(payload);
      default: return fail('未知 action: ' + action);
    }
  } catch (e) { return fail(e.message || '服务异常'); }
};
