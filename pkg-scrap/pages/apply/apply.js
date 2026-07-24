// pkg-scrap/pages/apply/apply.js —— M8.1.2 报废申请 + M8.1.1 强制报废自动判定
const api = require('../../../utils/api');
const network = require('../../../utils/network');
const auth = require('../../../utils/auth');
const { ROLES, TOOL_STATUS } = require('../../../utils/constants');
const { buildFlow } = require('../../../utils/flow');

// 强制报废 7 项判定（与 cloudfunctions/scrap/index.js SCRAP_RULES 对应）
const RULES = [
  { key: 'breakdown', label: '绝缘击穿' },
  { key: 'deformation', label: '严重变形' },
  { key: 'crack', label: '裂纹损伤' },
  { key: 'aging', label: '老化失效' },
  { key: 'over_life', label: '超过使用年限' },
  { key: 'failed_test', label: '检验不合格' },
  { key: 'unrepairable', label: '无法修复' },
];

Page({
  data: {
    candidates: [], idx: 0,
    reason: '', photos: [], submitting: false,
    rules: RULES, symptoms: [], judge: null,
    canApprove: false,
    // R16 搜索选择器（改由 db-picker 组件驱动）
    keyword: '', searchResults: [], selectedTool: null,
    selectedCandidateId: '',
    scrapFlow: null, // 报废流程进度（用于 flow-steps）
  },

  async onLoad() {
    const p = auth.getProfile();
    const canApprove = p && [ROLES.LEAD, ROLES.SUPERVISOR, ROLES.PROJECT_LEAD, ROLES.SAFETY_OFFICER].includes(p.role);
    this.setData({ canApprove: !!canApprove });

    const r = await api.autoScrapCheck().catch(() => null);
    const candidates = (r && r.candidates) || [];
    this.setData({ candidates, idx: candidates.length ? 0 : -1 });
    if (candidates.length) this.runJudge();
  },

  // 子功能入口：报废审批 / 处置
  onGo(e) { wx.navigateTo({ url: e.currentTarget.dataset.url }); },

  onPick(e) {
    this.setData({ idx: +e.detail.value, symptoms: [], judge: null, selectedTool: null, scrapFlow: null });
    this.runJudge();
  },

  // R16 db-picker(search) 搜索回调（替代手写 onSearch）
  async onDbSearch(e) {
    const keyword = e.detail.keyword || '';
    if (!keyword.trim()) { this.setData({ searchResults: [] }); return; }
    try {
      const r = await api.getToolList({ keyword, size: 20 });
      const list = (r && r.list) || (Array.isArray(r) ? r : []);
      // 格式化为 db-picker 需要的 searchResults 格式
      const formatted = list.map((t) => ({
        value: t._id || t.code,
        label: (t.code || '') + ' · ' + (t.name || ''),
        sublabel: '状态: ' + (t.status || ''),
        raw: t,
      }));
      this.setData({ searchResults: formatted });
    } catch (err) {
      this.setData({ searchResults: [] });
    }
  },

  // db-picker(search) 选中器具
  onDbPickerChange(e) {
    const raw = e.detail.item && e.detail.item.raw;
    if (!raw) return;
    this.setData({
      selectedTool: raw,
      keyword: (raw.code || '') + ' · ' + (raw.name || ''),
      symptoms: [], judge: null,
    });
    this.updateScrapFlow();
  },

  // db-picker(selector) 候选器具选择
  onCandidateChange(e) {
    const raw = e.detail.item && e.detail.item.raw;
    if (!raw) return;
    this.setData({
      selectedTool: raw, selectedCandidateId: e.detail.value,
      symptoms: [], judge: null, scrapFlow: null,
    });
    this.runJudge();
  },

  // R17 扫码反查器具 → 自动选中
  async onScanCode() {
    wx.scanCode({
      success: async (res) => {
        const code = res.result;
        if (!code) return;
        wx.showLoading({ title: '核验中…' });
        try {
          const t = await api.verifyTestTag(code);
          if (t && t.toolId) {
            this.setData({ selectedTool: t, keyword: t.code || '', searchResults: [], symptoms: [], judge: null });
            wx.showToast({ title: '已匹配器具', icon: 'success' });
            this.updateScrapFlow();
          } else {
            wx.vibrateShort({ type: 'heavy' });
            wx.showModal({ title: '未识别器具', content: '扫码内容：' + code + '，未匹配到器具档案。', showCancel: false });
          }
        } catch (err) {
          wx.vibrateShort({ type: 'heavy' });
          wx.showModal({ title: '未识别器具', content: '扫码内容：' + code + '，核验失败。', showCancel: false });
        } finally {
          wx.hideLoading();
        }
      },
    });
  },

  // R16 从搜索结果中选中器具
  onSelectResult(e) {
    const t = this.data.searchResults[e.currentTarget.dataset.i];
    if (!t) return;
    this.setData({ selectedTool: t, keyword: (t.code || '') + ' ' + (t.name || ''), searchResults: [], symptoms: [], judge: null });
    this.updateScrapFlow();
  },

  // 计算报废流程进度（从 selectedTool.status 映射到 scrap 流程阶段）
  updateScrapFlow() {
    const t = this.data.selectedTool;
    if (!t) { this.setData({ scrapFlow: null }); return; }
    let scrapStatus = null;
    if (t.status === TOOL_STATUS.FORBIDDEN) scrapStatus = 'pending';
    else if (t.status === TOOL_STATUS.SCRAPPED) scrapStatus = 'approved';
    else if (t.status === TOOL_STATUS.QUALIFIED) scrapStatus = 'rejected';
    this.setData({ scrapFlow: scrapStatus ? buildFlow('scrap', scrapStatus) : null });
    // 异步补充：若 tool.status 为 'scrapped'，尝试拉取全状态记录以区分 approved/disposed
    if (t.status === TOOL_STATUS.SCRAPPED && t._id) {
      api.getScrapList({ status: 'approved' }).then((records) => {
        const list = Array.isArray(records) ? records : (records && records.list) || [];
        const pendingRecords = list.filter((r) => r.toolId === t._id);
        if (pendingRecords.length) {
          // 还在 approved 列表 → 确认 approved
        } else {
          // 不在 approved 列表 → 可能已 disposed，尝试拉取 disposed
          api.getScrapList({ status: 'disposed' }).then((disposedRecords) => {
            const dlist = Array.isArray(disposedRecords) ? disposedRecords : (disposedRecords && disposedRecords.list) || [];
            if (dlist.some((r) => r.toolId === t._id)) {
              this.setData({ scrapFlow: buildFlow('scrap', 'disposed') });
            }
          }).catch(() => {});
        }
      }).catch(() => {});
    }
  },

  // 清除已选中器具
  onClearSelected() {
    this.setData({ selectedTool: null, keyword: '', searchResults: [], scrapFlow: null });
  },

  bindReason(e) { this.setData({ reason: e.detail.value }); },

  // M8.1.1 强制报废自动判定：基于器具状态/年限/试验 + 勾选症状
  // R16：优先使用搜索选中的器具，否则回退到 candidates picker
  async runJudge() {
    const sel = this.data.selectedTool;
    const c = sel || this.data.candidates[this.data.idx];
    if (!c) return;
    const id = c._id || c.toolId;
    if (!id) return;
    const r = await api.judgeScrap(id, this.data.symptoms).catch(() => null);
    if (r) this.setData({ judge: r });
  },

  toggleSymptom(e) {
    const key = e.currentTarget.dataset.k;
    const set = new Set(this.data.symptoms);
    set.has(key) ? set.delete(key) : set.add(key);
    this.setData({ symptoms: [...set] });
    this.runJudge();
  },

  async onPhoto() {
    const m = await wx.chooseMedia({ count: 3, mediaType: ['image'] });
    // 并行上传，缩短等待（原串行上传 3-5 张 = 3-5 倍延迟）
    const ids = await Promise.all(m.tempFiles.map((f) => api.uploadFile(f.tempFilePath, 'image')));
    this.setData({ photos: this.data.photos.concat(ids) });
  },

  async onSubmit() {
    try { await network.requireOnline(); } catch (e) { return; }
    // R16：优先使用 selectedTool，否则回退 candidates picker
    const sel = this.data.selectedTool;
    const c = sel || this.data.candidates[this.data.idx];
    if (!c) { wx.showToast({ title: '请选择器具', icon: 'none' }); return; }
    const id = c._id || c.toolId;
    if (!id) { wx.showToast({ title: '器具信息异常', icon: 'none' }); return; }
    this.setData({ submitting: true });
    try {
      const r = await api.submitScrap({ id, reason: this.data.reason, photos: this.data.photos, symptoms: this.data.symptoms });
      const must = r && r.mustScrap;
      wx.showModal({
        title: '已提交审批',
        content: must ? '系统判定为强制报废（' + ((r && r.reasons) || []).join('、') + '），已上报待审批。' : '已提交报废审批，等待安全员/项目部审批。',
        showCancel: false,
        success: () => wx.navigateBack(),
      });
    } catch (err) {
      wx.showToast({ title: '提交失败', icon: 'none' });
    } finally {
      this.setData({ submitting: false });
    }
  },
});
