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

module.exports = { getNetworkType, isOnline, requireOnline, watchStatus };
