// pkg-store/pages/records/records.js —— M3 入库记录
const api = require('../../../utils/api');

Page({
  data: {
    list: [],
    records: [],
    loading: true,
  },

  async onLoad() {
    const list = await api.getInboundRecords({}).catch(() => []);
    const records = (list || []).map((it) => ({
      time: it.ts,
      title: it.toolName,
      desc: '入库 ' + it.storeName,
      operator: it.operator,
    }));
    this.setData({ list: list || [], records, loading: false });
  },
});
