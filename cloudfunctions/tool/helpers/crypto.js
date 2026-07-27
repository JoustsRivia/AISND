// shared/crypto.js
// ★ 密码哈希单一源（SEC-01 / DUP-02）。纯 Node 模块，无 wx-server-sdk 依赖，可安全打包进各云函数 helpers/。
//
// 设计：
//   - 新密码使用 PBKDF2（sha512, 10万次, 64字节）＋ 每用户独立随机盐，格式 `pbkdf2$sha512$iter$keylen$salt$derived`。
//   - 兼容存量账户：已用旧 sha1('tms_'+p) 哈希的密码在 verifyPwd 时自动回退校验，旧账户登录/校验无需强制改密。
//   - 未来换自有服务器时仅改写本文件，其余引用方零改动。
const crypto = require('crypto');

const LEGACY_SALT = 'tms_';
const PBKDF2_DIGEST = 'sha512';
const PBKDF2_ITER = 100000;
const PBKDF2_KEYLEN = 64;

// 旧哈希（sha1 + 静态盐）：仅用于存量账户回退校验，不再用于新密码
function legacyHash(p) {
  return p ? crypto.createHash('sha1').update(LEGACY_SALT + p).digest('hex') : '';
}

// 生成新哈希（PBKDF2 + 随机盐），返回带元数据的字符串
function hashPwd(p) {
  if (!p) return '';
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto
    .pbkdf2Sync(p, salt, PBKDF2_ITER, PBKDF2_KEYLEN, PBKDF2_DIGEST)
    .toString('hex');
  return ['pbkdf2', PBKDF2_DIGEST, PBKDF2_ITER, PBKDF2_KEYLEN, salt, derived].join('$');
}

// 校验密码：新格式走 PBKDF2（timingSafeEqual 防时序攻击），旧格式回退 sha1
function verifyPwd(p, stored) {
  if (!p || !stored) return false;
  if (stored.indexOf('pbkdf2$') === 0) {
    const parts = stored.split('$');
    // pbkdf2$<digest>$<iter>$<keylen>$<salt>$<derived>
    if (parts.length !== 6) return false;
    const [, digest, iter, keylen, salt, derived] = parts;
    let computed;
    try {
      computed = crypto
        .pbkdf2Sync(p, salt, Number(iter), Number(keylen), digest)
        .toString('hex');
    } catch (_) {
      return false;
    }
    const a = Buffer.from(computed, 'hex');
    const b = Buffer.from(derived, 'hex');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }
  // 存量账户回退
  return legacyHash(p) === stored;
}

module.exports = { hashPwd, verifyPwd, legacyHash };
