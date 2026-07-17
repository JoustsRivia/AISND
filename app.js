// app.js —— 全局生命周期与共享数据
// 注意：本文件只做初始化与 globalData 管理，所有网络请求统一走 utils/api.js
const auth = require('./utils/auth');

// 云开发初始化：必须在任何 wx.cloud.* 调用之前执行（utils/api.js 内部走 wx.cloud.callFunction）。
// 前提：微信开发者工具「云开发」已开通环境；env 用 DYNAMIC_CURRENT_ENV 自动跟随当前环境。
if (wx.cloud) {
  wx.cloud.init({
    env: wx.cloud.DYNAMIC_CURRENT_ENV,
    traceUser: true,
  });
}

App({
  globalData: {
    userInfo: null,   // 用户档案（来自 users 集合）
    role: null,        // 角色：见 utils/constants.js ROLES
    orgId: null,       // 所属组织节点
    openid: null,
  },

  onLaunch() {
    // 启动即尝试静默登录并拉取档案；失败不阻塞首屏
    this.bootstrap().catch((err) => {
      console.warn('[app] bootstrap 失败，等待用户主动登录', err);
    });
  },

  async bootstrap() {
    const profile = await auth.ensureLogin();
    if (profile) {
      this.globalData.userInfo = profile;
      this.globalData.role = profile.role;
      this.globalData.orgId = profile.orgId;
      this.globalData.openid = profile.openid;
    }
    return profile;
  },
});
