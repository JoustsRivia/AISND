// cloudfunctions/auth/index.js
// 业务逻辑层：只引�? ./helpers，绝不直接调�? cloud.database() / cloud.getWXContext()�?
// 所有平台专属能力都�? helpers 封装，迁移时本文件无需改动�?
const { getOpenid } = require('./helpers/user');

const { createRateLimiter } = require('./helpers/rateLimiter');
const __limiter = createRateLimiter({ getOpenid });
const { findUser, addUser, updateUser, update, listUsers, remove, listBy, listAll } = require('./helpers/db');
const { passwordError } = require('./helpers/password');

// F2 安全修复：服务端角色白名单，禁止客户端伪�? role 提权�?
// 普通业务角�? + 专班负责�?/项目部负责人/安监部管理人�? 均允许在注册时自绑定�?
// 「小程序管理�?(admin)」权限极高，不在此白名单，须由系统初始化/控制台分配，避免越权自建�?
// �? utils/constants.js �? ROLES 保持同源；此处硬编码以建立服务端权威边界，避免跨部署依赖�?
const { ROLE_SELF_BINDABLE } = require('./helpers/roles');

// 角色 ↔ 组织节点类型权威映射（与 utils/role-tree.js 的 orgKind 语义同源）：
// 服务端硬编码以建立权威边界（云函数不得 require 前端目录）。注册/绑定共用。
const ORG_KIND_MAP = { a1:'unit',a2:'unit', b11:'unit',b12:'unit', b21:'project',b22:'project',b23:'team',b24:'team', c11:'unit',c12:'unit', c21:'project',c22:'project',c23:'team',c24:'team' };

// 统一出口
const ok = (data) => ({ code: 0, data });
const fail = (message, code = 1) => ({ code, message });

// 登录/注册合一：首次进入自动建�?
async function login() {
  const openid = getOpenid();
  const exist = await findUser(openid);
  if (exist.data && exist.data.length) {
    return ok(exist.data[0]);
  }
  const created = await addUser({
    openid,
    role: 'b24',         // 默认角色（班组作业人员），由管理员在系统管理后台调整；词表=三级树码
    orgId: '',
    bound: false,        // 自动建档未绑定账号，登录守卫据此拦截
    createdAt: new Date(),
    status: 'active',
  });
  const fresh = await findUser(openid);
  return ok((fresh.data && fresh.data[0]) || null); // 优化#2 空值守卫：写后重查空结果返回 null 而非 undefined
}

async function getProfile() {
  const openid = getOpenid();
  const res = await findUser(openid);
  if (!res.data || !res.data.length) return fail('用户不存在，请先登录', 404);
  return ok(res.data[0]);
}

async function updateProfile(payload) {
  const openid = getOpenid();
  // 业务校验：不允许越权修改角色/orgId（由系统管理模块处理�?
  const { role, orgId, ...safe } = payload;
  await updateUser(openid, { ...safe, updatedAt: new Date() });
  const res = await findUser(openid);
  return ok((res.data && res.data[0]) || null); // 优化#2 空值守卫
}

const { hashPwd, verifyPwd } = require('./helpers/crypto');

// R02 按组织树级别生成工号（与 system.generateEmployeeId 同源逻辑�?
// 规则：单位级�?4位；项目部级�?6位；班组级→8位。工号组织树内唯一�?
// R02 employeeId: reuse shared/employeeId.js (DUP-01)
async function generateEmployeeId(orgId) {
  const orgs = await listAll('orgs');
  const users = await listAll('users');
  return require('./helpers/employeeId').generateEmployeeId(orgId, orgs, users);
}

// 角色 ↔ 组织节点类型匹配校验（ORG_KIND_MAP 与 utils/role-tree.js orgKind 语义同源）。
// 返回错误消息或 null；组织节点查不到时静默跳过（组织树可能未播种完成）。
async function checkOrgKind(role, orgId) {
  if (!ORG_KIND_MAP[role] || !orgId) return null;
  const _orgs = await listAll('orgs');
  const _node = (_orgs || []).find(o => o._id === orgId);
  if (_node && _node.kind && _node.kind !== ORG_KIND_MAP[role]) {
    return '所选组织节点类型(' + (_node.kind || '') + ')与角色(' + role + ')要求(' + ORG_KIND_MAP[role] + ')不匹配';
  }
  return null;
}

async function register(payload) {
  const openid = getOpenid();
  const { role, unitId, orgId, username: rawUsername, nickname: rawNickname, password } = payload;
  // 用户名/昵称 trim：防止「 fb」类前导空格导致登录时精确匹配失败（存量脏数据已在库，新数据不再产生）
  const username = String(rawUsername || '').trim();
  const nickname = String(rawNickname || '').trim();
  if (!ROLE_SELF_BINDABLE.includes(role)) {
    return fail('角色不合法或需管理员分配：' + (role || '�?'), 403);
  }
  // ORG_KIND_MAP 为模块级常量（见文件头），服务端角色↔组织类型权威映射
  const orgKindErr = await checkOrgKind(role, orgId);
  if (orgKindErr) return fail(orgKindErr, 400);
  if (!orgId) return fail('请选择所属机构 / 班组', 400);
  // 用户名唯一性：排除当前身份自身，避免重复注册时误判
  const dup = await listUsers({ username });
  if (dup.data && dup.data.some((x) => x.openid !== openid)) return fail('用户名已存在', 409);
  // R02：自动生成组织树内唯一工号
  const pwErr = passwordError(password);
  if (pwErr) return fail(pwErr, 400);
  const employeeId = await generateEmployeeId(orgId);
  await updateUser(openid, {
    role,
    unitId: unitId || '',
    orgId,
    username: username || '',
    nickname: nickname || '',
    password: hashPwd(password),
    employeeId,
    bound: true,
    updatedAt: new Date(),
  });
  const res = await findUser(openid);
  return ok((res.data && res.data[0]) || null); // 优化#2 空值守卫
}

// 首次登录绑定：允许设置角�?/机构/账号（UI�? 显式登录�?
async function bindAccount(payload) {
  const openid = getOpenid();
  const { role, unitId, orgId, username: rawUsername, nickname: rawNickname } = payload;
  const username = String(rawUsername || '').trim();
  const nickname = String(rawNickname || '').trim();
  // 对齐 register 的权威校验：组织类型匹配（ORG_KIND_MAP）+ orgId 必填 + 用户名唯一性
  const orgKindErr = await checkOrgKind(role, orgId);
  if (orgKindErr) return fail(orgKindErr, 400);
  if (!orgId) return fail('请选择所属机构 / 班组', 400);
  const dup = await listUsers({ username });
  if (dup.data && dup.data.some((x) => x.openid !== openid)) return fail('用户名已存在', 409);

  // 服务端角色校验：不在白名单内（含伪造的 lead/project_lead/supervisor 等提权角色）一律拒�?
  if (!ROLE_SELF_BINDABLE.includes(role)) {
    return fail('角色不合法或需管理员分配：' + (role || '�?'), 403);
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
  return ok((res.data && res.data[0]) || null); // 优化#2 空值守卫
}

// 凭证登录（UI�? 登录按钮）：按账号名核对密码，并绑定当前微信身份�?
// 既兼容用户自注册账号（openid 已与账号一致），也支持管理员在后台预建的账�?
// （首次登录时把账号记录的 openid 绑定到当前微信身份，实现「账号名即身份」）�?
async function signin(payload) {
  const openid = getOpenid();
  const { username: rawUsername, password } = payload;
  // trim 后精确匹配：与注册/绑定端同规则，避免前导空格用户名登录不上
  const username = String(rawUsername || '').trim();
  if (!username || !password) return fail('请输入账号和密码', 400);
  const byName = await listUsers({ username });
  if (!byName.data || !byName.data.length) return fail('账号不存在，请先注册', 404);
  const u = byName.data[0];
  if (!u.bound) return fail('账号未完成注册，请先注册', 403);
  if (!verifyPwd(password, u.password)) return fail('密码不正�?', 401);
  // R12 凭证严格对应：signin �? username 定位唯一账户，密码校验通过后只返回该账户档案，
  // 因此「输入某账号的账号密码」必然且只能登录到该账号本身，不会误登其他账户�?
  // 若账号记录中�? openid 与当前微信身份不一致（管理员预建账号首次登�? / 用户换设备重装）�?
  // 则把账号绑定到当前微信身份，兼容多设备使用�?
  if (u.openid !== openid) {
    await update('users', u._id, { openid, updatedAt: new Date() });
    u.openid = openid;
    // 清理�? openid 下可能残留的自动建档空记录，避免 getCurrentUser 取到错误档案
    const dups = await listUsers({ openid });
    for (const d of (dups.data || [])) {
      if (String(d._id) !== String(u._id) && (!d.username || !d.bound)) {
        await remove('users', d._id);
      }
    }
  }
  return ok(u);
}

// 云函数入口：�? action 路由到纯业务函数
exports.main = __limiter.wrap(async (event) => {
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
}, 'auth');
