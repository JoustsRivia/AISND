// pages/identity/identity.js —— 个人身份码（身份信息可信化 · 现场互扫验证）
// 编码当前登录用户的身份负载为二维码；他人用「扫一扫」扫码即可校验身份。
const auth = require('../../utils/auth');
const qrcode = require('../../pkg-barcode/utils/qrcode.js');

const ROLE_TEXT = {
  lead: '专班负责人', project_lead: '项目部负责人', safety_officer: '专职安全员',
  group_lead: '班组长', supervisor: '安监管理', worker: '作业人员',
  lease_admin: '租赁管理员', admin: '小程序管理员',
};

// 身份负载前缀：与器具码（_id/编号）区分，避免扫码中枢误判
const PREFIX = 'AISND|ID|';

Page({
  data: {
    name: '', employeeId: '', roleText: '', orgText: '', rendered: false,
  },

  onShow() {
    if (!auth.isLoggedIn()) { wx.reLaunch({ url: '/pages/login/login' }); return; }
    auth.ensureLogin().catch(() => {});
    const p = auth.getProfile();
    if (!p) return;
    this.setData({
      name: p.nickname || p.username || '同事',
      employeeId: p.employeeId || '',
      roleText: ROLE_TEXT[p.role] || '成员',
      orgText: p.orgName || '',
    });
    this.render();
  },

  // 编码可携带可读字段，扫码端即使无服务端查询也能离线展示（后续可加签名防伪）
  buildPayload(p) {
    return PREFIX + JSON.stringify({
      o: p.openid,
      n: p.nickname || p.username || '',
      e: p.employeeId || '',
      r: p.role || '',
    });
  },

  render() {
    const p = auth.getProfile();
    if (!p) return;
    const text = this.buildPayload(p);
    let qr;
    try {
      qr = qrcode(0, 'M');
      qr.addData(text);
      qr.make();
    } catch (e) {
      wx.showToast({ title: '身份码生成失败', icon: 'none' });
      return;
    }
    const count = qr.getModuleCount();
    wx.createSelectorQuery().in(this).select('#qr').fields({ node: true, size: true })
      .exec((res) => {
        if (!res || !res[0] || !res[0].node) return;
        const canvas = res[0].node;
        const ctx = canvas.getContext('2d');
        const dpr = (wx.getWindowInfo && wx.getWindowInfo().pixelRatio) || wx.getSystemInfoSync().pixelRatio || 2;
        const size = res[0].width;
        canvas.width = size * dpr;
        canvas.height = size * dpr;
        ctx.scale(dpr, dpr);
        const cell = size / count;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, size, size);
        ctx.fillStyle = '#0F2B5B';
        for (let r = 0; r < count; r++) {
          for (let c = 0; c < count; c++) {
            if (qr.isDark(r, c)) ctx.fillRect(c * cell, r * cell, cell, cell);
          }
        }
        this.setData({ rendered: true });
      });
  },

  onShare() {
    wx.showToast({ title: '请让同事用「扫一扫」互验', icon: 'none' });
  },
});
