// components/db-picker/db-picker.js
// R14/R16/R17/R20/R21/R25 通用下拉选择组件
// 支持 3 种模式：selector（从数据源选择）、date（日期选择）、search（搜索联想）
// 数据源通过 api 调用方传入 items 数组，或通过 bind:load 事件让页面自行加载
Component({
  properties: {
    // 模式：selector | date | search
    mode: { type: String, value: 'selector' },
    // selector 模式：选项数组 [{ value, label, ... }] 或字符串数组
    items: { type: Array, value: [] },
    // 当前值
    value: { type: null, value: '' },
    // label 字段名（items 为对象数组时）
    labelKey: { type: String, value: 'label' },
    // value 字段名
    valueKey: { type: String, value: 'value' },
    // placeholder
    placeholder: { type: String, value: '请选择' },
    // date 模式：起始日期
    start: { type: String, value: '' },
    // date 模式：结束日期
    end: { type: String, value: '' },
    // search 模式：搜索结果数组 [{ value, label, sublabel }]
    searchResults: { type: Array, value: [] },
    // 是否禁用
    disabled: { type: Boolean, value: false },
    // 附加描述（显示在 label 下方的副标题）
    descKey: { type: String, value: '' },
  },

  data: {
    // search 模式：当前输入关键字
    keyword: '',
    // search 模式：是否展开结果下拉
    showDropdown: false,
    // selector 模式：picker 的 range
    range: [],
    // selector 模式：当前选中的 index
    selIndex: -1,
  },

  observers: {
    items(val) {
      this._syncRange(val);
    },
    value(val) {
      this._syncSelIndex(val);
    },
  },

  methods: {
    // 同步 items → range（统一为 { label, value, raw } 结构）
    _syncRange(items) {
      const { labelKey, valueKey } = this.data;
      const range = (items || []).map((it) => {
        if (typeof it === 'string') return { label: it, value: it, raw: it };
        return { label: it[labelKey] || it[valueKey] || '', value: it[valueKey], raw: it };
      });
      this.setData({ range });
      this._syncSelIndex(this.data.value);
    },

    // 根据 value 找到对应 index
    _syncSelIndex(val) {
      const { range, valueKey } = this.data;
      if (val == null || val === '') { this.setData({ selIndex: -1 }); return; }
      const idx = range.findIndex((r) => String(r.value) === String(val));
      this.setData({ selIndex: idx });
    },

    // selector 模式：picker change
    onPickerChange(e) {
      const idx = Number(e.detail.value);
      const item = this.data.range[idx];
      if (!item) return;
      this.triggerEvent('change', { value: item.value, item: item.raw, index: idx });
    },

    // date 模式：date picker change
    onDateChange(e) {
      const val = e.detail.value;
      this.triggerEvent('change', { value: val });
    },

    // search 模式：输入关键字
    onSearchInput(e) {
      const keyword = e.detail.value;
      this.setData({ keyword, showDropdown: true });
      this.triggerEvent('search', { keyword });
    },

    // search 模式：选中某个结果
    onSearchTap(e) {
      const idx = Number(e.currentTarget.dataset.idx);
      const item = (this.data.searchResults || [])[idx];
      if (!item) return;
      const labelKey = this.data.labelKey;
      const valueKey = this.data.valueKey;
      const val = (typeof item === 'string') ? item : (item[valueKey] || item[labelKey]);
      this.setData({ keyword: (typeof item === 'string') ? item : (item[labelKey] || ''), showDropdown: false });
      this.triggerEvent('change', { value: val, item });
    },

    // search 模式：失焦收起下拉（延迟避免 tap 先触发）
    onSearchBlur() {
      setTimeout(() => { this.setData({ showDropdown: false }); }, 200);
    },

    // search 模式：聚焦展开下拉
    onSearchFocus() {
      if (this.data.searchResults && this.data.searchResults.length) {
        this.setData({ showDropdown: true });
      }
    },

    // 清空选择
    onClear() {
      this.setData({ keyword: '', selIndex: -1, showDropdown: false });
      this.triggerEvent('change', { value: '', item: null });
    },
  },
});
