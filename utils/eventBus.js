// utils/eventBus.js
// 极简全局事件总线：解耦页面间的实时刷新（如角色/组织变更后广播刷新 permission/profile）。
// 仅依赖小程序运行环境，不触碰任何 wx.cloud.* 平台 API（遵守前端统一入口铁律）。
class EventBus {
  constructor() { this.map = Object.create(null); }
  // 订阅；返回取消订阅函数（便于页面 onHide/onUnload 时清理）
  on(type, cb) {
    if (!type || typeof cb !== 'function') return () => {};
    (this.map[type] = this.map[type] || []).push(cb);
    return () => this.off(type, cb);
  }
  off(type, cb) {
    const arr = this.map[type];
    if (!arr) return;
    const i = arr.indexOf(cb);
    if (i >= 0) arr.splice(i, 1);
  }
  emit(type, payload) {
    const arr = this.map[type];
    if (!arr || !arr.length) return;
    // 复制一份再遍历，避免回调内增删监听导致迭代异常
    for (const cb of arr.slice()) {
      try { cb(payload); } catch (e) { console.error('[eventBus] handler error', type, e); }
    }
  }
}

module.exports = new EventBus();
