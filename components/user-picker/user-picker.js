// components/user-picker/user-picker.js
// 用户选择器组件：联想搜索 + 下拉列表 + 手动输入后备。
// Props  : placeholder, value（当前选中用户标识）
// Events : bind:change(e.detail = { openid, username, employeeId, displayName })
const { searchUsers, displayName, formatUser } = require('../../utils/user-utils');

Component({
  properties: {
    placeholder: { type: String, value: '搜索或输入用户名' },
    value: { type: String, value: '' }, // 当前选中用户标识（displayName 格式）
  },

  data: {
    keyword: '',
    candidates: [],      // 搜索结果列表
    showCandidates: false,
    selectedItem: null,  // 当前选中的用户对象
    isManual: false,     // 是否手动输入模式
    debounceTimer: null,
  },

  lifetimes: {
    attached() {
      if (this.properties.value) {
        this.setData({ keyword: this.properties.value });
      }
    },
  },

  observers: {
    value(v) {
      if (v && v !== this.data.keyword && !this.data.selectedItem) {
        this.setData({ keyword: v });
      }
    },
  },

  methods: {
    onInput(e) {
      const keyword = e.detail.value || '';
      this.setData({ keyword, showCandidates: false, isManual: false, selectedItem: null });

      if (this.data.debounceTimer) clearTimeout(this.data.debounceTimer);

      if (!keyword.trim()) {
        this.setData({ candidates: [] });
        this.triggerEvent('change', { openid: '', username: '', employeeId: '', displayName: '' });
        return;
      }

      this.data.debounceTimer = setTimeout(() => {
        this.doSearch(keyword.trim());
      }, 300);
    },

    async doSearch(keyword) {
      try {
        const list = await searchUsers(keyword);
        this.setData({ candidates: list, showCandidates: list.length > 0 });
      } catch (e) {
        console.error('[user-picker] 搜索失败', e);
        this.setData({ candidates: [], showCandidates: false });
      }
    },

    onSelect(e) {
      const index = e.currentTarget.dataset.index;
      const user = this.data.candidates[index];
      if (!user) return;

      const name = displayName(user);
      this.setData({
        keyword: name,
        showCandidates: false,
        selectedItem: user,
        isManual: false,
      });

      this.triggerEvent('change', {
        openid: user.openid || '',
        username: user.username || '',
        employeeId: user.employeeId || '',
        displayName: name,
      });
    },

    onConfirm() {
      const { keyword, candidates, selectedItem } = this.data;

      // 如果已有选中的联想结果，直接确认
      if (selectedItem) {
        this.setData({ showCandidates: false });
        return;
      }

      // 无联想结果时，手动输入作为后备
      if (!candidates.length && keyword.trim()) {
        this.setData({ isManual: true, showCandidates: false });
        this.triggerEvent('change', {
          openid: '',
          username: keyword.trim(),
          employeeId: '',
          displayName: keyword.trim(),
        });
      }
    },

    onClear() {
      this.setData({
        keyword: '',
        candidates: [],
        showCandidates: false,
        selectedItem: null,
        isManual: false,
      });
      this.triggerEvent('change', { openid: '', username: '', employeeId: '', displayName: '' });
    },

    onFocus() {
      // 有搜索结果时重新显示下拉
      if (this.data.candidates.length > 0 && this.data.keyword.trim()) {
        this.setData({ showCandidates: true });
      }
    },
  },
});
