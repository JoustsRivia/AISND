// components/role-org-picker/role-org-picker.js
// 共享「角色 + 单位 + 机构/班组」级联选择器（迭代 Item 5）：
//   消除 pages/register 与 pages/login 中重复的 picker 逻辑。
//   通过 bind:change 向父页面派发 { roleValue, roleName, unitId, orgId, roleIndex, unitIndex, orgIndex }，
//   父页面据此拼装注册 / 绑定载荷，自身零感知级联细节。
Component({
  properties: {
    roles: { type: Array, value: [] },
    units: { type: Array, value: [] }, // 由 buildUnits 生成：[{ _id, name, options:[{ _id, label, unitId }] }]
    showRole: { type: Boolean, value: true }, // 登录页仅在注册模式显示角色
    roleIndex: { type: Number, value: 0 },
    unitIndex: { type: Number, value: 0 },
    orgIndex: { type: Number, value: 0 },
  },
  data: { orgOptions: [] },
  observers: {
    'unitIndex, units': function (unitIndex, units) {
      const u = (units || [])[unitIndex];
      this.setData({ orgOptions: (u && u.options) || [] });
    },
  },
  methods: {
    onRoleChange(e) { this._emit(+e.detail.value, this.data.unitIndex, 0); },
    onUnitChange(e) { this._emit(this.data.roleIndex, +e.detail.value, 0); },
    onOrgChange(e) { this._emit(this.data.roleIndex, this.data.unitIndex, +e.detail.value); },
    _emit(roleIndex, unitIndex, orgIndex) {
      const roles = this.data.roles || [];
      const units = this.data.units || [];
      const role = roles[roleIndex] || {};
      const u = units[unitIndex] || {};
      const org = (u.options || [])[orgIndex] || {};
      this.setData({ roleIndex, unitIndex, orgIndex });
      this.triggerEvent('change', {
        roleIndex, unitIndex, orgIndex,
        roleValue: role.value, roleName: role.name,
        unitId: u._id || '', orgId: org._id || '',
      });
    },
  },
});
