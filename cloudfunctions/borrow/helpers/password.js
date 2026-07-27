// shared/password.js
// ★ 密码强度校验单一源（FEAT-01）。云函数侧注册/后台建用户统一引用，由 bundle-db-base.js 同步进 helpers/。
// 规则：至少 6 位，且同时包含字母与数字（满足等保三级基础密码策略）。
function isPasswordStrong(p) {
  if (!p || typeof p !== 'string') return false;
  if (p.length < 6) return false;
  return /[a-zA-Z]/.test(p) && /\d/.test(p);
}

// 返回错误文案（null 表示通过），便于直接 fail(message)
function passwordError(p) {
  if (!p) return '请输入密码';
  if (p.length < 6) return '密码至少 6 位';
  if (!/[a-zA-Z]/.test(p) || !/\d/.test(p)) return '密码需同时包含字母和数字';
  return null;
}

module.exports = { isPasswordStrong, passwordError };
