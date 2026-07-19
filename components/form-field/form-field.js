// components/form-field/form-field.js
// 共享表单字段组件：label + input + 错误提示，消除注册 / 登录页输入框重复。
// 通过 bind:input 向父页面派发 { value }，父页面 handler 仍按 e.detail.value 取值（与原 <input> 一致）。
Component({
  properties: {
    label: { type: String, value: '' },
    value: { type: String, value: '' },
    placeholder: { type: String, value: '' },
    password: { type: Boolean, value: false },
    type: { type: String, value: 'text' },
    error: { type: String, value: '' },
  },
  methods: {
    onInput(e) { this.triggerEvent('input', { value: e.detail.value }); },
  },
});
