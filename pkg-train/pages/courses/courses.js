// pkg-train/pages/courses/courses.js —— M9.1 培训课程
const api = require('../../../utils/api');
const network = require('../../../utils/network');

Page({
  data: {
    list: [],
    loading: true,
    // 指派弹窗
    showAssignModal: false,
    assignCourse: null,
    userSearchKey: '',
    userSearchResults: [],
    selectedUsers: [],
    assigning: false,
  },

  async onLoad() {
    // 登录守卫：未登录跳登录页
    let profile = null;
    try { profile = await api.getMyProfile(); } catch (e) { profile = null; }
    if (!profile || !profile.bound) { wx.reLaunch({ url: '/pages/login/login' }); return; }
    await this.load();
  },
  async onPullDownRefresh() { await this.load(); wx.stopPullDownRefresh(); },

  async load() {
    this.setData({ loading: true });
    const list = await api.getTrainingCourses().catch(() => []);
    this.setData({ list: list || [], loading: false });
  },

  // 打开指派弹窗
  async onAssign(e) {
    const item = e.currentTarget.dataset.item;
    try { await network.requireOnline(); } catch (err) { return; }
    this.setData({
      showAssignModal: true,
      assignCourse: item,
      userSearchKey: '',
      userSearchResults: [],
      selectedUsers: [],
      assigning: false,
    });
    // 预加载用户列表
    await this.searchUsers();
  },

  // 搜索输入
  onUserSearchInput(e) {
    this.setData({ userSearchKey: e.detail.value }, () => {
      this.searchUsers();
    });
  },

  // 搜索用户（本地过滤）
  async searchUsers() {
    try {
      const res = await api.listUsers();
      const arr = Array.isArray(res) ? res : (res && res.list) || [];
      const key = (this.data.userSearchKey || '').trim().toLowerCase();
      const filtered = !key
        ? arr
        : arr.filter((u) => {
            const name = (u.name || '').toLowerCase();
            const nick = (u.nickName || '').toLowerCase();
            const uid = (u._id || '').toLowerCase();
            return name.includes(key) || nick.includes(key) || uid.includes(key);
          });
      // 标记已选
      const selIds = this.data.selectedUsers.map((u) => u._id);
      const results = filtered.map((u) => ({ ...u, _selected: selIds.includes(u._id) }));
      this.setData({ userSearchResults: results });
    } catch (err) {
      this.setData({ userSearchResults: [] });
    }
  },

  // 切换选中
  toggleSelectUser(e) {
    const idx = e.currentTarget.dataset.index;
    const user = this.data.userSearchResults[idx];
    if (!user) return;
    const selected = this.data.selectedUsers.slice();
    const i = selected.findIndex((u) => u._id === user._id);
    if (i >= 0) selected.splice(i, 1);
    else selected.push({ _id: user._id, name: user.name || user.nickName || user._id });
    const selIds = selected.map((u) => u._id);
    const results = this.data.userSearchResults.map((u) => ({
      ...u,
      _selected: selIds.includes(u._id),
    }));
    this.setData({ selectedUsers: selected, userSearchResults: results });
  },

  // 移除已选
  removeSelectedUser(e) {
    const id = e.currentTarget.dataset.id;
    const selected = this.data.selectedUsers.filter((u) => u._id !== id);
    const selIds = selected.map((u) => u._id);
    const results = this.data.userSearchResults.map((u) => ({
      ...u,
      _selected: selIds.includes(u._id),
    }));
    this.setData({ selectedUsers: selected, userSearchResults: results });
  },

  // 确认指派
  async confirmAssign() {
    if (this.data.selectedUsers.length === 0) {
      wx.showToast({ title: '请选择人员', icon: 'none' });
      return;
    }
    const courseId = this.data.assignCourse && this.data.assignCourse._id;
    if (!courseId) return;
    this.setData({ assigning: true });
    try {
      const userIds = this.data.selectedUsers.map((u) => u._id);
      await api.assignTraining({ userIds, courseId });
      wx.showToast({ title: '已指派', icon: 'success' });
      this.setData({ showAssignModal: false });
    } catch (err) {
      wx.showToast({ title: '指派失败', icon: 'none' });
    } finally {
      this.setData({ assigning: false });
    }
  },

  cancelAssign() {
    this.setData({ showAssignModal: false });
  },
});
