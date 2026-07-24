// pkg-ledger/pages/tool-create/tool-create.js —— M1.3.1 新增录入 / M1.3.4 信息编辑
// R13：日期选择器 + 约束校验 + expireAt 联动计算；R14：库房从 stores 表加载
const api = require('../../../utils/api');
const network = require('../../../utils/network');
const { TOOL_CATEGORIES, TOOL_SOURCES } = require('../../../utils/constants');
const { validateDateConstraints, calcExpireAt } = require('../../../utils/tool-schema');

Page({
  data: {
    id: '', editMode: false,
    categories: TOOL_CATEGORIES,
    catIndex: 0,
    sources: TOOL_SOURCES,
    sourceIndex: 0,
    stores: [],           // R14：库房列表
    storeIndex: -1,      // R14：当前选中库房
    form: {
      name: '', spec: '', factoryNo: '', purchaseDate: '',
      testPeriod: 6, lastTestDate: '', expireAt: '', store: '', keeper: '', keeperDisplay: '', source: 'self',
      leaseUnit: '', certNo: '', operator: '', operatorCert: '', // M1.3.7 租赁字段
      attachments: [], // M1.3.5 附件（合同/合格证/试验报告）
    },
    submitting: false,
  },

  onLoad(opts) {
    this.loadStores();
    if (opts.id) {
      this.setData({ id: opts.id, editMode: true });
      this.prefill(opts.id);
    }
  },

  // R14：加载库房列表（按当前用户组织范围）
  async loadStores() {
    const stores = await api.getStoreList().catch(() => []);
    this.setData({ stores });
  },

  // 编辑模式：拉取档案回填（M1.3.4）
  async prefill(id) {
    const t = await api.getToolDetail(id).catch(() => null);
    if (!t) return;
    const catIndex = Math.max(0, this.data.categories.findIndex((c) => c.code === t.category));
    const sourceIndex = Math.max(0, this.data.sources.findIndex((s) => s.value === (t.source || 'self')));
    const storeIndex = Math.max(-1, this.data.stores.findIndex((s) => s.name === t.store));
    this.setData({
      catIndex, sourceIndex, storeIndex,
      form: {
        name: t.name || '', spec: t.spec || '', factoryNo: t.factoryNo || '',
        purchaseDate: t.purchaseDate || '', testPeriod: t.testPeriod || 6,
        lastTestDate: t.lastTestDate || '', expireAt: t.expireAt || '',
        store: t.store || '', keeper: t.keeper || '', keeperDisplay: t.keeperDisplay || t.keeper || '', source: t.source || 'self',
        leaseUnit: t.leaseUnit || '', certNo: t.certNo || '', operator: t.operator || '', operatorCert: t.operatorCert || '',
        attachments: t.attachments || [],
      },
    });
  },

  onCat(e) { this.setData({ catIndex: +e.detail.value }); },
  onSource(e) { this.setData({ sourceIndex: +e.detail.value }); },
  bind(e) {
    const k = e.currentTarget.dataset.k;
    const v = e.detail.value;
    this.setData({ ['form.' + k]: v });
    // R13：检验周期或上次试验日期变化时自动计算 expireAt
    if (k === 'testPeriod' || k === 'lastTestDate') {
      const expire = calcExpireAt(this.data.form.lastTestDate, k === 'testPeriod' ? v : this.data.form.testPeriod);
      if (expire) this.setData({ ['form.expireAt']: expire });
    }
  },

  // R13：日期 picker change
  onDate(e) {
    const k = e.currentTarget.dataset.k;
    const v = e.detail.value;
    this.setData({ ['form.' + k]: v });
    // R13：上次试验日期变化时自动计算 expireAt
    if (k === 'lastTestDate') {
      const expire = calcExpireAt(v, this.data.form.testPeriod);
      if (expire) this.setData({ ['form.expireAt']: expire });
    }
  },

  // R14：库房 picker change → 同步 store 名称，并自动带出保管人
  onStore(e) {
    const idx = +e.detail.value;
    const store = this.data.stores[idx];
    if (!store) return;
    const patch = { storeIndex: idx, ['form.store']: store.name };
    if (store.keeper) {
      patch['form.keeper'] = store.keeper;
      patch['form.keeperDisplay'] = store.keeperDisplay || store.keeper;
    }
    this.setData(patch);
  },

  // user-picker 选择变更：存储 openid 和可读展示名
  onKeeperChange(e) {
    this.setData({
      ['form.keeper']: e.detail.openid || e.detail.username || '',
      ['form.keeperDisplay']: e.detail.displayName || '',
    });
  },

  // M1.3.5 附件上传（采购合同/合格证/型式试验报告）
  async onPhoto() {
    try { await network.requireOnline(); } catch (err) { return; }
    const m = await wx.chooseMedia({ count: 4, mediaType: ['image'] });
    const ids = [];
    for (const f of m.tempFiles) ids.push(await api.uploadFile(f.tempFilePath, 'image'));
    this.setData({ ['form.attachments']: (this.data.form.attachments || []).concat(ids) });
  },

  async onSubmit() {
    const f = this.data.form;
    if (!f.name) { wx.showToast({ title: '请填写器具名称', icon: 'none' }); return; }
    // R13：前端日期约束校验
    const dateErr = validateDateConstraints(f);
    if (dateErr) { wx.showToast({ title: dateErr, icon: 'none' }); return; }
    this.setData({ submitting: true });
    try {
      const payload = {
        category: this.data.categories[this.data.catIndex].code,
        source: this.data.sources[this.data.sourceIndex].value,
        ...f,
      };
      if (this.data.editMode) {
        await api.updateTool(this.data.id, payload); // M1.3.4 编辑（记录变更）
        wx.showToast({ title: '已保存修改', icon: 'success' });
      } else {
        await api.createTool(payload);
        wx.showToast({ title: '已录入', icon: 'success' });
      }
      setTimeout(() => wx.navigateBack(), 800);
    } catch (err) {
      wx.showToast({ title: err.message || '保存失败', icon: 'none' });
    } finally {
      this.setData({ submitting: false });
    }
  },
});
