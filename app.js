// app.js —— 全局生命周期与共享数据
// 注意：本文件只做初始化与 globalData 管理，所有网络请求统一走 utils/api.js
const auth = require('./utils/auth');
const theme = require('./utils/theme');
const fonts = require('./utils/fonts');

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
    theme: 'auto',     // 夜间主题模式：auto / dark
    fontReady: false,  // SNDIcon 字体是否已加载完成（页面可据此触发重绘）
  },

  onLaunch() {
    this.globalData.theme = theme.getMode();
    // 静默加载展示/图标字体（失败回退系统字体，绝不阻塞首屏）
    // 2026-08-12：loadFontFace 异步——首页首帧渲染时字体未就绪会显示方块，
    // 加载完成后强制已渲染页面重绘（setData 触发），使图标字体生效。
    fonts.loadFonts().then(() => {
      this.globalData.fontReady = true;
      // 用 nextTick 让出主线程，避免字体就绪瞬间同步 setData 造成卡顿；
      // 一次性重绘（所有已渲染页），后续页面进入时字体已就绪，无额外开销。
      wx.nextTick(() => {
        const pages = getCurrentPages() || [];
        pages.forEach((p) => {
          if (p && typeof p.setData === 'function' && !p.__fontRedrawn) {
            p.__fontRedrawn = true;
            p.setData({ _fontTick: 1 });
          }
        });
      });
    });
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
