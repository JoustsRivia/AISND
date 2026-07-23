// utils/user-utils.js
// 全局用户工具函数：搜索、格式化、解析、显示。
// 纯工具函数，不依赖 wx API，方便单元测试。
// 所有记录操作人、领用人等场景统一使用本模块中的函数。

const api = require('./api');

/**
 * searchUsers(keyword)
 * 从 api.listUsers() 拉取用户列表，按 keyword 模糊匹配 username/nickname/employeeId，
 * 返回匹配结果（最多 20 条）。
 * 每条含 { _id, openid, username, nickname, employeeId, role, orgId }
 *
 * @param {string} keyword 搜索关键词
 * @returns {Promise<Array>} 匹配的用户列表
 */
async function searchUsers(keyword) {
  if (!keyword || !String(keyword).trim()) return [];
  const kw = String(keyword).toLowerCase();
  try {
    const r = await api.listUsers();
    const list = (r && r.list) || [];
    const matched = list.filter((u) =>
      [u.username, u.nickname, u.employeeId].some(
        (f) => f != null && String(f).toLowerCase().includes(kw)
      )
    );
    return matched.slice(0, 20).map((u) => ({
      _id: u._id,
      openid: u.openid,
      username: u.username,
      nickname: u.nickname,
      employeeId: u.employeeId,
      role: u.role,
      orgId: u.orgId,
    }));
  } catch (e) {
    console.error('[user-utils] searchUsers 失败', e);
    return [];
  }
}

/**
 * formatUser(user)
 * 返回 `username（employeeId）` 格式的可读字符串。
 * 如工号为空则只返回 username。
 *
 * @param {object} user 用户对象，需含 username / employeeId
 * @returns {string}
 */
function formatUser(user) {
  if (!user) return '';
  const name = user.username || user.nickname || '';
  const eid = user.employeeId || '';
  return eid ? `${name}（${eid}）` : name;
}

/**
 * resolveUser(openid)
 * 通过 openid 查找用户，返回 formatUser 格式的可读字符串。
 * 查找失败时回退到 openid。
 *
 * @param {string} openid
 * @returns {Promise<string>}
 */
async function resolveUser(openid) {
  if (!openid) return '';
  try {
    const r = await api.listUsers();
    const list = (r && r.list) || [];
    const u = list.find((x) => x.openid === openid);
    if (u) return formatUser(u);
  } catch (e) {
    console.error('[user-utils] resolveUser 失败', e);
  }
  return openid; // 回退到 openid
}

/**
 * displayName(user)
 * 返回用户显示名：优先 nickname，其次 username。
 *
 * @param {object} user 用户对象
 * @returns {string}
 */
function displayName(user) {
  if (!user) return '';
  return user.nickname || user.username || '';
}

module.exports = {
  searchUsers,
  formatUser,
  resolveUser,
  displayName,
};
