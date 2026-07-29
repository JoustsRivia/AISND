// components/cascading-role-picker/cascading-role-picker.js
// 三级级联角色选择器（picker-view 实现，类似时间选择器交互）。
// 通过 bind:change 向父页面派发 { roleValue, roleName, roleMeta }，
// 父页面据此完成注册，自身零感知级联细节。
const { getRoleTree, getChildren, getRoleMeta, isLeafRole } = require('../../utils/role-tree');

Component({
  properties: {
    // 外部可传入已选角色码（如编辑场景回显）
    roleValue: { type: String, value: '' },
  },

  data: {
    // 三列数据源
    col1: [], col2: [], col3: [],
    // picker-view 当前选中索引 [idx0, idx1, idx2]
    pickerValue: [0, 0, 0],
    // 当前选中的角色码及元数据
    selectedValue: '',
    selectedName: '',
    selectedMeta: null,
    // 是否已选择到叶子节点（a1/a2/b11/... 等）
    isComplete: false,
    // 第三列是否可见（a1/a2 无第三级）
    showCol3: true,
  },

  lifetimes: {
    attached() {
      this._init();
    },
  },

  observers: {
    roleValue(val) {
      if (val && val !== this.data.selectedValue) {
        this._syncFromValue(val);
      }
    },
  },

  methods: {
    // ── 初始化 ──
    _init() {
      const tree = getRoleTree();
      const col1 = tree.map((n) => n.name);
      const l1 = tree[0];
      const col2 = (l1.children || []).map((n) => n.name);
      const l2 = l1.children ? l1.children[0] : null;
      const col3 = (l2 && l2.children) ? l2.children.map((n) => n.name) : [];
      const showCol3 = col3.length > 0;

      this.setData({ col1, col2, col3, pickerValue: [0, 0, 0], showCol3 });
      this._updateSelection(0, 0, 0);
    },

    // ── picker-view 列滚动事件 ──
    onColumnChange(e) {
      const { column, value } = e.detail;
      const current = [...this.data.pickerValue];
      current[column] = value;

      if (column === 0) {
        // L1 变化 → 重置 L2 (0) + L3 (0)，重新计算 L2 列表
        current[1] = 0;
        current[2] = 0;
        this._rebuildColumns(current);
        this.setData({ pickerValue: [current[0], 0, 0] });
        this._updateSelection(current[0], 0, 0);
      } else if (column === 1) {
        // L2 变化 → 重置 L3 (0)，重新计算 L3 列表
        current[2] = 0;
        this._rebuildColumns(current);
        this.setData({ pickerValue: [current[0], current[1], 0] });
        this._updateSelection(current[0], current[1], 0);
      } else {
        // L3 滚动 → 只更新选中
        this.setData({ pickerValue: current });
        this._updateSelection(current[0], current[1], current[2]);
      }
    },

    // ── 根据 pickerValue 重新生成各列数据 ──
    _rebuildColumns(pickerValue) {
      const tree = getRoleTree();
      const l1Node = tree[pickerValue[0]];
      const l2Nodes = l1Node ? (l1Node.children || []) : [];
      const l2Node = l2Nodes[pickerValue[1]] || null;
      const l3Nodes = l2Node ? (l2Node.children || []) : [];

      this.setData({
        col2: l2Nodes.map((n) => n.name),
        col3: l3Nodes.map((n) => n.name),
        showCol3: l3Nodes.length > 0,
      });
    },

    // ── 根据索引更新当前选中角色信息 ──
    _updateSelection(i0, i1, i2) {
      const tree = getRoleTree();
      const l1Node = tree[i0];
      const l2Nodes = l1Node ? (l1Node.children || []) : [];
      const l2Node = l2Nodes[i1] || null;
      const l3Nodes = l2Node ? (l2Node.children || []) : [];
      const l3Node = l3Nodes[i2] || null;

      // 如果没有三级节点，当前选中的是二级节点
      const effectiveNode = l3Node || l2Node;
      let selectedValue = '';
      let selectedName = '';
      let selectedMeta = null;
      let isComplete = false;

      if (effectiveNode) {
        selectedValue = effectiveNode.value;
        selectedName = effectiveNode.name;
        selectedMeta = getRoleMeta(selectedValue);
        isComplete = isLeafRole(selectedValue);
      }

      const oldValue = this.data.selectedValue;
      this.setData({ selectedValue, selectedName, selectedMeta, isComplete });

      // 值变化时通知父页面
      if (selectedValue && selectedValue !== oldValue) {
        this.triggerEvent('change', {
          roleValue: selectedValue,
          roleName: selectedName,
          roleMeta: selectedMeta,
          isComplete,
        });
      }
    },

    // ── 外部 roleValue 回显同步 ──
    _syncFromValue(roleValue) {
      const meta = getRoleMeta(roleValue);
      if (!meta || !meta.path) return;
      // meta.path 是名称数组 ['总包人员', '总包现场工作人员', '自有作业人员']
      const tree = getRoleTree();
      const l1Idx = tree.findIndex((n) => n.name === meta.path[0]);
      if (l1Idx < 0) return;
      const l2Nodes = tree[l1Idx] ? (tree[l1Idx].children || []) : [];
      const l2Idx = l2Nodes.findIndex((n) => n.name === meta.path[1]);
      if (l2Idx < 0) return;
      let l3Idx = 0;
      if (meta.path.length >= 3) {
        const l3Nodes = l2Nodes[l2Idx] ? (l2Nodes[l2Idx].children || []) : [];
        l3Idx = l3Nodes.findIndex((n) => n.name === meta.path[2]);
        if (l3Idx < 0) l3Idx = 0;
      }

      const pickerValue = [l1Idx, l2Idx, l3Idx];
      this.setData({
        col1: tree.map((n) => n.name),
        col2: l2Nodes.map((n) => n.name),
        col3: l2Nodes[l2Idx] && l2Nodes[l2Idx].children ? l2Nodes[l2Idx].children.map((n) => n.name) : [],
        showCol3: meta.path.length >= 3,
        pickerValue,
        selectedValue: roleValue,
        selectedName: meta.name,
        selectedMeta: meta,
        isComplete: isLeafRole(roleValue),
      });
    },
  },
});
