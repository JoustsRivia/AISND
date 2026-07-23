// utils/api.js
// ★ 全项目唯一网络入口。页面/组件/服务只调用本文件导出的语义函数，
//   绝不可直接调用 wx.cloud.callFunction / wx.cloud.database / wx.cloud.uploadFile。
// ★ 迁移契约：未来换自有服务器时，只需把下方 invoke() 内部 transport 从
//   云函数替换为 wx.request，本文件导出的语义函数签名与调用方代码均无需改动。

// ── 云函数名映射（仅此处声明，调用方无感知） ──────────────────────────
const FN = {
  auth: 'auth',
  tool: 'tool',
  borrow: 'borrow',
  test: 'test',
  scrap: 'scrap',
  maintenance: 'maintenance',
  purchase: 'purchase',
  store: 'store',
  site: 'site',
  training: 'training',
  check: 'check',
  warning: 'warning',
  stats: 'stats',
  system: 'system',
  file: 'file',
  cert: 'cert',
  reconcile: 'reconcile',
  performance: 'performance',
};

// ── 统一请求封装（transport 抽象层） ──────────────────────────────────
// 现在：云开发 transport。
// 迁移时：把函数体替换为 wx.request({ url: BASE_URL + '/' + fn + '/' + action, ... })
function invoke(fn, action, payload = {}) {
  return new Promise((resolve, reject) => {
    wx.cloud.callFunction({
      name: fn,
      data: { action, payload, _ts: Date.now() },
      success: (res) => {
        const data = res && res.result ? res.result : res;
        if (data && data.code && data.code !== 0 && data.code !== 200) {
          reject(new Error(data.message || '请求失败'));
        } else {
          resolve(data && 'data' in data ? data.data : data);
        }
      },
      fail: (err) => reject(err),
    });
  });
}

// ── 账户 ───────────────────────────────────────────────────────────────
const login = () => invoke(FN.auth, 'login');
const getMyProfile = () => invoke(FN.auth, 'getProfile');
const updateProfile = (data) => invoke(FN.auth, 'updateProfile', data);
const bindAccount = (data) => invoke(FN.auth, 'bindAccount', data);
const register = (data) => invoke(FN.auth, 'register', data);
const signin = (data) => invoke(FN.auth, 'signin', data);

// ── 台账 M1 ──────────────────────────────────────────────────────────
const getToolList = (params) => invoke(FN.tool, 'list', params);
const getToolDetail = (id) => invoke(FN.tool, 'detail', { id });
const createTool = (data) => invoke(FN.tool, 'create', data);
const updateTool = (id, data) => invoke(FN.tool, 'update', { id, ...data });
const getLedgerStats = (params) => invoke(FN.tool, 'ledgerStats', params);
const exportLedger = (params) => invoke(FN.tool, 'export', params);
const getLeaseList = (params) => invoke(FN.tool, 'leaseList', params);
const createLease = (data) => invoke(FN.tool, 'leaseCreate', data);
const importTools = (data) => invoke(FN.tool, 'import', data);

// ── 周期试验 M4 ───────────────────────────────────────────────────────
const getTestDueList = (params) => invoke(FN.test, 'dueList', params);
const submitTest = (data) => invoke(FN.test, 'submit', data);
const verifyTestTag = (code) => invoke(FN.test, 'verifyTag', { code });

// ── 领用归还 M5 ──────────────────────────────────────────────────────
const borrowTool = (id) => invoke(FN.borrow, 'borrow', { id }).then((r) => { logOperation({ type: 'borrow', action: 'borrow', target: id }); return r; });
// 归还需回传外观状态（normal/damaged），外观损坏触发报修（M5.2.1~M5.2.3）
const returnTool = (id, data = {}) => invoke(FN.borrow, 'return', { id, ...data }).then((r) => { logOperation({ type: 'borrow', action: 'return', target: id }); return r; });
const getBorrowRecords = (params) => invoke(FN.borrow, 'records', params);

// ── 维保 M7 ──────────────────────────────────────────────────────────
const createMaintenance = (data) => invoke(FN.maintenance, 'create', data);
const reportRepair = (data) => invoke(FN.maintenance, 'report', data);
const approveRepair = (id) => invoke(FN.maintenance, 'approve', { id });
const recordRepair = (data) => invoke(FN.maintenance, 'record', data);
const recheckRepair = (id) => invoke(FN.maintenance, 'recheck', { id });
const getRepairList = (params) => invoke(FN.maintenance, 'list', params);
const listMaintenancePlans = (params) => invoke(FN.maintenance, 'listPlan', params);
const execMaintenancePlan = (data) => invoke(FN.maintenance, 'execPlan', data);

// ── 报废 M8 ──────────────────────────────────────────────────────────
const autoScrapCheck = () => invoke(FN.scrap, 'autoCheck');
const judgeScrap = (id, symptoms = []) => invoke(FN.scrap, 'judge', { id, symptoms });
const getScrapList = (params) => invoke(FN.scrap, 'list', params);
const submitScrap = (data) => invoke(FN.scrap, 'submit', data).then((r) => { logOperation({ type: 'scrap', action: 'submit', target: data && data.id }); return r; });
const approveScrap = (id, pass = true) => invoke(FN.scrap, 'approve', { scrapId: id, approve: pass }).then((r) => { logOperation({ type: 'scrap', action: 'approve', target: id, result: pass ? 'approved' : 'rejected' }); return r; });
const recordScrapDisposal = (data) => invoke(FN.scrap, 'disposal', data);

// ── 采购验收 M2 ───────────────────────────────────────────────────────
const createPurchase = (data) => invoke(FN.purchase, 'create', data);
// 审批需透传 pass：pass=false 表示驳回，云函数据此置 rejected（修复「驳回恒变通过」）
const approvePurchase = (id, pass = true) => invoke(FN.purchase, 'approve', { id, pass }).then((r) => { logOperation({ type: 'purchase', action: 'approve', target: id, result: pass ? 'approved' : 'rejected' }); return r; });
const createAcceptance = (data) => invoke(FN.purchase, 'accept', data).then((r) => { logOperation({ type: 'purchase', action: 'accept', target: data && data.purchaseId }); return r; });
const getPurchaseList = (params) => invoke(FN.purchase, 'list', params);

// ── 库房 M3 ──────────────────────────────────────────────────────────
const registerStore = (data) => invoke(FN.store, 'register', data);
const inbound = (data) => invoke(FN.store, 'inbound', data).then((r) => { logOperation({ type: 'store', action: 'inbound', target: data && data.code }); return r; });
const getInboundRecords = (params) => invoke(FN.store, 'records', params);

// ── 现场使用 M6 ───────────────────────────────────────────────────────
const getSpotCheckTask = () => invoke(FN.site, 'checkTask');
const submitSpotCheck = (data) => invoke(FN.site, 'submitCheck', data);
const getOpGuide = (id) => invoke(FN.site, 'opGuide', { id });
const recordBriefing = (data) => invoke(FN.site, 'briefing', data);
const getDailyCheck = () => invoke(FN.site, 'dailyList');

// ── 培训持证 M9 ───────────────────────────────────────────────────────
const getTrainingCourses = () => invoke(FN.training, 'courses');
const assignTraining = (data) => invoke(FN.training, 'assign', data);
const signInTraining = (data) => invoke(FN.training, 'signIn', data);
const getMyTraining = () => invoke(FN.training, 'myRecords');

// ── 监督检查隐患 M10 ──────────────────────────────────────────────────
const getInspectionTasks = () => invoke(FN.check, 'tasks');
const submitInspection = (data) => invoke(FN.check, 'submit', data);
const reportHazard = (data) => invoke(FN.check, 'reportHazard', data);
const assignHazard = (id, data) => invoke(FN.check, 'assignHazard', { id, ...data });
const trackHazard = (id, data) => invoke(FN.check, 'trackHazard', { id, ...data });
const closeHazard = (id) => invoke(FN.check, 'closeHazard', { id });
const getHazardList = (params) => invoke(FN.check, 'listHazard', params);
const getAssessmentList = (params) => invoke(FN.check, 'assessList', params);
const submitAssessment = (data) => invoke(FN.check, 'assess', data);

// ── 预警消息 M11 ──────────────────────────────────────────────────────
const getWarnings = (params) => invoke(FN.warning, 'list', params);
const readWarning = (id) => invoke(FN.warning, 'read', { id });
const readAllWarnings = () => invoke(FN.warning, 'readAll');
const subscribeWarning = () => invoke(FN.warning, 'subscribe');
const generateWarnings = () => invoke(FN.warning, 'generate');

// ── 统计分析 M12 ──────────────────────────────────────────────────────
const getDashboard = () => invoke(FN.stats, 'dashboard');
const getProjectDashboard = (orgId) => invoke(FN.stats, 'project', { orgId });
const getSixStandard = () => invoke(FN.stats, 'sixStandard');
const getMyStats = () => invoke(FN.stats, 'myStats');
const getTrend = (params) => invoke(FN.stats, 'trend', params);
const exportReport = (params) => invoke(FN.stats, 'exportReport', params);
// 工作台模块徽标聚合（P0 可视化：九宫格 tile 实时状态徽标）
const getHomeStatus = () => invoke(FN.stats, 'homeStatus');

// ── 系统管理 M13 ──────────────────────────────────────────────────────
const getOrgTree = () => invoke(FN.system, 'orgTree');
const manageOrg = (data) => invoke(FN.system, 'org', data);
const manageUser = (data) => invoke(FN.system, 'user', data).then((r) => {
  // 操作日志闭环（item 3）：仅对「增/改/删」用户这类权限变更动作留痕，列表查询不记
  if (data && ['add', 'update', 'delete'].includes(data.op)) {
    logOperation({ type: 'user', action: data.op, target: data.id || (data.data && data.data._id) || '' });
  }
  return r;
});
const listUsers = () => invoke(FN.system, 'user', { op: 'list' });
const getDict = (type) => invoke(FN.system, 'dict', { type });
// 字典增删改（M13.2）：服务端 requireAdmin 鉴权，按 type+key 写入 dicts 集合
const createDict = (data) => invoke(FN.system, 'dict', { op: 'create', data });
const updateDict = (data) => invoke(FN.system, 'dict', { op: 'update', data });
const removeDict = (id) => invoke(FN.system, 'dict', { op: 'remove', data: { _id: id } });
const manageCheckTemplate = (data) => invoke(FN.system, 'checkTemplate', data);
// 日志写入限流策略（item 4：后台可配置）—— get 查看、set 变更（仅管理员，留痕）
const getRateLimit = () => invoke(FN.system, 'rateLimit', { op: 'get' });
const setRateLimit = (policy) => invoke(FN.system, 'rateLimit', { op: 'set', policy }).then((r) => {
  logOperation({ type: 'system', action: 'rate_limit_set', target: 'rate_limit:policy' });
  return r;
});
const getRateStats = () => invoke(FN.system, 'rateStats');
// 日志留存策略（item 3：后台可配置）—— get 查看、set 变更（仅管理员，留痕）
const getRetention = () => invoke(FN.system, 'retention', { op: 'get' });
const setRetention = (policy) => invoke(FN.system, 'retention', { op: 'set', policy }).then((r) => {
  logOperation({ type: 'system', action: 'retention_set', target: 'retention:policy' });
  return r;
});

// ── 条码文件 M14 ──────────────────────────────────────────────────────
const generateBarcode = (id) => invoke(FN.tool, 'genBarcode', { id });
const getBarcodeFile = (id) => invoke(FN.tool, 'barcodeFile', { id });
const genLabel = (id) => invoke(FN.file, 'genLabel', { id });
const batchInbound = (ids) => invoke(FN.store, 'batchInbound', { ids });
const batchSpotCheck = (ids) => invoke(FN.site, 'batchCheck', { ids });
const batchGenBarcode = (ids) => invoke(FN.tool, 'batchGen', { ids });

// ── 持证管理 M9.2 ─────────────────────────────────────────────────────
const certList = (params) => invoke(FN.cert, 'list', params);
const myCerts = () => invoke(FN.cert, 'myCerts');
const upsertCert = (data) => invoke(FN.cert, 'upsert', data);
const deleteCert = (id) => invoke(FN.cert, 'remove', { id });
const checkCert = (params) => invoke(FN.cert, 'check', params);

// ── 账物核对 M1.4 ─────────────────────────────────────────────────────
const createReconcileTask = (data) => invoke(FN.reconcile, 'createTask', data);
const getReconcileList = (params) => invoke(FN.reconcile, 'list', params);
const getReconcileTask = (id) => invoke(FN.reconcile, 'getTask', { id });
const confirmReconcileItem = (data) => invoke(FN.reconcile, 'confirmItem', data);
const finishReconcileTask = (id) => invoke(FN.reconcile, 'finishTask', { id });
const getReconcileDiff = (params) => invoke(FN.reconcile, 'diff', params);

// ── 人员考核 M10.3 ────────────────────────────────────────────────────
const scorePerformance = (data) => invoke(FN.performance, 'score', data);
const getPerformanceList = (params) => invoke(FN.performance, 'list', params);
const getPerformanceRank = (params) => invoke(FN.performance, 'rank', params);
const getPerformanceSummary = (params) => invoke(FN.performance, 'summary', params);
const addReward = (data) => invoke(FN.performance, 'rewardAdd', data);
const getRewardList = (params) => invoke(FN.performance, 'rewardList', params);

// ── 文件上传（封装 wx.cloud.uploadFile，调用方不直接接触） ──────────────
function uploadFile(filePath, type = 'image') {
  return new Promise((resolve, reject) => {
    const cloudPath = `${type}/${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    wx.cloud.uploadFile({
      cloudPath,
      filePath,
      success: (res) => resolve(res.fileID),
      fail: reject,
    });
  });
}

// ── 操作日志 ──────────────────────────────────────────────────────
// 统一在 fire-and-forget 前自动补充审计字段（向后兼容：不改变调用方与云函数契约）。
//   - operatorName：本地档案昵称/用户名（服务端已记 openid，此处补充可读署名）
//   - clientTime：客户端动作发生时刻（与服务端 ts 形成双时间戳，便于合规对账）
// 任何异常都不影响主流程（catch 静默）。
const logOperation = (data = {}) => {
  try {
    const app = (typeof getApp === 'function') && getApp();
    const u = app && app.globalData && app.globalData.userInfo;
    if (u && (u.nickname || u.username)) {
      data.operatorName = u.nickname || u.username;
    }
  } catch (e) { /* 取不到署名不影响留痕 */ }
  data.clientTime = Date.now();
  return invoke(FN.system, 'log', data).catch(() => {});
};
const getOperationLogs = (params) => invoke(FN.system, 'listLog', params);
// 日志合规留存清理（item 3）：管理员手动触发超期日志清理；定时器每日凌晨亦会自动调用。
const cleanupLogs = (data = {}) => invoke(FN.system, 'cleanupLogs', data);

module.exports = {
  // 账户
  login, getMyProfile, updateProfile, bindAccount, register, signin,
  // 台账
  getToolList, getToolDetail, createTool, updateTool, getLedgerStats, exportLedger,
  getLeaseList, createLease, importTools,
  // 试验
  getTestDueList, submitTest, verifyTestTag,
  // 领用归还
  borrowTool, returnTool, getBorrowRecords,
  // 维保
  createMaintenance, reportRepair, approveRepair, recordRepair, recheckRepair, getRepairList,
  // 报废
  autoScrapCheck, judgeScrap, getScrapList, submitScrap, approveScrap, recordScrapDisposal,
  // 采购
  createPurchase, approvePurchase, createAcceptance, getPurchaseList,
  // 库房
  registerStore, inbound, getInboundRecords,
  // 现场
  getSpotCheckTask, submitSpotCheck, getOpGuide, recordBriefing, getDailyCheck,
  // 培训
  getTrainingCourses, assignTraining, signInTraining, getMyTraining,
  // 监督
  getInspectionTasks, submitInspection, reportHazard, assignHazard, trackHazard, closeHazard, getHazardList,
  getAssessmentList, submitAssessment,
  // 预警
  getWarnings, readWarning, readAllWarnings, subscribeWarning, generateWarnings,
  // 统计
  getDashboard, getProjectDashboard, getSixStandard, getMyStats, getTrend, exportReport, getHomeStatus,
  // 系统
  getOrgTree, manageOrg, manageUser, listUsers, getDict, createDict, updateDict, removeDict, manageCheckTemplate,
  getRateLimit, setRateLimit, getRateStats, getRetention, setRetention,
  // 条码
  generateBarcode, getBarcodeFile, batchInbound, batchSpotCheck, batchGenBarcode, genLabel,
  // 持证
  certList, myCerts, upsertCert, deleteCert, checkCert,
  // 账物核对
  createReconcileTask, getReconcileList, getReconcileTask, confirmReconcileItem, finishReconcileTask, getReconcileDiff,
  // 人员考核
  scorePerformance, getPerformanceList, getPerformanceRank, getPerformanceSummary, addReward, getRewardList,
  // 文件/日志
  uploadFile, logOperation, getOperationLogs, cleanupLogs,
};
