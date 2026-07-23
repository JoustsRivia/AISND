// shared/rateLimiter.js
// ★ 通用限流中间件（R23 提取自 cloudfunctions/system/index.js 内嵌逻辑）。
//
// 设计：每个云函数入口可用 `wrap(handler, action)` 包装，同一 action 在窗口内超阈值则返回 429。
// 窗口/阈值支持按 action 分级（default/import/batch 三档），也可在 dicts 后台配置覆盖。
//
// 迁移到自有服务器时：只需把 `collection('operation_logs')` 替换为 MySQL/MongoDB 客户端，
// 其余纯逻辑（计数/比较/429 响应）无需改动。

const { collection } = require('./dbBase');

// 默认限流档（可被 dicts type=rate_limit/key=policy 后台覆盖）
const DEFAULT = {
  default: { window: 60 * 1000, max: 30 },
  import: { window: 60 * 1000, max: 200 },
  batch: { window: 60 * 1000, max: 300 },
};

// 批量操作白名单（自动走高阈值档）
const BATCH_ACTIONS = ['importTools', 'batchInbound', 'batchGen', 'batchImport'];

/**
 * 创建限流器
 * @param {Object} opts
 * @param {number} opts.windowMs - 时间窗口（毫秒），默认 60000
 * @param {number} opts.max - 窗口内最大请求数，默认 30
 * @param {Function} opts.getOpenid - 获取当前用户 openid 的函数
 * @param {Object} opts.db - 数据库操作对象（含 collection）
 * @returns {{ wrap: Function }}
 */
function createRateLimiter(opts = {}) {
  const { windowMs = 60000, max = 30, getOpenid, db } = opts;

  // 限流策略配置驱动（R23：优先后台 dicts 配置，回退默认）
  async function getPolicy() {
    if (!db) return { default: { window: windowMs, max } };
    try {
      const r = await db.collection('dicts').where({ type: 'rate_limit', key: 'policy' }).limit(1).get();
      const item = r.data && r.data[0];
      return (item && item.data) || { default: { window: windowMs, max } };
    } catch (_) {
      return { default: { window: windowMs, max } };
    }
  }

  // 按 action 选择限流档
  async function resolveLimit(action) {
    const policy = await getPolicy();
    if (BATCH_ACTIONS.includes(action)) return policy.batch || DEFAULT.batch;
    if (action && policy[action]) return policy[action];
    return policy.default || DEFAULT.default;
  }

  /**
   * 包装云函数 handler：超过限流阈值时自动返回 429
   * @param {Function} handler - 原 handler: async (event) => result
   * @param {string} action - action 名（用于分级限流 + 计数 key）
   * @returns {Function} 包装后的 handler
   */
  function wrap(handler, action = 'unknown') {
    return async function (event) {
      const openid = getOpenid ? getOpenid() : (event && event.userInfo && event.userInfo.openId) || 'anonymous';
      const limit = await resolveLimit(action);
      const rec = Date.now() - limit.window;

      try {
        const recent = (await collection('operation_logs').where({
          operator: openid,
          action,
          ts: require('./dbBase').db.command.gt(rec),
        }).get()).data || [];

        if (recent.length >= limit.max) {
          return { code: 429, message: '操作过于频繁，请稍后再试' };
        }
      } catch (_) {
        // 限流查询失败 → 放行（不因限流机制故障阻塞正常业务）
      }

      return handler(event);
    };
  }

  return { wrap };
}

module.exports = { createRateLimiter, DEFAULT, BATCH_ACTIONS };
