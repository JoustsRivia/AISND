// pages/permission/permission.js —— 权限说明常驻查看页（迭代 Item 6 / Item 4 实时刷新）
// 注册成功弹窗的「查看完整权限说明」入口，亦可由「我的」页跳转；展示当前角色
// 的数据范围 / 可用功能 / 审批链路（来自 utils/register-shared ROLE_INFO）。
// Item 4：进入（onShow）即从服务端拉取最新角色与组织并重渲染；并订阅全局
// 「档案变更」事件，角色/组织变更时同页实时刷新，无需重新进入。
const auth = require('../../utils/auth');
const api = require('../../utils/api');
const { ROLE_INFO, ROLES_BINDABLE } = require('../../utils/register-shared');

Page({
  data: { roleName: '', info: null },

  onLoad(q) {
    // 注册成功 deep-link 携带 ?role=，作为初始展示；onShow 会用服务端最新角色覆盖
    this.queryRole = (q && q.role) || '';
    this._off = null;
  },

  async onShow() {
    // 实时刷新：每次进入/回到本页都从服务端拉取最新角色与组织，确保权限说明与当前身份一致
    await this.refresh();
    // 订阅全局「档案变更」事件，角色/组织变更时同页实时刷新（避免重复进入）
    if (!this._off) this._off = auth.onProfileChanged(() => this.refresh());
  },

  onHide() { if (this._off) { this._off(); this._off = null; } },
  onUnload() { if (this._off) { this._off(); this._off = null; } },

  async refresh() {
    let role = this.queryRole;
    // 服务端档案为准：拉取最新角色/组织，覆盖初始 query/deep-link，确保变更后实时
    try {
      const p = await api.getMyProfile();
      if (p && p.role) { role = p.role; auth.setProfile(p); }
    } catch (e) { /* 拉取失败则回退 query/缓存 */ }
    if (!role) {
      const p = auth.getProfile();
      role = (p && p.role) || '';
    }
    const bind = ROLES_BINDABLE.find((r) => r.value === role);
    const info = ROLE_INFO[role] || null;
    this.setData({ roleName: (bind && bind.name) || role || '未绑定角色', info });
  },
});
