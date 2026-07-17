// cloudfunctions/auth/index.js
// 业务逻辑层：只引用 ./helpers，绝不直接调用 cloud.database() / cloud.getWXContext()。
// 所有平台专属能力都被 helpers 封装，迁移时本文件无需改动。
const { getOpenid } = require('./helpers/user');
const { findUser, addUser, updateUser } = require('./helpers/db');

// F2 安全修复：服务端角色白名单，禁止客户端伪造 role 提权。
// 仅「操作类」角色允许在首次登录自绑定；审批 / 决策 / 督查类角色权限极高，
// 必须由系统管理员在 pkg-system 后台分配（与 updateProfile 排除 role/orgId 的策略一致）。
// 与 utils/constants.js 的 ROLES 保持同源；此处硬编码以建立服务端权威边界，避免跨部署依赖。
const SELF_BINDABLE_ROLES = ['worker', 'group_lead', 'safety_officer', 'lease_admin'];

// 统一出口
const ok = (data) => ({ code: 0, data });
const fail = (message, code = 1) => ({ code, message });

// 登录/注册合一：首次进入自动建档
async function login() {
  const openid = getOpenid();
  const exist = await findUser(openid);
  if (exist.data && exist.data.length) {
    return ok(exist.data[0]);
  }
  const created = await addUser({
    openid,
    role: 'worker',      // 默认角色，由管理员在系统管理后台调整
    orgId: '',
    bound: false,        // 自动建档未绑定账号，登录守卫据此拦截
    createdAt: new Date(),
    status: 'active',
  });
  const fresh = await findUser(openid);
  return ok(fresh.data[0]);
}

async function getProfile() {
  const openid = getOpenid();
  const res = await findUser(openid);
  if (!res.data || !res.data.length) return fail('用户不存在，请先登录', 404);
  return ok(res.data[0]);
}

async function updateProfile(payload) {
  const openid = getOpenid();
  // 业务校验：不允许越权修改角色/orgId（由系统管理模块处理）
  const { role, orgId, ...safe } = payload;
  await updateUser(openid, { ...safe, updatedAt: new Date() });
  const res = await findUser(openid);
  return ok(res.data[0]);
}

const crypto = require('crypto');
function hashPwd(p) { return p ? crypto.createHash('sha1').update('tms_' + p).digest('hex') : ''; }

// 注册新用户（UI② 注册按钮）：写入角色/单位/机构/账号/密码到 users 集合
// 与 bindAccount 共用白名单与服务端校验，避免客户端伪造提权角色。
async function register(payload) {
  const openid = getOpenid();
  const { role, unitId, orgId, username, nickname, password } = payload;
  if (!SELF_BINDABLE_ROLES.includes(role)) {
    return fail('角色不合法或需管理员分配：' + (role || '空'), 403);
  }
  if (!orgId) return fail('请选择所属机构 / 班组', 400);
  await updateUser(openid, {
    role,
    unitId: unitId || '',
    orgId,
    username: username || '',
    nickname: nickname || '',
    password: hashPwd(password),
    bound: true,
    updatedAt: new Date(),
  });
  const res = await findUser(openid);
  return ok(res.data[0]);
}

// 首次登录绑定：允许设置角色/机构/账号（UI② 显式登录）
async function bindAccount(payload) {
  const openid = getOpenid();
  const { role, unitId, orgId, username, nickname } = payload;

  // 服务端角色校验：不在白名单内（含伪造的 lead/project_lead/supervisor 等提权角色）一律拒绝
  if (!SELF_BINDABLE_ROLES.includes(role)) {
    return fail('角色不合法或需管理员分配：' + (role || '空'), 403);
  }

  await updateUser(openid, {
    role,
    unitId: unitId || '',
    orgId: orgId || '',
    username: username || '',
    nickname: nickname || '',
    bound: true, updatedAt: new Date(),
  });
  const res = await findUser(openid);
  return ok(res.data[0]);
}

// 凭证登录（UI② 登录按钮）：本 openid 账号须已注册（bound+密码），核对账号与密码
// 同一微信身份按 openid 唯一建档，注册即绑定；此处仅做身份确认闸门。
async function signin(payload) {
  const openid = getOpenid();
  const { username, password } = payload;
  if (!username || !password) return fail('请输入账号和密码', 400);
  const res = await findUser(openid);
  if (!res.data || !res.data.length) return fail('账号未注册，请先注册', 404);
  const u = res.data[0];
  if (!u.bound) return fail('账号未完成注册，请先注册', 403);
  if ((u.username || '') !== username) return fail('账号不正确', 401);
  if (u.password !== hashPwd(password)) return fail('密码不正确', 401);
  return ok(u);
}

// 云函数入口：按 action 路由到纯业务函数
exports.main = async (event) => {
  const { action, payload = {} } = event;
  try {
    switch (action) {
      case 'login': return login();
      case 'register': return register(payload);
      case 'signin': return signin(payload);
      case 'getProfile': return getProfile();
      case 'updateProfile': return updateProfile(payload);
      case 'bindAccount': return bindAccount(payload);
      default: return fail('未知 action: ' + action);
    }
  } catch (e) {
    return fail(e.message || '服务异常');
  }
};
