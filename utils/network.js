// utils/network.js
// 网络状态检测 —— 支撑 M5.1.5 / M6.1.5「无网络提示，引导至有网络环境」。
// 仅使用 wx.getNetworkType / wx.onNetworkStatusChange，不外泄平台专属 DB/云函数 API。

function getNetworkType() {
  return new Promise((resolve) => {
    wx.getNetworkType({
      success: (res) => resolve(res.networkType),
      fail: () => resolve('unknown'),
    });
  });
}

// 在线判断：none / unknown 视为不可用
async function isOnline() {
  const t = await getNetworkType();
  return t !== 'none' && t !== 'unknown';
}

// 业务守卫：离线时弹提示并 reject，避免静默失败
async function requireOnline() {
  const ok = await isOnline();
  if (!ok) {
    wx.showModal({
      title: '网络不可用',
      content: '当前无网络连接，相关操作（如领用、点检、上报）需在联网环境下进行。请检查网络后重试。',
      showCancel: false,
      confirmText: '我知道了',
    });
    throw new Error('OFFLINE');
  }
  return true;
}

function watchStatus(cb) {
  wx.onNetworkStatusChange((res) => cb && cb(res.isConnected, res.networkType));
}

// 缓存优先 + 网络兜底（M5.1.5 / M6.1.5 离线可浏览）：
// 先返回本地缓存（未过期），再发起网络请求刷新；离线或请求失败时若缓存存在则降级用缓存，保证历史数据可看。
const CACHE_TTL = 5 * 60 * 1000;

function _readCache(key, ttl) {
  try {
    const raw = wx.getStorageSync('cache:' + key);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (Date.now() - obj.t > ttl) return null;
    return obj.v;
  } catch (e) { return null; }
}

function _writeCache(key, val) {
  try {
    wx.setStorageSync('cache:' + key, JSON.stringify({ t: Date.now(), v: val }));
  } catch (e) { /* 存储满或异常：忽略，降级为纯网络 */ }
}

async function cacheThenNetwork(key, fetcher, opts = {}) {
  const ttl = opts.ttl || CACHE_TTL;
  const cached = _readCache(key, ttl);
  let result = cached;
  const online = await isOnline();
  if (online) {
    try {
      const fresh = await fetcher();
      if (fresh != null) { _writeCache(key, fresh); result = fresh; }
    } catch (e) { /* 网络失败：保留缓存 */ }
  }
  if (result == null) throw new Error('NO_CACHE');
  return result;
}

module.exports = { getNetworkType, isOnline, requireOnline, watchStatus, cacheThenNetwork, CACHE_TTL };
