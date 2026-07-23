// pkg-store/pages/register/register.js —— M3.1 库房注册
// R21：分区动态输入 + 组织两级 picker 选择（单位 → 项目部）
const api = require('../../../utils/api');
const network = require('../../../utils/network');

Page({
  data: {
    name: '',
    keeper: '',
    keeperOpenid: '',
    submitting: false,
    // 组织树
    orgTree: [],
    units: [],          // level===0 节点列表（picker range）
    unitIndex: -1,      // 选中的单位索引
    subOrgs: [],        // 选中单位下的 level===1 子节点
    subIndex: -1,       // 选中的项目部索引
    orgId: '',          // 最终提交的 orgId（项目部 _id，或单位 _id）
    // 分区动态数组
    zones: [''],
    // 已注册库房列表
    storeList: [],
  },

  async onLoad() {
    try {
      const tree = await api.getOrgTree();
      const units = (tree || []).filter((o) => o.level === 0);
      this.setData({ orgTree: tree || [], units });
    } catch (e) {
      this.setData({ orgTree: [], units: [] });
    }
    this.loadStoreList();
  },

  async loadStoreList() {
    try {
      const storeList = await api.getStoreList().catch(() => []);
      this.setData({ storeList });
    } catch (e) {
      // 静默失败
    }
  },

  bindName(e) { this.setData({ name: e.detail.value }); },
  onKeeperChange(e) {
    this.setData({
      keeper: e.detail.displayName || '',
      keeperOpenid: e.detail.openid || '',
    });
  },

  // 选择单位：刷新该单位下的项目部（level===1 直属子节点）
  onUnitPick(e) {
    const idx = Number(e.detail.value);
    const unit = this.data.units[idx];
    if (!unit) return;
    const subOrgs = (this.data.orgTree || []).filter(
      (o) => o.level === 1 && o.parentId === unit._id
    );
    this.setData({
      unitIndex: idx,
      subOrgs,
      subIndex: -1,
      orgId: unit._id,   // 默认挂到单位，待选项目部后覆盖
    });
  },

  // 选择项目部
  onSubPick(e) {
    const idx = Number(e.detail.value);
    const sub = this.data.subOrgs[idx];
    if (!sub) return;
    this.setData({ subIndex: idx, orgId: sub._id });
  },

  // 分区动态行：追加 / 删除 / 更新
  addZone() {
    const zones = this.data.zones.slice();
    zones.push('');
    this.setData({ zones });
  },
  removeZone(e) {
    const idx = Number(e.currentTarget.dataset.index);
    const zones = this.data.zones.slice();
    if (zones.length <= 1) {
      zones[0] = '';
    } else {
      zones.splice(idx, 1);
    }
    this.setData({ zones });
  },
  bindZone(e) {
    const idx = Number(e.currentTarget.dataset.index);
    const zones = this.data.zones.slice();
    zones[idx] = e.detail.value;
    this.setData({ zones });
  },

  async onSubmit() {
    try { await network.requireOnline(); } catch (e) { return; }
    const { name, orgId, keeper, keeperOpenid, zones } = this.data;
    if (!name) { wx.showToast({ title: '请填写库房名称', icon: 'none' }); return; }
    if (!orgId) { wx.showToast({ title: '请选择所属组织', icon: 'none' }); return; }
    if (!keeper) { wx.showToast({ title: '请填写管理员', icon: 'none' }); return; }
    const zoneList = (zones || []).map((z) => (z || '').trim()).filter(Boolean);
    this.setData({ submitting: true });
    try {
      await api.registerStore({ name, orgId, zone: zoneList, keeper, keeperOpenid });
      wx.showToast({ title: '注册成功', icon: 'success' });
      this.setData({ name: '', keeper: '', keeperOpenid: '', zones: [''] });
      this.loadStoreList();
    } catch (err) {
      wx.showToast({ title: '注册失败', icon: 'none' });
    } finally {
      this.setData({ submitting: false });
    }
  },
});
