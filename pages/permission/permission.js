// pages/permission/permission.js —— 权限说明常驻查看页（迭代 Item 6）
// 注册成功弹窗的「查看完整权限说明」入口，亦可由「我的」页跳转；展示当前角色
// 的数据范围 / 可用功能 / 审批链路（来自 utils/register-shared ROLE_INFO）。
const auth = require('../../utils/auth');
const { ROLE_INFO, ROLES_BINDABLE } = require('../../utils/register-shared');

Page({
  data: { roleName: '', info: null },
  onLoad(q) {
    let role = (q && q.role) || '';
    if (!role) {
      const p = auth.getProfile();
      role = (p && p.role) || '';
    }
    const bind = ROLES_BINDABLE.find((r) => r.value === role);
    const info = ROLE_INFO[role] || null;
    this.setData({ roleName: (bind && bind.name) || role || '未绑定角色', info });
  },
});
