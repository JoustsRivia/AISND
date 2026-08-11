// pages/identity/identity.js —— 个人身份码（身份信息可信化 · 现场互扫验证）
// 编码当前登录用户的身份负载为二维码；他人用「扫一扫」扫码即可校验身份。
// 完善（待优化问题 #4）：负载携带生成时间戳 t，页面展示「刷新于」时间并支持手动刷新，
// 扫码端核验时展示生成时间——翻拍/截图的旧码可被识别，防伪能力闭环。
const auth = require('../../utils/auth');
const api = require('../../utils/api');
const qrcode = require('../../pkg-barcode/utils/qrcode.js');

const { ROLE_TEXT } = require('../../utils/constants');
const { orgPathText } = require('../../utils/org-utils');

// 身份负载前缀：与器具码（_id/编号）区分，避免扫码中枢误判
const PREFIX = 'AISND|ID|';

function fmtTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const p = (n) => (n < 10 ? '0' + n : '' + n);
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}

Page({
  data: {
    name: '', employeeId: '', roleText: '', orgText: '', rendered: false, stampText: '',
  },

  async onShow() {
    if (!auth.isLoggedIn()) { wx.reLaunch({ url: '/pages/login/login' }); return; }
    auth.ensureLogin().catch(() => {});
    const p = auth.getProfile();
    if (!p) return;
    // 归属单位/机构：users 无冗余 orgName，按 orgId 从组织树解析完整路径（问题 #2）
    let orgText = '';
    if (p.orgId) {
      const tree = await api.getOrgTree().catch(() => []);
      orgText = orgPathText(tree, p.orgId);
    }
    this.setData({
      name: p.nickname || p.username || '同事',
      employeeId: p.employeeId || '',
      roleText: ROLE_TEXT[p.role] || '成员',
      orgText,
    });
    this.render();
  },

  // 编码可携带可读字段，扫码端即使无服务端查询也能离线展示（后续可加签名防伪）
  // g: orgId —— 扫码端用自身组织树解析归属路径（组织树全员可读，问题 #2 核验闭环）
  // t: 生成时间戳 —— 扫码端展示「生成于」，旧码/翻拍可辨识（#4 完善）
  buildPayload(p) {
    return PREFIX + JSON.stringify({
      o: p.openid,
      n: p.nickname || p.username || '',
      e: p.employeeId || '',
      r: p.role || '',
      g: p.orgId || '',
      t: Date.now(),
    });
  },

  // 手动刷新：重新生成带新时间戳的身份码（防旧码截图复用）
  onRefresh() { this.render(); },

  render() {
    const p = auth.getProfile();
    if (!p) return;
    const text = this.buildPayload(p);
    this.setData({ stampText: '刷新于 ' + fmtTime(Date.now()) });
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
        const dpr = wx.getWindowInfo().pixelRatio || 2; // lib 3.0.0 必有 getWindowInfo，getSystemInfoSync 已弃用
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
