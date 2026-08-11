// pages/ledger/ledger.js —— 台账列表（统计 + 筛查 + 卡片列表 + 分页 + 分台账 + 录入/导入）
const api = require('../../utils/api');
const auth = require('../../utils/auth');
const { TOOL_CATEGORIES, ROLE_FAMILIES } = require('../../utils/constants');
const { subtreeIds } = require('../../utils/org-utils');
const { catName } = require('../../utils/display'); // 优化#13：类别中文
const net = require('../../utils/network');

const STATUS_TABS = [
  { key: '', label: '全部' },
  { key: 'qualified', label: '合格' },
  { key: 'pending_test', label: '待检' },
  { key: 'in_use', label: '领用中' },
  { key: 'maintaining', label: '维修中' },
  { key: 'forbidden', label: '禁用' },
  { key: 'scrapped', label: '报废' },
];

const PAGE_SIZE = 20;


Page({
  data: {
    list: [],
    stats: [],
    tabs: STATUS_TABS,
    activeTab: '',
    filterStatus: '', // 统计卡片当前高亮的状态
    chips: TOOL_CATEGORIES.map((c) => ({ key: c.code, label: c.name })),
    activeChips: [],
    keyword: '',
    highRisk: false,
    page: 1,
    hasMore: true,
    loading: true,
    loadingMore: false,
    exporting: false,
    // 分台账（问题6）
    orgOptions: [],
    orgIndex: 0,
  },

  onShow() {
    // 问题1：未登录拦截
    if (!auth.isLoggedIn()) { wx.reLaunch({ url: '/pages/login/login' }); return; }
    // 修复：切回台账页时强制刷新——器具状态（合格→待检等）在别的页变更后须及时可见；
    // 首次 onShow 由 onLoad 的 reload 覆盖，跳过避免双请求；离线时 cacheThenNetwork 回退缓存
    if (this._inited) this.reload();
    this._inited = true;
  },

  onLoad() {
    this.loadOrgTree();
    this.loadStats();
    this.reload();
  },

  onPullDownRefresh() {
    this.reload().then(() => wx.stopPullDownRefresh()).catch(() => wx.stopPullDownRefresh());
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loadingMore) this.loadMore();
  },

  // 分台账组织选项：管理员可选全部+任意机构；普通角色仅限自身子树内
  async loadOrgTree() {
    const tree = await net.cacheThenNetwork('orgTree', () => api.getOrgTree()).catch(() => []);
    if (!tree.length) return;
    const byId = {};
    tree.forEach((o) => { byId[o._id] = o; });
    const p = auth.getProfile();
    let opts = tree;
    // 全局(admin/a1)与单位级管理可全选；其余仅自身子树（词表统一：三级树码）
    if (p && p.orgId && !(p.role === 'admin' || p.role === 'a1' || ROLE_FAMILIES.UNIT_MGMT.includes(p.role))) {
      const set = new Set(subtreeIds(tree, p.orgId));
      opts = tree.filter((o) => set.has(o._id));
    }
    const options = [{ _id: '', label: '全部分台账' }].concat(opts.map((o) => {
      const path = [];
      let cur = o;
      while (cur) { path.unshift(cur.name); cur = byId[cur.parentId]; }
      return { _id: o._id, label: path.join(' / ') };
    }));
    this.setData({ orgOptions: options, orgIndex: 0 });
  },

  async loadStats() {
    const orgId = this._curOrgId();
    const s = await api.getLedgerStats(orgId ? { orgId } : {}).catch(() => null);
    if (s) {
      this.setData({
        stats: [
          { label: '总数', value: s.total, color: 'var(--c-primary)', statusKey: '' },
          { label: '合格', value: s.qualified, color: 'var(--c-success)', statusKey: 'qualified' },
          { label: '待检', value: s.pendingTest, color: 'var(--c-warning)', statusKey: 'pending_test' },
          { label: '领用', value: s.inUse, color: 'var(--c-info)', statusKey: 'in_use' },
          { label: '维修', value: s.maintaining, color: 'var(--c-primary)', statusKey: 'maintaining' },
          { label: '报废', value: s.scrapped, color: 'var(--c-text-weak)', statusKey: 'scrapped' },
        ],
      });
    }
  },

  _curOrgId() {
    const { orgOptions, orgIndex } = this.data;
    const opt = orgOptions[orgIndex];
    return opt ? opt._id : '';
  },

  // 离线缓存键：按当前筛选维度生成，确保缓存与视图一一对应
  _cacheKey() {
    const { activeTab, activeChips, keyword, highRisk } = this.data;
    const orgId = this._curOrgId();
    return [orgId, activeTab, (activeChips || []).join(','), keyword, highRisk ? 1 : 0].join('|');
  },

  // 重置并加载第一页
  async reload() {
    this.setData({ page: 1, hasMore: true, list: [], loading: true });
    const key = 'ledger:' + this._cacheKey();
    const res = await net.cacheThenNetwork(key, () => this.fetchPage(1), { ttl: 60000 }).catch(() => null);
    if (res) this.setData({ list: res.list, hasMore: res.hasMore, loading: false });
    else this.setData({ loading: false });
  },

  async loadMore() {
    const next = this.data.page + 1;
    this.setData({ loadingMore: true });
    const res = await this.fetchPage(next);
    this.setData({
      list: this.data.list.concat(res.list),
      page: next,
      hasMore: res.hasMore,
      loadingMore: false,
    });
  },

  async fetchPage(page) {
    const { activeTab, activeChips, keyword, highRisk } = this.data;
    const orgId = this._curOrgId();
    const params = { page, size: PAGE_SIZE, keyword };
    if (orgId) params.orgId = orgId;
    if (activeTab) params.status = activeTab;
    if (activeChips.length) params.category = activeChips[0];
    if (highRisk) params.highRisk = true; // M1.3.6 高危专项台账
    const res = await api.getToolList(params).catch(() => []);
    const list = (Array.isArray(res) ? res : (res.list || [])).map((t) => ({
      ...t,
      // 优化#13 通病整改：tool-card 组件读 categoryText，服务端 list 返回英文码
      categoryText: catName(t.category),
    }));
    const total = Array.isArray(res) ? res.length : (res.total || 0);
    // 边界修正：当本页拉满且仍有下一页（page*PAGE_SIZE < total）才允许加载更多；
    // 去掉原 `|| total === 0` 兜底，避免末页恰好满页时误判 hasMore=true 触发多余空请求。
    return { list, hasMore: list.length >= PAGE_SIZE && page * PAGE_SIZE < total };
  },

  // 分台账切换（问题6）
  onOrgChange(e) {
    this.setData({ orgIndex: +e.detail.value });
    this.loadStats();
    this.reload();
  },

  // M1.3.6 高危专项台账开关
  onToggleHighRisk() {
    this.setData({ highRisk: !this.data.highRisk });
    this.reload();
  },

  // 问题5：手动录入 → 跳器具录入页
  onAdd() {
    wx.navigateTo({ url: '/pkg-ledger/pages/tool-create/tool-create' });
  },

  // 问题5：按模板批量导入
  onImport() {
    wx.navigateTo({ url: '/pkg-ledger/pages/import/import' });
  },

  // M1.1.3 台账导出（服务端聚合明细 → CSV 落盘 + 剪贴板）
  async onExport() {
    if (this.data.exporting) return;
    this.setData({ exporting: true });
    wx.showLoading({ title: '导出中' });
    const { activeTab, activeChips, keyword, highRisk } = this.data;
    const orgId = this._curOrgId();
    const params = {};
    if (orgId) params.orgId = orgId;
    if (activeTab) params.status = activeTab;
    if (activeChips.length) params.category = activeChips[0];
    if (keyword) params.keyword = keyword;
    if (highRisk) params.highRisk = true;
    const res = await api.exportLedger(params).catch(() => null);
    wx.hideLoading();
    if (!res || !res.rows || !res.rows.length) {
      this.setData({ exporting: false });
      wx.showToast({ title: '无数据可导出', icon: 'none' });
      return;
    }
    const STATUS = { qualified: '合格', pending_test: '待检', in_use: '领用中', maintaining: '维修中', forbidden: '禁用', scrapped: '报废' };
    const headers = ['编号', '名称', '类别', '规格', '状态', '来源', '存放', '保管', '有效期至', '上次试验', '采购日期'];
    const esc = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    const lines = [headers.join(',')];
    res.rows.forEach((r) => {
      lines.push([
        r.code, r.name, catName(r.category), r.spec, STATUS[r.status] || r.status, r.source, // 优化#13：类别导出中文
        r.store, r.keeper, r.expireAt, r.lastTestDate, r.purchaseDate,
      ].map(esc).join(','));
    });
    const csv = '﻿' + lines.join('\r\n'); // BOM 确保 Excel 中文不乱码
    const fs = wx.getFileSystemManager();
    const path = `${wx.env.USER_DATA_PATH}/工器具台账_${Date.now()}.csv`;
    fs.writeFile({
      filePath: path, data: csv, encoding: 'utf8',
      success: () => {
        // 优化#9：文件下载方式替代剪贴板——保存到手机文件 或 发送文件（文件传输助手）
        wx.showActionSheet({
          itemList: ['💾 保存到手机文件', '📤 发送文件（发到文件传输助手）'],
          success: (r) => {
            if (r.tapIndex === 0) {
              if (!wx.saveFileToDisk) {
                wx.showToast({ title: '当前微信版本不支持，请改用发送文件', icon: 'none' });
                return;
              }
              wx.saveFileToDisk({
                filePath: path,
                success: () => wx.showToast({ title: `已保存 ${res.rows.length} 条台账`, icon: 'success' }),
                fail: () => wx.showModal({
                  title: '保存失败',
                  content: '请在「设置-通用-存储空间/权限」中允许保存到手机文件，或改用发送文件',
                  showCancel: false,
                }),
              });
            } else {
              wx.shareFileMessage({
                filePath: path,
                success: () => wx.showToast({ title: '已发送，可在聊天中保存文件', icon: 'success' }),
                fail: () => wx.showToast({ title: '发送失败', icon: 'none' }),
              });
            }
          },
          fail: () => { /* 用户取消，静默 */ },
        });
      },
      fail: () => wx.showToast({ title: '导出失败', icon: 'none' }),
      complete: () => this.setData({ exporting: false }),
    });
  },

  onSearch(e) {
    this.setData({ keyword: e.detail.value });
    if (this._st) clearTimeout(this._st);
    this._st = setTimeout(() => this.reload(), 300);
  },

  clearSearch() {
    this.setData({ keyword: '' });
    this.reload();
  },

  onTab(e) {
    this.setData({ activeTab: e.detail.key, filterStatus: e.detail.key });
    this.reload();
  },

  // #12 台账概况点击状态筛选
  onFilter(e) {
    const status = e.currentTarget.dataset.status;
    this.setData({ activeTab: status, filterStatus: status });
    this.reload();
  },

  onChip(e) {
    this.setData({ activeChips: e.detail.active });
    this.reload();
  },

  onTapItem(e) {
    const t = e.detail.tool;
    wx.navigateTo({ url: '/pages/tool-detail/tool-detail?id=' + (t._id || '') });
  },
});
